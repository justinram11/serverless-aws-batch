const BbPromise = require('bluebird');
const { spawnSync } = require('child_process');
const fse = require('fs-extra');
const path = require('path');
const util = require('util');
const { getDockerLoginToECRCommand } = require('./awscli');

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
    
    const ps = spawnSync(cmd, options, spawnOptions);
    if (ps.error) {
        if (ps.error.code === 'ENOENT') {
            throw new Error('docker not found! Please install it.');
        }
        throw new Error(ps.error);
    } else if (ps.status !== 0) {
        throw new Error(ps.stderr);
    }
    return ps;
}

/**
 * @returns {string} "<ECR Repo Name>:latest"
 */
function getDockerImageName() {
    return `${this.provider.naming.getECRRepositoryURL()}:latest`;
}

/**
 * Build the custom Docker image by copying our package to the /var/task directory
 * in the docker image.
 * 
 * Our base image uses the Lambda Docker Image for the platform:
 * https://hub.docker.com/r/lambci/lambda/
 */
function buildDockerImage() {
    this.serverless.cli.log(`Building docker image: "${this.provider.naming.getDockerImageName()}"...`);
    
    const dockerFileContents = `
    FROM lambci/lambda:${this.serverless.service.provider.runtime}
    ENV AWS_DEFAULT_REGION ${this.options.region}
    USER root
    COPY ${this.serverless.service.service}.zip /var/task
    RUN cd /var/task && unzip ${this.serverless.service.service}.zip && rm ${this.serverless.service.service}.zip
    USER sbx_user1051
    `;
    
    const servicePath = this.serverless.config.servicePath || '';
    const packagePath = path.join(servicePath || '.', '.serverless');
    const dockerFile = path.join(packagePath, 'Dockerfile');
    fse.writeFileSync(dockerFile, dockerFileContents);

    const dockerOptions = ['build', '-f', dockerFile, '-t', this.provider.naming.getDockerImageName(), '.'];
    dockerCommand(dockerOptions, packagePath);

    return BbPromise.resolve();
}

/**
 * Uses docker to upload the image to ECR
 */
function pushDockerImageToECR() {
    // Log docker into our AWS ECR repo so that we can push images to it
    // TODO should awscli.js be bound to "this"?
    this.serverless.cli.log("Logging into ECR...");
    const loginCommand = getDockerLoginToECRCommand(this.serverless, this.options);
    dockerCommand(loginCommand.split(" "));

    // Then perform the upload
    this.serverless.cli.log("Uploading to ECR...");
    dockerCommand(['push', this.provider.naming.getECRRepositoryURL()], null, 'inherit');

    return BbPromise.resolve();
}

module.exports = { getDockerImageName, buildDockerImage, pushDockerImageToECR };
