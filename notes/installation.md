# Installation
In order to work with blueprints, you must first install the prerequisites (below) to start synthesizing and testing templates on your local machine.

### Prerequisites
The following items must be installed prior to working with the blueprints in this repository.

- [Install Java](https://www.java.com/en/download/help/download_options.html)
- [Install Maven](https://maven.apache.org/install.html)
- [Install Node.js](https://nodejs.org/en/download/)
- [Install and Bootstrap CDK](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html)
- [Install Git](https://github.com/git-guides/install-git)
- [Install AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)

### Ensure that npm packages associated with CDK are up to date

1. In the shared CDK folder, run `npm update`.
2. In the CDK folder of your blueprint, run `npm update`.

For example, let's say you want to deploy the MSK Serverless -> Studio blueprint. Here are the steps you would follow:

Navigate to shared CDK folder (from root of this repo)
```
> cd cdk-infra/shared
> npm update

up to date, audited 457 packages in 12s

30 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
```

Navigate to your blueprint folder (from root of this repo)

```
> cd apps/java-datastream/msk-serverless-to-s3-datastream-java
> npm install
...
> npm update

up to date, audited 457 packages in 12s

30 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
```

Now, you're ready to [deploy blueprints](#how-do-i-use-these-blueprints).

NOTE: If `npm update` doesn't actually update your dependency versions, you might have to run `npm check update` or `ncu` and manually update the dependency versions in the `package.json` files in each of the above locations.

## How do I use these blueprints?

- To get started with a blueprint, first ensure you have the [necessary prerequisites](#prerequisites) installed.
- Then clone this repo using the command shown below.

```
git clone https://github.com/aws-samples/amazon-kinesis-data-analytics-blueprints
```
- Open a terminal session and navigate to the [blueprint](/README.md#get-started-with-blueprints) of your choice within the project structure; once there, follow the blueprint specific instructions.

### Experimentation

- Once you have successfully begun sending data through your blueprint, you have successfully launched and tested a blueprint!
- You can now take the blueprints in this repo, copy them to your own project structure and begin to [modify](modify.md) them for your specific needs.
