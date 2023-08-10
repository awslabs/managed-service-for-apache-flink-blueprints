import boto3
import botocore
import cfnresponse
import logging
import signal

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

timeout_seconds = 300


def handler(event, context):

    # setup alarm for remaining runtime minus a second
    signal.alarm(timeout_seconds)

    try:
        LOGGER.info('REQUEST RECEIVED: %s', event)
        LOGGER.info('REQUEST Context: %s', context)
        client = boto3.client('kinesisanalyticsv2')
        props = event['ResourceProperties']

        # set up env vars
        if event['RequestType'] == 'Create':
            LOGGER.info('Creating KDA Java app')
            create_app(client=client, props=props)
            cfnresponse.send(event, context, cfnresponse.SUCCESS, { "Message": "Successfully Created Application"})
        elif event['RequestType'] == 'Update':
            LOGGER.info('Nothing to update')
            cfnresponse.send(event, context, cfnresponse.SUCCESS, { "Message": "Successfully Updated Application"})
        elif event['RequestType'] == 'Delete':
            delete_app(client=client, props=props)
            cfnresponse.send(event, context, cfnresponse.SUCCESS, { "Message": "Successfully Deleted Application"})

    except Exception as e:
        LOGGER.error(str(e))
        cfnresponse.send(event, context, cfnresponse.FAILED, {"Message": str(e)})


def create_app(client, props):
    # check if app already exists
    try:
        describe_response = client.describe_application(
            ApplicationName=props['AppName'])
        LOGGER.info("App already exists %s", describe_response)
        return
    except botocore.exceptions.ClientError as e:
        if e.response["Error"]["Code"] != "ResourceNotFoundException":
            raise e
        LOGGER.info("App doesn't exist yet so I am creating it")

    response = client.create_application(
        ApplicationName=props['AppName'],
        ApplicationDescription="KDA blueprint Java application",
        RuntimeEnvironment=props['RuntimeEnvironment'],
        ServiceExecutionRole=props['ServiceExecutionRole'],
        ApplicationConfiguration={
            "FlinkApplicationConfiguration": {
                "ParallelismConfiguration": {
                    "ConfigurationType": "CUSTOM",
                    "Parallelism": int(props['Parallelism']),
                    "ParallelismPerKPU": int(props['ParallelismPerKpu']),
                    "AutoScalingEnabled": bool(props['AutoscalingEnabled']),
                },
                "CheckpointConfiguration": {
                    "ConfigurationType": "CUSTOM",
                    'CheckpointingEnabled': True,
                    'CheckpointInterval': int(props["CheckpointInterval"]),
                    'MinPauseBetweenCheckpoints': int(props["MinPauseBetweenCheckpoints"])
                },
            },
            'EnvironmentProperties': {
                'PropertyGroups': [
                    {
                        'PropertyGroupId': 'BlueprintMetadata',
                        'PropertyMap': props['ApplicationProperties']
                    },
                ]
            },
            "ApplicationCodeConfiguration": {
                "CodeContent": {
                    "S3ContentLocation": {
                        "BucketARN": props['BucketArn'],
                        "FileKey": props['FileKey']
                    },
                },
                "CodeContentType": "ZIPFILE",
            },
        },
        CloudWatchLoggingOptions=[
            {"LogStreamARN": props['LogStreamArn']},
        ])

    LOGGER.info("Create response %s", response)


def delete_app(client, props):
    # check if app already deleted
    describe_response = ""
    try:
        describe_response = client.describe_application(ApplicationName=props['AppName'])
        LOGGER.info("App exists, going to delete it %s", describe_response)
    except botocore.exceptions.ClientError as e:
        if e.response["Error"]["Code"] != "ResourceNotFoundException":
            raise e
        LOGGER.info("App doesn't exist or already deleted %s", e)
        return

    create_timestamp = describe_response["ApplicationDetail"]["CreateTimestamp"]

    delete_response = client.delete_application(ApplicationName=props['AppName'], CreateTimestamp=create_timestamp)
    LOGGER.info("Delete response %s", delete_response)


def timeout_handler(_signal, _frame):
    '''Handle SIGALRM'''
    raise Exception('Operation timed out')


signal.signal(signal.SIGALRM, timeout_handler)
