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
        this.serverless = serverless;
        this.options = options;
        this.provider = this.serverless.getProvider('aws');

        this.areThereBatchFunctions = this.checkBatchFunctions();
        this.areMultipleRepositories = this.checkPackageIndividuallyFlag();

        serverless.configSchemaHandler.defineFunctionProperties('batch', {
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
        });

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
            getLambdaScheduleArtifactName: batchenvironment.getLambdaScheduleArtifactName,
            getBatchComputeEnvironmentLogicalId: batchenvironment.getBatchComputeEnvironmentLogicalId,
            getBatchJobQueueLogicalId: batchenvironment.getBatchJobQueueLogicalId,
            getBatchJobQueueName: batchenvironment.getBatchJobQueueName,
            getJobDefinitionLogicalId: batchtask.getJobDefinitionLogicalId,
        });

        // Define inner lifecycles
        this.commands = {};

        if (this.areThereBatchFunctions) {
            this.hooks = {
                'after:package:initialize': () => generateCoreTemplate.generateCoreTemplate.bind(this)(),
                'before:package:compileFunctions': async () => {
                    await batchenvironment.validateAWSBatchServerlessConfig.bind(this)();
                    await batchenvironment.generateAWSBatchTemplate.bind(this)();
                    await batchtask.compileBatchTasks.bind(this)();
                    await docker.buildDockerImages.bind(this)();
                },
                'after:aws:deploy:deploy:updateStack': () => docker.pushDockerImageToECR.bind(this)(),
                'before:remove:remove': () => awscli.deleteAllDockerImagesInECR.bind(this)(),
            };
        } else {
            this.hooks = { 'before:remove:remove': () => awscli.deleteAllDockerImagesInECR.bind(this)() };
        }
    }

    checkBatchFunctions() {
        return this.serverless.service
            .getAllFunctions()
            .reduce((areThereBatchFunctions, functionName) => areThereBatchFunctions || this.isBatchFunction(functionName), false);
    }

    checkPackageIndividuallyFlag() {
        return this.serverless.service
            .getAllFunctions()
            .reduce(
                (individuallyPackaged, functionName) => individuallyPackaged || this.isBatchFunctionAndIndividuallyPackaged(functionName),
                false
            );
    }

    isBatchFunction(functionName) {
        const functionObject = this.serverless.service.getFunction(functionName);

        return functionObject.hasOwnProperty('batch');
    }

    isIndividuallyPackaged(functionName) {
        if (this.serverless.service.package.individually) {
            return true;
        }

        const functionObject = this.serverless.service.getFunction(functionName);

        return !!_.get(functionObject, 'package.individually');
    }

    isBatchFunctionAndIndividuallyPackaged(functionName) {
        return this.isBatchFunction(functionName) && this.isIndividuallyPackaged(functionName);
    }
}

module.exports = ServerlessAWSBatch;
