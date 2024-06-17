# KDS to S3 (Java Datastream API)

This blueprint deploys a MSF app that reads from Kinesis Data Streams (KDS) using IAM auth and writes to S3 using the Java DataStream API:

![Arch diagram](img/kds-kda-s3.png)

## Project details

1. Flink version: `1.19.0`
2. Java version: `11`

## Key components used

1. `FlinkKinesisConsumer`.
2. `FileSink` (`StreamingFileSink` is slated to be deprecated).

## High-level deployment steps

1. Build app and copy resulting JAR to S3 location
2. Deploy associated infra (KDS and MSF) using CDK script
    - If using existing resources, you can simply update app properties in MSF.
3. Perform data generation

## Prerequisites

1. Maven
2. AWS SDK v2
2. AWS CDK v2 - for deploying associated infra (KDS Stream and MSF app)

## Step-by-step deployment walkthrough

1. First, let's set up some environment variables to make the deployment easier. Replace these values with your own S3 bucket, app name, etc.

```bash
export AWS_PROFILE=<<profile-name>>
export APP_NAME=<<name-of-your-app>>
export S3_BUCKET=<<your-s3-bucket-name>>
export S3_FILE_KEY=<<your-jar-name-on-s3>>
```

2. Build Java Flink application locally.

From root directory of this project, run:

```
mvn clean package
```

3. Copy jar to S3 so it can be referenced in CDK deployment

```bash
aws s3 cp target/<<your generated jar>> ${S3_BUCKET}/{S3_FILE_KEY}
```

4. Follow instructions in the [`cdk-infra`](cdk-infra/README.md) folder to deploy the infrastructure associated with this app - such as the source KDS stream and the Managed Service for Apache Flink application.

5. Follow instructions in [orders-datagen](../../../datagen/orders-datagen/README.md) to create topic and generate data into the source KDS stream.

6. Start your Managed Service for Apache Flink application from the AWS console.

7. Do a Flink query or S3 Select Query against S3 to view data written to S3.



## Launching via CloudFormation with pre-synthesized templates:

1. First, navigate to [the bootstrapping folder](/bootstrap-cdk/): `/bootstrap-cdk` and synthesize the template: `cdk synth`
2. Next, navigate to this blueprint's cdk-infra folder and type `cdk synth` to synthesize the template.
3. Finally, navigate to the root of the project. `/`

#### Bootstrap your account (run in root of project and change variables accordingly)

Copy and paste this command into a terminal in the root of the project to bootstrap the assets into your account.

```bash
export timestampToLetters=$(date +%s)
export BucketName=myblueprintdemoassets-${timestampToLetters}
export BootstrapStackName=bootstrap-my-account-${timestampToLetters}-stack
export BlueprintStackName=kds-to-s3-blueprint-${timestampToLetters}-stack
export AppName=kds-to-s3-demo-${timestampToLetters}-app
export StreamName=kds-to-s3-demo-${timestampToLetters}-stream
export CloudWatchLogGroupName=blueprints/managed-flink/${AppName}
export CloudWatchLogStreamName=managed-flink-log-stream
export RoleName=kds-to-s3-demo-${timestampToLetters}-role

aws cloudformation create-stack --template-body file://./bootstrap-cdk/cdk.out/BootstrapCdkStack.template.json --stack-name ${BootstrapStackName} --parameters ParameterKey=AssetBucket,ParameterValue=$BucketName ParameterKey=AssetList,ParameterValue="https://data-streaming-labs.s3.amazonaws.com/blueprint-test/kds-to-s3-datastream-java-1.0.1.jar\,https://data-streaming-labs.s3.amazonaws.com/blueprint-test/kds-to-s3-datastream-java.json" --capabilities CAPABILITY_IAM
```

### once bootstrapping finishes (in your AWS Console), then run next command from terminal: 

```bash
aws cloudformation create-stack --template-url https://${BucketName}.s3.amazonaws.com/kds-to-s3-datastream-java.json --stack-name $BlueprintStackName --parameters ParameterKey=AppName,ParameterValue=$AppName ParameterKey=CloudWatchLogGroupName,ParameterValue=$CloudWatchLogGroupName ParameterKey=CloudWatchLogStreamName,ParameterValue=$CloudWatchLogStreamName ParameterKey=StreamName,ParameterValue=$StreamName ParameterKey=BucketName,ParameterValue=$BucketName ParameterKey=BootstrapStackName,ParameterValue=$BootstrapStackName ParameterKey=RoleName,ParameterValue=$RoleName --capabilities CAPABILITY_NAMED_IAM
```

Now the blueprint will be launched in your account.