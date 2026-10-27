param(
  [string]$StackName = "seelearn-serverless",
  [string]$Region = $(if ($env:AWS_REGION) { $env:AWS_REGION } else { "us-east-1" }),
  [string]$ModelProvider = $(if ($env:MODEL_PROVIDER) { $env:MODEL_PROVIDER } else { "gemini" }),
  [string]$GeminiModel = $env:GEMINI_MODEL,
  [string]$BedrockModelId = $env:BEDROCK_MODEL_ID,
  [string]$ExplainModelId = $env:EXPLAIN_MODEL_ID,
  [string]$AllowedOrigin = $(if ($env:ALLOWED_ORIGIN) { $env:ALLOWED_ORIGIN } else { "*" })
)

$ErrorActionPreference = "Stop"
if (-not (Get-Command sam -ErrorAction SilentlyContinue)) { throw "AWS SAM CLI is not installed." }

# Read Gemini API key from environment or secure prompt
$GeminiApiKey = $env:GEMINI_API_KEY
if ($ModelProvider -eq "gemini" -and [string]::IsNullOrWhiteSpace($GeminiApiKey)) {
  $secure = Read-Host -Prompt "Enter GEMINI_API_KEY" -AsSecureString
  $GeminiApiKey = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  )
  if ([string]::IsNullOrWhiteSpace($GeminiApiKey)) { throw "GEMINI_API_KEY is required when MODEL_PROVIDER=gemini." }
}

# Confirm AWS identity
Write-Host "`nActive AWS identity:" -ForegroundColor Cyan
aws sts get-caller-identity --region $Region
$confirm = Read-Host "`nDeploy to this account in ${Region}? (y/N)"
if ($confirm -notin @("y", "Y")) { Write-Host "Deployment cancelled."; exit 0 }

# Build parameter overrides, skipping empty values
$overrides = @("ModelProvider=$ModelProvider", "BedrockRegion=$Region", "AllowedOrigin=$AllowedOrigin")
if ($GeminiApiKey)   { $overrides += "GeminiApiKey=$GeminiApiKey" }
if ($GeminiModel)    { $overrides += "GeminiModel=$GeminiModel" }
if ($BedrockModelId) { $overrides += "BedrockModelId=$BedrockModelId" }
if ($ExplainModelId) { $overrides += "ExplainModelId=$ExplainModelId" }

sam build --template-file template.yaml
if (Test-Path "samconfig.toml") {
  sam deploy --stack-name $StackName --region $Region --resolve-s3 --capabilities CAPABILITY_IAM `
    --parameter-overrides @overrides --no-fail-on-empty-changeset
} else {
  sam deploy --guided --stack-name $StackName --region $Region --resolve-s3 --capabilities CAPABILITY_IAM `
    --parameter-overrides @overrides
}

$url = aws cloudformation describe-stacks --stack-name $StackName --region $Region `
  --query "Stacks[0].Outputs[?OutputKey=='FunctionUrl'].OutputValue" --output text
Write-Host "`n========================================================"
Write-Host "SeeLearn AWS deployment complete."
Write-Host "Function URL: $url"
Write-Host "Set in frontend .env: VITE_AWS_API_ENDPOINT=`"$url`""
Write-Host "========================================================"
