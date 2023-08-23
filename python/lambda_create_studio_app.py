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
        zep_flink_version = os.environ["RuntimeEnvironment"]
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
                    "Parallelism": 4,
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

    code_content = {}
    code_content["paragraphs"] = []




    create_udf_content = {}
    create_udf_content["text"] = """%flink \n\nclass RandomTickerUDF extends ScalarFunction {\n  private val randomStrings: List[String] = List(\"AAPL\", \"AMZN\", \"MSFT\", \"INTC\", \"TBV\")\n    private val random: scala.util.Random = new scala.util.Random(System.nanoTime())\n\n  \n  override def isDeterministic(): Boolean = {\n      return false;\n  }\n  \n  \n  def eval(): String = {\n        val randomIndex = random.nextInt(randomStrings.length)\n        randomStrings(randomIndex)\n    }\n}\n\nstenv.registerFunction(\"random_ticker_udf\", new RandomTickerUDF())"""
    create_udf_content["title"] = """<h3><font  color="#3071A9">1) User Defined Function for generating stock ticker data</font></h3>"""
    create_udf_content["config"] = {}
    create_udf_content["config"]["title"] = "true"

    create_stock_table_content = {}
    create_stock_table_content["text"] = """%flink.ssql(type=update)\nDROP TABLE IF EXISTS stock_table;\nCREATE TABLE stock_table (\n  ticker STRING,\n  event_time TIMESTAMP(3),\n  price DOUBLE,\n  WATERMARK for event_time as event_time - INTERVAL '15' SECONDS\n) WITH (\n  'connector' = 'kafka',\n  'topic' = 'sourceTopic',\n  'properties.bootstrap.servers' = '""" + bootstrap_string + """',\n  'properties.security.protocol' = 'SASL_SSL',\n  'properties.sasl.mechanism' = 'AWS_MSK_IAM',\n  'properties.sasl.jaas.config' = 'software.amazon.msk.auth.iam.IAMLoginModule required;',\n  'properties.sasl.client.callback.handler.class' = 'software.amazon.msk.auth.iam.IAMClientCallbackHandler',\n  'properties.group.id' = 'myGroup',\n  'scan.startup.mode' = 'earliest-offset',\n  'format' = 'json'\n);\n\n\nSELECT * FROM stock_table;"""
    create_stock_table_content["title"] = """<h3><font  color="#3071A9">2) Defining a source table to source MSK topic and querying data</font></h3>"""
    create_stock_table_content["config"] = {}
    create_stock_table_content["config"]["title"] = "true"

    insert_datagen_content = {}
    insert_datagen_content["text"] = """%flink.ssql(parallelism=1)\nDROP TABLE IF EXISTS generate_stock_data;\nCREATE TABLE generate_stock_data(\n  ticker STRING,\n  event_time TIMESTAMP(3),\n  price DOUBLE\n)\nWITH (\n    'connector' = 'datagen',\n    'fields.price.kind' = 'random',\n    'fields.price.min' ='0.00',\n    'fields.price.max' = '1000.00'\n\n\n);\n\n\nINSERT INTO stock_table \nSELECT random_ticker_udf() as ticker, event_time, price from generate_stock_data;"""
    insert_datagen_content["title"] = """<h3><font  color="#3071A9" >3) Please run this paragraph before running any additional event_time based queries in order to generate new data into the MSF topic</font></h3>"""
    insert_datagen_content["config"] = {}
    insert_datagen_content["config"]["title"]= "true"

    code_content["paragraphs"].append(create_udf_content)
    code_content["paragraphs"].append(create_stock_table_content)
    code_content["paragraphs"].append(insert_datagen_content)

    code_content["name"] = app_name
    code_content["id"] = "ABCDEFGHI"
    code_content["defaultInterpreterGroup"] = "flink"
    code_content["version"] = "0.9.0-rc1-kda1"
    code_content["path"] = "/" + app_name

    return json.dumps(code_content)


def timeout_handler(_signal, _frame):
    '''Handle SIGALRM'''
    raise Exception('Operation timed out')


signal.signal(signal.SIGALRM, timeout_handler)
