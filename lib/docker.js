const BbPromise = require('bluebird');
const { spawnSync } = require('child_process');
const _ = require('lodash');
const fse = require('fs-extra');
const path = require('path');
const util = require('util');
const { getDockerLoginToECRCommand } = require('./awscli');

const DOCKER_TAG = `${Date.now()}`;

/**
 * @returns {string} "<ECR Repo Name>:latest"
 */
function getDockerImageName() {
    return `${this.provider.naming.getECRRepositoryURL()}:${DOCKER_TAG}`;
}

/**
 * Helper function to run a docker command
 * @param {string[]} options
 * @param {string} cwd Current working directory
 * @return {Object}
 */
function dockerCommand(options, cwd = null, stdio = null) {
    const cmd = 'docker';
    var spawnOptions = {
        encoding: 'utf-8'
    }
    if (cwd != null) {
        spawnOptions.cwd = cwd;
    }
    if (stdio != null) {
        spawnOptions.stdio = stdio;
    }
    
    //console.error("dockerCommand:", options, spawnOptions);
    const ps = spawnSync(cmd, options, spawnOptions);
    if (ps.error) {
        if (ps.error.code === 'ENOENT') {
            throw new Error('docker not found! Please install it.');
        }
        throw new Error(ps.error);
    } else if (ps.status !== 0) {
        //console.error("docker output:", ps.output);
        //console.error("docker stdout:", ps.stdout);
        //console.error("docker stderr:", ps.stderr)
        throw new Error(ps.stderr);
    }
    return ps;
}

/**
 * Build the custom Docker image by copying our package to the /var/task directory
 * in the docker image.
 * 
 * Our base image uses the Lambda Docker Image for the platform:
 * https://hub.docker.com/r/lambci/lambda/
 */
function buildDockerImage() {
    let image = this.provider.naming.getDockerImageName();
    this.serverless.cli.log(`Building docker image: "${image}"...`);

    // Get any additional run commands we'd like to include in the docker image
    let addtionalBuildCommands = "";
    if (this.serverless.service.custom
        && this.serverless.service.custom.awsBatch
        && this.serverless.service.custom.awsBatch.addtionalBuildCommands) {

        _.forEach(
            this.serverless.service.custom.awsBatch.addtionalBuildCommands,
            runCommand => {
                addtionalBuildCommands += `${runCommand}\n`;
            }
        )
    }

    let additionalCommands = "";
    if (this.serverless.service.custom
        && this.serverless.service.custom.awsBatch
        && this.serverless.service.custom.awsBatch.additionalCommands) {

        _.forEach(
            this.serverless.service.custom.awsBatch.additionalCommands,
            runCommand => {
                additionalCommands += `${runCommand}\n`;
            }
        )
    }

    // Override some of the default lambci environmental variables.
    //   - Function Timeout and Function Memory are set by Env Variables on the Job Definition
    //   - Access Key and Secret are unset to that we use the role on the container that AWS provides
    const dockerFileContents = `
    FROM justinram11/lambda:build-nodejs12.x AS builder
    USER root
    RUN mkdir -p /tmp/task/
    COPY ${this.serverless.service.service}.zip /tmp/task
    RUN cd /tmp/task && unzip -q ${this.serverless.service.service}.zip && rm ${this.serverless.service.service}.zip
    RUN mkdir -p /tmp/node16/
    RUN curl -sL https://develop.apricity-health.com/assets/node-v16.20.0-linux-x64.tar.gz --output /tmp/node.tar.gz
    RUN cd /tmp && tar xf node.tar.gz && cp -rf node-v16.20.0-linux-x64/* /tmp/node16/
    ${addtionalBuildCommands}
    
    FROM justinram11/lambda:nodejs12.x
    USER root
    COPY --from=builder /tmp/task /var/task/
    COPY --from=builder /tmp/node16 /var/lang/
    ENV NODE_PATH=/var/lang/lib/node_modules:/var/task/node_modules:/var/runtime/node_modules
    RUN node -v
    ${additionalCommands}
    RUN rm -rf /tmp/*
    USER sbx_user1051
    `;

    const servicePath = this.serverless.config.servicePath || '';
    const packagePath = path.join(servicePath || '.', '.serverless');
    const dockerFile = path.join(packagePath, 'Dockerfile');
    fse.writeFileSync(dockerFile, dockerFileContents);

    const dockerOptions = ['build', '-f', dockerFile, '-t', image, '.'];
    dockerCommand(dockerOptions, packagePath, 'inherit');

    return BbPromise.resolve();
}

/**
 * Uses docker to upload the image to ECR
 */
function pushDockerImageToECR() {
    // Log docker into our AWS ECR repo so that we can push images to it
    this.serverless.cli.log("Logging into ECR...");
    const loginCommand = getDockerLoginToECRCommand.bind(this)();
    dockerCommand(loginCommand.split(" "));

    // Then perform the upload
    this.serverless.cli.log("Uploading to ECR...");
    dockerCommand(['push', '--all-tags', this.provider.naming.getECRRepositoryURL()], null, 'inherit');

    return BbPromise.resolve();
}

module.exports = { getDockerImageName, buildDockerImage, pushDockerImageToECR };
