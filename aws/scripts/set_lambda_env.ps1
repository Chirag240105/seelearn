[CmdletBinding()]
param(
  [string]$FunctionName = "seeLearn",
  [string]$Region = "us-east-1",
  [string]$EnvFile = "aws/.env"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $EnvFile)) {
  Write-Error "Env file '$EnvFile' does not exist."
  exit 1
}

$variables = @{}
Get-Content -Path $EnvFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) {
    return
  }
  $idx = $line.IndexOf("=")
  if ($idx -lt 0) {
    return
  }
  $key = $line.Substring(0, $idx).Trim()
  $val = $line.Substring($idx + 1).Trim()
  if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
    if ($val.Length -ge 2) {
      $val = $val.Substring(1, $val.Length - 2).Trim()
    }
  }
  if ($key) {
    $variables[$key] = $val
  }
}

# Validate settings
$provider = $variables["MODEL_PROVIDER"]
if ([string]::IsNullOrWhiteSpace($provider)) {
  $provider = "gemini"
  $variables["MODEL_PROVIDER"] = "gemini"
}
$provider = $provider.ToLower()
if ($provider -ne "gemini" -and $provider -ne "bedrock") {
  Write-Error "Validation failed: MODEL_PROVIDER must be 'gemini' or 'bedrock', found '$provider'."
  exit 1
}

if ($provider -eq "gemini") {
  $model = $variables["GEMINI_MODEL"]
  if ([string]::IsNullOrWhiteSpace($model)) {
    Write-Error "Validation failed: GEMINI_MODEL must be non-empty when MODEL_PROVIDER=gemini."
    exit 1
  }
  if ($model.Contains(" ")) {
    Write-Error "Validation failed: GEMINI_MODEL must not contain spaces ('$model')."
    exit 1
  }
  $apiKey = $variables["GEMINI_API_KEY"]
  if ([string]::IsNullOrWhiteSpace($apiKey)) {
    Write-Error "Validation failed: GEMINI_API_KEY must be non-empty when MODEL_PROVIDER=gemini."
    exit 1
  }
}

# Caller identity confirmation
Write-Host "`nAWS Caller Identity:" -ForegroundColor Cyan
aws sts get-caller-identity --region $Region
if ($LASTEXITCODE -ne 0) {
  Write-Error "Failed to retrieve AWS caller identity."
  exit 1
}

Write-Host "Target Function: $FunctionName" -ForegroundColor Yellow
Write-Host "Target Region:   $Region" -ForegroundColor Yellow
$confirmation = Read-Host "`nType 'yes' to proceed with updating function configuration"
if ($confirmation -ne "yes") {
  Write-Host "Deployment cancelled."
  exit 0
}

# Temporary configuration payload in $env:TEMP
$tempFile = [System.IO.Path]::Combine($env:TEMP, [System.IO.Path]::GetRandomFileName() + ".json")
try {
  $payload = @{
    Variables = $variables
  }
  $jsonContent = $payload | ConvertTo-Json -Compress
  Set-Content -Path $tempFile -Value $jsonContent -Encoding utf8

  $fileArg = "file://" + $tempFile.Replace("\", "/")
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $output = (aws lambda update-function-configuration `
    --function-name $FunctionName `
    --region $Region `
    --environment $fileArg `
    --timeout 150 `
    --memory-size 512 2>&1) | Out-String
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $prevEap

  if ($exitCode -ne 0) {
    if ($output -match "AccessDenied") {
      Write-Host "`nThis IAM user cannot update Lambda. Use the console steps in aws/README.md." -ForegroundColor Red
    } else {
      Write-Host "`nFailed to update Lambda configuration: $output" -ForegroundColor Red
    }
    exit 1
  }

  Write-Host "`nLambda configuration updated successfully." -ForegroundColor Green
  Write-Host "Variables set: $($variables.Keys -join ', ')"
  if ($variables.ContainsKey("GEMINI_API_KEY")) {
    $rawKey = $variables["GEMINI_API_KEY"]
    $last4 = if ($rawKey.Length -ge 4) { $rawKey.Substring($rawKey.Length - 4) } else { "****" }
    Write-Host "GEMINI_API_KEY: ...$last4"
  }
}
finally {
  if (Test-Path $tempFile) {
    Remove-Item -Path $tempFile -Force -ErrorAction SilentlyContinue
  }
}
