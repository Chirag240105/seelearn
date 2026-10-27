#!/usr/bin/env bash
# ==============================================================================
# SeeLearn Lambda Function URL deployment (SAM)
# ==============================================================================

set -e

STACK_NAME="seelearn-serverless"
REGION="${AWS_REGION:-us-east-1}"
MODEL_PROVIDER="${MODEL_PROVIDER:-gemini}"
GEMINI_API_KEY="${GEMINI_API_KEY:-}"
GEMINI_MODEL="${GEMINI_MODEL:-}"
BEDROCK_MODEL_ID="${BEDROCK_MODEL_ID:-}"
EXPLAIN_MODEL_ID="${EXPLAIN_MODEL_ID:-}"
ALLOWED_ORIGIN="${ALLOWED_ORIGIN:-*}"

echo "========================================================"
echo "    Deploying SeeLearn backend to AWS ($REGION)"
echo "========================================================"

# Check for AWS SAM CLI
if ! command -v sam &> /dev/null; then
    echo "ERROR: AWS SAM CLI is not installed."
    echo "Install SAM: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html"
    exit 1
fi

# Prompt for Gemini API key if not set and provider is gemini
if [ "$MODEL_PROVIDER" = "gemini" ] && [ -z "$GEMINI_API_KEY" ]; then
    echo ""
    read -rsp "Enter GEMINI_API_KEY (input hidden): " GEMINI_API_KEY
    echo ""
    if [ -z "$GEMINI_API_KEY" ]; then
        echo "ERROR: GEMINI_API_KEY is required when MODEL_PROVIDER=gemini."
        exit 1
    fi
fi

# Confirm AWS identity before deploying
echo ""
echo "Active AWS identity:"
aws sts get-caller-identity --region "$REGION"
echo ""
read -rp "Deploy to this account in $REGION? (y/N) " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "Deployment cancelled."
    exit 0
fi

# Build parameter overrides, skipping empty values
OVERRIDES="ModelProvider=$MODEL_PROVIDER BedrockRegion=$REGION AllowedOrigin=$ALLOWED_ORIGIN"
[ -n "$GEMINI_API_KEY" ]   && OVERRIDES="$OVERRIDES GeminiApiKey=$GEMINI_API_KEY"
[ -n "$GEMINI_MODEL" ]     && OVERRIDES="$OVERRIDES GeminiModel=$GEMINI_MODEL"
[ -n "$BEDROCK_MODEL_ID" ] && OVERRIDES="$OVERRIDES BedrockModelId=$BEDROCK_MODEL_ID"
[ -n "$EXPLAIN_MODEL_ID" ] && OVERRIDES="$OVERRIDES ExplainModelId=$EXPLAIN_MODEL_ID"

echo "[1/3] Building SAM serverless artifacts..."
sam build --template-file template.yaml

echo "[2/3] Deploying CloudFormation stack: $STACK_NAME ..."
if [ -f "samconfig.toml" ]; then
    sam deploy --stack-name "$STACK_NAME" --region "$REGION" --resolve-s3 \
        --capabilities CAPABILITY_IAM \
        --parameter-overrides $OVERRIDES \
        --no-fail-on-empty-changeset
else
    sam deploy --guided --stack-name "$STACK_NAME" --region "$REGION" --resolve-s3 \
        --capabilities CAPABILITY_IAM \
        --parameter-overrides $OVERRIDES
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
