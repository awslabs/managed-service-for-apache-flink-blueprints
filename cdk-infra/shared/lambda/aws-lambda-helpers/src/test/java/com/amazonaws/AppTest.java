package com.amazonaws;

import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * Unit test for simple App.
 */
public class AppTest 
{
    @Test
    public void gsonShouldSerializeResponse() {
        DataPayload dataPayload = new DataPayload("My Response");
        String asJson = dataPayload.asJson();
        assertTrue( asJson.equals("{\"Data\":{\"attributes\":{\"Response\":\"My Response\"}}}") );
    }
}
