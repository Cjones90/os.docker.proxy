"use strict";

const http = require("http");
const https = require("https");
const os = require("os");
const fs = require("fs");
const url = require("url");
const path = require("path");

const { service } = require("os-npm-util");
const routes = require("./routes.js");
const serverState = require("./serverState.js");

const BIN = process.env.BIN;
const PUB_FILES = process.env.PUB_FILES;
const OUTPUT_FILES = process.env.OUTPUT_FILES;
const REGISTER_SERVICE = JSON.parse(process.env.REGISTER_SERVICE);
const DEV_ENV = process.env.DEV_ENV ? JSON.parse(process.env.DEV_ENV) : ""

const CONSUL_CHECK_UUID = os.hostname();
const LOG_EVERY_NUM_CHECKS = process.env.LOG_EVERY_NUM_CHECKS || 15;
let serverCheckCount = 0;

const HTTP_PORT = process.env.HTTP_PORT ? process.env.HTTP_PORT : 80;
const HTTPS_PORT = process.env.HTTPS_PORT ? process.env.HTTPS_PORT : 443;
const LISTEN_ON_SSL = process.env.LISTEN_ON_SSL ? JSON.parse(process.env.LISTEN_ON_SSL) : false;
const SSL_TERMINATION = process.env.SSL_TERMINATION ? JSON.parse(process.env.SSL_TERMINATION) : false;

const httpProxy = require("http-proxy");

// // TODO: GET domain
// For now w'll use docker bridge to get domain from consul until we find
//   a good solution on passing domain to each app
// const DOMAIN = process.env.DOMAIN ? process.env.DOMAIN : "localhost";
const consul = require('consul')({host: `172.17.0.1`});
const proxy = httpProxy.createProxyServer()

let HOSTS = {}

getAppRoutes()
setInterval(getAppRoutes, 1000 * (DEV_ENV ? 30 : 60)

function getAppRoutes() {
    consul.kv.get({key: "apps", recurse: true}, (err, results) => {
        if(err) { console.log("ERR - SERVER.KVGETAPPS:\n", err);}

        let apps = {}
        results.forEach((app) => {
            let appName = app.Key.split("/")[1]
            let key = app.Key.split("/")[2]
            let value = app.Value
            !apps[appName] && (apps[appName] = {})
            apps[appName][key] = value
        })
        consul.kv.get("domainname", (err, result) => {
            registerEndpoints(apps, result.Value)
        })
    })
}

function registerEndpoints(apps, domain) {
    Object.keys(apps).forEach((appName) => {
        let host = appName+"."+domain
        let betahost = "beta."+host
        let activeAppColor = apps[appName]["active"]
        HOSTS[host] = apps[appName][activeAppColor]
        HOSTS[betahost] = apps[appName][activeAppColor!=="blue"?"blue":"green"]
    })
    console.log("Endpoints refreshed");
}


const onProtoUpgrade = (req, socket, head) => {
    let targetProto = SSL_TERMINATION ? "ws:" : "wss:"
    proxy.ws(req, socket, head, { target: `${targetProto}//`+HOSTS[req.headers.host] }, (err) => {
        err && console.log("WS proxy err: ", err);
    });
}

const handleHealthCheck = (req, res) => {
    let systems_online = LISTEN_ON_SSL
        ? serverState.https_is_healthy && serverState.server_is_healthy
        : serverState.server_is_healthy
    if(LOG_EVERY_NUM_CHECKS > 0 && ++serverCheckCount % LOG_EVERY_NUM_CHECKS === 0) {
        console.log(`Container ${os.hostname}: ${systems_online?"Online":"Malfunctioning"}`);
    }
    let httpStatusCode = systems_online ? 200 : 404
    res.writeHead(httpStatusCode)

    let exitCode = systems_online ? "0" : "1"
    res.end(exitCode)

    let checkPassOrFail = systems_online ? "pass" : "fail"
    let TTL = {
        definition: "passOrFail",
        path: `/v1/agent/check/${checkPassOrFail}/${CONSUL_CHECK_UUID}`,
    }
    REGISTER_SERVICE && service.sendToCatalog(TTL)
}

function send404(req, res) {
    // TODO: Seperate 404's depending on what we found
    let extname = path.extname(url.parse(req.url).pathname);
    let file = (url.parse(req.url).pathname).slice(1);
    let contentTypes = {
        ".js": "text/javascript",
        ".ico": "text/x-icon",
        ".html": "text/html",
    }
    let filePath = contentTypes[extname] ? PUB_FILES+file : PUB_FILES+"index.html"
    let contentType = contentTypes[extname] ? contentTypes[extname] : 'text/html';
    res.setHeader('Cache-Control', 'public, max-age=' + (1000 * 60 * 60 * 24 * 30))
    res.writeHead(404, {"Content-Type": contentType});
    fs.readFile(filePath, "utf8", (err, data) => {
        if(filePath.match(`${PUB_FILES}index.html`)) {
            data = data.replace(/%%VERSION%%/, service.IMAGE_VER)
        }
        res.end(data)
    })
}

// Servers
const httpServer = http.createServer((req, res) => {
    let isDockerHealthCheck = req.headers.host === "localhost" && req.url === "/healthcheck"
    if(isDockerHealthCheck) { return handleHealthCheck(req, res) }

    if(!HOSTS[req.headers.host]) {
        console.log(`Could not find 'req.headers.host': ${req.headers.host} in 'HOSTS'`);
        return send404(req, res);
    }

    let requrl = url.parse(req.url).pathname
    let hostname = req.headers.host.split(".").length > 2
        ? req.headers.host.replace(/^[\w]+\./, "")
        : req.headers.host

    if(requrl.indexOf("/.well-known/acme-challenge") > -1) {
        console.log("Certbot");
        return proxy.web(req, res, { target: `http://cert.${hostname}:8080`}, (err) => {
            console.log("ERR - SERVER.ACME-CHALLENGE:\n", err);
            res.end("Could not proxy for certbot")
        })
    }
    if(LISTEN_ON_SSL) {
        res.writeHead(302, {"Location": "https://"+req.headers.host+req.url}); // Redirect to https
        res.end();
    }
    else {
        proxy.web(req, res, { target: "http://"+HOSTS[req.headers.host] }, (err) => {
            console.log("ERR - SERVER.HTTP_SERVER:\n", err);
            return send404(req, res);
        })
    }
})

console.log("======= Starting server =======");
registerGracefulShutdown(httpServer, "http")
httpServer.on("upgrade", onProtoUpgrade)
if(REGISTER_SERVICE) { service.register(DEV_ENV); }
httpServer.listen(HTTP_PORT, () => {
    console.log("HTTP proxy on port: "+HTTP_PORT)
    setTimeout(() => {
        serverState.changeServerState(true)
        !LISTEN_ON_SSL && process.send('ready')
    }, 1000);
});


if(LISTEN_ON_SSL) {

    consul.kv.get({key: "ssl/", recurse: true}, (err, results) => {
        if(err) { console.log("ERR - SERVER.KVGETSSL:\n", err);}

        let certs = {}
        results.forEach((cert) => {
            let certName = cert.Key.split("/")[1]
            certName === "privkey" && (certs["key"] = cert.Value)
            certName === "fullchain" && (certs["cert"] = cert.Value)
            certName === "chain" && (certs["ca"] = cert.Value)
        })

        // Ensure we dont attempt to start httpsserver without certs
        if (certs.key === "") {
            return console.log("LISTEN_ON_SSL is set to true, but certs do not exist.");
        }

        const httpsServer = https.createServer(certs, (req, res) => {
            if(!HOSTS[req.headers.host]) { return send404(req, res); }
            let targetProto = SSL_TERMINATION ? "http:" : "https:"
            proxy.web(req, res, { target: `${targetProto}//`+HOSTS[req.headers.host] }, (err) => {
                console.log("ERR - SERVER.HTTPS_SERVER:\n", err);
                return send404(req, res);
            })
        })
        registerGracefulShutdown(httpsServer, "https")
        httpsServer.on("upgrade", onProtoUpgrade)
        httpsServer.listen(HTTPS_PORT, () => {
            console.log("HTTPS proxy on port: "+HTTPS_PORT)
            setTimeout(() => {
                process.send('ready')
                serverState.changeHttpsState(true)
            }, 1000);
        });
    })
}

function registerGracefulShutdown(server, type) {
    let close = () => {
        console.log(`${type} received SIG signal, shutting down`);
        type === "http" && serverState.changeServerState(false)
        type === "https" && serverState.changeHttpsState(false)
        let closeServer = () => server.close(() => {
            console.log(`Closed out ${type} successfully`);
            setTimeout(() => {
                // Wait for both http and https to close
                let serversOffline = LISTEN_ON_SSL
                    ? !serverState.https_is_healthy && !serverState.server_is_healthy
                    : !serverState.server_is_healthy
                serversOffline && console.log("== Exiting now ==") && process.exit()
            }, 1000)
        })
        REGISTER_SERVICE && service.deregisterCheck(CONSUL_CHECK_UUID, closeServer);
        !REGISTER_SERVICE && closeServer()
    }
    process.on("SIGTERM", close)
    process.on("SIGHUP", close)
    process.on("SIGINT", close)
    process.on("SIGQUIT", close)
    process.on("SIGABRT", close)
}
