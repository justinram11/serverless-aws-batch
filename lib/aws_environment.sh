#!/bin/bash

echo $0
echo $1
echo $2
echo $3
echo $4
export AWS_ACCESS_KEY_ID=$(echo $2 | jq -r .AWS_ACCESS_KEY_ID)
export AWS_SECRET_ACCESS_KEY=$(echo $2 | jq -r .AWS_SECRET_ACCESS_KEY)
export AWS_SESSION_TOKEN=$(echo $2 | jq -r .AWS_SESSION_TOKEN)
echo ${AWS_ACCESS_KEY_ID}

/var/lang/bin/python3.6 /var/runtime/awslambda/bootstrap.py $1