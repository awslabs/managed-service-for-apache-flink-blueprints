# Steps for deploying CFN

1. Deploy `bootstrap-template.yaml`
2. Copy `zip` and `jar` files to shared S3 bucket
3. Deploy `out.yaml` w/ all params supplied. Note `lambdaZipsS3Bucket`: this is the name of the bucket where the zip and jar files are expected to be.