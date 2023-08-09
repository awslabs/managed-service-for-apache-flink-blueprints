# Maven project for generating Uber Jar for PyFlink app

This project contains the Maven project for generating the uber jar for the `msk-serverless-to-s3-tableapi-python` PyFlink app. Note that you don't have to build this project as the generated jar is already included in the `lib` folder of the accompanying PyFlink app. . This project is provided for reference purposes.

## List of key dependencies in [pom.xml](pom.xml)

| Dependency              | Purpose                                       |
|-------------------------|-----------------------------------------------|
| `flink-connector-kafka` | Kafka source connector for reading from Kafka |
| `flink-connector-files` | File system connector for sinking to S3       |
| `flink-parquet`         | Required by ParquetAvroWriter                 |

## Building this project

NOTE: You don't have to build this project as the generated jar is already included in the `lib` folder of the accompanying PyFlink app. This project is provided for reference purposes.

```
mvn clean package
```