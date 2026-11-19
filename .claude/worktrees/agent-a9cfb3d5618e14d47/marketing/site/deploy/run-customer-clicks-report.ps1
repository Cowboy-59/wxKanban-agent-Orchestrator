# Wrapper invoked by the Windows Scheduled Task "wxKanban-ClickReport-Sat".
# Runs the customer-announce click report and logs output. Writes clicks-cust844.csv
# in the lambda dir (who clicked the tagged CTA, mapped back to each contact).
$ErrorActionPreference = "Continue"
$env:AWS_PROFILE = "Andy"
$env:AWS_REGION  = "us-east-1"

$lambdaDir = Join-Path $PSScriptRoot "lambda"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$log = Join-Path $lambdaDir "click-report-$stamp.log"

Set-Location $lambdaDir
"=== customer-announce click report @ $(Get-Date -Format o) ===" | Tee-Object -FilePath $log
node report-customer-clicks.mjs cust844 *>&1 | Tee-Object -FilePath $log -Append
"=== exit code: $LASTEXITCODE @ $(Get-Date -Format o) ===" | Tee-Object -FilePath $log -Append
