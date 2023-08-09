# Lambda code (in Java) for creating MSK topics

This project contains Java code for creating topics against MSK, and is meant to be used in AWS Lambda functions. Note that you don't have to build this project or otherwise interact with it to use the CDK templates that reference the output of this project. With that said, here's the info for building this project and using it in the referencing CDK template.

## Building this project

- Run `mvn clean package shade:shade`
- Copy the uber jar named `aws-lambda-helpers-1.0.jar` from the `target` folder to the level above this project