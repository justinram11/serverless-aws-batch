#!/bin/sh

/lambda-entrypoint.sh $1 &

# https://docs.aws.amazon.com/lambda/latest/dg/images-test.html
RESPONSE=$(curl -s -w "\n" -XPOST "http://localhost:8080/2015-03-31/functions/function/invocations" -d $2)

# https://docs.aws.amazon.com/lambda/latest/dg/nodejs-exceptions.html
# For some reason header 'X-Amz-Function-Error' is not included when lambda fails, so we rely on errorType property (not very robust though)
# if echo "$RESPONSE" | grep -q "X-Amz-Function-Error"
if echo "$RESPONSE" | grep -q "errorType"
then
    exit 1
fi