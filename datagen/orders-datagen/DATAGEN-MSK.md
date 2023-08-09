### Create MSK streaming table into which data will be written

Let's now create a table against our source MSK cluster that we'll write to from the datagen source. Run the following query in a notebook cell:

IMPORTANT: Make sure that you replace the placeholders for the `topic` and `properties.bootstrap.servers` with your values. If you're performing data generation to try out one of the blueprints in this repo, then you can get these values from CloudFormation Outputs tab.

```SQL
%flink.ssql

-- IMPORTANT!!: Please replace
-- <<your topic>> with your source topic
-- <<your broker>> with your broker

DROP TABLE IF EXISTS orders_msk;

CREATE TABLE orders_msk (
    product_id   BIGINT,
    order_number BIGINT,
    quantity     INT,
    price        DECIMAL(32, 2),
    buyer        STRING,
    order_time   TIMESTAMP(3)
)
WITH (
    'connector'= 'kafka',
    'topic' = '<<your topic>>',
    'format' = 'json',
    'scan.startup.mode' = 'earliest-offset',
    'properties.bootstrap.servers' = '<<your broker>>',
    'properties.security.protocol' = 'SASL_SSL',
    'properties.sasl.mechanism' = 'AWS_MSK_IAM',
    'properties.sasl.jaas.config' = 'software.amazon.msk.auth.iam.IAMLoginModule required;',
    'properties.sasl.client.callback.handler.class' = 'software.amazon.msk.auth.iam.IAMClientCallbackHandler'
);
```

### Run continuous data generation query

Now let's run the continuous data generation using the following SQL statement in a new notebook cell:

```SQL
%flink.ssql(parallelism=1)

INSERT INTO orders_msk
SELECT 
    product_id,
    order_number,
    quantity,
    price,
    buyer,
    order_time
FROM orders_datagen_source;
```

The above statement starts a continously running Flink job that populates synthetic data into your MSK cluster/topic. Any consumers reading from that topic will see data in the following format:

```json
{
    'product_id': 2343,
    'order_number': 54,
    'quantity': 4,
    'price': 43.23,
    'buyer': 'random_string',
    'order_time': 23942349823
}
```

### (Optional) Query to view generated data

We can view this stream of data using another query. Run the following in a new notebook cell:

NOTE: The following query is *not* necessary for data generation. It's simply used here to valid that we're indeed generating data.

```SQL
%flink.ssql(type=update, parallelism=1)

select * from orders_msk;
```