param(
  [string]$StackName = "seelearn-serverless",
  [string]$Region = $(if ($env:AWS_REGION) { $env:AWS_REGION } else { "us-east-1" }),
  [string]$BedrockModelId = $env:BEDROCK_MODEL_ID,
  [string]$ModelProvider = $(if ($env:MODEL_PROVIDER) { $env:MODEL_PROVIDER } else { "bedrock" }),
  [string]$GeminiApiKey = $env:GEMINI_API_KEY
)

$ErrorActionPreference = "Stop"
if (-not (Get-Command sam -ErrorAction SilentlyContinue)) { throw "AWS SAM CLI is not installed." }
sam build --template-file template.yaml
if (Test-Path "samconfig.toml") {
  sam deploy --stack-name $StackName --region $Region --resolve-s3 --capabilities CAPABILITY_IAM `
    --parameter-overrides "BedrockModelId=$BedrockModelId" "ModelProvider=$ModelProvider" `
      "GeminiApiKey=$GeminiApiKey" "BedrockRegion=$Region" --no-fail-on-empty-changeset
} else {
  sam deploy --guided --stack-name $StackName --region $Region --resolve-s3 --capabilities CAPABILITY_IAM `
    --parameter-overrides "BedrockModelId=$BedrockModelId" "ModelProvider=$ModelProvider" `
      "GeminiApiKey=$GeminiApiKey" "BedrockRegion=$Region"
}
$url = aws cloudformation describe-stacks --stack-name $StackName --region $Region `
  --query "Stacks[0].Outputs[?OutputKey=='FunctionUrl'].OutputValue" --output text
Write-Host "Function URL: $url"
Write-Host "Set in frontend .env: VITE_AWS_API_ENDPOINT=`"$url`""
