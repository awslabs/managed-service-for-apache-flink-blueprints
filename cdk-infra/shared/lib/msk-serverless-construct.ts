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

import { CfnOutput, StackProps } from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { aws_msk as msk } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { MSKGetBootstrapBrokerStringConstruct } from '../lib/msk-get-bootstrap-broker-string';
import * as iam from 'aws-cdk-lib/aws-iam'

export interface MSKServerlessContructProps extends StackProps {
    account: string,
    region: string,
    vpc: ec2.Vpc,
    clusterName: string,
    mskSG: ec2.SecurityGroup,
    topicToCreate: string,
    onEventLambdaFn: lambda.SingletonFunction,
}

export class MSKServerlessContruct extends Construct {
    public cfnMskServerlessCluster: msk.CfnServerlessCluster;
    public cfnClusterArnOutput: CfnOutput;
    public bootstrapServersOutput: CfnOutput;

    constructor(scope: Construct, id: string, props: MSKServerlessContructProps) {
        super(scope, id);

        // msk cluster
        this.cfnMskServerlessCluster = new msk.CfnServerlessCluster(this, 'MSKServerlessCluster', {
            clusterName: props.clusterName,

            // unauthenticated
            clientAuthentication: {
                sasl: {
                    iam: {
                        enabled: true,
                    },
                },
            },

            vpcConfigs: [{
                subnetIds: props.vpc.selectSubnets({
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                }).subnetIds,
                securityGroups: [props.mskSG.securityGroupId],
            }]

        }); // CfnCluster

        // 👇 create an output for cluster ARN
        this.cfnClusterArnOutput = new cdk.CfnOutput(this, 'ClusterArnServerlessOutput', {
            value: this.cfnMskServerlessCluster.attrArn,
            description: 'The ARN of our serverless MSK cluster: ', //+ props.clusterName,
            exportName: 'ServerlessMSKClusterARN-' + props.clusterName,
        });

        this.cfnClusterArnOutput.node.addDependency(this.cfnMskServerlessCluster);


        const getBootstrapBrokersLambda = new MSKGetBootstrapBrokerStringConstruct(this, 'GetBootstrapStringLambda', {
            mskClusterArn: this.cfnMskServerlessCluster.attrArn,
          });

        // custom resource policy to get bootstrap brokers for our cluster
        const getBootstrapBrokers = new cdk.CustomResource(this, 'BootstrapBrokersServerlessLookup', {
            serviceToken: getBootstrapBrokersLambda.getBootstrapBrokerFn.functionArn
        });


        getBootstrapBrokersLambda.node.addDependency(this.cfnMskServerlessCluster);
        getBootstrapBrokers.node.addDependency(this.cfnMskServerlessCluster);

        // 👇 create an output for bootstrap servers
        this.bootstrapServersOutput = new cdk.CfnOutput(this, 'ServerlessBootstrapServersOutput', {
            value: getBootstrapBrokers.getAttString("BootstrapBrokerString"),
            description: 'List of bootstrap servers for our Serverless MSK cluster',// + props.clusterName,
            exportName: 'ServerlessMSKBootstrapServers-' + props.clusterName,
        });

        this.bootstrapServersOutput.node.addDependency(getBootstrapBrokers);

        const resource = new cdk.CustomResource(this, 'TopicCreationResource', {
            serviceToken: props!.onEventLambdaFn.functionArn,
            properties:
            {
                Broker: this.bootstrapServersOutput.value,
                Topic: props!.topicToCreate,
                NumPartitions: 3,
                ReplicationFactor: 2,
            }
        });

        props!.onEventLambdaFn.addDependency(this.cfnMskServerlessCluster);
        resource.node.addDependency(this.cfnMskServerlessCluster);
        resource.node.addDependency(props!.onEventLambdaFn);

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
    fixVpcDeletion(props.onEventLambdaFn)


        // 👇 create an output for topic name
        const topicName = resource.getAtt('TopicName').toString();
        const topicNameOutput = new cdk.CfnOutput(this, 'TopicName', {
            value: topicName,
            exportName: 'MSKTopicName-' + props.clusterName,
        });

        topicNameOutput.node.addDependency(props!.onEventLambdaFn);
        topicNameOutput.node.addDependency(resource);

    

        props!.onEventLambdaFn.addDependency(this.cfnMskServerlessCluster);
        resource.node.addDependency(this.cfnMskServerlessCluster);
        resource.node.addDependency(props!.onEventLambdaFn);


    } // constructor
} // class MSKConstruct