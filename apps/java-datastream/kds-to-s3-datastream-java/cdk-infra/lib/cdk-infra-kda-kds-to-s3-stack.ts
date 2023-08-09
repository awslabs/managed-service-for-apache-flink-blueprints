/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * Apache-2.0
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import * as cdk from 'aws-cdk-lib';
import { StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { aws_logs as logs } from 'aws-cdk-lib';
import { aws_kinesis as kinesis } from 'aws-cdk-lib';
import { KDAConstruct } from '../../../../../cdk-infra/shared/lib/kda-construct';
import { KdaJavaApp, KdaJavaAppRuntimeEnvironment } from '../../../../../cdk-infra/shared/lib/kda-java-app-construct';
import { StreamMode } from 'aws-cdk-lib/aws-kinesis';
import { AppStartLambdaConstruct } from '../../../../../cdk-infra/shared/lib/app-start-lambda-construct';
import { KdsDataGenLambdaConstruct } from  '../../../../../cdk-infra/shared/lib/kds-datagen-lambda-construct'
import { Bucket } from 'aws-cdk-lib/aws-s3';

export interface GlobalProps extends StackProps {
}

export class CdkInfraKdaKdsToS3Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: GlobalProps) {
    super(scope, id, props);

    // we'll be generating a CFN script so we need CFN params
    let cfnParams = this.getParams(props);

    // create cw log group and log stream
    // so it can be used when creating kda app
    const logGroup = new logs.LogGroup(this, 'KDALogGroup', {
      logGroupName: cfnParams.get("CloudWatchLogGroupName")!.valueAsString,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const logStream = new logs.LogStream(this, 'KDALogStream', {
      logStreamName: cfnParams.get("CloudWatchLogStreamName")!.valueAsString,
      logGroup: logGroup,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const kinesisStream = new kinesis.Stream(this, 'SourceKinesisStream', {
      streamName: cfnParams.get("StreamName")!.valueAsString,
      streamMode: StreamMode.ON_DEMAND,
      retentionPeriod: cdk.Duration.hours(cfnParams.get("RetentionPeriodHours")!.valueAsNumber)
    });

    // our KDA app needs to be able to log
    const accessCWLogsPolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          resources: [logGroup.logGroupArn],
          actions: ['logs:PutLogEvents',
                    'logs:DescribeLogGroups',
                    'logs:DescribeLogStreams'
                   ],
        }),
      ],
    });

    // our KDA app needs to be able to write metrics
    const accessCWMetricsPolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          resources: ['*'],
          actions: ['cloudwatch:PutMetricData'],
        }),
      ],
    });

    // our KDA app needs access to read application jar from S3
    // as well as to write to S3 (from FileSink)
    const accessS3Policy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          resources: [`arn:aws:s3:::${cfnParams.get("BucketName")!.valueAsString}/*`],
          actions: ['s3:ListBucket',
                    's3:PutObject',
                    's3:GetObject',
                    's3:DeleteObject'
                    ],
        }),
      ],
    });

    // our KDA app needs to be able to read from the source Kinesis Data Stream
    const accessKdsPolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          resources: [kinesisStream.streamArn],
          actions: ['kinesis:DescribeStream',
                    'kinesis:GetShardIterator',
                    'kinesis:GetRecords',
                    'kinesis:PutRecord',
                    'kinesis:PutRecords',
                    'kinesis:ListShards']
        }),
      ],
    });

    const kdaAppRole = new iam.Role(this, 'kda-app-role', {
      roleName: cfnParams.get("RoleName")!.valueAsString,
      assumedBy: new iam.ServicePrincipal('kinesisanalytics.amazonaws.com'),
      description: 'KDA app role',
      inlinePolicies: {
        AccessKDSPolicy: accessKdsPolicy,
        AccessCWLogsPolicy: accessCWLogsPolicy,
        AccessCWMetricsPolicy: accessCWMetricsPolicy,
        AccessS3Policy: accessS3Policy,
      },
    });

    const flinkApplicationProps = {
      "StackId": this.stackId,
      "BlueprintName": "KDS_FLINK-DATASTREAM-JAVA_S3",
      "StreamName": kinesisStream.streamName,
      "BucketName": `s3://${cfnParams.get("BucketName")!.valueAsString}/`,
      "AWSRegion": this.region,
      "StreamInitialPosition": "TRIM_HORIZON",
      "PartitionFormat": "yyyy-MM-dd-HH",
    };

    const app = new KdaJavaApp(this, "kds-to-s3-java-app-test", {
      account: this.account,
      region: this.region,
      partition: this.partition,
      appName: cfnParams.get("AppName")!.valueAsString,
      runtimeEnvironment: KdaJavaAppRuntimeEnvironment.FLINK_1_15,
      serviceExecutionRole: kdaAppRole.roleArn,
      bucketName: cfnParams.get("BucketName")!.valueAsString,
      jarFile: cfnParams.get("JarFile")!.valueAsString,
      logStreamName:  logStream.logStreamName,
      logGroupName: logGroup.logGroupName, 
      applicationProperties: flinkApplicationProps,
    });

    // Configure app start lambda to automatically start KDA app
    const appStartLambdaFnConstruct = new AppStartLambdaConstruct(this, 'AppStartLambda', {
      account: this.account,
      region: this.region,
      appName: cfnParams.get("AppName")!.valueAsString
    });

    const appStartCustomResource = new cdk.CustomResource(this, 'AppStartLambdaResource', {
      serviceToken: appStartLambdaFnConstruct.appStartLambdaFn.functionArn,
      properties:
      {
        AppName: cfnParams.get("AppName")!.valueAsString
,
      }
    });

    appStartCustomResource.node.addDependency(app);

    // 👇 create an output for app start response
    const response = appStartCustomResource.getAtt('Message').toString();
    const appStartResponseOutput = new cdk.CfnOutput(this, 'AppStartResponseOutput', {
      value: response,
    });

    appStartResponseOutput.node.addDependency(appStartLambdaFnConstruct.appStartLambdaFn);
    appStartResponseOutput.node.addDependency(appStartCustomResource);

    new KdsDataGenLambdaConstruct(this, "KdsDataGenLambda", {
      streamArn: kinesisStream.streamArn,
      numberOfItems: cfnParams.get("NumberOfItems")!.valueAsNumber,
    })

  } // constructor

  getParams(props?: GlobalProps): Map<string, cdk.CfnParameter> {
    let params = new Map<string, cdk.CfnParameter>();

    params.set("AppName", new cdk.CfnParameter(this, "AppName", {
      type: "String",
      description: "The name of the Kinesis Data Analytics application"
    }));

    params.set("BucketName", new cdk.CfnParameter(this, "BucketName", {
      type: "String",
      description: "The S3 bucket where the application payload will be stored (must exist)"
    }));

    params.set("StreamName", new cdk.CfnParameter(this, "StreamName", {
      type: "String",
      description: "The name of the Kinesis Data Stream"
    }));

    params.set("RoleName", new cdk.CfnParameter(this, "RoleName", {
      type: "String",
      description: "Name of IAM role used to run KDA app"
    }));

    params.set("CloudWatchLogGroupName", new cdk.CfnParameter(this, "CloudWatchLogGroupName", {
      type: "String",
      description: "The log group name for the KDA app"
    }));

    params.set("CloudWatchLogStreamName", new cdk.CfnParameter(this, "CloudWatchLogStreamName", {
      type: "String",
      description: "The log stream name for the KDA app"
    }));

    params.set("JarFile", new cdk.CfnParameter(this, "JarFile", {
      type: "String",
      default: "kds-to-s3-datastream-java-1.0.1.jar",
      description: "S3 key for .jar file containing the app (must exist in bucket specified in BucketName parameter)"
    }));

    params.set("RuntimeEnvironment", new cdk.CfnParameter(this, "RuntimeEnvironment", {
      type: "String",
      default: "FLINK-1_15",
      description: "Flink runtime environment"
    }));

    params.set("RetentionPeriodHours", new cdk.CfnParameter(this, "RetentionPeriodHours", {
      type: "Number",
      default: 90 * 24,
      description: "Time to retain data in Kinesis Data Stream in hours"
    }));

    params.set("NumberOfItems", new cdk.CfnParameter(this, "NumberOfItems", {
      type: "Number",
      default: 10000,
      description: "Number of test data items to generate"
    }));

    return params;
  }

} // class 