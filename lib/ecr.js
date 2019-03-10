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
 * Get the Registry URL we should tag our images with so we can upload them to
 * ECR
 * 
 * @param {string[]} options
 * @return {string} https://<account_id>.dkr.ecr.<region>.amazonaws.com/<service>-<stage>
 */
function createECRRepositoryIfNotExists(serverless, options) {
    // First get our account ID
    const result = awsCommand(['sts', 'get-caller-identity', '--output', 'text']);
    const accountID = result.stdout.split('\t')[0];
    
    // Create the repository (if it exists command will fail but that's okay)
    const serviceNameAndStage = `${serverless.service.service}-${serverless.service.provider.stage}`;
    awsCommand(['ecr', 'create-repository', '--region', options.region, '--repository-name', serviceNameAndStage]);
    
    // Return the entire repository URI
    const repositoryName = `${accountID}.dkr.ecr.${options.region}.amazonaws.com/${serviceNameAndStage}`;
    return repositoryName;
}

module.exports = { getDockerLoginToECRCommand, createECRRepositoryIfNotExists };