const { spawnSync } = require('child_process');
const fse = require('fs-extra');
const path = require('path');
const util = require('util');
const { getDockerLoginToECRCommand, createECRRepositoryIfNotExists } = require('./ecr');

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
 * Build the custom Docker image by copying our package to the /var/task directory
 * in the docker image.
 * 
 * Our base image uses the Lambda Docker Image for the platform:
 * https://hub.docker.com/r/lambci/lambda/
 */
function buildImage(serverless, options, repositoryName) {
    serverless.cli.log("Creating docker image...");
    
    const dockerFileContents = `
    FROM lambci/lambda:${serverless.service.provider.runtime}
    ENV AWS_DEFAULT_REGION ${options.region}
    USER root
    COPY ${serverless.service.service}.zip /var/task
    RUN cd /var/task && unzip ${serverless.service.service}.zip && rm ${serverless.service.service}.zip
    USER sbx_user1051
    `;
    
    const servicePath = serverless.config.servicePath || '';
    const packagePath = path.join(servicePath || '.', '.serverless');
    const dockerFile = path.join(packagePath, 'Dockerfile');
    fse.writeFileSync(dockerFile, dockerFileContents);
    
    const imageName = `${repositoryName}:latest`;

    const dockerOptions = ['build', '-f', dockerFile, '-t', imageName, '.'];
    dockerCommand(dockerOptions, packagePath);
    return imageName;
}

/**
 * Logs Docker into our Elastic Container Registry so that we can push images
 * to it
 */
function loginToECR(serverless, options) {
    const loginCommand = getDockerLoginToECRCommand(serverless, options);
    dockerCommand(loginCommand.split(" "));
}

/**
 * Uses docker to upload the image to ECR
 */
function pushToECR(repositoryName) {
    dockerCommand(['push', repositoryName], null, 'inherit');
}

/**
 * Handles building and uploading our docker image which contains the deployment 
 * artifact that is usually deployed to AWS Lambda.
 */
function buildAndUploadImage(serverless, options) {
    serverless.cli.log("Creating ECR repository if necessary...")
    const repositoryName = createECRRepositoryIfNotExists(serverless, options);
    
    serverless.cli.log("Building docker image...");
    const imageName = buildImage(serverless, options, repositoryName);
    
    serverless.cli.log("Logging into ECR...");
    loginToECR(serverless, options);
    
    serverless.cli.log("Uploading to ECR...");
    pushToECR(repositoryName);
}

module.exports = { buildAndUploadImage };
