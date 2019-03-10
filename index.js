'use strict';

const BbPromise = require('bluebird');
const fse = require('fs-extra');
const { buildAndUploadImage } = require('./lib/docker');
var util = require('util');

BbPromise.promisifyAll(fse);

class ServerlessAWSBatch {
    constructor(serverless, options) {
        this.serverless = serverless;
        this.options = options;

        this.hooks = {
            'before:package:createDeploymentArtifacts': () => {
                this.serverless.cli.log(util.inspect(this.serverless));
                this.serverless.cli.log(util.inspect(this.options));
                this.serverless.cli.log(util.inspect(this.serverless.service))
            },
            'after:package:createDeploymentArtifacts': () => {
                this.serverless.cli.log("Creating docker image...");
                buildAndUploadImage(this.serverless, this.options);
            }
        }
    }
}

function ts(object) {
    return JSON.stringify(object);
}

module.exports = ServerlessAWSBatch;