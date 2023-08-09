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

import { CfnOutput, SecretValue, Stack, StackProps } from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { aws_msk as msk } from 'aws-cdk-lib';
import * as cr from 'aws-cdk-lib/custom-resources';

export interface MSKContructProps extends StackProps {
    account: string,
    region: string,
    vpc: ec2.Vpc,
    clusterName: string,
    kafkaVersion: string,
    instanceType: string,
    mskSG: ec2.SecurityGroup,
    sshSG: ec2.SecurityGroup,
}

export class MSKContruct extends Construct {
    public cfnMskCluster: msk.CfnCluster;
    public cfnClusterArnOutput: CfnOutput;
    public bootstrapServersOutput: CfnOutput;

    constructor(scope: Construct, id: string, props: MSKContructProps) {
        super(scope, id);

        // msk cluster
        this.cfnMskCluster = new msk.CfnCluster(this, 'MSKCluster', {
            clusterName: props.clusterName,
            kafkaVersion: props.kafkaVersion,

            numberOfBrokerNodes: 3,

            // unauthenticated
            clientAuthentication: {
                unauthenticated: {
                    enabled: true,
                },
            },

            encryptionInfo: {
                encryptionInTransit: {
                    clientBroker: 'TLS_PLAINTEXT',
                    inCluster: true,
                }
            },

            brokerNodeGroupInfo: {
                instanceType: props.instanceType,
                clientSubnets: props.vpc.selectSubnets({
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                }).subnetIds,
                securityGroups: [props.mskSG.securityGroupId],
                storageInfo: {
                    ebsStorageInfo: {
                        volumeSize: 512,
                    },
                },
            } // brokerNodeGroupInfo

        }); // CfnCluster

        // 👇 create an output for cluster ARN
        this.cfnClusterArnOutput = new cdk.CfnOutput(this, 'ClusterArnOutput', {
            value: this.cfnMskCluster.attrArn,
            description: 'The ARN of MSK cluster: ' + props!.clusterName,
            exportName: 'MSKClusterARN-' + props!.clusterName,
        });

        this.cfnClusterArnOutput.node.addDependency(this.cfnMskCluster);

        // custom resource policy to get bootstrap brokers for our cluster
        const getBootstrapBrokers = new cr.AwsCustomResource(this, 'BootstrapBrokersLookup', {
            onUpdate: {   // will also be called for a CREATE event
                service: 'Kafka',
                action: 'getBootstrapBrokers',
                parameters: {
                    ClusterArn: this.cfnMskCluster.attrArn
                },
                region: props.region,
                physicalResourceId: cr.PhysicalResourceId.of(Date.now().toString())
            },
            policy: cr.AwsCustomResourcePolicy.fromSdkCalls({ resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE })
        });

        getBootstrapBrokers.node.addDependency(this.cfnMskCluster);

        // 👇 create an output for bootstrap servers
        this.bootstrapServersOutput = new cdk.CfnOutput(this, 'BootstrapServersOutput', {
            value: getBootstrapBrokers.getResponseField('BootstrapBrokerString'),
            description: 'List of bootstrap servers for our MSK cluster - ' + props!.clusterName,
            exportName: 'MSKBootstrapServers-' + props!.clusterName,
        });

        this.bootstrapServersOutput.node.addDependency(getBootstrapBrokers);

    } // constructor
} // class MSKConstruct