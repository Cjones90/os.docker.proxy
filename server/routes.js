'use strict';

const fs = require("fs");

const routes = function (req, res) {

    const respond = (response) => {
        response = response || "";
        res.writeHead(200, {'Access-Control-Allow-Origin' : '*'} );
        res.end(JSON.stringify(response));
    }
    //Convert post data to string
    let input = '';
    req.on('data', (buffer) => {
        input += buffer.toString();
    })

    req.on('end', () => {
        let parsed = input ? JSON.parse(input) : "";

        switch(req.url) {
            case "/": respond();
            break;
            default: respond();
        }
    })
}

module.exports = routes;
