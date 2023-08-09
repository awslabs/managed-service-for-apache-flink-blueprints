/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * Apache-2.0
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

package com.amazonaws.services.kinesisanalytics.stock;

import org.apache.flink.core.io.SimpleVersionedSerializer;
import org.apache.flink.streaming.api.functions.sink.filesystem.BucketAssigner;
import org.apache.flink.streaming.api.functions.sink.filesystem.bucketassigners.SimpleVersionedStringSerializer;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

public class StockDateBucketAssigner implements BucketAssigner<Stock, String> {
    private final String prefix;
    private final String partitionFormat;
    private transient DateTimeFormatter dtFormatForWrite;

    public StockDateBucketAssigner(String partitionFormat, String prefix) {
        this.prefix = prefix;
        this.partitionFormat = partitionFormat;
    }

    @Override
    public String getBucketId(Stock stock, Context context) {
        this.dtFormatForWrite = DateTimeFormatter.ofPattern(partitionFormat);

        String eventTimeStr = stock.getEvent_time();
        LocalDateTime eventTime = LocalDateTime.parse(eventTimeStr.replace(" ", "T"));

        String formattedDate = eventTime.format(this.dtFormatForWrite);

        return String.format("%sts=%s",
                prefix,
                formattedDate
        );
    }

    @Override
    public SimpleVersionedSerializer<String> getSerializer() {
        return SimpleVersionedStringSerializer.INSTANCE;
    }
}