// Handles setting up our ECR repository so that we can push our docker image to it

'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const _ = require('lodash');
var util = require('util');

/**
 * Adds the ECR repository to the "create" template so that we have a repository we can upload our docker image to
 * during deployment.
 */
function generateCoreTemplate() {
  // Setup our ECR Repository to delete untagged images after 1 day
  const ecrTemplate = `
      {
        "Type" : "AWS::ECR::Repository",
        "Properties" : {
          "LifecyclePolicy" : {
            "LifecyclePolicyText" : "{\\"rules\\":[{\\"rulePriority\\":1,\\"description\\":\\"Remove untagged images\\",\\"selection\\":{\\"tagStatus\\":\\"untagged\\",\\"countType\\":\\"sinceImagePushed\\",\\"countUnit\\":\\"days\\",\\"countNumber\\":1},\\"action\\":{\\"type\\":\\"expire\\"}}]}"
          },
          "RepositoryName" : "${this.provider.naming.getECRRepositoryName()}"
        }
      }
    `;

  const newECRObject = {
    [this.provider.naming.getECRLogicalId()]: JSON.parse(ecrTemplate)
  };

  // Add it to our initial compiled cloud formation templates
  _.merge(
    this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
    newECRObject
  );

  // Then write it back out to the file
  const coreTemplateFileName = this.provider.naming.getCoreTemplateFileName();

  const coreTemplateFilePath = path.join(this.serverless.config.servicePath,
    '.serverless',
    coreTemplateFileName);

  this.serverless.utils.writeFileSync(coreTemplateFilePath,
    this.serverless.service.provider.compiledCloudFormationTemplate);

  this.serverless.service.provider.coreCloudFormationTemplate =
    _.cloneDeep(this.serverless.service.provider.compiledCloudFormationTemplate);

  return BbPromise.resolve();
}

module.exports = { generateCoreTemplate };