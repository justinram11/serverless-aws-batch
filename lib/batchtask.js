
const BbPromise = require('bluebird');
const _ = require('lodash');
const util = require('util');


/**
 * Transforms a function object into a "JobDefinition" object that can be used to run this function inside a Batch task
 */
function compileBatchTask(functionName) {
  const functionObject = this.serverless.service.getFunction(functionName);
  this.serverless.cli.log(util.inspect(functionObject));

  // If this isn't a batch function, just skip it
  if (! functionObject.hasOwnProperty("batch")) {
    return;
  }

  const batchObject = functionObject.batch

  // Otherwise we need to generate a JobDefinition object for it
  const memorySize = Number(batchObject.Memory)
    || Number(functionObject.memory)
    || 2048;
  const timeout = Number(batchObject.Timeout)
    || Number(functionObject.timeout)
    || 3600;

  const environment = {}
  if (functionObject.environment || this.serverless.service.provider.environment) {
    newFunction.Properties.Environment = {};
    newFunction.Properties.Environment.Variables = Object.assign(
      {},
      this.serverless.service.provider.environment,
      functionObject.environment
    );

    let invalidEnvVar = null;
    _.forEach(
      _.keys(newFunction.Properties.Environment.Variables),
      key => { // eslint-disable-line consistent-return
        // taken from the bash man pages
        if (!key.match(/^[A-Za-z_][a-zA-Z0-9_]*$/)) {
          invalidEnvVar = `Invalid characters in environment variable ${key}`;
          return false;   // break loop with lodash
        }
        const value = newFunction.Properties.Environment.Variables[key];
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
      return BbPromise.reject(new this.serverless.classes.Error(invalidEnvVar));
    }
  }

  if ('role' in functionObject) {
    this.compileRole(newFunction, functionObject.role);
  } else if ('role' in this.serverless.service.provider) {
    this.compileRole(newFunction, this.serverless.service.provider.role);
  } else {
    this.compileRole(newFunction, 'IamRoleLambdaExecution');
  }


  const jobDefinitionTemplate = `
    {
      "Type": "AWS::Batch::JobDefinition",
      "Properties": {
        "JobDefinitionName": "",
        "Type": "container",
        "ContainerProperties": {
          "Environment": [
          
          ],
          "Image": "${this.provider.naming.getDockerImageName()}",
          "Instancetype": "",
          "JobRoleArn": "",
          "Memory": 2048,
          "Vcpus": 1
      }
    }
    `;
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
  compileBatchTasks
};