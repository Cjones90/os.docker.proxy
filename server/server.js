'use strict';

const http = require("http");
const https = require("https");
const fs = require("fs");
const url = require("url");
const path = require("path");

const httpProxy = require("http-proxy");
const { service } = require("os-npm-util");

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


const proxy = httpProxy.createProxyServer()

const onHttpUpgrade = (req, socket, head) => {
    proxy.ws(req, socket, head, { target: "ws://"+HOSTS[req.headers.host] }, (err) => {
        console.log(err);
        console.log("WS proxy err: ", err);
    });
}
const onHttpsUpgrade = (req, socket, head) => {
    proxy.ws(req, socket, head, { target: "wss://"+HOSTS[req.headers.host] }, (err) => {
        console.log(err);
        console.log("WS proxy err: ", err);
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
    res.writeHead(200, {"Content-Type": contentType});
    fs.readFile(filePath, "utf8", (err, data) => {
        if(filePath.match(`${PUB_FILES}index.html`)) {
            data = data.replace(/%%VERSION%%/, service.IMAGE_VER)
        }
        res.end(data)
    })
}

// Servers
const httpServer = http.createServer((req, res) => {
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
    if(PROXY_TO_SSL) {
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
registerGracefulShutdown(httpServer)
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
    if (!keyExists || options.key === "") {
        return console.log("SSL_PROXY_ON is set to true, but certs do not exist.");
    }

    const httpsServer = https.createServer(options, (req, res) => {
        if(!HOSTS[req.headers.host]) { return res.end("404 - Invalid host"); }
        proxy.web(req, res, { target: "https://"+HOSTS[req.headers.host] }, (err) => {
            console.log("ERR - SERVER.HTTPS_SERVER:\n", err);
            return send404(req, res);
        })
    })
    registerGracefulShutdown(httpsServer)
    httpsServer.on("upgrade", onHttpsUpgrade)
    httpsServer.listen(HTTPS_CONTAINER_PORT, console.log("HTTPS proxy on port: "+HTTPS_PORT));
}

function registerGracefulShutdown(server) {
    let close = () => {
        console.log("Received SIG signal, shutting down");
        server.close(() => {
            console.log("Closed out all connections successfully");
            process.exit();
        })
    }
    process.on("SIGTERM", close)
    process.on("SIGHUP", close)
    process.on("SIGINT", close)
    process.on("SIGQUIT", close)
    process.on("SIGABRT", close)
}
