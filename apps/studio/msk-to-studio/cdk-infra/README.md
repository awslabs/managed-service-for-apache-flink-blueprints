# CDK Infrastructure associated with MSK Serverless to S3 MSF blueprint (Java)

This CDK script deploys the following the components:

1. VPC for MSK Serverless and Managed Service for Apache Flinkapplication.
2. MSK Serverless.
3. Managed Service for Apache Flink Java DataStream API application.
4. IAM permissions for the role associated with the Managed Service for Apache Flink application.

This CDK script expects you to supply the following *existing* resources:

1. S3 bucket where the application jar will be uploaded (`appBucket` below).
2. S3 bucket that will function as the sink (`appSinkBucket` below).
3. Glue database (`glueDatabaseName` below).

## CDK runtime context key/value pairs that need to be supplied

Open up `cdk.json` and fill in appropriate values for each of these CDK context values:

| Context value name | Purpose | Notes
| --- | --- | --- |
| `msfAppName` | The name of the Managed Service for Apache Flink application | MSF app *will be created* |
| `appBucket` | The S3 bucket where the application payload will be stored | *Must be pre-existing* |
| `appSinkBucket` | The bucket to which the MSK to S3 Flink app will write output files (in Parquet) | *Must be pre-existing* |
| `runtimeEnvironment` | The Managed Service for Apache Flink runtime environment | For instance, `FLINK-1_15` |
| `deployDataGen` | `true` if you want Zeppelin-based interactive MSF for data generation to be deployed; `false` otherwise | N/A |
| `glueDatabaseName` | The AWS Glue database that will be used by MSF Studio datagen app | *Must be pre-existing* |
| `msfLogGroup` | The name for the CloudWatch Log Group that will be linked to the MSF Flink app | Log group *will be created* |
| `msfLogStream` | The name for the CloudWatch Log Stream that will be linked to the MSF Flink app | Log stream *will be created* |
| `sourceMskClusterName` | The name for the source MSK Serverless cluster | MSK Serverless cluster *will be created* |

For more information on CDK Runtime Context, please see [Runtime Context](https://docs.aws.amazon.com/cdk/v2/guide/context.html).


## Deploying the blueprint

```
cdk deploy
```

This will launch a CloudFormation Stack containing all the resources required for the blueprint.

## Generating a CloudFormation script using `cdk synth`:

Instead of deploying directly, you could also generate an intermediate CFN script using the command below.

```
cdk synth
```

## Deleting the blueprint

To avoid ongoing charges, please make sure that you delete the blueprint and associated AWS resources using the following command.

```
cdk destroy
```