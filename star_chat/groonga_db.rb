# coding: utf-8
require 'groonga'

module StarChat

  module GroongaDB

    module_function

    def load_or_create(path)
      if File.exist?(path)
        Groonga::Database.create(path: path)
        return
      end
      Groonga::Database.create(path: path)
      Groonga::Schema.define do |schema|
        schema.create_table('ChannelNames',
                            type: :hash,
                            key_type: 'ShortText') do |table|
        end
        schema.create_table('Messages',
                            type: :hash,
                            key_type: 'UInt64') do |table|
          table.reference('channel_name', 'ChannelNames')
          table.text('body')
        end
        schema.create_table('Terms',
                            type: :patricia_trie,
                            default_tokenizer: 'TokenBigram',
                            key_normalize: true) do |table|
          table.index('Messages.body', with_position: true)
        end
        schema.change_table('ChannelNames') do |table|
          table.index('Messages.channel_name', with_position: true)
        end
      end
      Channel.all.each do |channel|
        channel.messages.each do |message|
          add_message(channel.name, message)
        end
      end
    end

    def add_message(channel_name, message)
      entries = Groonga['Messages']
      raise 'Invalid state' unless entries
      entries.add(message.id,
                  channel_name: channel_name,
                  body:         message.body)
    end

    # TODO: Sort
    # TODO: Pagenate
    def search_messages(channels, keyword)
      return [] if channels.empty?
      return [] if keyword.empty?
      entries = Groonga['Messages']
      raise 'Invalid state' unless entries
      entries.select do |record|
        channels.map do |channel|
          record.channel_name == channel.name
        end.inject do |result, query|
          result | query
        end
      end.select do |record|
        record.body =~ keyword
      end.map do |record|
        id = record.key
        {
          channel_name: record.channel_name._key,
          message: Message.find(record._key),
        }
      end
    end

  end

end
