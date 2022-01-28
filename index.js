'use strict';

const generateCoreTemplate = require('./lib/generateCoreTemplate');
const ecr = require('./lib/ecr');
const docker = require('./lib/docker');
const batchenvironment = require('./lib/batchenvironment');
const batchtask = require('./lib/batchtask');
const awscli = require('./lib/awscli');
const _ = require('lodash');

class ServerlessAWSBatch {
    constructor(serverless, options) {
        serverless.configSchemaHandler.defineFunctionProperties('batch', {
            properties: {
                ContainerProperties: {
                    type: 'object',
                    properties: {
                        Memory: { type: 'number' },
                        Vcpus: { type: 'number' },
                        Command: { type: 'string' },
                        JobRoleArn: { type: 'string' },
                        Environment: { type: 'object' },
                    },
                },
                RetryStrategy: {
                    type: 'object',
                    properties: { Attempts: { type: 'number' } },
                },
                Timeout: {
                    type: 'object',
                    properties: { AttemptDurationSeconds: { type: 'number' } },
                },
            },
        });

        this.serverless = serverless;
        this.options = options;
        this.provider = this.serverless.getProvider('aws');

        // Make sure that we add the names for our ECR, docker, and batch resources to the provider
        _.merge(this.provider.naming, {
            getECRLogicalId: ecr.getECRLogicalId,
            getECRRepositoryName: ecr.getECRRepositoryName,
            getECRRepositoryURL: ecr.getECRRepositoryURL,
            getDockerImageName: docker.getDockerImageName,
            getBatchServiceRoleLogicalId: batchenvironment.getBatchServiceRoleLogicalId,
            getBatchInstanceManagementRoleLogicalId: batchenvironment.getBatchInstanceManagementRoleLogicalId,
            getBatchInstanceManagementProfileLogicalId: batchenvironment.getBatchInstanceManagementProfileLogicalId,
            getBatchSpotFleetManagementRoleLogicalId: batchenvironment.getBatchSpotFleetManagementRoleLogicalId,
            getBatchJobExecutionRoleLogicalId: batchtask.getBatchJobExecutionRoleLogicalId,
            getLambdaScheduleExecutionRoleLogicalId: batchenvironment.getLambdaScheduleExecutionRoleLogicalId,
            getBatchComputeEnvironmentLogicalId: batchenvironment.getBatchComputeEnvironmentLogicalId,
            getBatchJobQueueLogicalId: batchenvironment.getBatchJobQueueLogicalId,
            getBatchJobQueueName: batchenvironment.getBatchJobQueueName,
            getJobDefinitionLogicalId: batchtask.getJobDefinitionLogicalId,
        });

        // Define inner lifecycles
        this.commands = {};

        this.hooks = {
            'after:package:initialize': () => generateCoreTemplate.generateCoreTemplate(),
            'before:package:compileFunctions': async () => {
                await batchenvironment.validateAWSBatchServerlessConfig();
                await batchenvironment.generateAWSBatchTemplate();
                await batchtask.compileBatchTasks();
            },
            'after:package:createDeploymentArtifacts': () => docker.buildDockerImage(),
            'after:aws:deploy:deploy:updateStack': () => docker.pushDockerImageToECR(),
            'before:remove:remove': () => awscli.deleteAllDockerImagesInECR(),
        };
    }
}

module.exports = ServerlessAWSBatch;
