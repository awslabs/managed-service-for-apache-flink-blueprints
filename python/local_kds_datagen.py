import boto3
import json
import datetime
import random
import argparse

def get_data():
    return {
        'event_time': datetime.datetime.now().isoformat(),
        'ticker': random.choice(['AAPL', 'AMZN', 'MSFT', 'INTC', 'TBV']),
        'price': round(random.random() * 100, 2),
    }


def generate_records(streamArn, numberOfItems, region):
    client = boto3.client('kinesis', region_name=region)
    for _ in range(numberOfItems):
        data = get_data()
        client.put_record(
            StreamARN=streamArn,
            Data=json.dumps(data),
            PartitionKey=data["ticker"])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--stream-arn", help="Kinesis data stream ARN produce test records into")
    parser.add_argument("--count", type=int, help="Number of test records to produce")
    parser.add_argument("--region", help="AWS region of Kinesis data stream specified via --stream-arn")
    args = parser.parse_args()
    print(f"Producing {args.count} records into {args.stream_arn}")
    generate_records(args.stream_arn, args.count, args.region)
    print("done, bye")

main()