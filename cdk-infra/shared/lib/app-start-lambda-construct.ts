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

import { readFileSync } from "fs";
import { StackProps } from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';

export interface AppStartLambdaConstructProps extends StackProps {
    account: string,
    region: string,
    appName: string,
}

export class AppStartLambdaConstruct extends Construct {
    public appStartLambdaFn: lambda.SingletonFunction;

    constructor(scope: Construct, id: string, props: AppStartLambdaConstructProps) {
        super(scope, id);


        // Run app start lambda
        this.appStartLambdaFn = new lambda.SingletonFunction(this, 'AppStartFunction', {
            uuid: '97e4f730-4ee1-11e8-3c2d-fa7ae01b6ebc',
            lambdaPurpose: "Start MSF Application",
            code: lambda.Code.fromInline(readFileSync(`${__dirname}/../../../python/lambda_kda_app_start.py`, "utf-8")),
            handler: "index.handler",
            initialPolicy: [
                new iam.PolicyStatement(
                    {
                        actions: ['kinesisanalytics:DescribeApplication',
                            'kinesisanalytics:StartApplication',],

                        resources: ['arn:aws:kinesisanalytics:' + props.region + ':' + props.account + ':application/' + props.appName]
                    })
            ],
            timeout: cdk.Duration.seconds(600),
            runtime: lambda.Runtime.PYTHON_3_9,
            memorySize: 1024, // need extra memory for kafka-client
        });
    }
}