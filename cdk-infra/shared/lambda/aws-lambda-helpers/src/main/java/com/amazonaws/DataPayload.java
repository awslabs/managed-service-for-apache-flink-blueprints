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

import com.google.gson.Gson;

/*
  The purpose of this hierarchy of classes is to ensure that we properly structure our response for
  CDK: {'Data': {'attributes': {'Response': <response>}}}
 */
public class DataPayload {
    public AttributesPayload Data;

    public DataPayload() {
    }

    public DataPayload(String response) {
        this.Data = new AttributesPayload(response);
    }

    public String asJson() {
        Gson gson = new Gson();
        return gson.toJson(this);
    }

    public static class AttributesPayload {
        public ResponsePayload attributes;

        public AttributesPayload(String response) {
            this.attributes = new ResponsePayload(response);
        }
    }

    public static class ResponsePayload {
        public ResponsePayload(String response) {
            this.Response = response;
        }

        public String Response;
    }
}