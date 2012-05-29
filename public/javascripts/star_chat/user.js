'use strict';

starChat.User = (function () {
    var User = function (name) {
        this.name_ = name;
        this.channels_ = [];
        this.keywords_ = [];
    };
    User.prototype.name = function () {
        return this.name_;
    };
    User.prototype.channels = function () {
        return this.channels_;
    };
    User.prototype.keywords = function (keywords) {
        if (keywords !== void(0)) {
            if (!$.isArray(keywords)) {
                throw 'Invalid assignment: keywords is not an array';
            }
            this.keywords_ = keywords;
            return this;
        } else {
            return this.keywords_;
        }
    };
    User.prototype.load = function (session, callback) {
        var url = '/users/' + encodeURIComponent(this.name_);
        var self = this;
        starChat.ajaxRequest(session, url, 'GET', null, function (sessionId, url, method, data) {
            self.keywords_ = data.keywords;
            if (callback !== void(0)) {
                callback(sessionId, url, method, data);
            }
        });
    };
    User.prototype.loadChannels = function (session, callback) {
        var url = '/users/' + encodeURIComponent(this.name_) + '/channels';
        var self = this;
        starChat.ajaxRequest(session, url, 'GET', null, function () {
            self.channels_ = data;
            if (callback !== void(0)) {
                callback(sessionId, url, method, data);
            }
        });
    };
    User.prototype.save = function (session, callback) {
        var url = '/users/' + encodeURIComponent(this.name_);
        starChat.ajaxRequest(session, url, 'PUT', {
            keywords: this.keywords_,
        }, function (sessionId, url, method, data) {
            if (callback !== void(0)) {
                callback(sessionId, url, method, data);
            }
        });
    };
    return User;
})();
