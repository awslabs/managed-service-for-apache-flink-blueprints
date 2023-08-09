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

def kafka_dest_main():

    s_env.disable_operator_chaining()

    table_env.execute_sql("DROP TABLE IF EXISTS sink_kafka")
    sink_ddl = f"""
        CREATE TABLE IF NOT EXISTS sink_kafka (
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
        'properties.bootstrap.servers' = 'localhost:9092'
        )
        """

    table_env.execute_sql("DROP TABLE IF EXISTS datagen_source")
    source_ddl = f"""
        CREATE TABLE IF NOT EXISTS datagen_source (
            product_id   BIGINT,
            order_number BIGINT,
            quantity     INT,
            price_int    INT,
            price        AS CAST(price_int/100.0 AS DECIMAL(32, 2)),
            buyer        STRING,
            order_time   TIMESTAMP(3)
        )
        WITH (
            'connector'= 'datagen',
            'fields.product_id.min' = '1',
            'fields.product_id.max' = '99999',
            'fields.quantity.min' = '1',
            'fields.quantity.max' = '25',
            'fields.price_int.min' = '29',
            'fields.price_int.max' = '99999999',
            'fields.order_number.min' = '1',
            'fields.order_number.max' = '9999999999',
            'fields.buyer.length' = '15'
        )
        """

    final_load_query = """
    INSERT INTO sink_kafka
    SELECT
       product_id,
       order_number,
       quantity,
       price,
       buyer,
       order_time
    FROM datagen_source
    """

    table_env.execute_sql(sink_ddl)
    table_env.execute_sql(source_ddl)

    exec_response = table_env.execute_sql(final_load_query)
    if is_local:
        exec_response.wait()


def main():
    kafka_dest_main()


if __name__ == "__main__":
    main()