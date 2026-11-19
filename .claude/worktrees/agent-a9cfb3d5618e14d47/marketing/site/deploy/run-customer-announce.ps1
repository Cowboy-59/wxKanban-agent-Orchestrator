# Wrapper invoked by the Windows Scheduled Task "wxKanban-CustomerAnnounce-Sat".
# Runs the customer-announce blast (--send) and logs output. Self-contained:
# sets AWS creds/region, then runs the send script (which reads .env + DB itself).
$ErrorActionPreference = "Continue"
$env:AWS_PROFILE = "Andy"
$env:AWS_REGION  = "us-east-1"

$lambdaDir = Join-Path $PSScriptRoot "lambda"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$log = Join-Path $lambdaDir "scheduled-send-$stamp.log"

Set-Location $lambdaDir
"=== customer-announce scheduled send @ $(Get-Date -Format o) ===" | Tee-Object -FilePath $log
node send-customer-announce.mjs --send *>&1 | Tee-Object -FilePath $log -Append
"=== exit code: $LASTEXITCODE @ $(Get-Date -Format o) ===" | Tee-Object -FilePath $log -Append
