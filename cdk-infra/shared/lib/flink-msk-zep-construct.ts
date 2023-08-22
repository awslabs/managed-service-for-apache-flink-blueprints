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
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3'
import { aws_logs as logs } from "aws-cdk-lib";
import { AppStartLambdaConstruct } from "./app-start-lambda-construct";
import { CreateStudioApp } from "./create-studio-app-lambda-construct";
import { ZeppelinNoteRunConstruct } from "./zeppelin-note-run-lambda-construct";


export interface FlinkMSKZepContructProps extends StackProps {
  account?: string;
  region?: string;
  vpc: ec2.Vpc | undefined | null,
  mskSG: ec2.SecurityGroup | undefined | null,
  logGroup: logs.LogGroup;
  logStream: logs.LogStream;
  kdaAppName: string;
  glueDatabaseName: string;
  serviceExecutionRole: string;
  zepFlinkVersion: string;
  bootstrapString: string;
  sourceTopicName: string;
  blueprintName: string;
  runZepNotebookAssetBucket: string;
  runZepNotebookAssetKey: string;
  bootstrapStackName: string;
}

export class FlinkMSKZepContstruct extends Construct {
  public cfnApplicationProps: kinesisanalyticsv2.CfnApplicationProps;
  // public cwlogsOption: kinesisanalyticsv2.CfnApplicationCloudWatchLoggingOption;

  constructor(scope: Construct, id: string, props: FlinkMSKZepContructProps) {
    super(scope, id);

    const createStudioAppConstruct = new CreateStudioApp(this, 'CreateStudioApp', {
      account: props.account!,
      region: props.region!,
      vpc: props.vpc,
      mskSG: props.mskSG,
      logGroup: props.logGroup,
      logStream: props.logStream,
      kdaAppName: props.kdaAppName,
      glueDatabaseName: props.glueDatabaseName,
      serviceExecutionRole: props.serviceExecutionRole,
      zepFlinkVersion: props.zepFlinkVersion,
      bootstrapString: props.bootstrapString,
      sourceTopicName: props.sourceTopicName,
      blueprintName: props.blueprintName,
      bootstrapStackName: props.bootstrapStackName,
    });


    const createAppResource = new cdk.CustomResource(this, 'CreateAppResource', {
      serviceToken: createStudioAppConstruct.createStudioAppFn.functionArn
    });

    // 👇 create an output for create app response
    const create_app_response = createAppResource.getAtt('Message').toString();
    const create_app_response_output = new cdk.CfnOutput(this, 'AppCreateResponseOutput', {
      value: create_app_response,
    });
    
    create_app_response_output.node.addDependency(createAppResource)

    // https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/iam-access-control-overview-cwl.html
    const logStreamArn =
      `arn:aws:logs:${props.region}` +
      `:${props.account}:log-group:` +
      `${props.logGroup.logGroupName}:log-stream:${props.logStream.logStreamName}`;

    
    const appStartLambdaFnConstruct = new AppStartLambdaConstruct(this, 'AppStartFunction', {
      account: props.account!,
      region: props.region!,
      appName: props.kdaAppName
    });

    const appStartResource = new cdk.CustomResource(this, 'AppStartLambdaResource', {
      serviceToken: appStartLambdaFnConstruct.appStartLambdaFn.functionArn,
      properties:
      {
        AppName: props.kdaAppName,
      }
    });

    appStartResource.node.addDependency(createAppResource)
    appStartResource.node.addDependency(createStudioAppConstruct)
    appStartResource.node.addDependency(create_app_response_output);
    appStartResource.node.addDependency(appStartLambdaFnConstruct.appStartLambdaFn);



    // 👇 create an output for app start response
    const response = appStartResource.getAtt('Message').toString();
    const appStartResponseOutput = new cdk.CfnOutput(this, 'AppStartResponseOutput', {
      value: response,
    });

    appStartResponseOutput.node.addDependency(appStartLambdaFnConstruct.appStartLambdaFn);
    appStartResponseOutput.node.addDependency(appStartResource);


    const zeppelinNoteRunLambdaFnConstruct  = new ZeppelinNoteRunConstruct(this, 'ZeppelinNoteRunFunction', {
      account: props.account!,
      region: props.region!,
      codeBucket: props.runZepNotebookAssetBucket,
      codeKey: props.runZepNotebookAssetKey,
      appName: props.kdaAppName
    })

    const zeppelinNoteRunResource = new cdk.CustomResource(this, 'ZeppelinNoteRunLambdaResource', {
      serviceToken: zeppelinNoteRunLambdaFnConstruct.zeppelinNoteRunFn.functionArn,
    });


    zeppelinNoteRunResource.node.addDependency(appStartResource)
    zeppelinNoteRunResource.node.addDependency(appStartLambdaFnConstruct)
    zeppelinNoteRunResource.node.addDependency(create_app_response_output);
    zeppelinNoteRunResource.node.addDependency(appStartLambdaFnConstruct.appStartLambdaFn);
    zeppelinNoteRunResource.node.addDependency(appStartResponseOutput);

  }
}
