<div style="text-align: center">
<h1> Managed Service for Apache Flink Blueprints</h1>
<img src=img/msf-icon.png style="text-align: center; width:100px;"></img>


Managed Service for Apache Flink Blueprints are a curated collection of Apache Flink applications. Each blueprint will walk you through how to solve a practical problem related to stream processing using Apache Flink. These blueprints can be leveraged to create more complex applications to solve your business challenges in Apache Flink, and they are designed to be extensible. We will feature examples for both the DataStream and Table API where possible.

</div>

## Get started with Blueprints

Within this repo, you will find examples of Apache Flink applications that can be run locally, on an open source Apache Flink cluster, or on Managed Service for Apache Flink cluster. Clone the repository to get started.

| Description | Flink API | Language
| --- | --- | --- |
| **[Reading from Kinesis Data Streams and writing to Amazon S3](apps/java-datastream/kds-to-s3-datastream-java)** | DataStream | Java |
| **[Reading from MSK Serverless into Managed Service for Apache Flink Studio](apps/studio/msk-to-studio/)** | Flink SQL | SQL



## Installation

Follow the installation instructions [here](notes/installation.md) to install the shared libraries and begin developing.

## Contributing
Have a good idea for a new Managed Service for Apache Flink Blueprint? Check out the instructions [here](notes/contribute.md) for how to contribute.

## Modifying
Need to modify the blueprint for your needs? Check out the instructions [here](notes/modify.md) for more details.