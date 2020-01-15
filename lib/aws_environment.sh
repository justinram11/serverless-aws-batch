#!/bin/bash

credentials=$(aws sts assume-role --role-arn $ASSUME_ROLE_ARN --role-session-name "RoleSessionFromCodeBuild" | jq .Credentials)
export AWS_ACCESS_KEY_ID=$(echo $credentials | jq -r .AccessKeyId)
export AWS_SECRET_ACCESS_KEY=$(echo $credentials | jq -r .SecretAccessKey)
export AWS_SESSION_TOKEN=$(echo $credentials | jq -r .SessionToken)
echo ${AWS_ACCESS_KEY_ID}

