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
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { aws_s3 as s3 } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as glue from 'aws-cdk-lib/aws-glue';
import { aws_logs as logs } from 'aws-cdk-lib';
import { KDAConstruct } from '../../../../../cdk-infra/shared/lib/kda-construct';
import { KDAZepConstruct } from '../../../../../cdk-infra/shared/lib/kda-zep-construct';
import { MSKServerlessContruct } from '../../../../../cdk-infra/shared/lib/msk-serverless-construct';
import { TopicCreationLambdaConstruct } from '../../../../../cdk-infra/shared/lib/msk-topic-creation-lambda-construct';

export interface GlobalProps extends StackProps {
  kdaAppName: string,
  appBucket: string,
  appFileKeyOnS3: string,
  runtimeEnvironment: string,
  appSinkBucket: string,
  deployDataGen: boolean,
  glueDatabaseName: string,
  flinkVersion: string,
  zepFlinkVersion: string,
  kdaLogGroup: string,
  kdaLogStream: string,
  mskClusterName: string,
  sourceTopicName: string,
}

export class CdkInfraKdaKafkaToS3Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: GlobalProps) {
    super(scope, id, props);

    // we'll be generating a CFN script so we need CFN params
    let cfnParams = this.getParams(props);

    // app package s3 bucket
    const s3_bucket = new s3.Bucket(this, 'AppPackageS3Bucket', {
      bucketName: cfnParams.get("appBucket")!.valueAsString,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // sink s3 bucket
    const sink_s3_bucket = new s3.Bucket(this, 'SinkS3Bucket', {
      bucketName: cfnParams.get("appSinkBucket")!.valueAsString,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // VPC
    const vpc = new ec2.Vpc(this, 'VPC', {
      enableDnsHostnames: true,
      enableDnsSupport: true,
      maxAzs: 3,
      natGateways: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'public-subnet-1',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        }
      ]
    });

    // security group for MSK access
    const mskSG = new ec2.SecurityGroup(this, 'mskSG', {
      vpc: vpc,
      allowAllOutbound: true,
      description: 'MSK Security Group'
    });

    mskSG.connections.allowInternally(ec2.Port.allTraffic(), 'Allow all traffic between hosts having the same security group');

    // create cw log group and log stream
    // so it can be used when creating kda app
    const logGroup = new logs.LogGroup(this, 'KDALogGroup', {
      logGroupName: props!.kdaLogGroup,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const logStream = new logs.LogStream(this, 'KDALogStream', {
      logGroup: logGroup,

      logStreamName: props!.kdaLogStream,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // This is the code for the lambda function that auto-creates the source topic
    // We need to pass in the path from the calling location
    const lambdaAssetLocation = '../../../../cdk-infra/shared/lambda/aws-lambda-helpers-1.0.jar';

    const topicCreationLambda = new TopicCreationLambdaConstruct(this, 'TopicCreationLambda', {
      account: this.account,
      region: this.region,
      vpc: vpc,
      clusterNamesForPermission: [props!.mskClusterName],
      mskSG: mskSG,
      lambdaAssetLocation: lambdaAssetLocation,
    });

    // instantiate source serverless MSK cluster w/ IAM auth
    const sourceServerlessMskCluster = new MSKServerlessContruct(this, 'MSKServerlessSource', {
      account: this.account,
      region: this.region,
      vpc: vpc,
      clusterName: props!.mskClusterName,
      mskSG: mskSG,
      topicToCreate: props!.sourceTopicName,
      onEventLambdaFn: topicCreationLambda.onEventLambdaFn,
    });

    sourceServerlessMskCluster.node.addDependency(vpc);
    sourceServerlessMskCluster.node.addDependency(topicCreationLambda);

    // our KDA app needs to be the following permissions against MSK
    // - read data
    // - write data
    // - create topics
    const accessMSKPolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          resources: [`arn:aws:kafka:${this.region}:${this.account}:cluster/${props!.mskClusterName}/*`,
                      `arn:aws:kafka:${this.region}:${this.account}:topic/${props!.mskClusterName}/*`],
          actions: ['kafka-cluster:Connect',
                    'kafka-cluster:CreateTopic',
                    'kafka-cluster:DescribeTopic',
                    'kafka-cluster:WriteData',
                    'kafka-cluster:DescribeGroup',
                    'kafka-cluster:AlterGroup',
                    'kafka-cluster:ReadData',
                    ],
        }),
      ],
    });

    const accessMSKTopicsPolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          resources: [`arn:aws:kafka:${this.region}:${this.account}:topic/${props!.mskClusterName}/*`],
          actions: ['kafka-cluster:CreateTopic',
                    'kafka-cluster:DescribeTopic',
                    'kafka-cluster:WriteData',
                    'kafka-cluster:DescribeGroup',
                    'kafka-cluster:AlterGroup',
                    'kafka-cluster:ReadData',
                    ],
        }),
      ],
    });

    // our KDA app needs to be able to log
    const accessCWLogsPolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:${props!.kdaLogGroup}:*`],
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
          resources: [`arn:aws:s3:::${s3_bucket.bucketName}/*`,
                      `arn:aws:s3:::${sink_s3_bucket.bucketName}/*`],
          actions: ['s3:ListBucket',
                    's3:PutObject',
                    's3:GetObject',
                    's3:DeleteObject'
                    ],
        }),
      ],
    });

    // our KDA app needs access to describe kinesisanalytics
    const kdaAccessPolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          resources: ['*'],
          actions: ['kinesisanalytics:DescribeApplication']
        }),
      ],
    });

    // our KDA app needs access to access glue db
    const glueAccessPolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          resources: [`arn:aws:glue:${this.region}:${this.account}:database/*`,
          `arn:aws:glue:${this.region}:${this.account}:table/*`,
          `arn:aws:glue:${this.region}:${this.account}:catalog`,
          `arn:aws:glue:${this.region}:${this.account}:userDefinedFunction/*`],
          actions: ["glue:SearchTables",
          "glue:UpdateDatabase",
          "glue:CreateTable",
          "glue:DeleteDatabase",
          "glue:GetTables",
          "glue:GetTableVersions",
          "glue:UpdateTable",
          "glue:DeleteTableVersion",
          "glue:DeleteTable",
          "glue:DeleteColumnStatisticsForTable",
          "glue:GetDatabases",
          "glue:GetTable",
          "glue:GetDatabase",
          "glue:GetTableVersion",
          "glue:CreateDatabase",
          "glue:UpdateColumnStatisticsForTable",
          "glue:BatchDeleteTableVersion",
          "glue:GetColumnStatisticsForTable",
          "glue:BatchDeleteTable",
          'glue:GetUserDefinedFunction',
          'glue:GetPartitions']
        }),
      ],
    });


    // our KDA app needs access to perform VPC actions
    const accessVPCPolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          resources: ['*'],
          actions: ['ec2:DeleteNetworkInterface',
                    'ec2:DescribeDhcpOptions',
                    'ec2:DescribeSecurityGroups',
                    'ec2:CreateNetworkInterface',
                    'ec2:DescribeNetworkInterfaces',
                    'ec2:CreateNetworkInterfacePermission',
                    'ec2:DescribeVpcs',
                    'ec2:DescribeSubnets'],
        }),
      ],
    });

    const kdaAppRole = new iam.Role(this, 'kda-app-role', {
      assumedBy: new iam.ServicePrincipal('kinesisanalytics.amazonaws.com'),
      description: 'KDA app role',
      inlinePolicies: {
        AccessMSKPolicy: accessMSKPolicy,
        AccessMSKTopicsPolicy: accessMSKTopicsPolicy,
        AccessCWLogsPolicy: accessCWLogsPolicy,
        AccessCWMetricsPolicy: accessCWMetricsPolicy,
        AccessS3Policy: accessS3Policy,
        AccessVPCPolicy: accessVPCPolicy,
        KDAAccessPolicy: kdaAccessPolicy,
        GlueAccessPolicy: glueAccessPolicy,
      },
    });

    const flinkApplicationProps = {
      "S3DestinationBucket": `s3://${sink_s3_bucket.bucketName}/`,
      "ServerlessMSKBootstrapServers": sourceServerlessMskCluster.bootstrapServersOutput.value,
      "KafkaSourceTopic": props!.sourceTopicName,
      "KafkaConsumerGroupId": "KDAFlinkConsumerGroup",
      "PartitionFormat": "yyyy-MM-dd-HH",
    };

    // // instantiate kda construct
    const kdaConstruct = new KDAConstruct(this, 'KDAConstruct', {
      account: this.account,
      region: this.region,
      vpc: vpc,
      mskSG: mskSG,
      logGroup: logGroup,
      logStream: logStream,
      kdaAppName: props!.kdaAppName,
      appBucket: s3_bucket.bucketName,
      appFileKeyOnS3: props!.appFileKeyOnS3,
      runtimeEnvironment: props!.runtimeEnvironment,
      serviceExecutionRole: kdaAppRole.roleArn,
      flinkApplicationProperties: flinkApplicationProps,
      pyFlinkRunOptions: null,
    });

    kdaConstruct.node.addDependency(vpc);
    kdaConstruct.node.addDependency(sourceServerlessMskCluster);
    kdaConstruct.node.addDependency(kdaAppRole);
    kdaConstruct.node.addDependency(logGroup);
    kdaConstruct.node.addDependency(logStream);

    // instantiate glue db
    const glueDB = new glue.CfnDatabase(this, 'GlueDB', {
      catalogId: this.account,
      databaseInput: {
        name: cfnParams.get("glueDatabaseName")!.valueAsString
      }
    });

    // instantiate zep kda construct
    if (props?.deployDataGen) {
      const zepDataGenAppName = props!.kdaAppName + "-zep";

      const zepLogStream = new logs.LogStream(this, 'ZepLogStream', {
        logGroup: logGroup,
  
        logStreamName: props!.kdaLogStream + "-zep",
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

      const zepKdaConstruct = new KDAZepConstruct(this, 'KDAZepConstruct', {
        account: this.account,
        region: this.region,
        vpc: vpc,
        mskSG: mskSG,
        logGroup: logGroup,
        logStream: zepLogStream,
        kdaAppName: zepDataGenAppName,
        glueDatabaseName: props!.glueDatabaseName,
        runtimeEnvironment: props!.runtimeEnvironment,
        serviceExecutionRole: kdaAppRole.roleArn,
        zepFlinkVersion: props!.zepFlinkVersion,
      });

      zepKdaConstruct.node.addDependency(vpc);
      zepKdaConstruct.node.addDependency(sourceServerlessMskCluster);
      zepKdaConstruct.node.addDependency(kdaAppRole);
      zepKdaConstruct.node.addDependency(logGroup);
      zepKdaConstruct.node.addDependency(zepLogStream);
    }

  } // constructor

  getParams(props?: GlobalProps): Map<string, cdk.CfnParameter> {
    let params = new Map<string, cdk.CfnParameter>();

    const appBucket = new cdk.CfnParameter(this, "appBucket", {
      type: "String",
      default: props!.appBucket,
      description: "The S3 bucket for storing app assets"
    });
    params.set("appBucket", appBucket);

    const appSinkBucket = new cdk.CfnParameter(this, "appSinkBucket", {
      type: "String",
      default: props!.appSinkBucket,
      description: "The S3 bucket to be used as the sink"
    });
    params.set("appSinkBucket", appSinkBucket);

    const glueDatabaseName = new cdk.CfnParameter(this, "glueDatabaseName", {
      type: "String",
      default: props!.glueDatabaseName,
      description: "The Glue catalog that will be used w/ Kinesis Data Analytics Studio"
    });
    params.set("glueDatabaseName", glueDatabaseName);

    return params;

  }
} // class 