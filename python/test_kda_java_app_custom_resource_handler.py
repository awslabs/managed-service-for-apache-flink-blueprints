import cfnresponse
import botocore
from datetime import datetime
from unittest.mock import MagicMock, patch

import kda_java_app_custom_resource_handler

event = {
    "RequestType": "Create",
    "ResourceProperties": {
        "AppName": "app",
        "RuntimeEnvironment": "FLINK_1-15",
        "ServiceExecutionRole": "arn:aws:iam:....",
        "Parallelism": "1",
        "ParallelismPerKpu": "1",  
        "AutoscalingEnabled": "true",
        "CheckpointInterval": "1000",
        "MinPauseBetweenCheckpoints": "1000",
        "ApplicationProperties": {
            "PropA": 10
        },
        "BucketArn": "bucket",
        "FileKey": "key",
        "LogStreamArn": "arn:aws:cloudwatch:..."
    }
}


@patch("kda_java_app_custom_resource_handler.LOGGER", MagicMock())
@patch("cfnresponse.send")
@patch("boto3.client")
def test_create_app(client, send):
    # Arrange
    kdaClient = MagicMock()
    client.return_value = kdaClient
    context = {}
    describe_application_response = botocore.exceptions.ClientError(error_response={"Error": {"Message": "Resource not found", "Code":"ResourceNotFoundException"}}, operation_name="describe_application")

    kdaClient.describe_application.side_effect = describe_application_response

    # Act
    kda_java_app_custom_resource_handler.handler(event, context)

    # Assert
    kdaClient.create_application.assert_called_once()
    props = event["ResourceProperties"]
    assert kdaClient.create_application.call_args.kwargs["ApplicationName"] == props["AppName"]
    assert kdaClient.create_application.call_args.kwargs["RuntimeEnvironment"] == props["RuntimeEnvironment"]
    assert kdaClient.create_application.call_args.kwargs["ServiceExecutionRole"] == props["ServiceExecutionRole"]
    parallelismConfig = kdaClient.create_application.call_args.kwargs["ApplicationConfiguration"]["FlinkApplicationConfiguration"]["ParallelismConfiguration"]
    assert parallelismConfig["Parallelism"] == int(props["Parallelism"])
    assert parallelismConfig["ParallelismPerKPU"] == int(props["ParallelismPerKpu"])
    assert parallelismConfig["AutoScalingEnabled"] == bool(props["AutoscalingEnabled"])
    checkpointConfig = kdaClient.create_application.call_args.kwargs["ApplicationConfiguration"]["FlinkApplicationConfiguration"]["CheckpointConfiguration"]
    assert checkpointConfig["CheckpointInterval"] == int(props["CheckpointInterval"])
    assert checkpointConfig["MinPauseBetweenCheckpoints"] == int(props["MinPauseBetweenCheckpoints"])
    envProps = kdaClient.create_application.call_args.kwargs["ApplicationConfiguration"]["EnvironmentProperties"]
    assert envProps["PropertyGroups"][0]["PropertyGroupId"] == "BlueprintMetadata"
    assert envProps["PropertyGroups"][0]["PropertyMap"] == props["ApplicationProperties"]
    codeConfig = kdaClient.create_application.call_args.kwargs["ApplicationConfiguration"]["ApplicationCodeConfiguration"]
    assert codeConfig["CodeContent"]["S3ContentLocation"]["BucketARN"] == props["BucketArn"]
    assert codeConfig["CodeContent"]["S3ContentLocation"]["FileKey"] == props["FileKey"]
    assert codeConfig["CodeContentType"] == "ZIPFILE"
    cwConfig = kdaClient.create_application.call_args.kwargs["CloudWatchLoggingOptions"]
    assert cwConfig[0]["LogStreamARN"] == props["LogStreamArn"]
    send.assert_called_with(event, context, cfnresponse.SUCCESS, {"Message": "Successfully Created Application"})


@patch("kda_java_app_custom_resource_handler.LOGGER", MagicMock())
@patch("cfnresponse.send")
@patch("boto3.client")
def test_create_an_existing_app(client, send):
    # Arrange
    kdaClient = MagicMock()
    client.return_value = kdaClient
    describe_application_response = {} 
    context = {}

    kdaClient.describe_application.return_value = describe_application_response

    # Act
    kda_java_app_custom_resource_handler.handler(event, context)

    # Assert
    kdaClient.create_application.assert_not_called()
    send.assert_called_with(event, context, cfnresponse.SUCCESS, {"Message": "Successfully Created Application"})


@patch("kda_java_app_custom_resource_handler.LOGGER", MagicMock())
@patch("cfnresponse.send")
@patch("boto3.client")
def test_create_app_when_describe_application_fails(client, send):
    # Arrange
    kdaClient = MagicMock()
    client.return_value = kdaClient
    describe_application_response = Exception("failed") 
    context = {}

    kdaClient.describe_application.side_effect = describe_application_response

    # Act
    kda_java_app_custom_resource_handler.handler(event, context)

    # Assert
    kdaClient.create_application.assert_not_called()
    send.assert_called_with(event, context, cfnresponse.FAILED, {"Message": str(describe_application_response)})


@patch("kda_java_app_custom_resource_handler.LOGGER", MagicMock())
@patch("cfnresponse.send")
@patch("boto3.client")
def test_create_app_when_create_application_fails(client, send):
    # Arrange
    kdaClient = MagicMock()
    client.return_value = kdaClient
    describe_application_response = botocore.exceptions.ClientError(error_response={"Error": {"Message": "Resource not found", "Code":"ResourceNotFoundException"}}, operation_name="describe_application")
    create_application_response = Exception("failed")
    context = {}

    kdaClient.describe_application.side_effect = describe_application_response
    kdaClient.create_application.side_effect = create_application_response

    # Act
    kda_java_app_custom_resource_handler.handler(event, context)

    # Assert
    send.assert_called_with(event, context, cfnresponse.FAILED, {"Message": str(create_application_response)})


@patch("kda_java_app_custom_resource_handler.LOGGER", MagicMock())
@patch("cfnresponse.send")
@patch("boto3.client")
def test_update_stack(client, send):
    # Arrange
    kdaClient = MagicMock()
    client.return_value = kdaClient
    context = {}
    event["RequestType"] = "Update"

    # Act
    kda_java_app_custom_resource_handler.handler(event, context)

    # Assert
    kdaClient.create_application.assert_not_called()
    kdaClient.describe_application.assert_not_called()
    send.assert_called_with(event, context, cfnresponse.SUCCESS, {"Message": "Successfully Updated Application"})


@patch("kda_java_app_custom_resource_handler.LOGGER", MagicMock())
@patch("cfnresponse.send")
@patch("boto3.client")
def test_delete_stack(client, send):
    # Arrange
    kdaClient = MagicMock()
    client.return_value = kdaClient
    context = {}
    event["RequestType"] = "Delete"
    describe_application_response = { "ApplicationDetail": { "CreateTimestamp": str(datetime.now()) } }
    kdaClient.describe_application.return_value = describe_application_response

    # Act
    kda_java_app_custom_resource_handler.handler(event, context)

    # Assert
    kdaClient.delete_application.assert_called_once_with(ApplicationName=event["ResourceProperties"]["AppName"], CreateTimestamp=describe_application_response["ApplicationDetail"]["CreateTimestamp"])
    send.assert_called_with(event, context, cfnresponse.SUCCESS, {"Message": "Successfully Deleted Application"})


@patch("kda_java_app_custom_resource_handler.LOGGER", MagicMock())
@patch("cfnresponse.send")
@patch("boto3.client")
def test_delete_stack_when_application_is_already_deleted(client, send):
    # Arrange
    kdaClient = MagicMock()
    client.return_value = kdaClient
    context = {}
    event["RequestType"] = "Delete"
    describe_application_response = botocore.exceptions.ClientError(error_response={"Error": {"Message": "Resource not found", "Code":"ResourceNotFoundException"}}, operation_name="describe_application")
    kdaClient.describe_application.side_effect = describe_application_response

    # Act
    kda_java_app_custom_resource_handler.handler(event, context)

    # Assert
    kdaClient.delete_application.assert_not_called()
    send.assert_called_with(event, context, cfnresponse.SUCCESS, {"Message": "Successfully Deleted Application"})


@patch("kda_java_app_custom_resource_handler.LOGGER", MagicMock())
@patch("cfnresponse.send")
@patch("boto3.client")
def test_delete_stack_when_describe_application_fails(client, send):
    # Arrange
    kdaClient = MagicMock()
    client.return_value = kdaClient
    context = {}
    event["RequestType"] = "Delete"
    describe_application_response = Exception("failed")
    kdaClient.describe_application.side_effect = describe_application_response

    # Act
    kda_java_app_custom_resource_handler.handler(event, context)

    # Assert
    kdaClient.delete_application.assert_not_called()
    send.assert_called_with(event, context, cfnresponse.FAILED, {"Message": str(describe_application_response)})


@patch("kda_java_app_custom_resource_handler.LOGGER", MagicMock())
@patch("cfnresponse.send")
@patch("boto3.client")
def test_delete_stack_when_delete_application_fails(client, send):
    # Arrange
    kdaClient = MagicMock()
    client.return_value = kdaClient
    context = {}
    event["RequestType"] = "Delete"
    describe_application_response = { "ApplicationDetail": { "CreateTimestamp": str(datetime.now()) } }
    kdaClient.describe_application.return_value = describe_application_response
    delete_application_response = Exception("failed")
    kdaClient.delete_application.side_effect = delete_application_response

    # Act
    kda_java_app_custom_resource_handler.handler(event, context)

    # Assert
    send.assert_called_with(event, context, cfnresponse.FAILED, {"Message": str(delete_application_response)})
