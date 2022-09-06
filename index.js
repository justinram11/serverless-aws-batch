'use strict';

const generateCoreTemplate = require('./lib/generateCoreTemplate');
const ecr = require('./lib/ecr');
const docker = require('./lib/docker');
const batchenvironment = require('./lib/batchenvironment');
const batchtask = require('./lib/batchtask');
const awscli = require('./lib/awscli');
const _ = require('lodash');

function isBatchFunction(functionName) {
    const functionObject = this.serverless.service.getFunction(functionName);

    return functionObject.hasOwnProperty('batch');
}

function isIndividuallyPacked(functionName) {
    if (this.serverless.service.package.individually) {
        return true;
    }

    const functionObject = this.serverless.service.getFunction(functionName);

    return !!_.get(functionObject, 'package.individually');
}

function getBatchFunctions() {
    return this.serverless.service.getAllFunctions().filter((functionName) => isBatchFunction.bind(this)(functionName));
}

function getBatchFunctionsPackedIndividually() {
    return getBatchFunctions
        .bind(this)()
        .filter((functionName) => isIndividuallyPacked.bind(this)(functionName));
}

class ServerlessAWSBatch {
    constructor(serverless, options) {
        this.serverless = serverless;
        this.options = options;
        this.provider = this.serverless.getProvider('aws');

        this.batchFunctions = getBatchFunctions.bind(this)();
        this.batchFunctionsPackedIndividually = getBatchFunctionsPackedIndividually.bind(this)();

        serverless.configSchemaHandler.defineTopLevelProperty('batch', {
            type: 'object',
            properties: {
                Type: { type: 'string' },
                SecurityGroupIds: { type: 'array', items: { type: 'string' } },
                Subnets: { type: 'array', items: { type: 'string' } },
            },
        });

        serverless.configSchemaHandler.defineFunctionProperties('aws', {
            properties: {
                batch: {
                    type: 'object',
                    properties: {
                        ContainerProperties: {
                            type: 'object',
                            properties: {
                                Memory: { type: 'number' },
                                Vcpus: { type: 'number' },
                                Command: { type: 'array', items: { type: 'string' } },
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
                },
            },
        });

        // Make sure that we add the names for our ECR, docker, and batch resources to the provider
        _.merge(this.provider.naming, {
            getECRLogicalId: ecr.getECRLogicalId,
            getECRRepositoryName: ecr.getECRRepositoryName,
            getECRRepositoryURL: ecr.getECRRepositoryURL,
            getDockerImageName: docker.getDockerImageName.bind(this),
            getBatchServiceRoleLogicalId: batchenvironment.getBatchServiceRoleLogicalId,
            getBatchInstanceManagementRoleLogicalId: batchenvironment.getBatchInstanceManagementRoleLogicalId,
            getBatchInstanceManagementProfileLogicalId: batchenvironment.getBatchInstanceManagementProfileLogicalId,
            getBatchSpotFleetManagementRoleLogicalId: batchenvironment.getBatchSpotFleetManagementRoleLogicalId,
            getBatchJobExecutionRoleLogicalId: batchtask.getBatchJobExecutionRoleLogicalId,
            getLambdaScheduleExecutionRoleLogicalId: batchenvironment.getLambdaScheduleExecutionRoleLogicalId,
            getLambdaScheduleArtifactName: batchenvironment.getLambdaScheduleArtifactName,
            getBatchComputeEnvironmentLogicalId: batchenvironment.getBatchComputeEnvironmentLogicalId,
            getBatchJobQueueLogicalId: batchenvironment.getBatchJobQueueLogicalId,
            getBatchJobQueueName: batchenvironment.getBatchJobQueueName,
            getJobDefinitionLogicalId: batchtask.getJobDefinitionLogicalId,
        });

        // Define inner lifecycles
        this.commands = {};

        const areThereBatchFunctions = this.batchFunctions.length > 0;

        if (areThereBatchFunctions) {
            this.hooks = {
                'after:package:initialize': () => generateCoreTemplate.generateCoreTemplate.bind(this)(),
                'after:package:createDeploymentArtifacts': () => docker.copyEntrypointScript.bind(this)(),
                'before:package:compileFunctions': async () => {
                    await batchenvironment.validateAWSBatchServerlessConfig.bind(this)();
                    await batchenvironment.generateAWSBatchTemplate.bind(this)();
                    await batchtask.compileBatchTasks.bind(this)();
                    await docker.buildDockerImages.bind(this)();
                },
                'after:aws:deploy:deploy:updateStack': () => docker.pushDockerImagesToECR.bind(this)(),
                'before:remove:remove': () => awscli.deleteAllDockerImagesInECR.bind(this)(),
            };
        } else {
            this.hooks = { 'before:remove:remove': () => awscli.deleteAllDockerImagesInECR.bind(this)() };
        }
    }
}

module.exports = ServerlessAWSBatch;
