const { spawnSync } = require('child_process');
const fse = require('fs-extra');
const path = require('path');
const util = require('util');

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
 * @param {object[]} serverless
 * @param {string[]} options
 * @return {string} login -u AWS -p <password> https://<account_id>.dkr.ecr.<region>.amazonaws.com
 */
function getDockerLoginToECRCommand(serverless, options) {
    const result = awsCommand(['ecr', 'get-login', '--region', options.region, '--no-include-email']);
    // AWS CLI returns the full command with "docker " out front. Remove it since we don't need it.
    return result.stdout.replace('docker ', '').replace('\n', '');
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

module.exports = { getDockerLoginToECRCommand, getAWSAccountID };