Run this command to launch this template:

```bash
aws cloudformation create-stack --template-body file://./bootstrap-cdk/cdk.out/BootstrapCdkStack.template.json --stack-name bootstrap-my-account --parameters ParameterKey=assetBucket,ParameterValue=myblueprintdemoassets12345 ParameterKey=assetList,ParameterValue="https://data-streaming-labs.s3.amazonaws.com/blueprint-test/aws-lambda-helpers-1.0.jar\,https://data-streaming-labs.s3.amazonaws.com/blueprint-test/CdkInfraKdaKafkaToS3Stack.template.json\,https://data-streaming-labs.s3.amazonaws.com/blueprint-test/my-deployment.zip" --capabilities CAPABILITY_IAM
```