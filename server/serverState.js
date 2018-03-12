"use strict";

module.exports = {
    https_is_healthy: false,
    server_is_healthy: false,
    changeHttpsState: function (httpsIsOnline) {
        this.https_is_healthy = httpsIsOnline
        console.log("Https is now: ", httpsIsOnline?"Online":"Offline");
    },
    changeServerState: function (serverIsOnline) {
        this.server_is_healthy = serverIsOnline
        console.log("Server is now: ", serverIsOnline?"Online":"Offline");
    },
}
