import { readFileSync } from 'fs';
import { StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';

export enum MsfRuntimeEnvironment {
    FLINK_1_11 = "FLINK-1_11",
    FLINK_1_13 = "FLINK-1_13",
    FLINK_1_15 = "FLINK-1_15",
    FLINK_1_18 = "FLINK-1_18",
    FLINK_1_6 = "FLINK-1_6",
    FLINK_1_8 = "FLINK-1_8",

}
export interface MsfJavaAppProps extends StackProps {
    account: string;
    region: string;
    partition: string;
    appName: string;
    runtimeEnvironment: MsfRuntimeEnvironment,
    serviceExecutionRole: string;
    bucketName: string;
    jarFile: string;
    logStreamName: string;
    logGroupName: string;
    subnets?: string[];
    securityGroups?: string[];
    parallelism?: Number;
    parallelismPerKpu?: Number;
    autoscalingEnabled?: Boolean;
    checkpointInterval?: Number;
    minPauseBetweenCheckpoints?: Number;
    applicationProperties?: Object;
}

// MsfJavaApp construct is used to create a new Java blueprint application.
// This construct is used instead of official CDK construct because official
// CDK construct does not support configuring CW logs during creation.
// Configuring CW logs with official CDK construct results in an update
// to the application which changes its initial version to 2. This is not 
// desired for blueprints functionality in AWS console.
export class MsfJavaApp extends Construct {
    constructor(scope: Construct, id: string, props: MsfJavaAppProps) {
        super(scope, id);

        const fn = new lambda.SingletonFunction(this, 'MsfJavaAppCustomResourceHandler', {
            uuid: 'c4e1d42d-595a-4bd6-99e9-c299b61f2358',
            lambdaPurpose: "Deploy an MSF app created created with Java",
            code: lambda.Code.fromInline(readFileSync(`${__dirname}/../../../python/msf_java_app_custom_resource_handler.py`, "utf-8")),
            handler: "index.handler",
            initialPolicy: [
                new iam.PolicyStatement(
                    {
                        actions: ['iam:PassRole'],
                        resources: [props.serviceExecutionRole],
                        conditions: {
                            StringEqualsIfExists: {
                                "iam:PassedToService": "kinesisanalytics.amazonaws.com"
                            },
                            ArnEqualsIfExists: {
                                "iam:AssociatedResourceARN": `arn:${props.partition}:kinesisanalytics:${props.region}:${props.account}:application/${props.appName}`
                            }
                        }
                    }),
            ],
            timeout: cdk.Duration.seconds(360),
            runtime: lambda.Runtime.PYTHON_3_9,
            memorySize: 1024,
        });

        fn.addToRolePolicy(new iam.PolicyStatement(
            {
                actions: [
                    'kinesisanalytics:DescribeApplication',
                    'kinesisanalytics:CreateApplication',
                    'kinesisanalytics:DeleteApplication',
                ],
                resources: ['arn:aws:kinesisanalytics:' + props.region + ':' + props.account + ':application/' + props.appName]
            }));

        const defaultProps = {
            parallelism: 2,
            parallelismPerKpu: 1,
            autoscalingEnabled: false,
            checkpointInterval: 60000,
            minPauseBetweenCheckpoints: 5000,
            applicationProperties: {}
        };

        props = { ...defaultProps, ...props };

        const logStreamArn = `arn:${props.partition}:logs:${props.region}:${props.account}:log-group:${props.logGroupName}:log-stream:${props.logStreamName}`;
        const bucketArn = `arn:${props.partition}:s3:::${props.bucketName}`;
        new cdk.CustomResource(this, `MSFJavaApp${id}`, {
            serviceToken: fn.functionArn,
            properties:
            {
                AppName: props.appName,
                RuntimeEnvironment: props.runtimeEnvironment,
                ServiceExecutionRole: props.serviceExecutionRole,
                BucketArn: bucketArn,
                FileKey: props.jarFile,
                LogStreamArn: logStreamArn,
                Subnets: props.subnets,
                SecurityGroups: props.securityGroups,
                Parallelism: props.parallelism,
                ParallelismPerKpu: props.parallelismPerKpu,
                AutoscalingEnabled: props.autoscalingEnabled,
                CheckpointInterval: props.checkpointInterval,
                MinPauseBetweenCheckpoints: props.minPauseBetweenCheckpoints,
                ApplicationProperties: props.applicationProperties
            }
        });
    }
}
