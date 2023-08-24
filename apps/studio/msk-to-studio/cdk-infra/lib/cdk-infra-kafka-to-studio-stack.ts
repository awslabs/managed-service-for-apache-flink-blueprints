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
import * as iam from 'aws-cdk-lib/aws-iam';
import * as glue from 'aws-cdk-lib/aws-glue';
import { aws_logs as logs } from 'aws-cdk-lib';
import { aws_kinesisanalyticsv2 as kinesisanalyticsv2 } from 'aws-cdk-lib';
import { FlinkMSKZepContstruct } from '../../../../../cdk-infra/shared/lib/flink-msk-zep-construct';
import { MSKServerlessContruct } from '../../../../../cdk-infra/shared/lib/msk-serverless-construct';
import { TopicCreationLambdaConstruct } from '../../../../../cdk-infra/shared/lib/msk-topic-creation-lambda-construct';


export interface GlobalProps extends StackProps {
  studioAppName: string,
  glueDatabaseName: string,
  RuntimeEnvironment: string,
  kdaLogGroup: string,
  studioLogStream: string,
  mskClusterName: string,
  SourceTopicName: string,
  blueprintName: string,
}

export class CdkInfraKafkaToStudioStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: GlobalProps) {
    super(scope, id, props);

    // we'll be generating a CFN script so we need CFN params
    let cfnParams = this.getParams(props);

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
    const studioLogGroup = new logs.LogGroup(this, 'KDALogGroup', {
      logGroupName: cfnParams.get("kdaLogGroup")!.valueAsString,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const logStream = new logs.LogStream(this, 'KDALogStream', {
      logGroup: studioLogGroup,

      logStreamName: cfnParams.get("studioLogStream")!.valueAsString,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    logStream.node.addDependency(studioLogGroup);

    // This is the code for the lambda function that auto-creates the source topic
    // We need to pass in the path from the calling location
    const AssetBucketName = cfnParams.get("AssetBucketName")!.valueAsString
    const lambdaAssetLocation = 'aws-lambda-helpers-1.0.jar';
    const runZeppelinNotebookLambdaASsetLocation = 'my-deployment.zip';



    const mskClusterNameStr = cfnParams.get("mskClusterName")!.valueAsString;

    const topicCreationLambda = new TopicCreationLambdaConstruct(this, 'TopicCreationLambda', {
      account: this.account,
      region: this.region,
      vpc: vpc,
      clusterNamesForPermission: [mskClusterNameStr],
      mskSG: mskSG,
      bucketName: AssetBucketName,
      lambdaAssetLocation: lambdaAssetLocation,
    });




    // instantiate source serverless MSK cluster w/ IAM auth
    const sourceServerlessMskCluster = new MSKServerlessContruct(this, 'MSKServerlessSource', {
      account: this.account,
      region: this.region,
      vpc: vpc,
      clusterName: mskClusterNameStr,
      mskSG: mskSG,
      topicToCreate: cfnParams.get("SourceTopicName")!.valueAsString,
      onEventLambdaFn: topicCreationLambda.onEventLambdaFn,
    });

    
    topicCreationLambda.node.addDependency(sourceServerlessMskCluster);
    sourceServerlessMskCluster.node.addDependency(vpc);

    // our KDA app needs to be the following permissions against MSK
    // - read data
    // - write data
    // - create topics
    const accessMSKPolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          resources: [`arn:aws:kafka:${this.region}:${this.account}:cluster/${mskClusterNameStr}/*`,
                      `arn:aws:kafka:${this.region}:${this.account}:topic/${mskClusterNameStr}/*`],
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
          resources: [`arn:aws:kafka:${this.region}:${this.account}:topic/${mskClusterNameStr}/*`,
                      `arn:aws:kafka:${this.region}:${this.account}:group/${mskClusterNameStr}/*/*`],
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
          resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:${cfnParams.get("kdaLogGroup")!.valueAsString}:*`],
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

    // our KDA app needs access to describe kinesisanalytics
    const kdaAccessPolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          resources: ['arn:aws:kinesisanalytics:'+ this.region +':' + this.account + ':application/' + props?.studioAppName],
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
          resources: ["arn:aws:ec2:" + this.region + ":" + this.account + ":network-interface/*",
          "arn:aws:ec2:" + this.region + ":" + this.account + ":subnet/*",
          "arn:aws:ec2:" + this.region + ":" + this.account + ":vpc/*",
          "arn:aws:ec2:" + this.region + ":" + this.account + ":security-group/*"],
          actions: ['ec2:CreateNetworkInterface',
          'ec2:CreateNetworkInterfacePermission',
          'ec2:CreateTags',
          'ec2:DeleteNetworkInterface'],
          
        }),
        new iam.PolicyStatement({
          resources: ['*'],
          actions: ["ec2:DescribeNetworkInterfaces",
          "ec2:DescribeVpcs",
          "ec2:DescribeDhcpOptions",
          "ec2:DescribeSubnets",
          "ec2:DescribeSecurityGroups"]
        })
      ],
    });

    const kdaAppRole = new iam.Role(this, 'kda-app-role', {
      assumedBy: new iam.ServicePrincipal('kinesisanalytics.amazonaws.com'),
      description: 'KDA app role',
      roleName: cfnParams.get("RoleName")!.valueAsString,
      inlinePolicies: {
        AccessMSKPolicy: accessMSKPolicy,
        AccessMSKTopicsPolicy: accessMSKTopicsPolicy,
        AccessCWLogsPolicy: accessCWLogsPolicy,
        AccessCWMetricsPolicy: accessCWMetricsPolicy,
        AccessVPCPolicy: accessVPCPolicy,
        KDAAccessPolicy: kdaAccessPolicy,
        GlueAccessPolicy: glueAccessPolicy,
      },
    });

    // instantiate glue db
    const glueDB = new glue.CfnDatabase(this, 'GlueDB', {
      catalogId: this.account,
      databaseInput: {
        name: cfnParams.get("glueDatabaseName")!.valueAsString
      }
    });

    // instantiate zep kda construct
    const zepAppName = cfnParams.get("studioAppName")!.valueAsString;


    const zepKdaConstruct = new FlinkMSKZepContstruct(this, 'KDAZepConstruct', {
      account: this.account,
      region: this.region,
      vpc: vpc,
      mskSG: mskSG,
      logGroup: studioLogGroup,
      logStream: logStream,
      kdaAppName: zepAppName,
      glueDatabaseName: cfnParams.get("glueDatabaseName")!.valueAsString,
      serviceExecutionRole: kdaAppRole.roleArn,
      RuntimeEnvironment: cfnParams.get("RuntimeEnvironment")!.valueAsString,
      bootstrapString: sourceServerlessMskCluster.bootstrapServersOutput.value,
      SourceTopicName: cfnParams.get("SourceTopicName")!.valueAsString,
      blueprintName: props!.blueprintName,
      runZepNotebookAssetBucket: AssetBucketName,
      runZepNotebookAssetKey: runZeppelinNotebookLambdaASsetLocation,
      bootstrapStackName: cfnParams.get("BootstrapStackName")!.valueAsString,
    });

    zepKdaConstruct.node.addDependency(vpc);
    zepKdaConstruct.node.addDependency(sourceServerlessMskCluster);
    zepKdaConstruct.node.addDependency(kdaAppRole);
    zepKdaConstruct.node.addDependency(studioLogGroup);

 


  } // constructor

  getParams(props?: GlobalProps): Map<string, cdk.CfnParameter> {
    let params = new Map<string, cdk.CfnParameter>();

    const studioAppName = new cdk.CfnParameter(this, "AppName", {
      type: "String",
      default: props!.studioAppName,
      description: "The name of the KDA Studio app"
    });
    params.set("studioAppName", studioAppName);


    const glueDatabaseName = new cdk.CfnParameter(this, "GlueDatabaseName", {
      type: "String",
      default: props!.glueDatabaseName,
      description: "The Glue catalog that will be used w/ Kinesis Data Analytics Studio"
    });
    params.set("glueDatabaseName", glueDatabaseName);

    const RuntimeEnvironment = new cdk.CfnParameter(this, "RuntimeEnvironment", {
      type: "String",
      default: props!.RuntimeEnvironment,
      description: "Flink Version for KDA Studio (1.13.2, etc...)"
    });
    params.set("RuntimeEnvironment", RuntimeEnvironment);

    const kdaLogGroup = new cdk.CfnParameter(this, "CloudWatchLogGroupName", {
      type: "String",
      default: props!.kdaLogGroup,
      description: "The log group name for the KDA studio app"
    });
    params.set("kdaLogGroup", kdaLogGroup);

    const studioLogStream = new cdk.CfnParameter(this, "CloudWatchLogStreamName", {
      type: "String",
      default: props!.studioLogStream,
      description: "The log stream name for the KDA studio app"
    });
    params.set("studioLogStream", studioLogStream);

    const mskClusterName = new cdk.CfnParameter(this, "ClusterName", {
      type: "String",
      default: props!.mskClusterName,
      description: "The MSK Serverless cluster name"
    });
    params.set("mskClusterName", mskClusterName);

    const SourceTopicName = new cdk.CfnParameter(this, "SourceTopicName", {
      type: "String",
      default: props!.SourceTopicName,
      description: "The source topic name"
    });
    params.set("SourceTopicName", SourceTopicName);

    const AssetBucketName = new cdk.CfnParameter(this, "BucketName", {
      type: "String",
      default: "my-asset-bucket-name",
      description: "The name of the Amazon S3 bucket where uploaded jar function will be stored."});

    params.set("AssetBucketName", AssetBucketName);

    const RoleName = new cdk.CfnParameter(this, "RoleName", {
      type: "String",
      default: "role-name",
      description: "KDA Role used for the app"});

    params.set("RoleName", RoleName);

    const BootstrapStackName = new cdk.CfnParameter(this, "BootstrapStackName", {
      type: "String",
      description: "Name of bootstrap stack used to create this blueprint"});

    params.set("BootstrapStackName", BootstrapStackName);
    
    return params;



  }
} // class 