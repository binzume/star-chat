'use strict';

$(function() {
    var clickChannelDel = function (view) {
        return function (channel) {
            var channelName = channel.name;
            var msg = "Are you sure you want to delete subscribing '" +
                channelName + "'?"
            if (!confirm(msg)) {
                return false;
            }
            var url = '/subscribings?' +
                'channel_name=' + encodeURIComponent(channelName) + ';' +
                'user_name=' + encodeURIComponent(view.session().userName());
            starChat.ajaxRequest(view.session(), url, 'DELETE', null, function (sessionId, uri, method, data) {
                starChat.clearFragment();
                getView().channelName = '';
                receiveResponse(sessionId, uri, method, data);
            });
            return false;
        };
    }
    var getView = (function () {
        var view = null;
        return function () {
            if (view === null) {
                view = new starChat.View(starChat.Session);
                view.clickChannelDel(clickChannelDel(view));
            }
            return view;
        };
    })();
    var stream = new starChat.Stream(new starChat.PacketProcessor());
    function logIn(userName, password) {
        console.log('Logging in...');
        localStorage.userName = userName;
        localStorage.password = password;
        var view = getView();
        view.logIn(userName, password);
        var url = '/users/' + encodeURIComponent(userName) + '/channels';
        starChat.ajaxRequest(view.session(), url, 'GET', null, receiveResponse);
        stream.start(view);
    }
    function logOut() {
        console.log('Logging out...');
        delete localStorage.userName;
        delete localStorage.password;
        var view = getView();
        view.logOut();
        $('#messages > section[data-channel-name!=""]').remove();
        view.update();
        stream.stop();
        starChat.clearFragment();
    }
    function tryLogIn(userName, password) {
        if (!userName) {
            userName = '';
        }
        if (!password) {
            password = '';
        }
        var allAscii = /^[\x20-\x7E]*$/;
        if (!userName.match(allAscii)) {
            return;
        }
        if (!password.match(allAscii)) {
            return;
        }
        var callbacks = {
            success: function (data, textStatus, jqXHR) {
                logIn(userName, password);
            },
            logOut: logOut,
        };
        starChat.ajax(userName, password,
                      '/users/' + encodeURIComponent(userName),
                      'GET',
                      callbacks);
    }

    var onHashchange = (function () {
        var lastFragment = null;
        return function () {
            var view = getView();
            var session = view.session();
            if (session.id() === 0) {
                return;
            }
            var fragment = starChat.getFragment();
            if (fragment === lastFragment) {
                return;
            }
            lastFragment = fragment;
            view.channelName = '';
            view.resetTimeSpan();
            if (fragment.match(/^channels\//)) {
                if (fragment.match(/^channels\/([^\/]+)$/)) {
                    var channelName = decodeURIComponent(RegExp.$1);
                    var startTime   = null;
                    var endTime     = null;
                } else if (fragment.match(/^channels\/([^\/]+)\/old_logs\/by_time_span\/(\d+),(\d+)$/)) {
                    var channelName = decodeURIComponent(RegExp.$1);
                    var startTime   = parseInt(decodeURIComponent(RegExp.$2));
                    var endTime     = parseInt(decodeURIComponent(RegExp.$3));
                    view.setTimeSpan(startTime, endTime);
                } else {
                    return;
                }
                var isAlreadyJoined = false;
                view.channels.forEach(function (channel) {
                    if (channel.name === channelName) {
                        isAlreadyJoined = true;
                        return false;
                    }
                });
                if (isAlreadyJoined || view.isShowingOldLogs()) {
                    view.channelName = channelName;
                    if ($.isNumeric(startTime) && $.isNumeric(endTime)) {
                        var url = '/channels/' + encodeURIComponent(channelName) +
                            '/messages/by_time_span/' +
                            encodeURIComponent(startTime) + ',' + encodeURIComponent(endTime);
                        starChat.ajaxRequest(session, url, 'GET', null, receiveResponse);
                    }
                    var url = '/channels/' + encodeURIComponent(channelName) + '/users';
                    starChat.ajaxRequest(session, url, 'GET', null, receiveResponse);
                    return;
                }
                // Confirming joining the new channel
                var msg = "Are you sure you want to join '" +
                    channelName + "'?"
                if (!confirm(msg)) {
                    return;
                }
                var url = '/subscribings?' +
                    'channel_name=' + encodeURIComponent(channelName) + ';' +
                    'user_name=' + encodeURIComponent(session.userName());
                starChat.ajaxRequest(session, url, 'PUT', null, function (sessionId, uri, method, data) {
                    receiveResponse(sessionId, uri, method, data);
                    var view = getView();
                    view.channelName = channelName;
                    view.update();
                });
            }
        }
    })();

    $(window).bind('hashchange', onHashchange);

    function receiveResponse(sessionId, uri, method, data) {
        var view = getView();
        var session = view.session();
        if (session.id() === 0) {
            return;
        }
        if (session.id() !== sessionId) {
            return;
        }
        try {
            if (method === 'GET') {
                if (uri.match(/^\/users\/([^\/]+)\/channels$/)) {
                    var userName = decodeURIComponent(RegExp.$1);
                    if (userName === session.userName()) {
                        view.channels = data;
                    }
                } else if (uri.match(/^\/channels\/([^\/]+)\/users$/)) {
                    var channelName = decodeURIComponent(RegExp.$1);
                    var userNames = {};
                    data.forEach(function (user) {
                        userNames[user.name] = true;
                    });
                    view.userNames[channelName] = userNames;
                } else if (uri.match(/^\/channels\/([^\/]+)\/messages\/by_time_span\/(\d+),(\d+)$/)) {
                    var channelName = decodeURIComponent(RegExp.$1);
                    var startTime   = decodeURIComponent(RegExp.$2);
                    var endTime     = decodeURIComponent(RegExp.$3);
                    view.setOldMessages(channelName, startTime, endTime, data);
                }
            } else if (method === 'PUT') {
                if (uri.match(/^\/subscribings\?/)) {
                    var params = starChat.parseQuery(uri);
                    var channelName = params['channel_name'];
                    var r = $.grep(view.channels, function (channel) {
                        return channel.name === channelName;
                    });
                    if (r.length === 0) {
                        view.channels.push({name: channelName});
                    }
                }
            } else if (method === 'DELETE') {
                if (uri.match(/^\/subscribings\?/)) {
                    var params = starChat.parseQuery(uri);
                    var channelName = params['channel_name'];
                    var idx = -1;
                    for (var i = 0; i < view.channels.length; i++) {
                        if (view.channels[i].name === channelName) {
                            idx = i;
                            break;
                        }
                    }
                    if (idx !== -1) {
                        view.channels.splice(i, 1);
                    }
                }
            }
        } finally {
            view.update();
            $(window).trigger('hashchange');
        }
    }
    
    (function () {
        var form = $('#logInForm');
        var userName = localStorage.userName;
        var password = localStorage.password;
        if (userName) {
            tryLogIn(userName, password);
        } else {
            logOut();
        }
        form.find('input[type="submit"]').click(function (e) {
            var userName = form.find('input[name="userName"]').val();
            var password = form.find('input[name="password"]').val();
            if (!userName) {
                return false;
            }
            tryLogIn(userName, password);
            e.stopPropagation();
            return false;
        });
    })();
    (function () {
        $('#logOutLink a').click(function () {
            logOut();
            return false;
        });
    })();
    (function () {
        var form = $('#addChannelForm');
        form.find('input[type="submit"]').click(function () {
            var session = getView().session();
            var channelName = form.find('input[name="name"]').val();
            if (!channelName) {
                return false;
            }
            var url = '/subscribings?' +
                'channel_name=' + encodeURIComponent(channelName) + ';' +
                'user_name=' + encodeURIComponent(session.userName());
            starChat.ajaxRequest(session, url, 'PUT', null, function (sessionId, uri, method, data) {
                form.find('input[name="name"]').val('');
                receiveResponse(sessionId, uri, method, data);
                location.hash = 'channels/' + encodeURIComponent(channelName);
            });
            return false;
        });
    })();
    (function () {
        var form = $('#postMessageForm');
        var isPostingMessage = false;
        form.find('input[type="submit"]').click(function () {
            var session = getView().session();
            if (!session.isLoggedIn()) {
                // TODO: show alert or do something
                return false;
            }
            var view = getView();
            if (isPostingMessage) {
                return false;
            }
            if (!view.channelName) {
                return false;
            }
            var body = form.find('input[name="body"]').val();
            if (!body) {
                return false;
            }
            var url = '/channels/' + encodeURIComponent(view.channelName) +
                '/messages';
            starChat.ajaxRequest(session, url, 'POST', {
                body: body,
            }, function (sessionId, uri, method, data) {
                receiveResponse(sessionId, uri, method, data);
                form.find('input[name="body"]').val('');
            });
            isPostingMessage = true;
            setTimeout(function () {
                isPostingMessage = false;
            }, 500);
            return false;
        });
    })();
    (function () {
        $('#channels menu img[data-tool-id="edit"]').click(function () {
            var view = getView();
            view.isEdittingChannels = !view.isEdittingChannels;
            view.update();
            return false;
        });
    })();
});

// Firefox Modification
$(function () {
    if (!$.browser.mozilla) {
        return;
    }
    function relayout() {
        $('#messages > section').height($('#messages').height() -
                                        $('#messages > h2').outerHeight() -
                                        $('#messages > form').height());
    }
    var isRequestedRelayouting = false;
    $(window).resize(function () {
        isRequestedRelayouting = true;
    });
    function loop() {
        (function () {
            if (!isRequestedRelayouting) {
                return;
            }
            relayout();
        })();
        setTimeout(loop, 500);
    }
    loop();
    relayout();
});
