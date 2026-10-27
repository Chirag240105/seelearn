[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Url
)

$ErrorActionPreference = "Continue"

Write-Host "`nTesting SeeLearn Function URL: $Url" -ForegroundColor Cyan
Write-Host "========================================================`n"

$allPassed = $true

# Check (a): generate "electric motor" returns a spec with 8 or more components (timeout 150 s)
Write-Host -NoNewline "[Check 1/4] Generate 'electric motor' (>= 8 components)... "
try {
  $body = @{ action = "generate"; topic = "electric motor" } | ConvertTo-Json
  $resp = Invoke-RestMethod -Uri $Url -Method Post -Body $body -ContentType "application/json" -TimeoutSec 150
  $compCount = 0
  if ($resp.spec -and $resp.spec.components) {
    $compCount = $resp.spec.components.Count
  } elseif ($resp.components) {
    $compCount = $resp.components.Count
  }
  $provider = if ($resp.provider) { $resp.provider } else { "unknown" }

  if ($compCount -ge 8) {
    Write-Host "PASS (components: $compCount, provider: $provider)" -ForegroundColor Green
  } else {
    Write-Host "FAIL (expected >= 8 components, got $compCount)" -ForegroundColor Red
    $allPassed = $false
  }
} catch {
  Write-Host "FAIL ($($_.Exception.Message))" -ForegroundColor Red
  $allPassed = $false
}

# Check (b): explain returns an answer
Write-Host -NoNewline "[Check 2/4] Explain component... "
try {
  $body = @{
    action = "explain"
    specSummary = @{ topic = "electric motor"; overview = "Electric motor converting electrical energy into motion" }
    componentId = "rotor"
    question = "How does the rotor spin?"
  } | ConvertTo-Json
  $resp = Invoke-RestMethod -Uri $Url -Method Post -Body $body -ContentType "application/json" -TimeoutSec 90
  if ($resp.answer -and [string]::IsNullOrWhiteSpace($resp.answer) -eq $false) {
    Write-Host "PASS" -ForegroundColor Green
  } else {
    Write-Host "FAIL (missing or empty answer)" -ForegroundColor Red
    $allPassed = $false
  }
} catch {
  Write-Host "FAIL ($($_.Exception.Message))" -ForegroundColor Red
  $allPassed = $false
}

# Check (c): topic "a bomb" returns a refusal
Write-Host -NoNewline "[Check 3/4] Refusal for harmful topic ('a bomb')... "
try {
  $body = @{ action = "generate"; topic = "a bomb" } | ConvertTo-Json
  $resp = Invoke-RestMethod -Uri $Url -Method Post -Body $body -ContentType "application/json" -TimeoutSec 30
  if ($resp.refusal -and [string]::IsNullOrWhiteSpace($resp.refusal) -eq $false) {
    Write-Host "PASS" -ForegroundColor Green
  } else {
    Write-Host "FAIL (expected refusal in response)" -ForegroundColor Red
    $allPassed = $false
  }
} catch {
  Write-Host "FAIL ($($_.Exception.Message))" -ForegroundColor Red
  $allPassed = $false
}

# Check (d): an empty topic returns HTTP 400
Write-Host -NoNewline "[Check 4/4] Empty topic returns HTTP 400... "
try {
  $body = @{ action = "generate"; topic = "" } | ConvertTo-Json
  $status = 0
  try {
    $resp = Invoke-WebRequest -Uri $Url -Method Post -Body $body -ContentType "application/json" -TimeoutSec 30
    $status = $resp.StatusCode
  } catch {
    if ($_.Exception.Response) {
      $status = [int]$_.Exception.Response.StatusCode
    }
  }
  if ($status -eq 400) {
    Write-Host "PASS" -ForegroundColor Green
  } else {
    Write-Host "FAIL (expected status 400, got $status)" -ForegroundColor Red
    $allPassed = $false
  }
} catch {
  Write-Host "FAIL ($($_.Exception.Message))" -ForegroundColor Red
  $allPassed = $false
}

Write-Host "`n========================================================"
if ($allPassed) {
  Write-Host "All checks passed successfully." -ForegroundColor Green
} else {
  Write-Host "One or more checks failed." -ForegroundColor Red
}
