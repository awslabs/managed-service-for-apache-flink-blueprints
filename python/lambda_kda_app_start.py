# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# Apache-2.0

import cfnresponse
import json
import logging
import signal
import boto3
import time

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

timeout_seconds = 550
poll_interval_seconds = 1


def handler(event, context):
    # Setup alarm for remaining runtime minus a second
    signal.alarm(timeout_seconds)
    try:
        LOGGER.info('Request Event: %s', event)
        LOGGER.info('Request Context: %s', context)
        if event['RequestType'] == 'Create':
            start_app(event['ResourceProperties']['AppName'])
            cfnresponse.send(event, context, cfnresponse.SUCCESS, {
                             "Message": "Resource created"})
        elif event['RequestType'] == 'Update':
            start_app(event['ResourceProperties']['AppName'])
            cfnresponse.send(event, context, cfnresponse.SUCCESS, {
                             "Message": "Resource updated"})
        elif event['RequestType'] == 'Delete':
            cfnresponse.send(event, context, cfnresponse.SUCCESS, {
                             "Message": "Resource deleted"})
        else:
            err = f"Unknown RequestType: {event['RequestType']}"
            LOGGER.error(err)
            cfnresponse.send(
                event, context, cfnresponse.FAILED, {"Message": err})
    except Exception as e:
        LOGGER.error("Failed %s", e)
        cfnresponse.send(event, context, cfnresponse.FAILED,
                         {"Message": str(e)})


def start_app(appName):
    client = boto3.client('kinesisanalyticsv2')
    desc_response = client.describe_application(ApplicationName=appName)
    status = desc_response['ApplicationDetail']['ApplicationStatus']
    if status == "READY":
        # We assume that after a successful invocation of this API
        # application would not be in READY state.
        client.start_application(ApplicationName=appName)
    while (True):
        desc_response = client.describe_application(ApplicationName=appName)
        status = desc_response['ApplicationDetail']['ApplicationStatus']
        if status != "STARTING":
            if status != "RUNNING":
                raise Exception(f"Unable to start the app in state: {status}")
            LOGGER.info(f"Application status changed: {status}")
            break
        else:
            time.sleep(poll_interval_seconds)


def timeout_handler(_signal, _frame):
    '''Handle SIGALRM'''
    raise Exception('Operation timed out')


signal.signal(signal.SIGALRM, timeout_handler)
