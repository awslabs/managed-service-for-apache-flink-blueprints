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
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { aws_logs as logs } from "aws-cdk-lib";
import * as kinesisanalyticsv2 from "aws-cdk-lib/aws-kinesisanalyticsv2";
import { readFileSync } from "fs";




export interface CreateStudioAppProps extends StackProps {
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
  bootstrapStackName: string;
}

export class CreateStudioApp extends Construct {
    public createStudioAppFn: lambda.SingletonFunction;

    constructor(scope: Construct, id: string, props: CreateStudioAppProps) {
        super(scope, id);


        const stack = cdk.Stack.of(this);

        const subnet1 = props.vpc!.selectSubnets({
            subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS}).subnetIds.at(0)!.toString();

        // Run app creation lambda
        this.createStudioAppFn = new lambda.SingletonFunction(this, 'CreateStudioAppFn', {
            uuid: 'a0b1c0c0-bc70-44bb-a514-ff763aa4182f',
            lambdaPurpose: "Create MSF Studio Application",
            code: lambda.Code.fromInline(readFileSync(`${__dirname}/../../../python/lambda_create_studio_app.py`, "utf-8")),
            handler: "index.handler",
            initialPolicy: [
                new iam.PolicyStatement(
                    {
                        actions: ["kinesisanalytics:DeleteApplicationVpcConfiguration",
                        "iam:PassRole",
                        "kinesisanalytics:DeleteApplication",
                        "kinesisanalytics:DescribeApplication",
                        "kinesisanalytics:StartApplication",
                        "kinesisanalytics:CreateApplication"],
                        resources: ['arn:aws:kinesisanalytics:' + props.region + ':' + props.account + ':application/' + props.kdaAppName,
                                    props.serviceExecutionRole],
                        conditions: {
                            StringEqualsIfExists: {
                                "iam:PassedToService": "kinesisanalytics.amazonaws.com",
                            },
                            ArnEqualsIfExists: {
                                "iam:AssociatedResourceARN": "arn:aws:kinesisanalytics:" + props.region + ":" + props.account + ":application/" + props.kdaAppName
                            }
                        }
                    }),

            ],
            timeout: cdk.Duration.seconds(300),
            runtime: lambda.Runtime.PYTHON_3_9,
            memorySize: 512,
            environment: {
                app_name: props.kdaAppName,
                bootstrap_string: props.bootstrapString,
                execution_role: props.serviceExecutionRole,
                glue_db_arn: `arn:aws:glue:${props.region}:${props.account}:database/${props.glueDatabaseName}`,
                log_stream_arn: `arn:aws:logs:${props.region}` +
                `:${props.account}:log-group:` +
                `${props.logGroup.logGroupName}:log-stream:${props.logStream.logStreamName}`,
                security_group: props.mskSG!.securityGroupId,
                source_topic_name: props.sourceTopicName,
                subnet_1: subnet1,
                zepFlinkVersion: props.zepFlinkVersion,
                stackId: stack.stackId,
                blueprintName: props!.blueprintName,
                bootstrapStackName: props!.bootstrapStackName,
              },
        });
    }
}