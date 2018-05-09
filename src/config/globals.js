'use strict';

window.HOST = location.protocol+"//"+location.host;
window.WS_HOST = location.protocol === 'http:' ? `ws://${location.host}` : `wss://${location.host}`;
window.DOMAIN = location.protocol+"//"+location.hostname
