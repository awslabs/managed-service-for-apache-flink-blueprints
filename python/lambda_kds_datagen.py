# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# Apache-2.0

import cfnresponse
import logging
import signal
import boto3
import datetime
import random
import json

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

timeout_seconds = 120


def get_data():
    return {
        'event_time': datetime.datetime.now().isoformat(),
        'ticker': random.choice(['AAPL', 'AMZN', 'MSFT', 'INTC', 'TBV']),
        'price': round(random.random() * 100, 2),
    }


def generate_records(streamArn, numberOfItems):
    client = boto3.client('kinesis')
    for _ in range(numberOfItems):
        data = get_data()
        client.put_record(
            StreamARN=streamArn,
            Data=json.dumps(data),
            PartitionKey=data["ticker"])


def handler(event, context):
    # Setup alarm for remaining runtime minus a second
    signal.alarm(timeout_seconds)
    try:
        LOGGER.info('Request Event: %s', event)
        LOGGER.info('Request Context: %s', context)
        if event['RequestType'] == 'Create':
            generate_records(event['ResourceProperties']['StreamArn'], int(
                event['ResourceProperties']['NumberOfItems']))
            cfnresponse.send(event, context, cfnresponse.SUCCESS, {
                             "Message": "Resource created"})
        elif event['RequestType'] == 'Update':
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


def timeout_handler(_signal, _frame):
    '''Handle SIGALRM'''
    raise Exception('Operation timed out')


signal.signal(signal.SIGALRM, timeout_handler)
