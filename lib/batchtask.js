
const BbPromise = require('bluebird');
const _ = require('lodash');
const util = require('util');
const path = require('path');
const fs = require('fs');
const JSZip = require("jszip");

/**
 * @param functionName
 * @returns {string} The logical ID of the Job Definition resource created for the function
 */
function getJobDefinitionLogicalId(functionName) {
  let logicalId = `JobDefinition${functionName.charAt(0).toUpperCase()}${functionName.slice(1)}`;
  return logicalId.length > 64
      ? logicalId.substring(0, 64)
      : logicalId;
}

/**
 * @returns {string} "IamRoleBatchJobExecution"
 */
function getBatchJobExecutionRoleLogicalId(functionName) {
  let logicalId = `IamRoleBatchJobExecution${functionName.charAt(0).toUpperCase()}${functionName.slice(1)}`;
  return logicalId.length > 64
      ? logicalId.substring(0, 64)
      : logicalId;
}

/**
 * Transforms a function object into a "JobDefinition" object that can be used to run this function inside a Batch task
 */
function compileBatchTask(functionName) {
  const functionObject = this.serverless.service.getFunction(functionName);

  // If this isn't a batch function, just skip it
  if (! functionObject.hasOwnProperty("batch")) {
    return BbPromise.resolve();
  }

  functionObject.getJobDefinitionName = function() {
    return `${this.provider.serverless.service.service}-${this.provider.getStage()}-${functionName}`
  }.bind(this);

  // Setup our new function
  const newFunction = {
    "Type": "AWS::Batch::JobDefinition",
    "Properties": {
      "JobDefinitionName": functionObject.getJobDefinitionName(),
      "Type": "container"
    }
  }
  updateContainerProperties.bind(this)(newFunction, functionObject, functionName);
  updateRetryStrategy.bind(this)(newFunction, functionObject);
  updateTimeout.bind(this)(newFunction, functionObject);

  // generate role for a batchjob execution based on custom iam statements
  const newBatchJobExecutionRoleObject = generateBatchJobExecutionRole.bind(this)(functionName, functionObject)

  // Add it to our compiled cloud formation templates
  _.merge(
      this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
      {
        [getJobDefinitionLogicalId(functionName)]: newFunction
      },
      newBatchJobExecutionRoleObject
  );

  // Now replace the original lambda function with code to invoke this batch task
  generateLambdaScheduleArtifact.bind(this)(functionName);

  _.merge(
      this.serverless.service.functions,
      {
        [functionName]: {
          handler: 'handler.schedule',
          name: functionObject.name,
          memorySize: 128,
          timeout: 6,
          runtime: 'nodejs16.x',
          package: {
            artifact: `${path.join(this.serverless.config.servicePath, '.serverless', functionName)}.zip`
          },
          environment: {
            EVENT_LOGGING_ENABLED: functionObject.batch.hasOwnProperty('scheduleLoggingEnabled') && functionObject.batch.scheduleLoggingEnabled,
            FUNCTION_NAME: functionName,
            JOB_DEFINITION_ARN: {
              'Ref': this.provider.naming.getJobDefinitionLogicalId(functionName)
            },
            JOB_QUEUE_ARN: {
              'Ref': this.provider.naming.getBatchJobQueueLogicalId()
            }
          },
          role: {
            "Fn::GetAtt": [
              this.provider.naming.getLambdaScheduleExecutionRoleLogicalId(),
              "Arn"
            ]
          }
        }
      }
  );
  _.unset(this.serverless.service.functions, `${functionName}.iamRoleStatements`)
  return BbPromise.resolve();
}

/**
 * Generates a container properties configuration and adds it to the newFunction object
 * https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-batch-jobdefinition-containerproperties.html
 */
function updateContainerProperties(newFunction, functionObject, functionName) {
  newFunction.Properties.ContainerProperties = _.merge(
      {},
      functionObject.batch.ContainerProperties
  );

  if (! newFunction.Properties.ContainerProperties.hasOwnProperty('Memory')) {
    const memorySize = getMemorySize(functionObject);
    newFunction.Properties.ContainerProperties.Memory = memorySize;
  }

  if (! newFunction.Properties.ContainerProperties.hasOwnProperty('Command')) {
    if (! functionObject.handler) {
      throw new this.serverless.classes.Error(`Could not find handler for batch task ${functionObject.name}`);
    }
    newFunction.Properties.ContainerProperties.Command = [
        `${this.serverless.service.service}/${functionObject.handler}`,
        "Ref::event"
    ]
  }

  if (! newFunction.Properties.ContainerProperties.hasOwnProperty('Image')) {
    newFunction.Properties.ContainerProperties.Image = this.provider.naming.getDockerImageName();
  }

  if (! newFunction.Properties.ContainerProperties.hasOwnProperty('Vcpus')) {
    newFunction.Properties.ContainerProperties.Vcpus = 1;
  }

  if (! newFunction.Properties.ContainerProperties.hasOwnProperty('JobRoleArn')) {
    newFunction.Properties.ContainerProperties.JobRoleArn = {
      Ref: this.provider.naming.getBatchJobExecutionRoleLogicalId(functionName)
    };
  }

  // Setup the required environment variables and any included in the serverless configuration
  const environment = _.merge(
      {
        'AWS_LAMBDA_FUNCTION_TIMEOUT': getTimeout(functionObject),
        'AWS_LAMBDA_FUNCTION_MEMORY_SIZE': getMemorySize(functionObject),
        'AWS_REGION': this.serverless.service.provider.region || 'us-east-1'
      },
      this.serverless.service.provider.environment,
      functionObject.environment,
      functionObject.batch.ContainerProperties.Environment
  );

  let invalidEnvVar = null;
  _.forEach(
      _.keys(environment),
      key => { // eslint-disable-line consistent-return
        // taken from the bash man pages
        if (!key.match(/^[A-Za-z_][a-zA-Z0-9_]*$/)) {
          invalidEnvVar = `Invalid characters in environment variable ${key}`;
          return false;   // break loop with lodash
        }
        const value = environment[key];
        if (_.isObject(value)) {
          const isCFRef = _.isObject(value) &&
              !_.some(value, (v, k) => k !== 'Ref' && !_.startsWith(k, 'Fn::'));
          if (!isCFRef) {
            invalidEnvVar = `Environment variable ${key} must contain string`;
            return false;
          }
        }
      }
  );

  if (invalidEnvVar) {
    throw new Error(invalidEnvVar);
  }

  newFunction.Properties.ContainerProperties.Environment = [];
  _.forEach(
      _.keys(environment),
      key => {
        newFunction.Properties.ContainerProperties.Environment.push({
          "Name": key,
          "Value": environment[key]
        });
      }
  );
}

/**
 * Generates a retry strategy configuration and adds it to the newFunction object
 */
function updateRetryStrategy(newFunction, functionObject) {
  newFunction.Properties.RetryStrategy = _.merge(
      {},
      functionObject.batch.RetryStrategy
  );

  if (! newFunction.Properties.RetryStrategy.hasOwnProperty('Attempts')) {
    newFunction.Properties.RetryStrategy.Attempts = 1;
  }
}

/**
 * Generates a timeout configuration and adds it to the newFunction object
 * https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-batch-jobdefinition-timeout.html
 */
function updateTimeout(newFunction, functionObject) {
  newFunction.Properties.Timeout = _.merge(
      {},
      functionObject.batch.Timeout
  );

  if (! newFunction.Properties.Timeout.hasOwnProperty('AttemptDurationSeconds')) {
    const timeout = getTimeout(functionObject);
    newFunction.Properties.Timeout.AttemptDurationSeconds = timeout;
  }
}

/**
 * Retrieves the memory to use for this function if it's set on the functionObject.
 * Otherwise defaults to 2gb.
 */
function getMemorySize(functionObject) {
  return Number(functionObject.batch.memory)
      || Number(functionObject.memory)
      || 2048;
}

/**
 * Retrieves the timeout to use for this function if it's set on the functionObject.
 * Otherwise defaults to 300s
 */
function getTimeout(functionObject) {
  return Number(functionObject.batch.Timeout ? functionObject.batch.Timeout.AttemptDurationSeconds: undefined)
      || Number(functionObject.timeout)
      || 300;
}


/**
 * Handles copying the "schedule.js" file into a zip deployment artifact for the specific batch function
 */
async function generateLambdaScheduleArtifact(functionName) {
  this.serverless.cli.log(`Building lambda schedule artifact for: "${functionName}"...`);

  const functionArtifactFileName = this.provider.naming.getFunctionArtifactName(functionName);
  const artifactFilePath = path.join(this.serverless.config.servicePath, '.serverless', functionArtifactFileName);

  const zip = new JSZip();

  // Add a top-level, arbitrary text file with contents
  const contents = fs.readFileSync(path.join(__dirname, 'schedule.js'));
  zip.file("handler.js", contents);

  // JSZip can generate Buffers so you can do the following
  const response = new Promise((resolve, reject) => {
    zip.generateNodeStream({type:'nodebuffer',streamFiles:true})
        .pipe(fs.createWriteStream(artifactFilePath))
        .on('finish', function () {
          resolve()
        })
  });

  return await response;
}
/**
 * Generate Batch job execution role per batch job
 */
function generateBatchJobExecutionRole(functionName, functionObject) {
  const batchJobExecutionRoleName = `BatchJobRole-${functionName}-${this.provider.getRegion()}-${this.provider.getStage()}-${this.provider.serverless.service.service}`.substring(0, 64);
  const batchJobExecutionRoleTemplate = `
    {
      "Type": "AWS::IAM::Role",
      "Properties": {
        "RoleName": "${batchJobExecutionRoleName}",
        "Path": "/",
        "AssumeRolePolicyDocument": {
          "Version": "2012-10-17",
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
                "Version": "2012-10-17",
                "Statement": this.serverless.service.provider.iamRoleStatements
              }
            }
          ]
        }
    )
  }

  // Merge in custom iamRoleStatements from lambda function definition
  if (functionObject.hasOwnProperty('iamRoleStatements')) {
    _.mergeWith(
      batchJobExecutionRole.Properties,
      {
        "Policies": [
          {
            "PolicyName": "batch-job-custom-policies",
            "PolicyDocument": {
              "Version": "2012-10-17",
              "Statement": functionObject.iamRoleStatements
            }
          }
        ]
      },
      (objValue, srcValue) => {
        if (_.isArray(objValue)) {
          return objValue.concat(srcValue);
        }
      }
    )
  }

  // Setup the JobQueue to push tasks to
  return {
    [this.provider.naming.getBatchJobExecutionRoleLogicalId(functionName)]: batchJobExecutionRole
  };
}

/**
 * Iterates through all of our functions, starting the compile to JobDefinition if needed
 */
function compileBatchTasks() {
  const allFunctions = this.serverless.service.getAllFunctions();
  return BbPromise.each(
    allFunctions,
    functionName => compileBatchTask.bind(this)(functionName)
  );
}

module.exports = {
  compileBatchTasks,
  getJobDefinitionLogicalId,
  getBatchJobExecutionRoleLogicalId
};
