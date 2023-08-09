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
import { StackProps } from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3'

export interface ZeppelinNoteRunConstructProps extends StackProps {
    account: string,
    region: string,
    codeBucket: string,
    codeKey: string, 
    appName: string
}

export class ZeppelinNoteRunConstruct extends Construct {
    public zeppelinNoteRunFn: lambda.SingletonFunction;

    constructor(scope: Construct, id: string, props: ZeppelinNoteRunConstructProps) {
        super(scope, id);


        const assetBucketObject = s3.Bucket.fromBucketName(
            this,
            "lambda-assets-bucket",
            props.codeBucket,
          );

        // Run zeppelin note run lambda
        this.zeppelinNoteRunFn = new lambda.SingletonFunction(this, 'RunZeppelinNoteFunction', {
            uuid: '97e4f730-4ee1-11e8-3c2d-fa7ae01b6ebc',
            lambdaPurpose: "Run Zeppelin Note",
            code: lambda.Code.fromBucket(assetBucketObject, props.codeKey),
            handler: "lambda_function.lambda_handler",
            initialPolicy: [
                new iam.PolicyStatement(
                    {
                        actions: ['kinesisanalytics:CreateApplicationPresignedUrl',],
                        resources: ['arn:aws:kinesisanalytics:' + props.region + ':' + props.account + ':application/' + props.appName]
                    })
            ],
            timeout: cdk.Duration.seconds(120),
            runtime: lambda.Runtime.PYTHON_3_9,
            memorySize: 256,
            environment: {
                AppName: props.appName
            }
        });
    }
}