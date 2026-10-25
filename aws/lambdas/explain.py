"""
SeeLearn Lambda: POST /explain
Provides grounded answers for hardware components and follow-up questions using Amazon Bedrock.
"""

import os
import json
import boto3

BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "anthropic.claude-3-haiku-20240307-v1:0")
BEDROCK_REGION = os.environ.get("BEDROCK_REGION", "us-east-1")

bedrock_client = boto3.client("bedrock-runtime", region_name=BEDROCK_REGION)

EXPLAIN_SCHEMA = {
    "type": "object",
    "required": ["componentId", "answer", "whyNeeded", "followUpQuestions"],
    "properties": {
        "componentId": {"type": "string"},
        "componentName": {"type": "string"},
        "answer": {"type": "string"},
        "whyNeeded": {"type": "string"},
        "specsSummary": {"type": "object"},
        "followUpQuestions": {"type": "array", "items": {"type": "string"}}
    }
}

def validate_schema(data):
    for field in EXPLAIN_SCHEMA["required"]:
        if field not in data:
            return False
    return True

def lambda_handler(event, context):
    headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "OPTIONS,POST"
    }

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": headers, "body": ""}

    try:
        body = json.loads(event.get("body", "{}"))
        component_id = body.get("componentId", "flight_controller")
        question = body.get("question", "")
        grounding_facts = body.get("groundingFacts", {})

        system_prompt = (
            "You are the SeeLearn Grounded Engineering Tutor. Answer the user's question about "
            "the selected physical component using ONLY the provided grounding facts.\n"
            "Rules:\n"
            "1. Output ONLY a valid JSON object matching the schema.\n"
            "2. Never hallucinate connections, specs, or functions not present in the facts.\n"
            "3. If unsure or if a fact is not in the data, state 'I am not sure based on current template facts' rather than guessing.\n"
            "4. Return schema:\n"
            "{\n"
            '  "componentId": string,\n'
            '  "componentName": string,\n'
            '  "answer": string,\n'
            '  "whyNeeded": string,\n'
            '  "followUpQuestions": [string, string, string]\n'
            "}"
        )

        user_content = (
            f"Component ID: {component_id}\n"
            f"User Question: \"{question}\"\n"
            f"Grounding Facts:\n{json.dumps(grounding_facts, indent=2)}"
        )

        payload = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 768,
            "system": system_prompt,
            "messages": [
                {"role": "user", "content": [{"type": "text", "text": user_content}]}
            ],
            "temperature": 0.15
        }

        try:
            response = bedrock_client.invoke_model(
                modelId=BEDROCK_MODEL_ID,
                body=json.dumps(payload)
            )
            resp_body = json.loads(response["body"].read().decode("utf-8"))
            raw_text = resp_body["content"][0]["text"].strip()
            if "{" in raw_text and "}" in raw_text:
                json_text = raw_text[raw_text.find("{"):raw_text.rfind("}")+1]
                result = json.loads(json_text)
            else:
                result = json.loads(raw_text)

            if not validate_schema(result):
                raise ValueError("Response failed schema verification")

        except Exception as bedrock_err:
            print(f"[Bedrock Fallback]: {str(bedrock_err)}")
            comp_name = grounding_facts.get("name", component_id)
            why = grounding_facts.get("why_needed", "Core system component.")
            desc = grounding_facts.get("detailed_description", "")
            result = {
                "componentId": component_id,
                "componentName": comp_name,
                "answer": f"{desc}\n\nKey Function: {why}",
                "whyNeeded": why,
                "followUpQuestions": [
                    f"What happens if {comp_name} fails in flight?",
                    f"Which components send electrical or signal inputs to {comp_name}?",
                    f"How do I mount and test {comp_name} on the bench?"
                ]
            }

        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps(result)
        }

    except Exception as e:
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": str(e)})
        }
