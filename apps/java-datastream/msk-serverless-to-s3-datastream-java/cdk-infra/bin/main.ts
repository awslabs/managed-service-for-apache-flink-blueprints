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
import { CdkInfraKdaKafkaToS3Stack } from '../lib/cdk-infra-kda-kafka-to-s3-stack';

const app = new cdk.App();

const kdaAppName = app.node.tryGetContext('kdaAppName');
const appBucket = app.node.tryGetContext('appBucket');
const appFileKeyOnS3 = app.node.tryGetContext('appFileKeyOnS3');
const runtimeEnvironment = app.node.tryGetContext('runtimeEnvironment');
const appSinkBucket = app.node.tryGetContext('appSinkBucket');
const glueDatabaseName = app.node.tryGetContext('glueDatabaseName');
const flinkVersion = app.node.tryGetContext('flinkVersion');
const zepFlinkVersion = app.node.tryGetContext('zepFlinkVersion');
const deployDataGen = app.node.tryGetContext('deployDataGen');
const kdaLogGroup = app.node.tryGetContext('kdaLogGroup');
const kdaLogStream = app.node.tryGetContext('kdaLogStream');
const mskClusterName = app.node.tryGetContext('mskClusterName');
const sourceTopicName = app.node.tryGetContext('sourceTopicName');

// NOTE: We're not creating a bucket to hold the application jar; we
//       expect there to be a pre-existing bucket. You can modify this stack
//       to also create a bucket instead.
//       Same goes for the bucket that this app will be writing to.
new CdkInfraKdaKafkaToS3Stack(app, 'CdkInfraKdaKafkaToS3Stack', {
  kdaAppName: kdaAppName,
  appBucket: appBucket,
  appFileKeyOnS3: appFileKeyOnS3,
  runtimeEnvironment: runtimeEnvironment,
  appSinkBucket: appSinkBucket,
  deployDataGen: deployDataGen == "true",
  glueDatabaseName: glueDatabaseName,
  flinkVersion: flinkVersion,
  zepFlinkVersion: zepFlinkVersion,
  kdaLogGroup: kdaLogGroup,
  kdaLogStream: kdaLogStream,
  mskClusterName: mskClusterName,
  sourceTopicName: sourceTopicName,
});