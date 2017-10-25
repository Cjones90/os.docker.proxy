'use strict';

const http = require("http");
const https = require("https");
const fs = require("fs");
const url = require("url");
const path = require("path");
const httpProxy = require("http-proxy");

const PUB_FILES = process.env.PUB_FILES;
const OUTPUT_FILES = process.env.OUTPUT_FILES
const REGISTER_SERVICE = JSON.parse(process.env.REGISTER_SERVICE)
const BIN = process.env.BIN;

const SSL_PROXY_ON = JSON.parse(process.env.SSL_PROXY_ON);
const PROXY_TO_SSL = JSON.parse(process.env.PROXY_TO_SSL);

const HTTP_PORT = 80;
const HTTPS_PORT = 443;
const HTTP_CONTAINER_PORT = 4000;
const HTTPS_CONTAINER_PORT = 4001;

const HOSTS = require("./hosts.json");
const routes = require("./routes.js");
const service = require("./service.js");

const proxy = httpProxy.createProxyServer()

const onHttpUpgrade = (req, socket, head) => {
    proxy.ws(req, socket, head, { target: "ws://"+HOSTS[req.headers.host] }, (err) => {
        console.log("WS proxy err: ", err);
    });
}
const onHttpsUpgrade = (req, socket, head) => {
    proxy.ws(req, socket, head, { target: "wss://"+HOSTS[req.headers.host] }, (err) => {
        console.log("WS proxy err: ", err);
    });
}

// Servers
const httpServer = http.createServer((req, res) => {
    if(!HOSTS[req.headers.host]) { return res.end("404 - Invalid host"); }

    let requrl = url.parse(req.url).pathname
    let hostname = req.headers.host.split(".").length > 2
        ? req.headers.host.replace(/^[\w]+\./, "")
        : req.headers.host

    if(requrl.indexOf("/.well-known/acme-challenge") > -1) {
        console.log("Certbot");
        return proxy.web(req, res, { target: `http://cert.${hostname}:8080`}, (err) => {
            res.end("Could not proxy for certbot")
        })
    }
    if(PROXY_TO_SSL) {
        res.writeHead(302, {"Location": "https://"+req.headers.host+req.url}); // Redirect to https
        res.end();
    }
    else {
        proxy.web(req, res, { target: "http://"+HOSTS[req.headers.host] }, (err) => {
            res.end("404 - Host appears to be down.")
        })
    }
})
httpServer.on("upgrade", onHttpUpgrade)
httpServer.listen(HTTP_CONTAINER_PORT, console.log("HTTP proxy on port: "+HTTP_PORT));
if(REGISTER_SERVICE) { service.register(); }


if(SSL_PROXY_ON) {
    let options = {};
    let keyExists = fs.existsSync("creds/privkey.pem")

    if(keyExists) {
        options = {
            key: fs.readFileSync("creds/privkey.pem", "utf8"),
            cert: fs.readFileSync("creds/fullchain.pem", "utf8"),
            ca: fs.readFileSync("creds/chain.pem", "utf8")
        }
    }

    // Ensure we dont attempt to start httpsserver without certs
    if (!keyExists || options.key === "") { return; }

    const httpsServer = https.createServer(options, (req, res) => {
        if(!HOSTS[req.headers.host]) { return res.end("404 - Invalid host"); }
        proxy.web(req, res, { target: "https://"+HOSTS[req.headers.host] }, (err) => {
            res.end("404 - Host appears to be down.")
        })
    })
    httpsServer.on("upgrade", onHttpsUpgrade)
    httpsServer.listen(HTTPS_CONTAINER_PORT, console.log("HTTPS proxy on port: "+HTTPS_PORT));
}
