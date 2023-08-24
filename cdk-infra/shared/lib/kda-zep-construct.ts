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


import { IResolvable, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as kinesisanalyticsv2 from "aws-cdk-lib/aws-kinesisanalyticsv2";
import * as cr from 'aws-cdk-lib/custom-resources';
import * as cdk from 'aws-cdk-lib';
import { aws_logs as logs } from "aws-cdk-lib";
import { AppStartLambdaConstruct } from "./app-start-lambda-construct";

export interface KDAZepContructProps extends StackProps {
  account?: string;
  region?: string;
  vpc: ec2.Vpc | undefined | null,
  mskSG: ec2.SecurityGroup | undefined | null,
  logGroup: logs.LogGroup;
  logStream: logs.LogStream;
  kdaAppName: string;
  glueDatabaseName: string;
  runtimeEnvironment: string;
  serviceExecutionRole: string;
  RuntimeEnvironment: string;
  codeContent: string;
}

export class KDAZepConstruct extends Construct {
  public cfnApplicationProps: kinesisanalyticsv2.CfnApplicationProps;
  public kdaZepApp: kinesisanalyticsv2.CfnApplication;
  public cwlogsOption: kinesisanalyticsv2.CfnApplicationCloudWatchLoggingOption;

  constructor(scope: Construct, id: string, props: KDAZepContructProps) {
    super(scope, id);

    let vpcConfigurations = undefined as IResolvable | (IResolvable | kinesisanalyticsv2.CfnApplication.VpcConfigurationProperty)[] | undefined;
    if (props!.vpc != undefined &&
      props!.mskSG != undefined) {
      vpcConfigurations = [
        {
          subnetIds: props.vpc.selectSubnets({
            subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          }).subnetIds,
          securityGroupIds: [props.mskSG.securityGroupId]
        }
      ]
    }

    // application properties (actual app is below)
    this.cfnApplicationProps = {
      runtimeEnvironment: "ZEPPELIN-FLINK-2_0",

      // TODO: clearly enumerate list of permissions
      // that this role needs. For instance, for deploying in VPC
      // the KDA app needs VPC read access
      serviceExecutionRole: props.serviceExecutionRole,
      applicationName: props.kdaAppName,
      applicationMode: "INTERACTIVE",

      applicationConfiguration: {
        flinkApplicationConfiguration: {
          parallelismConfiguration: {
            configurationType: "CUSTOM",
            parallelism: 2,
            parallelismPerKpu: 1,
            autoScalingEnabled: false
          }
        },
        applicationCodeConfiguration: props.codeContent ? {
          codeContentType: "PLAINTEXT",
          codeContent: {
            textContent: props.codeContent
          } 
        } : undefined,
        vpcConfigurations: vpcConfigurations,
        zeppelinApplicationConfiguration: {
          monitoringConfiguration: {
            logLevel: "INFO",
          },
          catalogConfiguration: {
            glueDataCatalogConfiguration: {
              databaseArn: `arn:aws:glue:${props.region}:${props.account}:database/${props.glueDatabaseName}`,
            },
          }, // catalogConfiguration
          customArtifactsConfiguration: [
            {
              artifactType: "DEPENDENCY_JAR",
              mavenReference: {
                groupId: "org.apache.flink",
                artifactId: "flink-connector-kafka_2.12",
                version: "1.13.2",
              },
            },
            {
              artifactType: "DEPENDENCY_JAR",
              mavenReference: {
                groupId: "org.apache.flink",
                artifactId: "flink-sql-connector-kinesis_2.12",
                version: "1.13.2",
              },
            },
            {
              artifactType: "DEPENDENCY_JAR",
              mavenReference: {
                groupId: "software.amazon.msk",
                artifactId: "aws-msk-iam-auth",
                version: "1.1.0",
              },
            },
          ], // customArtifactsConfiguration
        }, // zeppelinApplicationConfiguration
      },
    };

    // application
    this.kdaZepApp = new kinesisanalyticsv2.CfnApplication(
      this,
      "KDAZepApp",
      this.cfnApplicationProps
    );

    // https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/iam-access-control-overview-cwl.html
    const logStreamArn =
      `arn:aws:logs:${props.region}` +
      `:${props.account}:log-group:` +
      `${props.logGroup.logGroupName}:log-stream:${props.logStream.logStreamName}`;

    // cw logging config for app
    this.cwlogsOption =
      new kinesisanalyticsv2.CfnApplicationCloudWatchLoggingOption(
        this,
        "KDAZepCWLogs",
        {
          applicationName: props.kdaAppName,
          cloudWatchLoggingOption: {
            logStreamArn: logStreamArn,
          },
        }
      );

    this.cwlogsOption.addDependency(this.kdaZepApp);


    
    const appStartLambdaFnConstruct = new AppStartLambdaConstruct(this, 'AppStartLambda', {
      account: props.account!,
      region: props.region!,
      appName: props.kdaAppName,
    });

    const resource = new cdk.CustomResource(this, 'AppStartLambdaResource', {
      serviceToken: appStartLambdaFnConstruct.appStartLambdaFn.functionArn,
      properties:
      {
        AppName: props.kdaAppName,
      }
    });

    resource.node.addDependency(appStartLambdaFnConstruct.appStartLambdaFn);
    resource.node.addDependency(this.kdaZepApp);
    resource.node.addDependency(this.cwlogsOption);

    // 👇 create an output for app start response
    const response = resource.getAtt('Message').toString();
    const appStartResponseOutput = new cdk.CfnOutput(this, 'AppStartResponseOutput', {
      value: response,
    });

    appStartResponseOutput.node.addDependency(appStartLambdaFnConstruct.appStartLambdaFn);
    appStartResponseOutput.node.addDependency(resource);
  }
}
