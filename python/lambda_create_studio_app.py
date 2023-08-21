# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# Apache-2.0

import json
import boto3
import os
import cfnresponse
import json
import logging
import signal
import time

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

timeout_seconds = 300


def handler(event, context):

    # setup alarm for remaining runtime minus a second
    signal.alarm(timeout_seconds)

    try:
        LOGGER.info('REQUEST RECEIVED: %s', event)
        LOGGER.info('REQUEST Context: %s', context)

        # set up env vars
        client = boto3.client("kinesisanalyticsv2")
        app_name = os.environ["app_name"]
        execution_role = os.environ["execution_role"]
        bootstrap_string = os.environ["bootstrap_string"]
        subnet1 = os.environ["subnet_1"]
        source_topic = os.environ["source_topic_name"]
        security_group = os.environ["security_group"]
        glue_db_arn = os.environ["glue_db_arn"]
        log_stream_arn = os.environ["log_stream_arn"]
        zep_flink_version = os.environ["zepFlinkVersion"]
        blueprint_name = os.environ["blueprintName"]
        stack_id = os.environ["stackId"]

        if event['RequestType'] == 'Create' or event['RequestType'] == 'Update':
            LOGGER.info('In Create')

            create_app(client, app_name, execution_role, bootstrap_string, subnet1,
                       source_topic, security_group, glue_db_arn, log_stream_arn, zep_flink_version,
                       blueprint_name, stack_id)
            cfnresponse.send(event, context, cfnresponse.SUCCESS, {
                             "Message": "Successfully Created Application"})
        if event['RequestType'] == 'Delete':
            delete_app(client, app_name)
            cfnresponse.send(event, context, cfnresponse.SUCCESS, {
                             "Message": "Successfully Deleted Application"})
    except Exception as e:
        LOGGER.info('FAILED!')
        LOGGER.info(str(e))
        cfnresponse.send(event, context, cfnresponse.FAILED,
                         {"Message": str(e)})


def create_app(client, app_name, execution_role, bootstrap_string, subnet1,
               source_topic, security_group, glue_db_arn, log_stream_arn, zep_flink_version,
               blueprint_name, stack_id):

    # check if app already exists
    try:
        describe_response = client.describe_application(
            ApplicationName=app_name)
        LOGGER.info("App already exists %s", describe_response)
        return
    except Exception as e:
        LOGGER.info("App doesn't exist yet so I am creating it")

    code_content = generate_code_content(app_name, execution_role, bootstrap_string,
                                         subnet1, source_topic, security_group, glue_db_arn, log_stream_arn)
    response = client.create_application(
        ApplicationName=app_name,
        ApplicationDescription="blueprint studio application",
        RuntimeEnvironment=zep_flink_version,
        ServiceExecutionRole=execution_role,
        ApplicationConfiguration={
            "FlinkApplicationConfiguration": {
                "ParallelismConfiguration": {
                    "ConfigurationType": "CUSTOM",
                    "Parallelism": 2,
                    "ParallelismPerKPU": 1,
                    "AutoScalingEnabled": False,
                }
            },
            'EnvironmentProperties': {
                'PropertyGroups': [
                    {
                        'PropertyGroupId': 'BlueprintMetadata',
                        'PropertyMap': {
                            'StackId': stack_id,
                            'BlueprintName': blueprint_name
                        }
                    },
                ]
            },
            "ApplicationCodeConfiguration": {
                "CodeContent": {
                    "TextContent": code_content,
                },
                "CodeContentType": "PLAINTEXT",
            },
            "VpcConfigurations": [
                {"SubnetIds": [subnet1],
                    "SecurityGroupIds": [security_group]},
            ],
            "ZeppelinApplicationConfiguration": {
                "MonitoringConfiguration": {"LogLevel": "INFO"},
                "CatalogConfiguration": {
                    "GlueDataCatalogConfiguration": {"DatabaseARN": glue_db_arn}
                },
                "CustomArtifactsConfiguration": [
                    {
                        'ArtifactType': "DEPENDENCY_JAR",
                        'MavenReference': {
                            'GroupId': "org.apache.flink",
                            'ArtifactId': "flink-connector-kafka",
                            'Version': "1.15.4",
                        },
                    },
                    {
                        'ArtifactType': "DEPENDENCY_JAR",
                        'MavenReference': {
                            'GroupId': "org.apache.flink",
                            'ArtifactId': "flink-sql-connector-kinesis",
                            'Version': "1.15.4",
                        },
                    },
                    {
                        'ArtifactType': "DEPENDENCY_JAR",
                        'MavenReference': {
                            'GroupId': "software.amazon.msk",
                            'ArtifactId': "aws-msk-iam-auth",
                            'Version': "1.1.6",
                        },
                    },
                ],
            },
        },
        CloudWatchLoggingOptions=[
            {"LogStreamARN": log_stream_arn},
        ],
        ApplicationMode="INTERACTIVE")

    LOGGER.info("Create response %s", response)


def delete_app(client, app_name):
    LOGGER.info("Request to delete app")

    # check if app already deleted
    describe_response = ""
    try:
        describe_response = client.describe_application(
            ApplicationName=app_name)

        LOGGER.info("App exists, going to delete it %s", describe_response)
    except Exception as e:
        LOGGER.info("App doesn't exist or already deleted %s", e)
        return

    app_version = describe_response["ApplicationDetail"]["ApplicationVersionId"]
    vpc_configuration = describe_response["ApplicationDetail"][
        "ApplicationConfigurationDescription"]["VpcConfigurationDescriptions"][0]
    vpc_id = vpc_configuration["VpcConfigurationId"]

    LOGGER.info("Attempting to delete VPC from KDA App, VPC ID %s", vpc_id)

    delete_vpc_response = client.delete_application_vpc_configuration(
        ApplicationName=app_name,
        CurrentApplicationVersionId=app_version,
        VpcConfigurationId=vpc_id)

    LOGGER.info("Deleted VPC from App %s", delete_vpc_response)

    create_timestamp = describe_response["ApplicationDetail"]["CreateTimestamp"]

    while (True):
        desc_response = client.describe_application(ApplicationName=app_name)
        status = desc_response['ApplicationDetail']['ApplicationStatus']
        if status == "UPDATING":
            # wait until status is not updating
            LOGGER.info("Status is still UPDATING, sleeping until it is not.")
            time.sleep(1)
        else:
            LOGGER.info("App is done updating, proceeding with delete.")
            break

    delete_response = client.delete_application(
        ApplicationName=app_name, CreateTimestamp=create_timestamp)
    LOGGER.info("Delete response %s", delete_response)


def generate_code_content(app_name, execution_role, bootstrap_string, subnet1, source_topic, security_group, glue_db_arn, log_stream_arn):
    code_content = """
{
        "paragraphs": [
          {
                     
            "text": "%flink.ssql(type=update)\nDROP TABLE IF EXISTS stock_table;\nCREATE TABLE stock_table (\n  ticker STRING,\n  event_time TIMESTAMP(3),\n  price DOUBLE,\n  WATERMARK for event_time as event_time - INTERVAL '15' SECONDS\n) WITH (\n  'connector' = 'kafka',\n  'topic' = 'sourceTopic',\n  'properties.bootstrap.servers' = '""" + bootstrap_string + """',\n  'properties.security.protocol' = 'SASL_SSL',\n  'properties.sasl.mechanism' = 'AWS_MSK_IAM',\n  'properties.sasl.jaas.config' = 'software.amazon.msk.auth.iam.IAMLoginModule required;',\n  'properties.sasl.client.callback.handler.class' = 'software.amazon.msk.auth.iam.IAMClientCallbackHandler',\n  'properties.group.id' = 'myGroup',\n  'scan.startup.mode' = 'earliest-offset',\n  'format' = 'json'\n);\n\n\nSELECT * FROM stock_table;",
            "user": "anonymous",
            "dateUpdated": "2023-07-12T19:58:00+0000",
            "progress": 0,
            "config": {
              "colWidth": 12,
              "fontSize": 9,
              "enabled": true,
              "results": {},
              "editorSetting": {
                "language": "sql",
                "editOnDblClick": false,
                "completionKey": "TAB",
                "completionSupport": true
              },
              "editorMode": "ace/mode/sql",
              "type": "update"
            },
            "settings": {
              "params": {},
              "forms": {}
            },
            "apps": [],
            "runtimeInfos": {},
            "progressUpdateIntervalMs": 500,
            "jobName": "'paragraph_example_create'",
            "id": "paragraph_example_create",
            "dateCreated": "2023-07-12T19:38:48+0000",
            "status": "FINISHED",
            "focus": true,
            "$$hashKey": "object:235",
            "dateFinished": "2023-07-12T19:58:02+0000",
            "dateStarted": "2023-07-12T19:58:00+0000",
            "results": {}
          },
          {
      "text": "%flink \n\nclass RandomTickerUDF extends ScalarFunction {\n  private val randomStrings: List[String] = List(\"AAPL\", \"AMZN\", \"MSFT\", \"INTC\", \"TBV\")\n    private val random: scala.util.Random = new scala.util.Random(System.nanoTime())\n\n  \n  override def isDeterministic(): Boolean = {\n      return false;\n  }\n  \n  \n  def eval(): String = {\n        val randomIndex = random.nextInt(randomStrings.length)\n        randomStrings(randomIndex)\n    }\n}\n\nstenv.registerFunction(\"random_ticker_udf\", new RandomTickerUDF())",
      "user": "anonymous",
      "dateUpdated": "2023-08-18T21:51:11+0000",
      "progress": 0,
      "config": {
        "editorSetting": {
          "language": "scala",
          "editOnDblClick": false,
          "completionKey": "TAB",
          "completionSupport": true
        },
        "colWidth": 12,
        "editorMode": "ace/mode/scala",
        "fontSize": 9,
        "results": {},
        "enabled": true
      },
      "settings": {
        "params": {},
        "forms": {}
      },
      "apps": [],
      "runtimeInfos": {},
      "progressUpdateIntervalMs": 500,
      "jobName": "paragraph_1692387316402_870710564",
      "id": "paragraph_1692387316402_870710564",
      "dateCreated": "2023-08-18T19:35:16+0000",
      "dateStarted": "2023-08-18T21:51:11+0000",
      "dateFinished": "2023-08-18T21:51:13+0000",
      "status": "FINISHED",
      "$$hashKey": "object:11053"
    },
    {
      "text": "%flink.ssql(parallelism=1)\nDROP TABLE IF EXISTS generate_stock_data;\nCREATE TABLE generate_stock_data(\n  ticker STRING,\n  event_time TIMESTAMP(3),\n  price DOUBLE\n)\nWITH (\n    'connector' = 'datagen',\n    'fields.price.kind' = 'random',\n    'fields.price.min' ='0.00',\n    'fields.price.max' = '1000.00'\n\n\n);\n\n\nINSERT INTO stock_table \nSELECT random_ticker_udf() as ticker, event_time, price from generate_stock_data;",
      "user": "anonymous",
      "dateUpdated": "2023-08-21T14:25:40+0000",
      "progress": 0,
      "config": {
        "editorSetting": {
          "language": "sql",
          "editOnDblClick": false,
          "completionKey": "TAB",
          "completionSupport": true
        },
        "colWidth": 12,
        "editorMode": "ace/mode/sql",
        "fontSize": 9,
        "results": {
          "0": {
            "graph": {
              "mode": "multiBarChart",
              "height": 300,
              "optionOpen": true,
              "setting": {
                "table": {
                  "tableGridState": {
                    "columns": [
                      {
                        "name": "ticker0",
                        "visible": true,
                        "width": "*",
                        "sort": {
                          "priority": 0,
                          "direction": "desc"
                        },
                        "filters": [
                          {}
                        ],
                        "pinned": ""
                      },
                      {
                        "name": "event_time1",
                        "visible": true,
                        "width": "*",
                        "sort": {},
                        "filters": [
                          {}
                        ],
                        "pinned": ""
                      },
                      {
                        "name": "price2",
                        "visible": true,
                        "width": "*",
                        "sort": {},
                        "filters": [
                          {}
                        ],
                        "pinned": ""
                      }
                    ],
                    "scrollFocus": {},
                    "selection": [],
                    "grouping": {
                      "grouping": [],
                      "aggregations": [],
                      "rowExpandedStates": {}
                    },
                    "treeView": {},
                    "pagination": {
                      "paginationCurrentPage": 1,
                      "paginationPageSize": 250
                    }
                  },
                  "tableColumnTypeState": {
                    "names": {
                      "ticker": "string",
                      "event_time": "string",
                      "price": "string"
                    },
                    "updated": false
                  },
                  "tableOptionSpecHash": "[{\"name\":\"useFilter\",\"valueType\":\"boolean\",\"defaultValue\":false,\"widget\":\"checkbox\",\"description\":\"Enable filter for columns\"},{\"name\":\"showPagination\",\"valueType\":\"boolean\",\"defaultValue\":false,\"widget\":\"checkbox\",\"description\":\"Enable pagination for better navigation\"},{\"name\":\"showAggregationFooter\",\"valueType\":\"boolean\",\"defaultValue\":false,\"widget\":\"checkbox\",\"description\":\"Enable a footer for displaying aggregated values\"}]",
                  "tableOptionValue": {
                    "useFilter": false,
                    "showPagination": false,
                    "showAggregationFooter": false
                  },
                  "updated": false,
                  "initialized": false
                },
                "multiBarChart": {
                  "rotate": {
                    "degree": "-45"
                  },
                  "xLabelStatus": "default"
                }
              },
              "commonSetting": {},
              "keys": [],
              "groups": [],
              "values": []
            },
            "helium": {}
          },
          "2": {
            "graph": {
              "mode": "table",
              "height": 300,
              "optionOpen": false,
              "setting": {
                "table": {
                  "tableGridState": {},
                  "tableColumnTypeState": {
                    "names": {
                      "ticker": "string",
                      "event_time": "string",
                      "price": "string"
                    },
                    "updated": true
                  },
                  "tableOptionSpecHash": "[{\"name\":\"useFilter\",\"valueType\":\"boolean\",\"defaultValue\":false,\"widget\":\"checkbox\",\"description\":\"Enable filter for columns\"},{\"name\":\"showPagination\",\"valueType\":\"boolean\",\"defaultValue\":false,\"widget\":\"checkbox\",\"description\":\"Enable pagination for better navigation\"},{\"name\":\"showAggregationFooter\",\"valueType\":\"boolean\",\"defaultValue\":false,\"widget\":\"checkbox\",\"description\":\"Enable a footer for displaying aggregated values\"}]",
                  "tableOptionValue": {
                    "useFilter": false,
                    "showPagination": false,
                    "showAggregationFooter": false
                  },
                  "updated": false,
                  "initialized": false
                }
              },
              "commonSetting": {}
            }
          }
        },
        "enabled": true
      },
      "settings": {
        "params": {},
        "forms": {}
      },
      "apps": [],
      "runtimeInfos": {},
      "progressUpdateIntervalMs": 500,
      "jobName": "paragraph_1692370285234_1747432439",
      "id": "paragraph_1692370285234_1747432439",
      "dateCreated": "2023-08-18T14:51:25+0000",
      "dateStarted": "2023-08-21T14:25:40+0000",
      "dateFinished": "2023-08-21T14:26:40+0000",
      "status": "ABORT",
      "$$hashKey": "object:11054"
    }
        ],
        "name": '""" + app_name + """',
        "id": "ABCDEFGHI",
        "defaultInterpreterGroup": "flink",
        "version": "0.9.0-rc1-kda1",
        "noteParams": {},
        "noteForms": {},
        "angularObjects": {},
        "config": {
          "isZeppelinNotebookCronEnable": false,
          "looknfeel": "default",
          "personalizedMode": "false"
        },
        "info": {},
        "path": '/""" + app_name + """'
      }"""

    return code_content


def timeout_handler(_signal, _frame):
    '''Handle SIGALRM'''
    raise Exception('Operation timed out')


signal.signal(signal.SIGALRM, timeout_handler)
