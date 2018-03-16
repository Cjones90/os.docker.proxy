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
const DEV_ENV = process.env.DEV_ENV ? JSON.parse(process.env.DEV_ENV) : ""
const REGISTER_SERVICE = process.env.REGISTER_SERVICE
    ? JSON.parse(process.env.REGISTER_SERVICE)
    : false;

const HTTP_PORT = process.env.HTTP_PORT ? process.env.HTTP_PORT : 80;
const HTTPS_PORT = process.env.HTTPS_PORT ? process.env.HTTPS_PORT : 443;
const LISTEN_ON_SSL = process.env.LISTEN_ON_SSL ? JSON.parse(process.env.LISTEN_ON_SSL) : false;
const SSL_TERMINATION = process.env.SSL_TERMINATION ? JSON.parse(process.env.SSL_TERMINATION) : false;
const USE_CONSUL_ROUTES = process.env.USE_CONSUL_ROUTES ? JSON.parse(process.env.USE_CONSUL_ROUTES) : false;

const httpProxy = require("http-proxy");

// // TODO: GET domain
// For now w'll use docker bridge to get domain from consul until we find
//   a good solution on passing domain to each app
// const DOMAIN = process.env.DOMAIN ? process.env.DOMAIN : "localhost";
const consul = require('consul')({host: `172.17.0.1`});
const proxy = httpProxy.createProxyServer()



serverState.registerConnection("http")
LISTEN_ON_SSL && serverState.registerConnection("https")

let HOSTS = {}

if(USE_CONSUL_ROUTES) {
    getAppRoutes()
    setInterval(getAppRoutes, 1000 * (DEV_ENV ? 30 : 60))
}
else {
    const hostsfile = fs.existsSync(`/run/secrets/hosts`) ? fs.readFileSync(`/run/secrets/hosts`) : ""
    HOSTS = hostsfile ? JSON.parse(hostsfile) : ""

    if(!Object.keys(HOSTS).length) {
        console.log("No hosts file found mounted at /run/secrets/hosts");
        console.log("If you're using docker swarm, be sure to add the secret 'hosts'");
        try {
            HOSTS = require("/home/app/hosts.js")
            console.log("Found hosts file at /home/app/hosts.js");
        }
        catch(e) {
            console.log(e);
            console.log("No file found mounted at /home/app/hosts.js");
            console.log("This app requires a pairing of dnsname -> reachable url");
            console.log("This can be done in several ways:");
            console.log("- Exported JS module file mounted to /home/app/hosts.js");
            console.log("- JSON file provided to docker swarm secrets 'hosts'");
            console.log("- Adding a consul KV pairing of apps/$SERVICE/$COLOR -> $SERVER_URL");
            console.log("  also adding apps/$SERVICE/active -> $COLOR");
            // TODO: Maybe we place something to keep the app running so it can be
            //   inspected and troubleshooted
            return
        }
    }
}


startHttpServer()
LISTEN_ON_SSL && startHttpsServer()





// TODO: Have the option to allow apps to register their endpoints.
// At the moment we only register them in terraform.
// Mainly helps with development - Production might want to keep it as is
function getAppRoutes() {
    consul.kv.get({key: "apps", recurse: true}, (err, results) => {
        if(err) { console.log("ERR - SERVER.KVGETAPPS:\n", err);}
        if(!results) { return console.log("ERR - SERVER.KVGETAPPS: No apps found"); process.exit(1) }

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
    // For now we don't serve up anything on default domain until we have a need
    // TODO: Modifying global variables in functions feels dirty to me, need to come
    //   up with a better way to handle this
    HOSTS[domain] = `http://cert.${domain}:8080`
    Object.keys(apps).forEach((appName) => {
        let host = appName+"."+domain
        let betahost = "beta."+host
        let activeAppColor = apps[appName]["active"]
        HOSTS[host] = apps[appName][activeAppColor]
        HOSTS[betahost] = apps[appName][activeAppColor!=="blue"?"blue":"green"]
    })
    console.log("Endpoints refreshed");
}


function startHttpServer() {
    const httpServer = http.createServer((req, res) => {

        let isDockerHealthCheck = req.headers.host === "localhost" && req.url === "/healthcheck"
        if(isDockerHealthCheck) { return serverState.handleHealthCheck(res) }

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
    serverState.registerSigHandler(httpServer, "http", REGISTER_SERVICE && !LISTEN_ON_SSL)
    if(REGISTER_SERVICE && !LISTEN_ON_SSL) { service.register(DEV_ENV); }
    httpServer.on("upgrade", onProtoUpgrade)
    httpServer.listen(HTTP_PORT, () => {
        console.log("HTTP proxy on port: "+HTTP_PORT)
        serverState.changeServerState("http", true)
        serverState.startIfAllReady()
    });
}

function startHttpsServer() {
    consul.kv.get({key: "ssl/", recurse: true}, (err, results) => {
        if(err) { console.log("ERR - SERVER.KVGETSSL:\n", err);}
        if(!results) {
            console.log("ERR - SERVER.KVGETSSL: No ssl found. Exiting");
            process.exit(1)
        }

        let certs = {}
        results.forEach((cert) => {
            let certName = cert.Key.split("/")[1]
            certName === "privkey" && (certs["key"] = cert.Value)
            certName === "fullchain" && (certs["cert"] = cert.Value)
            certName === "chain" && (certs["ca"] = cert.Value)
        })

        //// Ensure we dont attempt to start httpsserver without certs
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
        serverState.registerSigHandler(httpsServer, "https", REGISTER_SERVICE && LISTEN_ON_SSL)
        if(REGISTER_SERVICE && LISTEN_ON_SSL) { service.register(DEV_ENV); }
        httpsServer.on("upgrade", onProtoUpgrade)
        httpsServer.listen(HTTPS_PORT, () => {
            console.log("HTTPS proxy on port: "+HTTPS_PORT)
            serverState.changeServerState("https", true)
            serverState.startIfAllReady()
        });
    })
}

function onProtoUpgrade (req, socket, head) {
    let targetProto = LISTEN_ON_SSL
        ? SSL_TERMINATION ? "ws:" : "wss:"
        : "ws:"
    proxy.ws(req, socket, head, { target: `${targetProto}//`+HOSTS[req.headers.host] }, (err) => {
        err && console.log("WS proxy err: ", err);
    });
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
