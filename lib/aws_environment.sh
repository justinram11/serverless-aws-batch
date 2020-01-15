#!/bin/bash

echo $2
export AWS_ACCESS_KEY_ID=$(echo $2 | jq -r .event.AWS_ACCESS_KEY_ID)
export AWS_SECRET_ACCESS_KEY=$(echo $2 | jq -r .event.AWS_SECRET_ACCESS_KEY)
export AWS_SESSION_TOKEN=$(echo $2 | jq -r .event.AWS_SESSION_TOKEN)
echo ${AWS_ACCESS_KEY_ID}

/var/lang/bin/python3.6 /var/runtime/awslambda/bootstrap.py $1