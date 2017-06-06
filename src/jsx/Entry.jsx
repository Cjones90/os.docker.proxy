"use strict";

import React from 'react';
import DOM from 'react-dom';

require("../style/Entry.less")

const Entry = React.createClass({

    getInitialState() {
        return {
        };
    },

    componentDidMount() {

    },


    render() {

        return (
            <div>

            </div>
        );
    }

});

DOM.render(<Entry />, document.getElementById("main"))
