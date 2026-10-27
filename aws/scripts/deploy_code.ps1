[CmdletBinding()]
param(
  [string]$FunctionName = "seeLearn",
  [string]$Region = "us-east-1"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..\..")
$handlerPath = Join-Path $repoRoot "aws\lambdas\handler.py"

if (-not (Test-Path $handlerPath)) {
  Write-Error "Handler file '$handlerPath' not found."
  exit 1
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
$confirmation = Read-Host "`nType 'yes' to proceed with deploying code"
if ($confirmation -ne "yes") {
  Write-Host "Deployment cancelled."
  exit 0
}

$tempDir = Join-Path $env:TEMP ([System.IO.Path]::GetRandomFileName())
New-Item -ItemType Directory -Path $tempDir | Out-Null
$zipFile = Join-Path $env:TEMP ([System.IO.Path]::GetRandomFileName() + ".zip")

try {
  $targetFile = Join-Path $tempDir "lambda_function.py"
  Copy-Item -Path $handlerPath -Destination $targetFile
  Compress-Archive -Path $targetFile -DestinationPath $zipFile -Force

  $filebArg = "fileb://" + $zipFile.Replace("\", "/")
  Write-Host "Updating function code for $FunctionName..." -ForegroundColor Cyan

  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $output = (aws lambda update-function-code `
    --function-name $FunctionName `
    --region $Region `
    --zip-file $filebArg 2>&1) | Out-String
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $prevEap

  if ($exitCode -ne 0) {
    if ($output -match "AccessDenied") {
      Write-Host "`nThis IAM user cannot update Lambda. Use the console steps in aws/README.md." -ForegroundColor Red
    } else {
      Write-Host "`nFailed to update function code: $output" -ForegroundColor Red
    }
    exit 1
  }

  Write-Host "Waiting for function update to complete..." -ForegroundColor Cyan
  aws lambda wait function-updated --function-name $FunctionName --region $Region
  Write-Host "`nFunction code deployed successfully." -ForegroundColor Green
}
finally {
  if (Test-Path $tempDir) { Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue }
  if (Test-Path $zipFile) { Remove-Item -Path $zipFile -Force -ErrorAction SilentlyContinue }
}
