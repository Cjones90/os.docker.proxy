"use strict";

const http = require("http");
const SERVICE_NAME = process.env.SERVICE_NAME
const SERVICE_PORT = process.env.SERVICE_PORT

// This is dockers default docker0 bridge - Keeping hardcoded until its a problem
const bridgeIP = "172.17.0.1"
const consulAPIPort = 8500
const IMAGE_VER = process.env.IMAGE_VER
const DEREGISTER_ON_EXIT = JSON.parse(process.env.DEREGISTER_ON_EXIT) || false

module.exports = {

    register: function() {
        let serviceToRegister = {
            "ID": SERVICE_NAME,
            "Name": SERVICE_NAME,
            "Tags": [ IMAGE_VER ],
            "Address": "",
            "Port": +SERVICE_PORT,
            "EnableTagOverride": false,
            "Checks": [
                {
                    "DeregisterCriticalServiceAfter": "12h",
                    "HTTP": `http://localhost:${SERVICE_PORT}`,
                    "Interval": "20s"
                },
                {
                    "DeregisterCriticalServiceAfter": "12h",
                    "Script": `docker ps -f "name=${SERVICE_NAME}" -f status=running | wc -l | awk '{lines=$0-1; print lines}' `,
                    "Interval": "20s"
                },
            ]
        }

        let opts = {
            method: "PUT",
            port: consulAPIPort,
            path: `/v1/agent/service/register`,
            hostname: bridgeIP
        }
        let response = "";
        let req = http.request(opts, (res) => {
            res.setEncoding('utf8');
            res.on('data', (chunk) => { response += chunk.toString(); });
            res.on('end', () => { console.log(response); });
        })
        req.on("error", (e) => { console.log("ERR:", e) })
        req.end(JSON.stringify(serviceToRegister))

        if (DEREGISTER_ON_EXIT) {
            // listen for TERM signal .e.g. kill
            process.on('SIGTERM', this.deregister);
            // listen for INT signal e.g. Ctrl-C
            process.on('SIGINT', this.deregister);
            process.on('exit', this.deregister);
        }
    },

    deregister: function() {
        console.log("Deregistering "+SERVICE_NAME);
        let opts = {
            method: "PUT",
            port: consulAPIPort,
            path: `/v1/agent/service/deregister/${SERVICE_NAME}`,
            hostname: bridgeIP
        }
        let response = "";
        let req = http.request(opts, (res) => {
            res.setEncoding('utf8');
            res.on('data', (chunk) => { response += chunk.toString(); });
            res.on('end', () => { console.log(response); });
        })
        req.on("error", (e) => { console.log("ERR:", e) })
        req.end()
    }
}
