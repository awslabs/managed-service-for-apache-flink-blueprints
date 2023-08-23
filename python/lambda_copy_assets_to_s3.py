# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# Apache-2.0

import cfnresponse
import json
import os
import urllib.request
from urllib.parse import urlparse
import boto3


def handler(event, context):

    try:
        print("REQUEST RECEIVED:" + json.dumps(event))
        if (event["RequestType"] == "Create"):

            asset_list = os.environ.get("AssetList")

            # S3 bucket details
            bucket_name = os.environ.get("bucketName")

            file_list = asset_list.split(",")

            for file_string in file_list:

                parsed_url = urlparse(file_string)
                domain = parsed_url.netloc
                sub_domain = parsed_url.path.rsplit('/')[1]

                if domain != "github.com" and domain != "data-streaming-labs.s3.amazonaws.com":
                    if sub_domain != "awslabs" and sub_domain != "blueprint-test":
                        raise Exception(
                            f"Unrecognized String in Bootstrapping List: {file_string}")

                print(file_string)

                s3_key = file_string.rsplit('/', 1)[-1]

                # Download the JAR file
                jar_file_path = '/tmp/file.jar'
                urllib.request.urlretrieve(file_string, jar_file_path)

                # Upload the JAR file to S3
                s3_client = boto3.client('s3')
                s3_client.upload_file(jar_file_path, bucket_name, s3_key)

                # Remove the local JAR file
                os.remove(jar_file_path)

                # Print the completion message
                print('JAR file uploaded to S3 successfully.')

            print("CREATE RESPONSE", "create_response")
            cfnresponse.send(event, context, cfnresponse.SUCCESS, {
                             "Message": "Resource creation successful!"})
        elif (event["RequestType"] == "Delete"):
            print("DELETE" + str("delete_response"))
            s3 = boto3.resource('s3')
            bucket_name = os.environ.get("bucketName")
            bucket = s3.Bucket(bucket_name)
            for obj in bucket.objects.filter():
                s3.Object(bucket.name, obj.key).delete()
            cfnresponse.send(event, context, cfnresponse.SUCCESS, {
                             "Message": "Resource deletion successful!"})
        else:
            cfnresponse.send(event, context, cfnresponse.FAILED, {
                             "Message": "Resource creation failed!"})
    except Exception as err:
        print(err)
        cfnresponse.send(event, context, cfnresponse.FAILED,
                         {"Message:": str(type(err))})


def test():
    file_string = "test"
    parsed_url = urlparse(file_string)
    domain = parsed_url.netloc
    sub_domain = parsed_url.path.rsplit('/')[1]

    if domain != "github.com" and domain != "data-streaming-labs.s3.amazonaws.com":
        if sub_domain != "awslabs" and sub_domain != "blueprint-test":
            print("yes")

