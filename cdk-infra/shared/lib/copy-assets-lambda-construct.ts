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
import { aws_s3 as s3 } from 'aws-cdk-lib';
import { readFileSync } from "fs";



export interface CopyAssetsConstructProps extends StackProps {
    account: string,
    region: string,
    assetBucket: string,
    assetList: string,
}

export class CopyAssetsLambdaConstruct extends Construct {
    public copyAssetsLambdaFn: lambda.SingletonFunction;
    public s3_bucket: s3.Bucket;


    constructor(scope: Construct, id: string, props: CopyAssetsConstructProps) {
        super(scope, id);



        // app package s3 bucket
        this.s3_bucket = new s3.Bucket(this, 'AssetsS3Bucket', {
            bucketName: props.assetBucket,
            encryption: s3.BucketEncryption.S3_MANAGED,
            enforceSSL: true,
            versioned: false,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,

        })


        // Run copy assets creation lambda
        this.copyAssetsLambdaFn = new lambda.SingletonFunction(this, 'CopyAssetsFunction', {
            uuid: '97e4f730-4ee1-11e8-3c2d-fa7ae01b6ebc',
            code: lambda.Code.fromInline(readFileSync(`${__dirname}/../../../python/lambda_copy_assets_to_s3.py`, "utf-8")),
            handler: "index.handler",
            initialPolicy: [
                new iam.PolicyStatement(
                    {
                        actions: ["s3:PutObject",
                                "s3:PutObjectAcl",
                                "s3:GetObject",
                                "s3:GetObjectAcl",
                                "s3:DeleteObject",
                                "s3:ListBucket",
                                "s3:GetBucketLocation"],
                        resources: ['arn:aws:s3:::' + props.assetBucket + '/*',
                                    'arn:aws:s3:::' + props.assetBucket]
                    })
            ],
            timeout: cdk.Duration.seconds(300),
            runtime: lambda.Runtime.PYTHON_3_9,
            memorySize: 256,
            environment: {
                assetList: props.assetList,
                bucketName: props.assetBucket,
              },

        });

        this.s3_bucket.grantPutAcl(this.copyAssetsLambdaFn);

        const resource = new cdk.CustomResource(this, 'CopyAssetsLambdaResource', {
            serviceToken: this.copyAssetsLambdaFn.functionArn
          });

          resource.node.addDependency(this.copyAssetsLambdaFn);
          resource.node.addDependency(this.s3_bucket);
}
}