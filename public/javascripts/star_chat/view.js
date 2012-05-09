'use strict';

starChat.View = (function () {
    var View = function (sessionClass) {
        this.sessionClass_ = sessionClass;

        initialize(this);
    };
    function initialize(self) {
        self.session_ = new self.sessionClass_();

        // TODO: Model に相当するクラスを作る?
        // TODO: いずれこれらの変数も private (_ 終わり) にする
        self.channels = [];
        self.channelName = '';
        self.newMessages = {};
        self.messageScrollTops = {};
        self.userNames = {};
        self.isEdittingChannels = false;

        self.lastChannelName_ = '';
        self.messageIdsAlreadyInSection_ = {};
        self.dirtyFlags_ = {};
        self.startTime_ = null;
        self.endTime_ = null;
        self.oldMessages_ = {};
    }
    var updateViewChannels = (function () {
        var lastSessionId = 0;
        var cachedChannels = [];
        return function (self) {
            // channels
            var channels = self.channels.sort(function (a, b) {
                if (a.name > b.name) {
                    return 1;
                }
                if (a.name < b.name) {
                    return -1;
                }
                return 0;
            });
            if (self.channelName) {
                self.dirtyFlags_[self.channelName] = false;
            }
            (function () {
                var ul = $('#channels ul');
                ul.empty();
                channels.forEach(function (channel) {
                    var a = $('<a></a>');
                    var name = channel.name;
                    var href = '#channels/' + encodeURIComponent(channel.name);
                    a.attr('href', href);
                    a.toggleClass('dirty', self.dirtyFlags_[name]);
                    a.text(name);
                    var delLink = $('<img src="" alt="delete" width="16" height="16" class="toolIcon" data-image-icon-name="blackTrash" data-tool-id="delete" />').click(function () {
                        return self.clickChannelDel_(channel);
                    });
                    var li = $('<li></li>').append(a).append(delLink);
                    ul.append(li);
                });
                cachedChannels = [];
                for (var i = 0; i < channels.length; i++) {
                    cachedChannels[i] = channels[i];
                }
                lastSessionId = self.session_.id();
            })();
            if (self.isEdittingChannels) {
                $('#channels li img[data-tool-id="delete"]').show();
            } else {
                $('#channels li img[data-tool-id="delete"]').hide();
            }
        }
    })();
    function getSectionElement(self) {
        if (!self.channelName) {
            return null;
        }
        var sections = $('#messages > section').filter(function (i) {
            return $(this).attr('data-channel-name') === self.channelName &&
                (!self.isShowingOldLogs() &&
                 !$(this).attr('data-start-time') &&
                 !$(this).attr('data-end-time')) ||
                (self.isShowingOldLogs() &&
                 parseInt($(this).attr('data-start-time')) === self.startTime_ &&
                 parseInt($(this).attr('data-end-time'))   === self.endTime_);
        });
        if (sections.length === 1) {
            var section = sections;
            section.find('input[name="year"]').val('');
            section.find('input[name="month"]').val('');
            section.find('input[name="day"]').val('');
            return section;
        }
        if (2 <= sections.length) {
            throw 'invalid sections';
        }
        var section = $('<section></section>');
        var channelName = self.channelName;
        section.attr('data-channel-name', channelName);
        if (self.isShowingOldLogs()) {
            section.attr('data-start-time', self.startTime_);
            section.attr('data-end-time',   self.endTime_);
        }
        if (!self.isShowingOldLogs()) {
            section.scroll(function () {
                self.messageScrollTops[channelName] = section.scrollTop();
            });
        }
        var inputYear   = $('<input type="number" name="year" min="0" max="9999" value="" />');
        var inputMonth  = $('<input type="number" name="month" min="1" max="12" value="" />');
        var inputDay    = $('<input type="number" name="day" min="1" max="31" value="" />');
        var inputSubmit = $('<input type="submit" value="Show" />');
        var oldLogsP    = $('<p></p>').append('Old Logs: ');
        oldLogsP.append(inputYear).append('-').append(inputMonth).append('-').append(inputDay);
        oldLogsP.append(inputSubmit);
        var oldLogsForm = $('<form action="." method="get"></form>');
        oldLogsForm.append(oldLogsP);
        inputSubmit.click(function () {
            var year  = inputYear.val();
            var month = inputMonth.val();
            var day   = inputDay.val();
            var startTime = (new Date(year, month - 1, day)).getTime() / 1000;
            var endTime   = startTime + 60 * 60 * 24;
            var fragment = 'channels/' + encodeURIComponent(channelName) +
                '/old_logs/by_time_span/' +
                encodeURIComponent(startTime) + ',' + encodeURIComponent(endTime);
            location.hash = fragment;
            return false;
        });
        section.append(oldLogsForm);
        $('#messages h2').after(section);
        return section;
    }
    function messageToElement(message) {
        var messageSection = $('<section></section>');
        messageSection.addClass('message');
        var userNameP = $('<p></p>').text(message.user_name);
        userNameP.addClass('userName');
        messageSection.append(userNameP);
        var bodyP = $('<p></p>').text(message.body);
        bodyP.addClass('body');
        messageSection.append(bodyP);
        var time = new Date();
        time.setTime(message.created_at * 1000);
        var h = time.getHours() + '';
        var m = time.getMinutes() + '';
        if (h.length < 2) {
            h = '0' + h;
        }
        if (m.length < 2) {
            m = '0' + m;
        }
        var timeStr = h + ':' + m;
        var createdAt = $('<time></time>').text(timeStr);
        createdAt.addClass('createdAt');
        createdAt.attr('data-unix-time', message.created_at)
        messageSection.append(createdAt);
        messageSection.attr('data-message-id', message.id);
        return messageSection;
    }
    function updateViewMessages(self) {
        if (self.channelName) {
            if (self.isShowingOldLogs()) {
                var d = new Date(self.startTime_ * 1000);
                if ((self.endTime_ - self.startTime_) === 60 * 60 * 24 &&
                    d.getHours() === 0 &&
                    d.getMinutes() === 0 &&
                    d.getSeconds() === 0) {
                    var startTime = starChat.toISO8601(new Date(self.startTime_ * 1000), 'date');
                    var oldLogs = '(Old Logs: ' + startTime + ')';
                } else {
                    var startTime = starChat.toISO8601(new Date(self.startTime_ * 1000));
                    var endTime   = starChat.toISO8601(new Date(self.endTime_   * 1000));
                    var oldLogs = '(Old Logs: ' + startTime + '/' + endTime + ')';
                }
                $('#messages h2').text(self.channelName + ' ' + oldLogs);
            } else {
                $('#messages h2').text(self.channelName);
            }
        } else {
            $('#messages h2').text("\u00a0");
        }
        if (!self.isShowingOldLogs()) {
            $('#messages > section').filter(function (i) {
                return $(this).attr('data-start-time') || $(this).attr('data-end-time');
            }).remove();
        }
        if (!self.channelName) {
            $('#messages > section').hide();
            self.lastChannelName_ = '';
            return;
        }
        var section = getSectionElement(self);
        $('#messages > section').each(function (i) {
            var e = $(this);
            if (e.attr('data-channel-name') === self.channelName &&
                (!self.isShowingOldLogs() ||
                 (parseInt(e.attr('data-start-time')) === self.startTime_ &&
                  parseInt(e.attr('data-end-time'))   === self.endTime_))) {
                e.show();
            } else {
                e.hide();
            }
        });
        // TODO: sort by id
        if (!self.isShowingOldLogs()) {
            if (self.channelName in self.newMessages) {
                var msgs = self.newMessages[self.channelName];
                msgs.forEach(function (message) {
                    if (self.messageIdsAlreadyInSection_[message.id]) {
                        return;
                    }
                    self.messageIdsAlreadyInSection_[message.id] = true;
                    section.append(messageToElement(message));
                });
                self.newMessages[self.channelName] = [];
            }
        } else {
            var key = self.startTime_ + '_' + self.endTime_;
            if (self.channelName in self.oldMessages_ &&
                key in self.oldMessages_[self.channelName]) {
                // TODO: Refactoring
                section.find('section.message').remove();
                var msgs = self.oldMessages_[self.channelName][key];
                msgs.forEach(function (message) {
                    section.append(messageToElement(message));
                });
            }
        }
        if (!self.isShowingOldLogs()) {
            if (self.lastChannelName_ === self.channelName) {
                var isBottom =
                    section.get(0).scrollHeight - section.scrollTop() ===
                    section.outerHeight();
                if (isBottom) {
                    section.animate({scrollTop: section.get(0).scrollHeight});
                }
            } else {
                if (!self.lastChannelName_ ||
                    !(self.channelName in self.messageScrollTops)) {
                    section.scrollTop(section.get(0).scrollHeight);
                } else {
                    section.scrollTop(self.messageScrollTops[self.channelName]);
                }
            }
            self.messageScrollTops[self.channelName] = section.scrollTop();
            self.lastChannelName_ = self.channelName;
        }
    }
    function updateViewUsers(self) {
        var userNamesObj = self.userNames[self.channelName];
        if (!userNamesObj) {
            userNamesObj = {};
        }
        var userNames = Object.keys(userNamesObj).sort();
        var ul = $('#users ul');
        ul.empty();
        userNames.forEach(function (userName) {
            var li = $('<li></li>');
            li.text(userName);
            ul.append(li);
        });
    }
    View.prototype.update = function () {
        if (this.session_.isLoggedIn()) {
            $('#logInForm').hide();
            $('#logOutLink span').text(this.session_.userName());
            $('#logOutLink').show();
            $('#main input').removeAttr('disabled');
            if (this.channelName && !this.isShowingOldLogs()) {
                $('#postMessageForm input').removeAttr('disabled');
            } else {
                $('#postMessageForm input').attr('disabled', 'disabled');
            }
        } else {
            $('#logInForm').show();
            $('#logOutLink').hide();
            $('#main input').attr('disabled', 'disabled');
        }
        updateViewChannels(this);
        updateViewMessages(this);
        updateViewUsers(this);
        $('img[data-image-icon-name]').each(function () {
            var e = $(this);
            if (e.attr('src')) {
                return true;
            }
            var iconName = e.attr('data-image-icon-name');
            e.attr('src', starChat.Icons[iconName]);
        });
        $(window).resize();
    };
    View.prototype.logIn = function (userName, password) {
        this.session_ = new this.sessionClass_($.now, userName, password);
    };
    View.prototype.logOut = function () {
        this.session_ = new this.sessionClass_();
        initialize(this);
    };
    View.prototype.session = function () {
        return this.session_;
    };
    View.prototype.setDirtyFlag = function (channelName, value) {
        this.dirtyFlags_[channelName] = value;
    };
    // TODO: 関数名直すべき?
    View.prototype.clickChannelDel = function (func) {
        this.clickChannelDel_ = func;
        return this;
    };
    View.prototype.resetTimeSpan = function () {
        this.startTime_ = null;
        this.endTime_   = null;
    };
    View.prototype.setTimeSpan = function (startTime, endTime) {
        this.startTime_ = startTime;
        this.endTime_   = endTime;
    };
    View.prototype.isShowingOldLogs = function () {
        return $.isNumeric(this.startTime_) && $.isNumeric(this.endTime_);
    };
    View.prototype.setOldMessages = function (channelName, startTime, endTime, messages) {
        if (!(channelName in this.oldMessages_)) {
            this.oldMessages_[channelName] = {};
        }
        var key = startTime + '_' + endTime;
        this.oldMessages_[channelName][key] = messages;
    };
    return View;
})();
