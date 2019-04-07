const { getAWSAccountID } = require('./awscli');

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
 * @type {string} "<awsAccountID>.dkr.ecr.us-east-1.amazonaws.com/<serviceName>-<stage>"
 */

function getECRRepositoryURL() {
  return `${getAWSAccountID()}.dkr.ecr.${this.provider.getRegion()}.amazonaws.com/${this.provider.naming.getECRRepositoryName()}`
}

module.exports = {
  getECRLogicalId,
  getECRRepositoryName,
  getECRRepositoryURL
}