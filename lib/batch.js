const BbPromise = require('bluebird');
const _ = require('lodash');
const util = require('util');

/**
 * @returns {string} "IamRoleBatchService"
 */
function getBatchServiceRoleLogicalId() {
  return "IamRoleBatchService";
}

/**
 * @returns {string} "IamRoleECSContainerService"
 */
function getBatchInstanceManagementRoleLogicalId() {
  return "IamRoleBatchInstanceManagement";
}

/**
 * @returns {string} "BatchComputeEnvironment"
 */
function getBatchComputeEnvironmentLogicalId() {
  return "BatchComputeEnvironment";
}

/**
 * @returns {string} "BatchJobQueue"
 */
function getBatchJobQueueLogicalId() {
  return "BatchJobQueue";
}

/**
 * Validates the "batch" object in the serverless config to ensure that we have:
 *  - subnets
 *  - securityGroups
 */
function validateAWSBatchServerlessConfig() {
  const provider = this.serverless.service.provider;
  if (! provider.hasOwnProperty("batch")) {
    throw new Error("'batch' configuration not defined on the provider");
  }

  const batch = provider.batch;
  if (! batch.hasOwnProperty("SecurityGroupIds")) {
    throw new Error("'batch' configuration does not contain property 'SecurityGroupIds' (make sure it's capitalized)");
  }
  if (! batch.hasOwnProperty("Subnets")) {
    throw new Error("'batch' configuration does not contain property 'Subnets' (make sure it's capitalized)");
  }
}

/**
 * Generates the IAM Service Role Object to be used by the Batch Compute Environment
 */
function generateBatchServiceRole() {
  const batchServiceRoleName = `BatchServiceRole-${this.provider.getRegion()}-${this.provider.getStage()}-${this.provider.serverless.service.service}`.substring(0, 64);
  const batchServiceRoleTemplate = `
    {
      "Type": "AWS::IAM::Role",
      "Properties": {
        "RoleName": "${batchServiceRoleName}",
        "Path": "/",
        "AssumeRolePolicyDocument": {
          "Version": "2012-10-17",
          "Statement": [
            {
              "Sid": "",
              "Effect": "Allow",
              "Principal": {
                "Service": "batch.amazonaws.com"
              },
              "Action": "sts:AssumeRole"
            }
          ]
        },
        "ManagedPolicyArns": [
          "arn:aws:iam::aws:policy/service-role/AWSBatchServiceRole"
        ]
      }
    }
    `;

  return {
    [this.provider.naming.getBatchServiceRoleLogicalId()]: JSON.parse(batchServiceRoleTemplate)
  };
}

/**
 * Generates the IAM Service Role Object that will be used on instances within our compute environment to launch containers
 */
function generateBatchInstanceRole() {
  const batchInstanceRoleName = `BatchMntRole-${this.provider.getRegion()}-${this.provider.getStage()}-${this.provider.serverless.service.service}`.substring(0, 64);
  const batchInstanceManagementRoleTemplate = `
    {
      "Type": "AWS::IAM::Role",
      "Properties": {
        "RoleName": "${batchInstanceRoleName}",
        "Path": "/",
        "AssumeRolePolicyDocument": {
          "Version": "2012-10-17",
          "Statement": [
            {
              "Sid": "",
              "Effect": "Allow",
              "Principal": {
                "Service": "ec2.amazonaws.com"
              },
              "Action": "sts:AssumeRole"
            }
          ]
        },
        "ManagedPolicyArns": [
          "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role",
          "arn:aws:iam::aws:policy/service-role/AmazonEC2SpotFleetRole"
        ]
      }
    }
    `;

  // Setup the JobQueue to push tasks to
  return {
    [this.provider.naming.getBatchInstanceManagementRoleLogicalId()]: JSON.parse(batchInstanceManagementRoleTemplate)
  };
}

/**
 * Generates the JobQueue object that we will submit tasks to
 */
function generateBatchJobQueue() {
  const batchJobQueueTemplate = `
    {
      "Type": "AWS::Batch::JobQueue",
      "Properties": {
        "JobQueueName": "${this.provider.serverless.service.service}-${this.provider.getStage()}-JobQueue",
        "Priority": 1,
        "ComputeEnvironmentOrder": [
          {
            "ComputeEnvironment": { "Ref": "${this.provider.naming.getBatchComputeEnvironmentLogicalId()}" },
            "Order": 1
          }
        ]
      }
    }
    `;

  return {
    [this.provider.naming.getBatchJobQueueLogicalId()]: JSON.parse(batchJobQueueTemplate)
  }
}

/**
 * Generates the ComputeEnvironment Object that will be used to run tasks
 */
function generateBatchComputeEnvironment() {
  // Setup our compute environment
  const batchComputeResourceTemplate = `
    {
      "Type": "EC2",
      "InstanceRole": { "Ref": "${this.provider.naming.getBatchInstanceManagementRoleLogicalId()}" },
      "SpotIamFleetRole": { "Ref": "${this.provider.naming.getBatchInstanceManagementRoleLogicalId()}" },
      "InstanceTypes": [
        "c5.large"
      ],
      "MinvCpus": 0,
      "MaxvCpus": 2,
      "Tags": {
        "Name": "AWS Batch Instance - ${this.provider.serverless.service.service}-${this.provider.getStage()}"
      }
    }
    `;

  // Merge any overrides into our compute environment template
  const batchComputeResourceObject = _.merge(
    {},
    JSON.parse(batchComputeResourceTemplate),
    this.serverless.service.provider.batch
  )

  const batchComputeEnvironmentTemplate = `
      {
        "Type" : "AWS::Batch::ComputeEnvironment",
        "Properties" : {
          "ComputeEnvironmentName" : "${this.provider.serverless.service.service}-${this.provider.getStage()}-ComputeEnvironment",
          "ServiceRole" : { "Ref": "${this.provider.naming.getBatchServiceRoleLogicalId()}" },
          "Type" : "MANAGED",
          "ComputeResources": ${JSON.stringify(batchComputeResourceObject)}
        }
      }
    `;

  // Then merge the compute resource into the Compute Environment object
  return {
    [this.provider.naming.getBatchComputeEnvironmentLogicalId()]: JSON.parse(batchComputeEnvironmentTemplate)
  }
}

/**
 * Adds the AWS Batch Compute Environment, Job Queue, and Job Definition to our cloud formation
 * template
 */
function generateAWSBatchTemplate() {
  const newBatchServiceRoleObject = generateBatchServiceRole.bind(this)();
  const newBatchInstanceManagementRoleObject = generateBatchInstanceRole.bind(this)();
  const newBatchJobQueueObject = generateBatchJobQueue.bind(this)();
  const newBatchComputeEnvironmentObject = generateBatchComputeEnvironment.bind(this)();

  // Add it to our initial compiled cloud formation templates
  _.merge(
    this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
    newBatchServiceRoleObject,
    newBatchInstanceManagementRoleObject,
    newBatchJobQueueObject,
    newBatchComputeEnvironmentObject,
  );

  //this.serverless.cli.log(util.inspect(this.serverless.service.provider.compiledCloudFormationTemplate.Resources));

  return BbPromise.resolve();
}

module.exports = {
  getBatchServiceRoleLogicalId,
  getBatchInstanceManagementRoleLogicalId,
  getBatchComputeEnvironmentLogicalId,
  getBatchJobQueueLogicalId,
  validateAWSBatchServerlessConfig,
  generateAWSBatchTemplate
};