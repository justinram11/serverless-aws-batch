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
 * @returns {string} "IamRoleBatchInstanceManagement"
 */
function getBatchInstanceManagementRoleLogicalId() {
  return "IamRoleBatchInstanceManagement";
}

/**
 * @returns {string} "IamProfileBatchInstanceManagement"
 */
function getBatchInstanceManagementProfileLogicalId() {
  return "IamProfileBatchInstanceManagement";
}

/**
 * @returns {string} "IamRoleBatchSpotFleetManagement"
 */
function getBatchSpotFleetManagementRoleLogicalId() {
  return "IamRoleBatchSpotFleetManagement";
}

/**
 * @returns {string} "IamRoleBatchJobExecution"
 */
function getBatchJobExecutionRoleLogicalId() {
  return "IamRoleBatchJobExecution";
}

/**
 * @returns {string} "IamRoleLambdaScheduleExecution"
 */
function getLambdaScheduleExecutionRoleLogicalId() {
  return "IamRoleLambdaScheduleExecution";
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
 * @returns {string} The name of the job queue to be used when submitting the job
 */
function getBatchJobQueueName() {
  return `${this.provider.serverless.service.service}-${this.provider.getStage()}-JobQueue`;
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
          "Version": "2008-10-17",
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
  const batchInstanceRoleName = `BatchInstanceRole-${this.provider.getRegion()}-${this.provider.getStage()}-${this.provider.serverless.service.service}`.substring(0, 64);
  const batchInstanceManagementRoleTemplate = `
    {
      "Type": "AWS::IAM::Role",
      "Properties": {
        "RoleName": "${batchInstanceRoleName}",
        "Path": "/",
        "AssumeRolePolicyDocument": {
          "Version": "2008-10-17",
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
          "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role"
        ]
      }
    }
    `;

  const batchInstanceProfileTemplate = `
    {
      "Type": "AWS::IAM::InstanceProfile",
      "Properties": {
        "Path": "/",
        "Roles": [ 
          {
            "Ref": "${this.provider.naming.getBatchInstanceManagementRoleLogicalId()}"
          }
        ]
      }
    }
  `

  // Setup the JobQueue to push tasks to
  return {
    [this.provider.naming.getBatchInstanceManagementRoleLogicalId()]: JSON.parse(batchInstanceManagementRoleTemplate),
    [this.provider.naming.getBatchInstanceManagementProfileLogicalId()]: JSON.parse(batchInstanceProfileTemplate)
  };
}

/**
 * Generates the IAM Service Role Object that will be used to manage spot instances in the compute environment
 */
function generateBatchSpotFleetRole() {
  const batchSpotRoleName = `BatchSpotFleetRole-${this.provider.getRegion()}-${this.provider.getStage()}-${this.provider.serverless.service.service}`.substring(0, 64);
  const batchSpotRoleManagementTemplate = `
    {
      "Type": "AWS::IAM::Role",
      "Properties": {
        "RoleName": "${batchSpotRoleName}",
        "Path": "/",
        "AssumeRolePolicyDocument": {  
           "Version":"2008-10-17",
           "Statement":[  
              {  
                 "Sid":"",
                 "Effect":"Allow",
                 "Principal":{  
                    "Service":"spotfleet.amazonaws.com"
                 },
                 "Action":"sts:AssumeRole"
              }
           ]
        },
        "ManagedPolicyArns": [
          "arn:aws:iam::aws:policy/service-role/AmazonEC2SpotFleetRole"
        ]
      }
    }
    `;

  return {
    [this.provider.naming.getBatchSpotFleetManagementRoleLogicalId()]: JSON.parse(batchSpotRoleManagementTemplate)
  }
}

/**
 * Generates an IAM Service Role Object that will be used to run the jobs from the job definition
 */
function generateBatchJobExecutionRole() {
  const batchJobExecutionRoleName = `BatchJobRole-${this.provider.getRegion()}-${this.provider.getStage()}-${this.provider.serverless.service.service}`.substring(0, 64);
  const batchJobExecutionRoleTemplate = `
    {
      "Type": "AWS::IAM::Role",
      "Properties": {
        "RoleName": "${batchJobExecutionRoleName}",
        "Path": "/",
        "AssumeRolePolicyDocument": {
          "Version": "2008-10-17",
          "Statement": [
            {
              "Sid": "",
              "Effect": "Allow",
              "Principal": {
                "Service": "ecs-tasks.amazonaws.com"
              },
              "Action": "sts:AssumeRole"
            }
          ]
        }
      }
    }
    `;

  // Merge our iamRoleStatements into this role
  const batchJobExecutionRole = JSON.parse(batchJobExecutionRoleTemplate);
  if (this.serverless.service.provider.hasOwnProperty('iamRoleStatements')) {
    _.merge(
        batchJobExecutionRole.Properties,
        {
          "Policies": [
            {
              "PolicyName": "batch-job-execution-policies",
              "PolicyDocument": {
                "Version": "2008-10-17",
                "Statement": this.serverless.service.provider.iamRoleStatements
              }
            }
          ]
        }
    )
  }

  // Setup the JobQueue to push tasks to
  return {
    [this.provider.naming.getBatchJobExecutionRoleLogicalId()]: batchJobExecutionRole
  };
}

/**
 * Generates the IAM Role that can be used by our lambda "schedule batch" functions
 */
function generateLambdaScheduleExecutionRole() {
  const lambdaScheduleExecutionRoleName = `BatchScheduleRole-${this.provider.getRegion()}-${this.provider.getStage()}-${this.provider.serverless.service.service}`.substring(0, 64);
  const lambdaScheduleExecutionRoleTemplate = `
    {
      "Type": "AWS::IAM::Role",
      "Properties": {
        "RoleName": "${lambdaScheduleExecutionRoleName}",
        "Path": "/",
        "AssumeRolePolicyDocument": {
          "Version": "2008-10-17",
          "Statement": [
            {
              "Sid": "",
              "Effect": "Allow",
              "Principal": {
                "Service": "lambda.amazonaws.com"
              },
              "Action": "sts:AssumeRole"
            }
          ]
        },
        "Policies": [
          {
            "PolicyName": "lambda-schedule-execution-policies",
            "PolicyDocument": {
              "Version": "2012-10-17",
              "Statement": [
                {
                  "Effect": "Allow",
                  "Action": [
                    "batch:SubmitJob"
                  ],
                  "Resource": [
                    {
                      "Ref": "${this.provider.naming.getBatchJobQueueLogicalId()}"
                    },
                    "arn:aws:batch:*:*:job-definition/*:*"
                  ]
                }
              ]
            }
          }
        ]
      }
    }
    `;

  // Setup the JobQueue to push tasks to
  return {
    [this.provider.naming.getLambdaScheduleExecutionRoleLogicalId()]: JSON.parse(lambdaScheduleExecutionRoleTemplate)
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
        "JobQueueName": "${this.provider.naming.getBatchJobQueueName()}",
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
      "InstanceRole": { 
        "Fn::GetAtt": [
          "${this.provider.naming.getBatchInstanceManagementProfileLogicalId()}",
          "Arn"
        ]
      },
      "SpotIamFleetRole": { 
        "Fn::GetAtt": [
          "${this.provider.naming.getBatchSpotFleetManagementRoleLogicalId()}",
          "Arn" 
        ]
      },
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

  // If we are a SPOT type, default the BigPercentage to 100% (always pay lowest market price)
  if (batchComputeResourceObject.hasOwnProperty("Type")
      && batchComputeResourceObject.Type == "SPOT"
      && ! batchComputeResourceObject.hasOwnProperty("BidPercentage")) {

    batchComputeResourceObject["BidPercentage"] = 100;
  }

  const computeEnvironmentName = `${this.provider.serverless.service.service}-${this.provider.getStage()}-ComputeEnvironment-${Math.floor(Math.random() * Math.floor(1000000))}`.substring(0, 64);
  const batchComputeEnvironmentTemplate = `
      {
        "Type" : "AWS::Batch::ComputeEnvironment",
        "Properties" : {
          "ComputeEnvironmentName" : "${computeEnvironmentName}",
          "ServiceRole" : { 
            "Fn::GetAtt": [
              "${this.provider.naming.getBatchServiceRoleLogicalId()}",
              "Arn" 
            ]
          },
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
  this.serverless.cli.log("Generating AWS Batch");

  const newBatchServiceRoleObject = generateBatchServiceRole.bind(this)();
  const newBatchInstanceManagementRoleObject = generateBatchInstanceRole.bind(this)();
  const newBatchSpotFleetManagementObject = generateBatchSpotFleetRole.bind(this)();
  const newBatchJobExecutionRoleObject = generateBatchJobExecutionRole.bind(this)();
  const newLambdaScheduleExecutionRoleObject = generateLambdaScheduleExecutionRole.bind(this)();
  const newBatchJobQueueObject = generateBatchJobQueue.bind(this)();
  const newBatchComputeEnvironmentObject = generateBatchComputeEnvironment.bind(this)();

  // Add it to our initial compiled cloud formation templates
  _.merge(
    this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
    newBatchServiceRoleObject,
    newBatchInstanceManagementRoleObject,
    newBatchSpotFleetManagementObject,
    newBatchJobExecutionRoleObject,
    newLambdaScheduleExecutionRoleObject,
    newBatchJobQueueObject,
    newBatchComputeEnvironmentObject,
  );

  return BbPromise.resolve();
}

module.exports = {
  getBatchServiceRoleLogicalId,
  getBatchInstanceManagementRoleLogicalId,
  getBatchInstanceManagementProfileLogicalId,
  getBatchSpotFleetManagementRoleLogicalId,
  getBatchJobExecutionRoleLogicalId,
  getLambdaScheduleExecutionRoleLogicalId,
  getBatchComputeEnvironmentLogicalId,
  getBatchJobQueueLogicalId,
  getBatchJobQueueName,
  validateAWSBatchServerlessConfig,
  generateAWSBatchTemplate
};