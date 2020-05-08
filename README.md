# Serverless Batch
[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)

A Serverless v1.x plugin that makes creating and running AWS Batch tasks as easy as creating a Serverless Lambda Function.

Tested with:
* Serverless >= v1.43
* Python 3.7
* Node.JS 10

**Disclaimer: This project has not yet been well tested and is not yet recommended for a production system**

## Install
First make sure than you have Docker installed and running

Then add the plugin to your serverless project:

```
npm install serverless-aws-batch --save-dev
```

Modify the `serverless.yml` file to include the plugin:

```yaml
plugins:
  - serverless-aws-batch
```

Next we need to define our [AWS Batch Compute Resource](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-batch-computeenvironment-computeresources.html)

```yaml
provider:
  name: aws
  region: us-east-2
  runtime: python3.7
  batch:
    Type: [EC2 | SPOT] # Required
    BidPercentage: <Integer> # Optional. Defaults to 100 if Type = SPOT (you always pay lowest market price)
    SecurityGroupIds: # Required
      - <Security Group ID>
    Subnets: # Required
      - <VPC Subnet ID>
    InstanceTypes: # Optional
      - <Batch-Supported-Instance-Type> # Default c5.large (cheapest)
    MinvCpus: <Integer> # Optional. Default 0
    MaxvCpus: <Integer> # Optional. Default 2
    Tags: # Optional
      <Key>: <Value> # Default "Name": "AWS Batch Instance - <service>"
```

And then define our [AWS Batch Job Definition](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-batch-jobdefinition.html)
on the function definition

```yaml
functions:
  hello:
    handler: <handler definition>
    batch:
      ContainerProperties:
        Memory: <Integer> # Optional. Default 2048
        Vcpus: <Integer> # Optional. Default 1
        Command: <Command to run in docker> # Optional. Defaults to "<handler> Ref::event"
        JobRoleArn: <ARN> # Optional. Defaults to package.iamRoleStatements
        Environment:
          TEST_ENV_1: Test Value 1
      RetryStrategy:
        Attempts: <Integer> # Optional. Defaults to 1
      Timeout:
        AttemptDurationSeconds: <Integer> # Optional. Defaults to 300
```

And now you should be able to write your batch function like you would any other serverless lambda function:

```python3
import logging

# Setup our logger to work both locally and with both AWS CloudWatch
if len(logging.getLogger().handlers) > 0:
    logging.getLogger().setLevel(logging.INFO)
else:
    logging.basicConfig(level=logging.INFO)
logger = logging.getLogger()


def hello(event, context):
    logger.info(f"Hello World: {event}")
```

```yaml
functions:
  hello:
    handler: handler.hello
    events:
      - http:
          path: hello
          method: get
    batch:
      ContainerProperties:
        Memory: 2048
        Vcpus: 1
      RetryStrategy:
        Attempts: 1
      Timeout:
        AttemptDurationSeconds: 3600
```

## Implementation

What happens behind the scenes is that the Serverless Framework's ".zip" artifact gets installed into a 
[lambci/lambda:\<env>](https://hub.docker.com/r/lambci/lambda/) docker image and uploaded to [ECR](https://aws.amazon.com/ecr/).

* _Note: Currently using copy of the docker images (https://cloud.docker.com/u/justinram11/repository/list) that unsets the 
ACCESS_KEY_ID and SECRET_ACCESS_KEY environmental variables so that we can use the role attached to the EC2 instance._

A "schedule" lambda function is then created with the same name as the regular Serverless Framework's lambda function
that can be called in to pass the input event to the AWS Batch Job. The "schedule" lambda function can also be subscribed
to events the same way a regular Serverless Lambda Function is.

![serverless-batch](https://user-images.githubusercontent.com/47002419/60786825-7e80bb00-a11d-11e9-8d4d-bf4916532ab0.png)

## Example

After deploying with `sls deploy`, navigate to the [AWS Lambda Console](https://us-east-2.console.aws.amazon.com/lambda/home?region=us-east-2#/functions/serverless-demo-dev-hello?tab=graph)
and create a new Test Event with any event value and click the "Test" button.

The lambda function will automatically create a new AWS Batch Job which should be visible on the [AWS Batch Console](https://us-east-2.console.aws.amazon.com/batch/home?region=us-east-2#/dashboard)

Logs are visible in CloudWatch under the [/aws/batch/job](https://us-east-2.console.aws.amazon.com/cloudwatch/home?region=us-east-2#logStream:group=/aws/batch/job;streamFilter=typeLogStreamPrefix) Log Group

`serverless.yml`
```yaml
service: serverless-demo

provider:
  name: aws
  region: us-east-2
  runtime: python3.7 | nodejs12.x # TODO Select one
  # Creates a SPOT Compute Environment using the VPC defined in our Resources
  batch:
    Type: SPOT
    BidPercentage: 100
    SecurityGroupIds:
      - Ref: AllowAllSecurityGroup
    Subnets:
      - Ref: PublicSubnet
    MinvCpus: 0
    MaxvCpus: 2
  # Allows the Batch Job (code written in handler.py) to list all of our S3 Buckets.
  iamRoleStatements:
    - Effect: "Allow"
      Action:
        - "s3:ListAllMyBuckets"
      Resource: "*"

plugins:
  # TODO Required if a python project
  # - serverless-python-requirements
  - serverless-aws-batch

package:
  include:
    - handler.py
  exclude:
    - .serverless/**
    - node_modules/**

functions:
  hello:
    handler: handler.hello
    events:
      - http:
         path: hello
         method: get
    # Creates a Batch Job with 2GB of memory and 1 vCPU.
    batch:
      ContainerProperties:
        Memory: 2048
        Vcpus: 1
      RetryStrategy:
        Attempts: 1
      Timeout:
        AttemptDurationSeconds: 3600


# WARNING: Should not be used in production (allows all traffic)
# VPC: "Batch VPC"
#  - CIDR: 10.224.0.0/16
#  - Subnet: "Batch <region>a Public Subnet"
#    - CIDR: 10.224.0.0/20
#    - Allows all incoming and outgoing traffic
#  - Security Group: "Batch Allow All"
#    - Allows all incoming and outgoing traffic
resources:
  Resources:

    VPC:
      Type: AWS::EC2::VPC
      Properties:
        CidrBlock: 10.224.0.0/16
        EnableDnsSupport: true
        EnableDnsHostnames: true
        Tags:
          - Key: Name
            Value: Batch VPC

    InternetGateway:
      Type: AWS::EC2::InternetGateway
      Properties:
        Tags:
          - Key: Name
            Value: Batch Internet Gateway

    InternetGatewayAttachment:
      Type: AWS::EC2::VPCGatewayAttachment
      Properties:
        InternetGatewayId: !Ref InternetGateway
        VpcId: !Ref VPC

    PublicSubnet:
      Type: AWS::EC2::Subnet
      Properties:
        VpcId: !Ref VPC
        AvailabilityZone: ${self:provider.region}a
        CidrBlock: 10.224.0.0/20
        MapPublicIpOnLaunch: true
        Tags:
          - Key: Name
            Value: Batch ${self:provider.region}a Public Subnet

    PublicRouteTable:
      Type: AWS::EC2::RouteTable
      Properties:
        VpcId: !Ref VPC
        Tags:
          - Key: Name
            Value: Batch Public Routes

    DefaultPublicRoute:
      Type: AWS::EC2::Route
      DependsOn: InternetGatewayAttachment
      Properties:
        RouteTableId: !Ref PublicRouteTable
        DestinationCidrBlock: 0.0.0.0/0
        GatewayId: !Ref InternetGateway

    PublicSubnetRouteTableAssociation:
      Type: AWS::EC2::SubnetRouteTableAssociation
      Properties:
        RouteTableId: !Ref PublicRouteTable
        SubnetId: !Ref PublicSubnet

    PublicNetworkAcl:
      Type: AWS::EC2::NetworkAcl
      DependsOn: VPC
      Properties:
        VpcId: !Ref VPC
        Tags:
          - Key: Name
            Value: AWS Batch Public ACL

    InboundPublicNetworkAclAllowAll:
      Type: AWS::EC2::NetworkAclEntry
      Properties:
        NetworkAclId: !Ref PublicNetworkAcl
        RuleNumber: 100
        Protocol: -1
        RuleAction: allow
        Egress: false
        CidrBlock: 0.0.0.0/0
        PortRange:
          From: 0
          To: 65535

    OutboundPublicNetworkAclAllowAll:
      Type: AWS::EC2::NetworkAclEntry
      Properties:
        NetworkAclId: !Ref PublicNetworkAcl
        RuleNumber: 100
        Protocol: -1
        RuleAction: allow
        Egress: true
        CidrBlock: 0.0.0.0/0
        PortRange:
          From: 0
          To: 65535

    PublicSubnetNetworkAclAssociation1:
      Type: AWS::EC2::SubnetNetworkAclAssociation
      Properties:
        SubnetId: !Ref PublicSubnet
        NetworkAclId: !Ref PublicNetworkAcl

    AllowAllSecurityGroup:
      Type: AWS::EC2::SecurityGroup
      Properties:
        GroupName: Batch Allow All
        GroupDescription: "Security group for batch instances that allows all traffic"
        VpcId: !Ref VPC
        SecurityGroupIngress:
          - IpProtocol: "-1"
            CidrIp: 0.0.0.0/0
        SecurityGroupEgress:
          - IpProtocol: "-1"
            CidrIp: 0.0.0.0/0
```

### Python

`handler.py`
```python3
import json
import time
import logging
import boto3

# Setup our logger to work with both AWS CloudWatch and locally
if len(logging.getLogger().handlers) > 0:
    logging.getLogger().setLevel(logging.INFO)
else:
    logging.basicConfig(level=logging.INFO)
logger = logging.getLogger()

# Setup our boto3 clients
s3 = boto3.client('s3')


def hello(event, context):
    logger.info(f"Hello world: {event}")

    response = s3.list_buckets()
    logger.info(f"S3 Buckets: {response}")

```

### Node.JS

`handler.js`
```nodejs
'use strict';
const process = require("process");
const AWS = require("aws-sdk");
const s3 = new AWS.S3();

module.exports.hello = (event, context, callback) => {

  console.log(`Received event: ${JSON.stringify(event)}`);

  console.log(process.env.AWS_ACCESS_KEY_ID);
  console.log(process.env.AWS_SECRET_ACCESS_KEY);

  s3.listBuckets({}, function(err, data) {
    console.log(`List buckets data: ${data} err: ${err}`);
  });
};
```

## Contributors

* [simonobe](https://github.com/simonobe)
* [gcaliene](https://github.com/gcaliene)
