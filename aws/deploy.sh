#!/usr/bin/env bash
# ==============================================================================
# SeeLearn Lambda Function URL deployment
# ==============================================================================

set -e

STACK_NAME="seelearn-serverless"
REGION="${AWS_REGION:-us-east-1}"
BEDROCK_MODEL_ID="${BEDROCK_MODEL_ID:-}"
MODEL_PROVIDER="${MODEL_PROVIDER:-bedrock}"
GEMINI_API_KEY="${GEMINI_API_KEY:-}"

echo "========================================================"
echo "    Deploying SeeLearn backend to AWS ($REGION)    "
echo "========================================================"

# Check for AWS SAM CLI
if ! command -v sam &> /dev/null; then
    echo "ERROR: AWS SAM CLI is not installed."
    echo "Install SAM: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html"
    exit 1
fi

echo "[1/3] Building SAM serverless artifacts..."
sam build --template-file template.yaml

echo "[2/3] Deploying CloudFormation stack: $STACK_NAME ..."
if [ -f "samconfig.toml" ]; then
    sam deploy --stack-name "$STACK_NAME" --region "$REGION" --resolve-s3 \
        --capabilities CAPABILITY_IAM \
        --parameter-overrides BedrockModelId="$BEDROCK_MODEL_ID" ModelProvider="$MODEL_PROVIDER" \
        GeminiApiKey="$GEMINI_API_KEY" BedrockRegion="$REGION" \
        --no-fail-on-empty-changeset
else
    sam deploy --guided --stack-name "$STACK_NAME" --region "$REGION" --resolve-s3 \
        --capabilities CAPABILITY_IAM \
        --parameter-overrides BedrockModelId="$BEDROCK_MODEL_ID" ModelProvider="$MODEL_PROVIDER" \
        GeminiApiKey="$GEMINI_API_KEY" BedrockRegion="$REGION"
fi

echo "[3/3] Retrieving Function URL..."
FUNCTION_URL=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='FunctionUrl'].OutputValue" \
    --output text)

echo "========================================================"
echo "SeeLearn AWS deployment complete."
echo "Function URL: $FUNCTION_URL"
echo "Set in frontend .env: VITE_AWS_API_ENDPOINT=\"$FUNCTION_URL\""
echo "========================================================"
