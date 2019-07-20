const { spawnSync } = require('child_process');
const fse = require('fs-extra');
const path = require('path');
const util = require('util');
const _ = require('lodash');

/**
 * Helper function to run an AWS CLI command
 * @param {string[]} options
 * @return {Object}
 */
function awsCommand(options) {
    const cmd = 'aws';
    const ps = spawnSync(cmd, options, { encoding: 'utf-8' });
    if (ps.error) {
        if (ps.error.code === 'ENOENT') {
            throw new Error('aws cli not found! Please install it.');
        }
        throw new Error(ps.error);
    } else if (ps.status !== 0) {
        throw new Error(ps.stderr);
    }
    return ps;
}

/**
 * Uses the AWS CLI to generate a pre-authenticated docker command that can be
 * used to login to the Elastic Container Registry (ECR) from docker.
 *
 * @return {string} login -u AWS -p <password> https://<account_id>.dkr.ecr.<region>.amazonaws.com
 */
function getDockerLoginToECRCommand() {
    const result = awsCommand(['ecr', 'get-login', '--region', this.options.region, '--no-include-email']);
    // AWS CLI returns the full command with "docker " out front. Remove it since we don't need it.
    return result.stdout.replace('docker ', '').replace('\n', '');
}

/**
 * Deletes all of our docker images in the remote ECR registry
 */
function deleteAllDockerImagesInECR() {
    try {
        const result = awsCommand(['ecr', 'list-images', '--repository-name', this.provider.naming.getECRRepositoryName()]);
        const images = JSON.parse(result.stdout);

        this.serverless.cli.log(`Found ${images['imageIds'].length} existing ECR images. Deleting...`)

        // Delete individually instead of batch so we don't run into any CLI length limits
        _.forEach(
            images['imageIds'],
            image => {
                awsCommand([
                    'ecr', 'batch-delete-image',
                    '--repository-name', this.provider.naming.getECRRepositoryName(),
                    '--image-ids', `imageDigest=${image['imageDigest']}`
                ]);
            }
        );
    }
    catch (e) {
        // If we failed to delete the stack from a previous "sls-remove" attempt, but already deleted the repository
        if (e.message.indexOf("RepositoryNotFoundException") > -1) {
            this.serverless.cli.log("ECR Repository already deleted");
        }
        // Unknown error
        else {
            throw e;
        }
    }
}

/**
 * Calls AWS CLI to get the accountID of the calling user
 * @returns {string} The accountID of the calling user
 */
let awsAccountID = null;
function getAWSAccountID() {
    if (awsAccountID == null) {
        const result = awsCommand(['sts', 'get-caller-identity']);
        awsAccountID = JSON.parse(result.stdout).Account
    }
    return awsAccountID;
}

module.exports = {
    getDockerLoginToECRCommand,
    getAWSAccountID,
    deleteAllDockerImagesInECR
};