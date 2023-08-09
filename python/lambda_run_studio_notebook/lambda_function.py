# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# Apache-2.0

import cfnresponse
import logging
import requests
import signal
import json
import boto3
import os

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

timeout_seconds = 120
note_url_id = "ABCDEFGHI"


def run_all_paragraphs(my_kda_appname):

    kda = boto3.client('kinesisanalyticsv2')

    response = kda.create_application_presigned_url(
        ApplicationName=my_kda_appname,
        UrlType='ZEPPELIN_UI_URL',
        SessionExpirationDurationInSeconds=1800
    )

    responseString = ''

    if not response or 'AuthorizedUrl' not in response:
        # app is invalid
        # or KDA app is not running
        responseString = "Unable to get pre signed url for app"
        raise Exception(responseString)

    rest_api_url = response['AuthorizedUrl']

    note_url = rest_api_url.replace(
        '/zeppelin/', '/zeppelin/api/notebook/job/' + note_url_id)

    s = requests.Session()

    # send a GET request to the note_url
    # This does NOT run the note. It does the auth for us with the endpoint
    s.get(note_url)

    # send post request now that we have the VerifiedAuthToken cookie
    # split the request url so that we do not have anything past '?auth'
    url_array = note_url.split('?auth')

    second_response = s.post(url_array[0])

    if 'exception' in second_response.json():
        # there was an issue running the note
        response_json = second_response.json()['message']
    else:
        response_json = json.loads(second_response.text)

    return response_json


def lambda_handler(event, context):
    # Setup alarm for remaining runtime minus a second
    signal.alarm(timeout_seconds)
    try:
        LOGGER.info('Request Event: %s', event)
        LOGGER.info('Request Context: %s', context)

        env_app_name = os.environ["AppName"]

        if event['RequestType'] == 'Create':
            note_response = run_all_paragraphs(env_app_name)
            cfnresponse.send(event, context, cfnresponse.SUCCESS, {
                             "Message": str(note_response)})
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
