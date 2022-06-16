const { getAWSAccountID } = require('./awscli');
import { DOCKER_TAG } from './docker';

/**
 * @returns {string} "ECRRepository"
 */
function getECRLogicalId() {
  return "ECRRepository";
}

/**
 * @returns {string} "<serviceName>-<stage>"
 */
function getECRRepositoryName() {
  return `${this.provider.serverless.service.service}-${this.provider.getStage()}`;
}


/**
 * @type {string} "<awsAccountID>.dkr.ecr.us-east-1.amazonaws.com/<serviceName>-<stage>:<tag>"
 */

function getECRRepositoryURL() {
  return `${getAWSAccountID()}.dkr.ecr.${this.provider.getRegion()}.amazonaws.com/${this.provider.naming.getECRRepositoryName()}:${DOCKER_TAG}`
}

module.exports = {
  getECRLogicalId,
  getECRRepositoryName,
  getECRRepositoryURL
}