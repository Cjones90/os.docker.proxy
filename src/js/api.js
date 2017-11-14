"use strict";

const getCookie = (name) => {
    return document.cookie.split('; ').reduce((acc, v) => {
        const split = v.split('=')
        return split[0] === name ? decodeURIComponent(split[1]) : acc
    }, '')
}

function defaultMessage(type, err) {
    alert("Unfortunately your request could not be processed. If this issue happens"+
    " again, please contact your administrator providing the following info: \n\n"+`${type} \n ${err}` )
}

const api = {

    get: function (type, opts, callback) {
        if(typeof(opts) === "function") { callback = opts; opts = {} }
        if(type.indexOf("/") === -1) { type = `/${type}`; }
        opts.type = type
        let returnAs = opts.returnAs || "json"

        let request = {
            method: "GET",
            headers: {
                "Auth-Email": getCookie("Auth-Email"),
                "Auth-Key": getCookie("Auth-Key"),
            }
        }
        fetch(`${HOST}/api/get`+type, request)
        .then((r) => {
            if(returnAs === "string") { return r.text() }
            if(returnAs === "json") { return r.json() }
            return r.json()
        })
        .then(callback)
        .catch((err) => { defaultMessage(type, err) })
    },

    post: function (type, opts, callback) {
        if(typeof(opts) === "function") { callback = opts; opts = {} }
        if(type.indexOf("/") === -1) { type = `/${type}`; }
        opts.type = type
        let request = {
            method: "POST",
            body: JSON.stringify(opts),
            headers: {
                "Auth-Email": getCookie("Auth-Email"),
                "Auth-Key": getCookie("Auth-Key"),
            }
        }
        fetch(`${HOST}/api/post`+type, request)
        .then((r) => r.json())
        .then(callback)
        .catch((err) => { defaultMessage(type, err) })
    },

    put: function (type, opts, callback) {
        if(typeof(opts) === "function") { callback = opts; opts = {} }
        if(type.indexOf("/") === -1) { type = `/${type}`; }
        opts.type = type
        let request = {
            method: "PUT",
            body: JSON.stringify(opts),
            headers: {
                "Auth-Email": getCookie("Auth-Email"),
                "Auth-Key": getCookie("Auth-Key"),
            }
        }
        fetch(`${HOST}/api/put`+type, request)
        .then((r) => r.json())
        .then(callback)
        .catch((err) => { defaultMessage(type, err) })
    },

}

module.exports = api
