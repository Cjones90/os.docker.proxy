"use strict";

module.exports = {
    apps: [{
        "name": "App",
        "cwd": "./",
        "watch": ["server", "pub"],
        "script": "./server/server.js",
        "out_file": "./logs/server-out.log",
        "error_file": "./logs/server-err.log",
        "log_date_format": "MMMM Do YYYY, h:mm:ss a",
        "min_uptime": 10000,
        "max_restarts": 3,
        "next_gen_js": true,
        "ignore_watch": ["server/bin", "server/output"],
        "exec_mode": "cluster",
        "instances": 1
  }]
}
