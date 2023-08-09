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

package com.amazonaws;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.LambdaLogger;
import com.amazonaws.services.lambda.runtime.events.CloudFormationCustomResourceEvent;
import com.google.gson.Gson;
import org.apache.kafka.clients.admin.*;
import org.apache.kafka.common.KafkaFuture;
import software.amazon.lambda.powertools.cloudformation.AbstractCustomResourceHandler;
import software.amazon.lambda.powertools.cloudformation.Response;

import java.util.*;
import java.util.concurrent.ExecutionException;

public class TopicGenHandler extends AbstractCustomResourceHandler {

    @Override
    protected Response create(CloudFormationCustomResourceEvent cloudFormationCustomResourceEvent, Context context) {
        String physicalResourceId = "topic-creation-lambda-" + UUID.randomUUID(); // Create a unique ID
        LambdaLogger logger = context.getLogger();

        logger.log("In TopicGenHandler.create");

        return createOrUpdate(physicalResourceId,
                cloudFormationCustomResourceEvent,
                context,
                true);
    }

    @Override
    protected Response update(CloudFormationCustomResourceEvent event, Context context) {
        LambdaLogger logger = context.getLogger();
        logger.log("In TopicGenHandler.update");

        return createOrUpdate(event.getPhysicalResourceId(),
                event,
                context,
                true);
    }

    protected Response createOrUpdate(String physicalResourceId,
            CloudFormationCustomResourceEvent cloudFormationCustomResourceEvent,
            Context context,
            Boolean generateData) {
        LambdaLogger logger = context.getLogger();

        Map<String, Object> rpMap = cloudFormationCustomResourceEvent.getResourceProperties();
        ResourceProperties resourceProperties = ResourceProperties.fromMap(rpMap);
        Boolean success = false;
        TopicCreationResponse tcResponse = processCreate(resourceProperties, context);

        String responseMessage = "";

        if (tcResponse == TopicCreationResponse.Created && generateData) {
            try {
                logger.log("Starting datagen stock ticker data");

                success = processDataGen(resourceProperties, context);

                logger.log("Done w/ datagen - status: " + success);
                responseMessage = success ? "Successfully generated data" : "Failed to perform datagen";
            } catch (Exception ex) {
                logger.log("Caught exception");

                responseMessage = "Failed to perform datagen";
                success = false;

                String msg = "Failed to generate data in createOrUpdate: " + ex.getMessage();
                logger.log(msg);
            }
        } else if (tcResponse == TopicCreationResponse.AlreadyExists) {
            logger.log("Not generating data because topic already exists");
            responseMessage = "Topic already exists; not generating data";
        } else {
            logger.log("NOT starting datagen");
            responseMessage = success ? "Created topic (no datagen)" : "Failed to create topic";
        }

        Map<String, String> retMap = new HashMap<>();
        retMap.put("Response", responseMessage);
        retMap.put("TopicName", resourceProperties.Topic);

        return Response.builder()
                .value(retMap)
                .status(success ? Response.Status.SUCCESS : Response.Status.FAILED)
                .physicalResourceId(physicalResourceId)
                .build();
    }

    @Override
    protected Response delete(CloudFormationCustomResourceEvent event, Context context) {
        Map<String, String> response = Map.of("Status", "Delete - not doing anything");
        return Response.builder()
                .value(response)
                .status(Response.Status.SUCCESS)
                .physicalResourceId(event.getPhysicalResourceId())
                .build();
    }

    private static boolean doesTopicExist(String topic, Properties properties, LambdaLogger logger) {
        AdminClient client = null;

        try {
            client = AdminClient.create(properties);
            Collection<TopicListing> listings = getTopicListing(client, false);
            for (TopicListing listing : listings) {
                if (listing.name().equals(topic)) {
                    boolean bool = true;
                    return bool;
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (ExecutionException e) {
            String msg = String.format("Failed to get topic list %s", e.getCause());
            logger.log(msg);
        } finally {
            if (client != null) {
                client.close();
            }
        }

        return false;
    }

    private static TopicCreationResponse processCreate(ResourceProperties resourceProperties, Context context) {
        LambdaLogger logger = context.getLogger();

        try {
            Gson gson = new Gson();
            logger.log("RESOURCE PROPERTIES: " + gson.toJson(resourceProperties));
            Properties properties = new Properties();
            properties.put("bootstrap.servers", resourceProperties.Broker);
            properties.put("client.id", "lambda-client");
            properties.put("security.protocol", "SASL_SSL");
            properties.put("sasl.mechanism", "AWS_MSK_IAM");
            properties.put("sasl.jaas.config", "software.amazon.msk.auth.iam.IAMLoginModule required;");
            properties.put("sasl.client.callback.handler.class",
                    "software.amazon.msk.auth.iam.IAMClientCallbackHandler");
            logger.log("PROPERTIES: " + properties);

            return createTopicIfNotExists(resourceProperties.Topic, properties, resourceProperties, context);
        } catch (Exception ex) {
            String msg = "Failed to create topic in processCreate " + ex.getMessage();
            logger.log(msg);

            return TopicCreationResponse.CreationFailed;
        }
    }

    private Boolean processDataGen(ResourceProperties rp, Context context) {
        LambdaLogger logger = context.getLogger();

        MSKDataGen mskDataGen = new MSKDataGen(rp.Broker, rp.Topic, 1001);

        try {
            mskDataGen.run();

            return true;
        } catch (Exception ex) {
            String msg = "Failed to generate data " + ex.getMessage();
            logger.log(msg);

            return false;
        }
    }

    private static TopicCreationResponse createTopicIfNotExists(String topic,
            Properties brokerProps,
            ResourceProperties coreBrokerProps,
            Context context) {
        LambdaLogger logger = context.getLogger();
        if (doesTopicExist(topic, brokerProps, logger)) {
            String msg = String.format("Topic '%s' already exists; not creating.", new Object[] { topic });
            logger.log(msg);
            return TopicCreationResponse.AlreadyExists;
        }
        AdminClient client = null;

        try {
            client = AdminClient.create(brokerProps);

            Collection<NewTopic> topicList = new ArrayList<>();
            topicList.add(new NewTopic(topic, coreBrokerProps.NumPartitions, coreBrokerProps.ReplicationFactor));
            CreateTopicsResult createTopicsResult = client.createTopics(topicList);

            logger.log("Before sync get");
            KafkaFuture<Void> voidKafkaFuture = createTopicsResult.values().get(topic);
            voidKafkaFuture.get();
            logger.log("After sync get");

            String msg = "Created topic " + topic;
            logger.log(msg);

            return TopicCreationResponse.Created;
        } catch (Exception e) {
            String msg = "Failed to create topic " + e.getMessage();
            logger.log(msg);

            return TopicCreationResponse.CreationFailed;
        } finally {
            if (client != null) {
                client.close();
            }
        } // try/finally
    }

    private static Collection<TopicListing> getTopicListing(AdminClient client, boolean isInternal)
            throws InterruptedException,
            ExecutionException {
        ListTopicsOptions options = new ListTopicsOptions();
        options.listInternal(isInternal);
        return client.listTopics(options).listings().get();
    }

    public enum TopicCreationResponse {
        Created,
        AlreadyExists,
        CreationFailed
    } // TopicCreationResponse
}