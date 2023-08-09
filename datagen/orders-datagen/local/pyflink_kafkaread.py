from pyflink.table import EnvironmentSettings, StreamTableEnvironment, TableEnvironment
from pyflink.datastream import StreamExecutionEnvironment
from pyflink.table import DataTypes
from pyflink.table.udf import udf
from pyflink.table.expressions import lit, col, call
import os
import pathlib
from pathlib import Path
import json


env_settings = EnvironmentSettings \
    .new_instance() \
    .in_streaming_mode() \
    .build()

s_env = StreamExecutionEnvironment.get_execution_environment()
table_env = StreamTableEnvironment.create(s_env, environment_settings=env_settings)

APPLICATION_PROPERTIES_FILE_PATH = "/etc/flink/application_properties.json"  # on kda

is_local = (
    # set this env var in your local environment
    True if os.environ.get("IS_LOCAL") else False
)

if is_local:
    print("Running in local mode...")
    # only for local, overwrite variable to properties and pass in your jars delimited by a semicolon (;)
    APPLICATION_PROPERTIES_FILE_PATH = "application_properties.json"  # local

    CURRENT_DIR = os.path.dirname(os.path.realpath(__file__))
    pipeline_jars_var = "file://" + str(CURRENT_DIR) + "/lib/flink-sql-connector-kafka-1.15.2.jar"

    print(pipeline_jars_var)

    table_env.get_config().get_configuration().set_string(
        "pipeline.jars",
        pipeline_jars_var
        )

def get_application_properties():
    if os.path.isfile(APPLICATION_PROPERTIES_FILE_PATH):
        with open(APPLICATION_PROPERTIES_FILE_PATH, "r") as file:
            contents = file.read()
            properties = json.loads(contents)
            return properties
    else:
        print('A file at "{}" was not found'.format(APPLICATION_PROPERTIES_FILE_PATH))

def property_map(props, property_group_id):
    for prop in props:
        if prop["PropertyGroupId"] == property_group_id:
            return prop["PropertyMap"]

def kafka_source_main():

    s_env.disable_operator_chaining()

    table_env.execute_sql("DROP TABLE IF EXISTS source_kafka")
    source_ddl = f"""
        CREATE TABLE IF NOT EXISTS source_kafka (
            product_id   BIGINT,
            order_number BIGINT,
            quantity     INT,
            price        DECIMAL(32,2),
            buyer        STRING,
            order_time   TIMESTAMP(3)
        )
        WITH (
        'connector'= 'kafka',
        'format' = 'json',
        'topic' = 'DatagenTopic',
        'scan.startup.mode' = 'earliest-offset',
        'properties.bootstrap.servers' = 'localhost:9092'
        )
        """

    table_env.execute_sql("DROP TABLE IF EXISTS sink_print")
    sink_print_ddl = f"""
        CREATE TABLE IF NOT EXISTS sink_print
        WITH (
            'connector'= 'print'
        )
        LIKE source_kafka (EXCLUDING ALL)
        """

    print_query = """
    INSERT INTO sink_print
    SELECT *
    FROM source_kafka
    """

    table_env.execute_sql(source_ddl)
    table_env.execute_sql(sink_print_ddl)

    exec_response = table_env.execute_sql(print_query)
    if is_local:
        exec_response.wait()


def main():
    kafka_source_main()


if __name__ == "__main__":
    main()