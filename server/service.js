"use strict";

const http = require("http");
const fs = require("fs")

const yaml = require("js-yaml");

const yamlFile = fs.readFileSync("/home/app/docker-compose.yml")
const yamlObj = yaml.safeLoad(yamlFile)

const MAIN_SERVICE = yamlObj.services.main

const DOCKER_IMAGE = MAIN_SERVICE.image
const IMAGE_VER = DOCKER_IMAGE.match(/:(.+)/)[1]
const SERVICE_NAME = process.env.SERVICE_NAME || DOCKER_IMAGE.match(/\/(\w+):/)[1]

const SERVICE_PORTS = MAIN_SERVICE.ports[0].split(":")
const SERVICE_PORT = SERVICE_PORTS.filter((port) => /^\d+$/.exec(port))[0]

// This is dockers default docker0 bridge - Keeping hardcoded until its a problem
const bridgeIP = "172.17.0.1"
const consulAPIPort = 8500;

module.exports = {

    register: function() {
        let script = `
            NUM_CONTAINERS=$(docker ps -f status=running -f "label=com.consul.service=${SERVICE_NAME}" | wc -l | awk '{lines=$0-1; print lines}');
            echo $NUM_CONTAINERS;
            if [ "$NUM_CONTAINERS" = 0 ]; then exit 2 ; fi;
            if [ "$NUM_CONTAINERS" > 0 ]; then exit 0 ; fi;`

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
                    "Script": script,
                    "Interval": "20s",
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

    },

    deregister: function(service, ip, respond) {
        console.log("Deregistering "+service);
        let opts = {
            method: "PUT",
            port: consulAPIPort,
            path: `/v1/agent/service/deregister/${service}`,
            hostname: ip
        }
        let response = "";
        let req = http.request(opts, (res) => {
            res.setEncoding('utf8');
            res.on('data', (chunk) => { response += chunk.toString(); });
            res.on('end', () => { console.log("res:", response); respond && respond(response) });
            res.on('error', () => { console.log("err:", response); });
        })
        req.on("error", (e) => { console.log("ERR:", e) })
        req.end()
    }

}
