"use strict";

import React from 'react';
import DOM from 'react-dom';

require("../style/Entry.less")

// TODO: After a few entries see if we can get a 200 code from the intended
//   url. If we can, inform and redirect while they didn't need to do anything.
//   Otherwise continue and let them know to try again soon
const story = ["Hey", "It looks like you need some help.", "Let's see here...",
    "Nope... it's not that.", "Hmm", "I'm sorry but I don't think it's there.",
    "Hopefully nothing bad happened to it..", "Maybe try again in a minute?"];

const Entry = React.createClass({

    // NOTE: Localstorage hasvisted thing kinda busted a bit but its not that important
    //  so we're not gonna worry about making sure its 100%
    getInitialState() {
        let hasVisted = localStorage.getItem("hasVisted")
        //TODO: Set an expiry period for refreshcount
        let refreshCount = localStorage.getItem("refreshCount") || -1
        localStorage.setItem("refreshCount", ++refreshCount)
        hasVisted = hasVisted ? JSON.parse(hasVisted) : false
        return {
            string: hasVisted ? story : [],
            fadeIn: hasVisted ? 1 : 0,
            hasVisted: hasVisted ? true : false,
            msgDone: hasVisted ? true : false,
            refreshCount: refreshCount || 0
        };
    },

    appendString(string) {
        this.state.string.push(string)
        this.setState({ string: this.state.string })
    },

    componentDidMount() {
        let timer = 0;
        let prevStrLen = 0
        !this.state.hasVisted && story.forEach((str, ind) => {
            let appendMsgIn = (prevStrLen >= 15 ? 1000 : 0) + (1500 * ind)
            // let appendMsgIn = 2
            prevStrLen = str.length
            setTimeout(() => {
                this.appendString(str)
                if(ind === story.length-1) { this.msgIsDone() }
            }, appendMsgIn)
        })
    },

    msgIsDone() {
        setTimeout(() => this.setState({ msgDone: true }, this.startFadein), 3000)
    },

    startFadein() {
        this.interval = setInterval(() => {
            if(this.state.fadeIn <= 1) {
                this.setState({
                    fadeIn: this.state.fadeIn + .010
                })
            }
            else {
                clearInterval(this.interval)
            }
        }, 20)
    },

    setHasVisited() {
        localStorage.setItem("hasVisted", "true")
        location.reload()
    },

    render() {

        let msg = this.state.string.map((str, ind) =>
            <span key={ind}>{str}<br /></span>
        )

        let refreshMsg = this.state.fadeIn >= .9
            ? <div id={"refresh"}>(You can click the page to refresh)</div>
            : null

        let refreshCount = this.state.fadeIn >= .9
            ? <div id={"refresh"}>Refresh count: {this.state.refreshCount}</div>
            : null

        return (
            <div onClick={this.setHasVisited}>
                {msg}
                <div id={"span404"} style={{
                    opacity: `${this.state.msgDone?this.state.fadeIn:0}`
                    }}>
                    404
                </div>
                {refreshMsg}
                {refreshCount}
            </div>
        );
    }

});

DOM.render(<Entry />, document.getElementById("main"))
