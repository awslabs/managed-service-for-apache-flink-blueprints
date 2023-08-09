#!/usr/bin/env node
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

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CdkInfraKafkaToStudioStack } from '../lib/cdk-infra-kafka-to-studio-stack';
import { BootstraplessStackSynthesizer } from 'cdk-bootstrapless-synthesizer';


const app = new cdk.App();

const studioAppName = app.node.tryGetContext('studioAppName');
const glueDatabaseName = app.node.tryGetContext('glueDatabaseName');
const zepFlinkVersion = app.node.tryGetContext('zepFlinkVersion');
const kdaLogGroup = app.node.tryGetContext('kdaLogGroup');
const studioLogStream = app.node.tryGetContext('studioLogStream');
const mskClusterName = app.node.tryGetContext('mskClusterName');
const sourceTopicName = app.node.tryGetContext('sourceTopicName');
const blueprintName = "MSK_STUDIO";

// NOTE: We're not creating a bucket to hold the application jar; we
//       expect there to be a pre-existing bucket. You can modify this stack
//       to also create a bucket instead.
//       Same goes for the bucket that this app will be writing to.
new CdkInfraKafkaToStudioStack(app, 'CdkInfraKafkaToStudioStack', {
  synthesizer: new BootstraplessStackSynthesizer({
    templateBucketName: 'cfn-template-bucket',

    fileAssetBucketName: 'file-asset-bucket-${AWS::Region}',
    fileAssetRegionSet: ['us-west-1', 'us-west-2'],
    fileAssetPrefix: 'file-asset-prefix/latest/'
  }),
  studioAppName: studioAppName,
  glueDatabaseName: glueDatabaseName,
  zepFlinkVersion: zepFlinkVersion,
  kdaLogGroup: kdaLogGroup,
  studioLogStream: studioLogStream,
  mskClusterName: mskClusterName,
  sourceTopicName: sourceTopicName,
  blueprintName: blueprintName,
});