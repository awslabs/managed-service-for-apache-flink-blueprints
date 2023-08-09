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

export interface MSKGetBootstrapBrokerStringProps extends StackProps {
    mskClusterArn: string
}

export class MSKGetBootstrapBrokerStringConstruct extends Construct {
    public getBootstrapBrokerFn: lambda.SingletonFunction;

    constructor(scope: Construct, id: string, props: MSKGetBootstrapBrokerStringProps) {
        super(scope, id);

        // Run topic creation lambda
        this.getBootstrapBrokerFn = new lambda.SingletonFunction(this, 'MSKGetBootstrapBrokerStringFunction', {
            uuid: 'e28123c0-1b6b-11ee-be56-0242ac120002',
            lambdaPurpose: "GetBootstrapBrokerString",
            code: lambda.Code.fromInline(`
import boto3
import os
import json
import cfnresponse
import datetime

def handler(event, context):
    try:
        print("Received Event:" + json.dumps(event))

        if(event["RequestType"] == "Create"):
            client = boto3.client('kafka')
            response = client.get_bootstrap_brokers(
                ClusterArn=os.environ['cluster_arn'])
            print(response["BootstrapBrokerStringSaslIam"])
            cfnresponse.send(event, context, cfnresponse.SUCCESS, responseData={"BootstrapBrokerString": response["BootstrapBrokerStringSaslIam"]})
        elif(event["RequestType"] == "Delete"):
            cfnresponse.send(event, context, cfnresponse.SUCCESS, responseData={"response": "successfully deleted custom resource"})
    except Exception as err:
            print(err)
            cfnresponse.send(event, context, cfnresponse.FAILED, err)
                  `),
            handler: "index.handler",
            initialPolicy: [
                new iam.PolicyStatement(
                    {
                        actions: ['kafka:getBootstrapBrokers'],
                        resources: ['*']
                    })
            ],
            timeout: cdk.Duration.seconds(300),
            runtime: lambda.Runtime.PYTHON_3_9,
            memorySize: 256,
            environment:
            {
                cluster_arn: props.mskClusterArn
            } 
        });

                //deletes SGs and such before deleting lambda (with dependencies)
                const fixVpcDeletion = (handler: lambda.IFunction): void => {
                    if (!handler.isBoundToVpc) {
                        return
                      }
                    handler.connections.securityGroups.forEach(sg => {
                      if (handler.role) {
                        handler.role.node.children.forEach(child => {
                          if (
                            child.node.defaultChild &&
                            (child.node.defaultChild as iam.CfnPolicy).cfnResourceType === 'AWS::IAM::Policy'
                          ) {
                            sg.node.addDependency(child);
                          }
                        });
                      }
                    });
                  };
                  
                  fixVpcDeletion(this.getBootstrapBrokerFn)
        }
}