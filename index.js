'use strict';

const BbPromise = require('bluebird');
const fse = require('fs-extra');
const generateCoreTemplate = require('./lib/generateCoreTemplate');
const ecr = require('./lib/ecr');
const docker = require('./lib/docker');
const batch = require('./lib/batch');
const _ = require('lodash');
var util = require('util');

BbPromise.promisifyAll(fse);

class ServerlessAWSBatch {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    // Make sure that we add the names for our ECR, docker, and batch resources to the provider
    _.merge(
      this.provider.naming,
      {
        'getECRLogicalId': ecr.getECRLogicalId,
        'getECRRepositoryName': ecr.getECRRepositoryName,
        'getECRRepositoryURL': ecr.getECRRepositoryURL,
        'getDockerImageName': docker.getDockerImageName,
        'getBatchServiceRoleLogicalId': batch.getBatchServiceRoleLogicalId,
        'getBatchInstanceManagementRoleLogicalId': batch.getBatchInstanceManagementRoleLogicalId,
        'getBatchComputeEnvironmentLogicalId': batch.getBatchComputeEnvironmentLogicalId,
        'getBatchJobQueueLogicalId': batch.getBatchJobQueueLogicalId
      }
    );

    // Define inner lifecycles
    this.commands = {}

    this.hooks = {
      /**
       * Outer lifecycle hooks
       */
      'after:package:initialize': () => BbPromise.bind(this)
        .then(generateCoreTemplate.generateCoreTemplate),

      //'after:package:createDeploymentArtifacts': () => BbPromise.bind(this)
      //  .then(docker.buildDockerImage),

      'before:deploy:deploy': () => BbPromise.bind(this)
        .then(batch.validateAWSBatchServerlessConfig)
        .then(batch.generateAWSBatchTemplate)
        //.then(docker.pushDockerImageToECR)
    }
  }
}

module.exports = ServerlessAWSBatch;