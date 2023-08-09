
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

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StackProps } from 'aws-cdk-lib';
import { CopyAssetsLambdaConstruct } from "../../cdk-infra/shared/lib/copy-assets-lambda-construct";




export interface GlobalProps extends StackProps {
  assetBucket: string,
  assetList: string,
}



export class BootstrapCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: GlobalProps) {
    super(scope, id, props);

    // we'll be generating a CFN script so we need CFN params
    let cfnParams = this.getParams(props);


    // this construct creates an S3 bucket then copies all the assets passed
    const copyAssetsLambdaFn = new CopyAssetsLambdaConstruct(this, 'CopyAssetsLambda', {
      account: this.account,
      region: this.region,
      assetBucket: cfnParams.get("assetBucket")!.valueAsString,
      assetList: cfnParams.get("assetList")!.valueAsString
    });
    


} // constructor



    getParams(props?: GlobalProps): Map<string, cdk.CfnParameter> {
      let params = new Map<string, cdk.CfnParameter>();
      const assetBucket = new cdk.CfnParameter(this, "assetBucket", {
        type: "String",
        description: "The s3 bucket to create that will hold the CFN template script and assets."
      });
      params.set("assetBucket", assetBucket);

      const assetList = new cdk.CfnParameter(this, "assetList", {
        type: "String",
        description: "The list of assets, comma separated, of all assets you wish to include in S3 bucket assets"});
  
      params.set("assetList", assetList)
      return params;
  
    }

} // class
