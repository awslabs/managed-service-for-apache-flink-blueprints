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
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3'

export interface TopicCreationLambdaConstructProps extends StackProps {
    account: string,
    region: string,
    vpc: ec2.Vpc,
    clusterNamesForPermission: string[],
    mskSG: ec2.SecurityGroup,
    bucketName: string,
    lambdaAssetLocation: string,
}

export class TopicCreationLambdaConstruct extends Construct {
    public onEventLambdaFn: lambda.SingletonFunction;

    

    constructor(scope: Construct, id: string, props: TopicCreationLambdaConstructProps) {
        super(scope, id);





        let mskResourcesForPolicy = [];
        for(let i = 0; i < props!.clusterNamesForPermission.length; i++) {
            let clusterResource = `arn:aws:kafka:${props!.region}:${props!.account}:cluster/${props!.clusterNamesForPermission[i]}/*`;
            let topicResource = `arn:aws:kafka:${props!.region}:${props!.account}:topic/${props!.clusterNamesForPermission[i]}/*`;
            mskResourcesForPolicy.push(clusterResource);
            mskResourcesForPolicy.push(topicResource);
        }

        const mskSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(this, 'existingMskSG', props.mskSG.securityGroupId, {
            mutable: false
        });



        const lambdaIAMPolicy = new iam.PolicyStatement(
            {
                actions: ['kafka-cluster:Connect',
                    'kafka-cluster:CreateTopic',
                    'kafka-cluster:DescribeTopic',
                    'kafka-cluster:DeleteTopic',
                    'kafka-cluster:WriteData',
                    'kafka-cluster:ReadData',
                    'kafka-cluster:*Topic*',],
                resources: mskResourcesForPolicy
            });


        const AssetBucketObject = s3.Bucket.fromBucketName(
                this,
                "lambda-assets-bucket",
                props.bucketName,
              );
        
        // Run topic creation lambda
        this.onEventLambdaFn = new lambda.SingletonFunction(this, 'TopicCreationFunction', {
            uuid: 'f7d4f730-4ee1-11e8-9c2d-fa7ae01bbebc',
            lambdaPurpose: "Create MSK Topic",
            code: lambda.Code.fromBucket(AssetBucketObject, props.lambdaAssetLocation),
            handler: "com.amazonaws.TopicGenHandler",
            initialPolicy: [
                lambdaIAMPolicy
            ],
            timeout: cdk.Duration.seconds(300),
            runtime: lambda.Runtime.JAVA_11,
            memorySize: 1024, // need extra memory for kafka-client
            vpc: props!.vpc,
            // 👇 place lambda in private subnet so 
            // we can reach MSK broker
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            securityGroups: [mskSecurityGroup],
        });



    }

    
}