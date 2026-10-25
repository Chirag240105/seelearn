#!/usr/bin/env bash
# ==============================================================================
# SeeLearn AWS Serverless Deployment Script
# Provisions API Gateway, Lambdas, DynamoDB, Bedrock IAM & CloudFront
# ==============================================================================

set -e

STACK_NAME="seelearn-serverless"
REGION="${AWS_REGION:-us-east-1}"
BEDROCK_MODEL_ID="${BEDROCK_MODEL_ID:-anthropic.claude-3-haiku-20240307-v1:0}"

echo "========================================================"
echo "    Deploying SeeLearn Architecture to AWS ($REGION)    "
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
sam deploy \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --resolve-s3 \
    --capabilities CAPABILITY_IAM \
    --parameter-overrides BedrockModelId="$BEDROCK_MODEL_ID" BedrockRegion="$REGION" \
    --no-fail-on-empty-changeset

echo "[3/3] Retrieving API Gateway endpoint..."
API_ENDPOINT=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" \
    --output text)

echo "========================================================"
echo "✅ SeeLearn AWS Deployment Complete!"
echo "API Gateway Endpoint: $API_ENDPOINT"
echo "Set in frontend .env: VITE_AWS_API_ENDPOINT=\"$API_ENDPOINT\""
echo "========================================================"
