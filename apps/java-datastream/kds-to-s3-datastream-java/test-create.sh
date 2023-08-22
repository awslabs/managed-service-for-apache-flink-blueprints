#!/bin/sh

set -x

AWS_ACCOUNT_ID=$(aws sts get-caller-identity) | jq -r ".Account"
AWS_REGION=$(aws configure get region)
BUCKET_NAME="kda-blueprints-kds-to-s3-${AWS_ACCOUNT_ID}-${AWS_REGION}"
APP_NAME=kds-to-s3-datastream-java
JAR_FILE=$APP_NAME-1.0.1.jar

# Create required S3 buckets if they don't already exist
# Buckets are created in the default region. Use AWS_REGION
# environment variable to change where they are created.
aws s3api head-bucket --bucket $BUCKET_NAME --region $AWS_REGION >/dev/null 2>&1
if [ $? -ne 0 ]; then
    aws s3api create-bucket --bucket $BUCKET_NAME --region $AWS_REGION --create-bucket-configuration LocationConstraint=$AWS_REGION | cat
fi


# After this point any failure should stop execution
set -e

# Build Flink app
mvn clean
mvn package

# Build CFN
cd cdk-infra
cdk synth -j > ../target/$APP_NAME.json
cd ..

# Upload artifacts
aws s3 cp target/$JAR_FILE s3://$BUCKET_NAME/$JAR_FILE

# Create CFN stack
aws cloudformation deploy --stack-name $APP_NAME  --parameter-overrides "AppName=${APP_NAME}" "BucketName=${BUCKET_NAME}" "StreamName=${APP_NAME}" "RoleName=${APP_NAME}" "GlueDatabaseName=default" "CloudWatchLogGroupName=blueprints/kinesis-analytics/${APP_NAME}" "CloudWatchLogStreamName=kinesis-analytics-log-stream" "BootstrapStackName=test-script" --capabilities CAPABILITY_NAMED_IAM --template-file target/$APP_NAME.json
