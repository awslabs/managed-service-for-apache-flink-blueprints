# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# Apache-2.0

import cfnresponse
import pytest
from unittest.mock import MagicMock, patch

import lambda_kda_app_start


@pytest.mark.parametrize("requestType, statuses, shouldStart, shouldSleep, cfnResponseStatus, cfnResponseMsg", [
    ("Create", ["READY", "STARTING", "RUNNING"], True,
     True, cfnresponse.SUCCESS, "Resource created"),
    ("Create", ["READY", "RUNNING"], True, False,
     cfnresponse.SUCCESS, "Resource created"),
    ("Create", ["READY", "STARTING", "FAILED"], True, True,
     cfnresponse.FAILED, "Unable to start the app in state: FAILED"),
    ("Create", ["READY", "FAILED"], True, False, cfnresponse.FAILED,
     "Unable to start the app in state: FAILED"),
    ("Create", ["STARTING", "STARTING", "RUNNING"], False,
     True, cfnresponse.SUCCESS, "Resource created"),
    ("Create", ["STARTING", "RUNNING"], False,
     False, cfnresponse.SUCCESS, "Resource created"),
    ("Create", ["RUNNING", "RUNNING"], False, False,
     cfnresponse.SUCCESS, "Resource created"),
    ("Update", ["READY", "STARTING", "RUNNING"], True,
     True, cfnresponse.SUCCESS, "Resource updated"),
    ("Update", ["READY", "RUNNING"], True, False,
     cfnresponse.SUCCESS, "Resource updated"),
    ("Update", ["READY", "STARTING", "FAILED"], True, True,
     cfnresponse.FAILED, "Unable to start the app in state: FAILED"),
    ("Update", ["READY", "FAILED"], True, False, cfnresponse.FAILED,
     "Unable to start the app in state: FAILED"),
    ("Update", ["STARTING", "STARTING", "RUNNING"], False,
     True, cfnresponse.SUCCESS, "Resource updated"),
    ("Update", ["STARTING", "RUNNING"], False,
     False, cfnresponse.SUCCESS, "Resource updated"),
    ("Update", ["RUNNING", "RUNNING"], False, False,
     cfnresponse.SUCCESS, "Resource updated"),
])
@patch("lambda_kda_app_start.LOGGER", MagicMock())
@patch("cfnresponse.send")
@patch("boto3.client")
@patch("time.sleep")
def test_handler_when_create_and_update(sleep, client, send, requestType, statuses, shouldStart, shouldSleep, cfnResponseStatus, cfnResponseMsg):
    # Arrange
    event = {
        "RequestType": requestType,
        "ResourceProperties": {
            "AppName": "a"
        }
    }
    context = {}

    kdaClient = MagicMock()
    client.return_value = kdaClient

    kdaClient.describe_application.side_effect = [{
        "ApplicationDetail": {
            "ApplicationStatus": s
        }
    } for s in statuses]

    kdaClient.describe_application.return_value = {
        "ApplicationDetail": {
            "ApplicationStatus": statuses[len(statuses) - 1]
        }
    }

    # Act
    lambda_kda_app_start.handler(event, context)

    # Assert
    kdaClient.describe_application.assert_called_with(ApplicationName="a")
    if shouldStart:
        kdaClient.start_application.assert_called_with(ApplicationName="a")
    if shouldSleep:
        sleep.assert_called_with(1)
    send.assert_called_with(event, context, cfnResponseStatus, {
                            "Message": cfnResponseMsg})


@patch("lambda_kda_app_start.LOGGER", MagicMock())
@patch("cfnresponse.send")
@patch("boto3.client")
@patch("time.sleep")
def test_handler_when_delete(sleep, client, send):
    # Arrange
    event = {
        "RequestType": "Delete",
        "ResourceProperties": {
            "AppName": "a"
        }
    }
    context = {}

    # Act
    lambda_kda_app_start.handler(event, context)

    # Assert
    client.assert_not_called()
    sleep.assert_not_called()
    send.assert_called_with(event, context, cfnresponse.SUCCESS, {
                            "Message": "Resource deleted"})


@patch("lambda_kda_app_start.LOGGER", MagicMock())
@patch("cfnresponse.send")
@patch("boto3.client")
@patch("time.sleep")
def test_handler_when_request_type_is_not_known(sleep, client, send):
    # Arrange
    event = {
        "RequestType": "Foo",
        "ResourceProperties": {
            "AppName": "a"
        }
    }
    context = {}

    # Act
    lambda_kda_app_start.handler(event, context)

    # Assert
    client.assert_not_called()
    sleep.assert_not_called()
    send.assert_called_with(event, context, cfnresponse.FAILED, {
                            "Message": "Unknown RequestType: Foo"})


@pytest.mark.parametrize("requestType, statuses, shouldStart", [
    ("Create", [Exception("failed")], False),
    ("Create", ["READY", Exception("failed")], True),
    ("Create", ["READY", "STARTING", Exception("failed")], True),
])
@patch("lambda_kda_app_start.LOGGER", MagicMock())
@patch("cfnresponse.send")
@patch("boto3.client")
@patch("time.sleep")
def test_handler_when_describe_application_fails(sleep, client, send, requestType, statuses, shouldStart):
    # Arrange
    event = {
        "RequestType": requestType,
        "ResourceProperties": {
            "AppName": "a"
        }
    }
    context = {}

    kdaClient = MagicMock()
    client.return_value = kdaClient

    def t(s): return s if isinstance(s, Exception) else {
        "ApplicationDetail": {
            "ApplicationStatus": s
        }
    }

    kdaClient.describe_application.side_effect = [t(s) for s in statuses]

    # Act
    lambda_kda_app_start.handler(event, context)

    # Assert
    if shouldStart:
        kdaClient.start_application.assert_called_with(ApplicationName="a")
    send.assert_called_with(event, context, cfnresponse.FAILED, {
                            "Message": "failed"})


@patch("lambda_kda_app_start.LOGGER", MagicMock())
@patch("cfnresponse.send")
@patch("boto3.client")
@patch("time.sleep")
def test_handler_when_start_application_fails(sleep, client, send):
    # Arrange
    event = {
        "RequestType": "Create",
        "ResourceProperties": {
            "AppName": "a"
        }
    }
    context = {}

    kdaClient = MagicMock()
    client.return_value = kdaClient

    kdaClient.describe_application.return_value = {
        "ApplicationDetail": {
            "ApplicationStatus": "READY"
        }
    }

    kdaClient.start_application.side_effect = Exception("failed")

    # Act
    lambda_kda_app_start.handler(event, context)

    # Assert
    send.assert_called_with(event, context, cfnresponse.FAILED, {
                            "Message": "failed"})


@patch("lambda_kda_app_start.timeout_seconds", 2)
@patch("lambda_kda_app_start.poll_interval_seconds", 10)
@patch("lambda_kda_app_start.LOGGER", MagicMock())
@patch("cfnresponse.send")
@patch("boto3.client")
@patch("time.sleep")
def test_handler_when_times_out(sleep, client, send):
    # Arrange
    event = {
        "RequestType": "Create",
        "ResourceProperties": {
            "AppName": "a"
        }
    }
    context = {}

    kdaClient = MagicMock()
    client.return_value = kdaClient

    kdaClient.describe_application.return_value = {
        "ApplicationDetail": {
            "ApplicationStatus": "STARTING"
        }
    }

    # Act
    lambda_kda_app_start.handler(event, context)

    # Assert
    send.assert_called_with(event, context, cfnresponse.FAILED, {
                            "Message": "Operation timed out"})
