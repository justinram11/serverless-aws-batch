#!/bin/bash

echo $1
echo $2
credentials=$(curl 169.254.170.2$AWS_CONTAINER_CREDENTIALS_RELATIVE_URI)
export AWS_ACCESS_KEY_ID=$(echo $credentials | jq -r .AccessKeyId)
export AWS_SECRET_ACCESS_KEY=$(echo $credentials | jq -r .SECRET_ACCESS_KEY)
export AWS_SESSION_TOKEN=$(echo $credentials | jq -r .Token)
echo ${AWS_ACCESS_KEY_ID}

/var/lang/bin/python3.6 /var/runtime/awslambda/bootstrap.py $1 $2