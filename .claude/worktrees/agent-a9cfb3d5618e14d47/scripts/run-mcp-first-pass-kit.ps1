param(
    [string]$ReportPath = "mcp-health-output.json",
    [switch]$KeepContainer,
    [switch]$SkipDockerBuild
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

function Get-EnvValue([string]$Name) {
    $line = (Select-String -Path ".env" -Pattern "^$Name=" -ErrorAction SilentlyContinue | Select-Object -First 1).Line
    if (-not $line) {
        return $null
    }
    return ($line -replace "^$Name=", "").Trim()
}

$db = Get-EnvValue -Name "DATABASE_URL"
$token = Get-EnvValue -Name "WXKANBAN_API_TOKEN"
$apiKey = Get-EnvValue -Name "API_KEY"
$projectId = Get-EnvValue -Name "PROJECT_ID"

if (-not $db -or -not $token -or -not $apiKey -or -not $projectId) {
    throw "Missing required .env values. Required: DATABASE_URL, WXKANBAN_API_TOKEN, API_KEY, PROJECT_ID"
}

$enc = node -e "const crypto=require('crypto');const db=process.argv[1];const token=process.argv[2];const key=crypto.scryptSync(token,'wxkanban-kit-salt',32);const iv=crypto.randomBytes(16);const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);let out=cipher.update(db,'utf8','hex');out+=cipher.final('hex');const tag=cipher.getAuthTag();process.stdout.write(iv.toString('hex')+':' + tag.toString('hex') + ':' + out);" "$db" "$token"

if ($LASTEXITCODE -ne 0 -or -not $enc) {
    throw "Failed to generate encrypted DATABASE_URL"
}

$pwshInvocation = @(
    "-NoProfile",
    "-File",
    "scripts/mcp-command-validation.ps1",
    "-ProjectId", $projectId,
    "-ApiKey", $apiKey,
    "-DatabaseUrlEncrypted", $enc,
    "-WxkanbanApiToken", $token,
    "-ReportPath", $ReportPath
)

if ($KeepContainer) {
    $pwshInvocation += "-KeepContainer"
}

if ($SkipDockerBuild) {
    $pwshInvocation += "-SkipDockerBuild"
}

Write-Host "Running kit-style first pass with Docker..." -ForegroundColor Cyan
Write-Host "ProjectId: $projectId" -ForegroundColor Gray
Write-Host "ReportPath: $ReportPath" -ForegroundColor Gray

& pwsh @pwshInvocation

if ($LASTEXITCODE -ne 0) {
    throw "First pass failed. Check report at $ReportPath"
}

Write-Host "First pass complete. Report: $ReportPath" -ForegroundColor Green
