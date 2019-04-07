'use strict';

const BbPromise = require('bluebird');
const fse = require('fs-extra');
const generateCoreTemplate = require('./lib/generateCoreTemplate');
const ecr = require('./lib/ecr');
const docker = require('./lib/docker');
const batchenvironment = require('./lib/batchenvironment');
const batchtask = require('./lib/batchtask');
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
        'getBatchServiceRoleLogicalId': batchenvironment.getBatchServiceRoleLogicalId,
        'getBatchInstanceManagementRoleLogicalId': batchenvironment.getBatchInstanceManagementRoleLogicalId,
        'getBatchComputeEnvironmentLogicalId': batchenvironment.getBatchComputeEnvironmentLogicalId,
        'getBatchJobQueueLogicalId': batchenvironment.getBatchJobQueueLogicalId
      }
    );

    // Define inner lifecycles
    this.commands = {}

    this.hooks = {
      /**
       * Outer lifecycle hooks
       */
      //'after:package:initialize': () => BbPromise.bind(this)
        //.then(generateCoreTemplate.generateCoreTemplate),

      'before:package:compileFunctions': () => BbPromise.bind(this)
        .then(batchtask.compileBatchTasks)

      //'after:package:createDeploymentArtifacts': () => BbPromise.bind(this)
      //  .then(docker.buildDockerImage),

      //'before:deploy:deploy': () => BbPromise.bind(this)
        //.then(batchenvironment.validateAWSBatchServerlessConfig)
        //.then(batchenvironment.generateAWSBatchTemplate)
        //.then(docker.pushDockerImageToECR)
    }
  }
}

module.exports = ServerlessAWSBatch;