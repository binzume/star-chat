# coding: utf-8

# require 'bundler/setup'
require './star_chat/models'
require 'sinatra'
require 'erubis'

set :server, :thin
set :sessions, false
set :erb, escape_html: true
set :streams, []
set :launched_time, Time.now.to_i

require './config'

helpers do

  def launched_time
    settings.launched_time
  end

  def protect!
    halt 401 unless authorized?
  end

  def authorized?
    if !auth.provided? or !auth.basic? or !auth.credentials
      return false
    end
    user_name, password = auth.credentials
    def password.inspect
      '(secret)'
    end
    return false unless user_name
    return false if user_name.empty?
    return false unless password
    StarChat::User.auth?(user_name, password)
  end

  def auth
    @auth ||= Rack::Auth::Basic::Request.new(request.env)
  end

  def current_user
    return @current_user if @current_user
    return nil unless authorized?
    user_name = auth.credentials[0]
    user = StarChat::User.find(user_name)
    return @current_user = user if user
    user = StarChat::User.new(user_name).save
    lobby_channel = (StarChat::Channel.find('Lobby') or
                     StarChat::Channel.new('Lobby').save)
    StarChat::Subscribing.save(lobby_channel, user)
    broadcast(type: 'subscribing',
              channel_name: lobby_channel.name,
              user_name: user_name) do |user_name|
      return false unless u = StarChat::User.find(user_name)
      lobby_channel.users.any?{|u2| u2.name == u.name}
    end
    @current_user = user
  end

  def broadcast(values)
    json = values.to_json
    settings.streams.each do |user_name, connection|
      next unless yield(user_name)
      # TODO: error handling?
      connection << json << "\n"
    end
  end

  def uri_encode(str)
    # Rack::Utils.escape is not for URI but for application/x-www-form-urlencoded
    Rack::Utils.escape(str).gsub('+', '%20')
  end

  def uri_decode(str)
    Rack::Utils.unescape(str.gsub('+', '%2B'))
  end

end

get '/', provides: :html do
  erb(:index)
end

before %r{^/users/([^/]+)} do
  protect!
  user_name = params[:captures][0]
  halt 401 if user_name != current_user.name
end

get '/users/:user_name', provides: :json do
  current_user.to_json
end

put '/users/:user_name', provides: :json do
  if params[:nick]
    current_user.nick = params[:nick].to_s
  end
  if params[:keywords] and params[:keywords].kind_of?(Array)
    current_user.keywords = params[:keywords]
  end
  current_user.save
  200
end

get '/users/:user_name/ping', provides: :json do
  {
    result: 'pong',
  }.to_json
end

get '/users/:user_name/channels', provides: :json do
  current_user.channels.to_json
end

get '/users/:user_name/stream', provides: :json do
  user_name = params[:user_name].to_s
  stream(:keep_open) do |out|
    subscribe = [user_name, out]
    settings.streams << subscribe
    if params[:start_time]
      start_time = params[:start_time].to_i
      end_time   = Time.now.to_i + 1
      packets = current_user.channels.inject([]) do |msgs, channel|
        msgs.concat(channel.messages_by_time_span(start_time, end_time).map do |msg|
                      {
                        type: 'message',
                        message: msg,
                      }
                    end.to_a)
      end
      packets.sort do |a, b|
        a[:message].id <=> b[:message].id
      end.each do |packet|
        out << packet.to_json << "\n"
      end
    end
    out.callback do
      settings.streams.delete(subscribe)
    end
    out.errback do
      settings.streams.delete(subscribe)
    end
  end
end

before %r{^/channels/([^/]+)} do
  protect!
  channel_name = params[:captures][0]
  # TODO: only for members?
  @channel = StarChat::Channel.find(channel_name)
  if @channel
    if (request.put? or request.delete? or request.post?) and
        !current_user.subscribing?(@channel)
      halt 401
    end
    if @channel.private? and
        !current_user.subscribing?(@channel)
      halt 401
    end
  else
    halt 404 unless request.put?
  end
end

get '/channels/:channel_name', provides: :json do
  @channel.to_json
end

put '/channels/:channel_name', provides: :json do
  result = 200
  unless @channel
    @channel = StarChat::Channel.save(params[:channel_name]).save
    result = 201
  end
  # TODO: params[:topic][:body]?
  if params[:topic_body]
    topic = @channel.update_topic(current_user, params[:topic_body])
    # TODO: move after saving?
    broadcast(type: 'topic',
              topic: topic) do |user_name|
      return false unless user = StarChat::User.find(user_name)
      user.subscribing?(@channel)
    end
  end
  if params[:privacy]
    @channel.privacy = params[:privacy]
  end
  @channel.save
  result
end

get '/channels/:channel_name/users', provides: :json do
  # TODO: This is a temporal hack.
  @channel.users.map do |user|
    hash = user.to_h
    hash.delete(:keywords) if user.name != current_user.name
    hash
  end.to_json
end

get '/channels/:channel_name/messages/:range', provides: :json do
  range = params[:range].to_s
  if range == 'recent'
    idx, len = -100, 100
    @channel.messages(idx, len).to_json
  else
    halt 404
  end
end

get '/channels/:channel_name/messages/by_time_span/:start_time,:end_time', provides: :json do
  start_time = params[:start_time].to_i
  end_time   = params[:end_time].to_i
  @channel.messages_by_time_span(start_time, end_time).to_json
end

post '/channels/:channel_name/messages', provides: :json do
  sleep(1) if development?
  body = params[:body].to_s
  message = @channel.post_message(current_user, body)
  # TODO: In fact, the real-time search is not needed.
  StarChat::GroongaDB.add_message(message)
  broadcast(type: 'message',
            message: message) do |user_name|
    return false unless user = StarChat::User.find(user_name)
    # TODO: Use User#subscribing?
    user.channels.any?{|channel| channel.name == @channel.name}
  end
  201
end

get '/channels/:channel_name/latest_key', provides: :json do
  halt 400 unless @channel.private?
  expire_time = Time.now.to_i + 60
  {
    channel_name: @channel.name,
    key:          @channel.generate_key(current_user, expire_time),
  }.to_json
end

before '/subscribings' do
  protect!
  channel_name = params[:channel_name].to_s
  user_name    = params[:user_name].to_s
  halt 400 unless channel_name.kind_of?(String)
  halt 400 unless user_name.kind_of?(String)
  halt 401 if user_name != current_user.name
  @channel = StarChat::Channel.find(channel_name)
  @channel_name = channel_name
end

put '/subscribings', provides: :json do
  unless @channel
    channel_key = request['X-StarChat-Channel-Key']
    @channel = StarChat::Channel.new(@channel_name)
    @channel.save
  end
  halt 409 if StarChat::Subscribing.exist?(@channel, current_user)
  if @channel.private?
    # TODO: Use one-time password
    halt 401 if channel_key.nil? or channel_key.empty?
    halt 401 unless @channel.auth?(channel_key)
  end
  StarChat::Subscribing.save(@channel, current_user)
  broadcast(type: 'subscribing',
            channel_name: @channel.name,
            user_name: current_user.name) do |user_name|
    return false unless user = StarChat::User.find(user_name)
    # TODO: Use User#subscribing?
    @channel.users.any?{|u| u.name == user.name}
  end
  packets = @channel.messages(-100, 100).map do |message|
    {
      type: 'message',
      message: message,
    }.to_json
  end.to_a
  unless packets.empty?
    packets_str = packets.join("\n")
    settings.streams.each do |user_name, connection|
      next if user_name != current_user.name
      connection << packets_str << "\n"
    end
  end
  201
end

delete '/subscribings', provides: :json do
  halt 400 unless @channel
  halt 409 unless StarChat::Subscribing.exist?(@channel, current_user)
  StarChat::Subscribing.destroy(@channel, current_user)
  broadcast(type: 'delete_subscribing',
            channel_name: @channel.name,
            user_name: current_user.name) do |user_name|
    return false unless user = StarChat::User.find(user_name)
    # TODO: Use User#subscribing?
    @channel.users.any?{|u| u.name == user.name}
  end
  200
end

before '/messages' do
  protect!
end

get '/messages/search/:query', provides: :json do
  channels = current_user.channels
  query = params[:query]
  StarChat::GroongaDB.search_messages(channels, query).to_a.to_json
end
