const { spawnSync } = require('child_process');
const _ = require('lodash');
const { readFileSync, writeFileSync } = require('fs');
const path = require('path');
const { getDockerLoginToECRCommand } = require('./awscli');

// https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html
const baseImageForBuildingMapping = {
    'nodejs14.x': 'amazonlinux:2',
    'nodejs12.x': 'amazonlinux:2',
    'python3.9': 'amazonlinux:2',
    'python3.8': 'amazonlinux:2',
    'python3.7': 'amazonlinux:1',
    'python3.6': 'amazonlinux:1'
};

const ENTRYPOINT_FILENAME = 'execute_lambda_entrypoint.sh';

/**
 * @returns {string} "<ECR Repo Name>:latest"
 */
function getDockerImageName(functionName) {
    const packedIndividually = functionName && this.batchFunctionsPackedIndividually.includes(functionName),
        version = packedIndividually ? functionName : 'latest';

    return `${this.provider.naming.getECRRepositoryURL()}:${version}`;
}

/**
 * Helper function to run a docker command
 * @param {string[]} options
 * @param {string} cwd Current working directory
 * @return {Object}
 */
function dockerCommand(options, cwd = null, stdio = null) {
    const cmd = 'docker';

    let spawnOptions = {
        encoding: 'utf-8',
    };

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

async function copyEntrypointScript() {
    const areThereBatchFunctions = this.batchFunctions.length > 0;

    if (!areThereBatchFunctions) {
        return;
    }

    this.serverless.cli.log(`Copying docker's entrypoint: "${ENTRYPOINT_FILENAME}"...`);

    const entrypointContent = readFileSync(path.join(__dirname, ENTRYPOINT_FILENAME)),
        entryPointFile = path.join(this.serverless.config.servicePath || '.', '.serverless', ENTRYPOINT_FILENAME);

    writeFileSync(entryPointFile, entrypointContent);
}

/**
 * Build the custom Docker image by copying our package to the /var/task directory
 * in the docker image.
 */
async function buildDockerImage(functionName) {
    this.serverless.cli.log(`Building docker image: "${this.provider.naming.getDockerImageName(functionName)}"...`);

    const dockerFileName = functionName ? `Dockerfile.${functionName}` : 'Dockerfile',
        srcZipFileName = functionName || this.serverless.service.service;

    // Get any additional run commands we'd like to include in the docker image
    let additionalRunCommands = '';

    if (this.serverless.service.custom?.awsBatch?.additionalDockerRunCommands) {
        _.forEach(this.serverless.service.custom.awsBatch.additionalDockerRunCommands, (runCommand) => {
            additionalRunCommands += `RUN ${runCommand}\n`;
        });
    }

    const fullRuntime = this.serverless.service.provider.runtime,
        [_fullMatch, runtime, runtimeVersion] = fullRuntime.match(/([a-zA-Z]+)(\d+(.\d+)?)/),
        baseImage = baseImageForBuildingMapping[fullRuntime] || 'amazonlinux:2',
        dockerFileContents = `
FROM ${baseImage} AS builder

RUN yum update -y && yum install unzip -y

${additionalRunCommands}
COPY ${srcZipFileName}.zip /tmp
RUN cd /tmp && unzip -q ${srcZipFileName}.zip && rm ${srcZipFileName}.zip

FROM amazon/aws-lambda-${runtime}:${runtimeVersion}

COPY ${ENTRYPOINT_FILENAME} /execute_lambda_entrypoint.sh
RUN chmod +x /execute_lambda_entrypoint.sh

COPY --from=builder /tmp /var/task/${this.serverless.service.service}/

ENTRYPOINT ["/execute_lambda_entrypoint.sh"]`;

    const packagePath = path.join(this.serverless.config.servicePath || '.', '.serverless');
    const dockerFile = path.join(packagePath, dockerFileName);
    writeFileSync(dockerFile, dockerFileContents);

    const dockerOptions = ['build', '-f', dockerFile, '-t', this.provider.naming.getDockerImageName(functionName), '.'];
    dockerCommand(dockerOptions, packagePath, 'inherit');
}

async function buildDockerImages() {
    const areThereBatchFunctions = this.batchFunctions.length > 0;

    if (!areThereBatchFunctions) {
        return;
    }

    const areThereBatchFunctionsPackedIndividually = this.batchFunctionsPackedIndividually.length > 0;

    if (areThereBatchFunctionsPackedIndividually) {
        for (const functionName of this.batchFunctionsPackedIndividually) {
            await buildDockerImage.bind(this)(functionName);
        }
    } else {
        await buildDockerImage.bind(this)();
    }
}

/**
 * Uses docker to upload the image to ECR
 */
async function pushDockerImagesToECR() {
    // Log docker into our AWS ECR repo so that we can push images to it
    this.serverless.cli.log('Logging into ECR...');
    const loginCommand = getDockerLoginToECRCommand.bind(this)();
    dockerCommand(loginCommand.split(' '));

    // Then perform the upload
    this.serverless.cli.log('Uploading to ECR...');
    dockerCommand(['push', this.provider.naming.getECRRepositoryURL(), '-a'], null, 'inherit');
}

module.exports = { getDockerImageName, copyEntrypointScript, buildDockerImages, pushDockerImagesToECR };
