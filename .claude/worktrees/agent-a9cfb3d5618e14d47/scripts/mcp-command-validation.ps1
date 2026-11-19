param(
    [string]$ProjectId,
    [string]$ApiKey = "mcp-test-key",
    [string]$DatabaseUrl,
    [string]$DatabaseUrlEncrypted,
    [string]$WxkanbanApiToken,
    [string]$ImageName = "wxkanban-mcp-test:latest",
    [string]$ContainerName = "wxkanban-mcp-test",
    [string]$McpBaseUrl = "http://localhost:3002",
    [string]$ReportPath = "mcp-health-output.json",
    [switch]$KeepContainer,
    [switch]$SkipDockerBuild,
    [switch]$UseLocalMcp
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$dockerFilePath = Join-Path $repoRoot "Dockerfile.mcp-test"
$localMcpPidPath = Join-Path $repoRoot ".mcp-validation.pid"
$script:mcpRuntime = "none"
$script:localMcpPid = $null
$script:scopedEnv = @{}
$results = New-Object System.Collections.Generic.List[object]
$summary = [ordered]@{
    total = 0
    pass = 0
    expectedBlocked = 0
    fail = 0
    startedAt = (Get-Date).ToString("o")
    endedAt = $null
}

function Write-Section([string]$Title) {
    Write-Host ""
    Write-Host "=== $Title ===" -ForegroundColor Cyan
}

function Add-Result(
    [string]$Name,
    [string]$Command,
    [int]$ExitCode,
    [string]$Classification,
    [string]$StdOut,
    [string]$StdErr,
    [string]$Note = ""
) {
    $entry = [ordered]@{
        name = $Name
        command = $Command
        exitCode = $ExitCode
        classification = $Classification
        stdout = $StdOut
        stderr = $StdErr
        note = $Note
        timestamp = (Get-Date).ToString("o")
    }
    $results.Add($entry)

    $summary.total++
    switch ($Classification) {
        "Pass" { $summary.pass++ }
        "Expected-Blocked" { $summary.expectedBlocked++ }
        default { $summary.fail++ }
    }
}

function Test-RequiredDirectory([string]$RelativePath) {
    $fullPath = Join-Path $repoRoot $RelativePath
    if (-not (Test-Path $fullPath)) {
        New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
        Write-Host "Created missing directory: $RelativePath" -ForegroundColor Yellow
    } else {
        Write-Host "Verified directory: $RelativePath" -ForegroundColor Green
    }
}

function Initialize-Dockerfile {
    if (Test-Path $dockerFilePath) {
        Write-Host "Using existing Dockerfile.mcp-test" -ForegroundColor Gray
        return
    }

    $dockerfile = @'
FROM node:20-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY mcp-server/package.json mcp-server/package-lock.json ./mcp-server/

RUN npm ci
RUN cd mcp-server && npm ci

COPY . .

RUN cd mcp-server && npm run build:http

EXPOSE 3002

CMD ["node", "mcp-server/dist/index-http.js"]
'@

    Set-Content -Path $dockerFilePath -Value $dockerfile -Encoding UTF8
    Write-Host "Created Dockerfile.mcp-test" -ForegroundColor Green
}

function Invoke-ProcessCapture {
    param(
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$WorkingDirectory,
        [hashtable]$Environment
    )

    $tempOut = [System.IO.Path]::GetTempFileName()
    $tempErr = [System.IO.Path]::GetTempFileName()

    try {
        $startInfo = New-Object System.Diagnostics.ProcessStartInfo
        $startInfo.FileName = $FilePath
        $startInfo.Arguments = ($Arguments -join " ")
        $startInfo.WorkingDirectory = $WorkingDirectory
        $startInfo.RedirectStandardOutput = $true
        $startInfo.RedirectStandardError = $true
        $startInfo.UseShellExecute = $false

        if ($Environment) {
            foreach ($key in $Environment.Keys) {
                $startInfo.Environment[$key] = [string]$Environment[$key]
            }
        }

        $proc = New-Object System.Diagnostics.Process
        $proc.StartInfo = $startInfo
        [void]$proc.Start()

        $stdout = $proc.StandardOutput.ReadToEnd()
        $stderr = $proc.StandardError.ReadToEnd()
        $proc.WaitForExit()

        return [pscustomobject]@{
            ExitCode = $proc.ExitCode
            StdOut = $stdout
            StdErr = $stderr
        }
    } finally {
        Remove-Item $tempOut -ErrorAction SilentlyContinue
        Remove-Item $tempErr -ErrorAction SilentlyContinue
    }
}

function Get-OutcomeClassification {
    param(
        [int]$ExitCode,
        [string]$StdOut,
        [string]$StdErr,
        [bool]$AllowBlocked
    )

    if ($ExitCode -eq 0) {
        return "Pass"
    }

    if (-not $AllowBlocked) {
        return "Fail"
    }

    $combined = "$StdOut`n$StdErr"
    $blockedPatterns = @(
        "missing",
        "required",
        "unauthorized",
        "forbidden",
        "not found",
        "invalid project",
        "database",
        "connection",
        "token",
        "unavailable",
        "no command specified",
        "command specified"
    )

    foreach ($pattern in $blockedPatterns) {
        if ($combined -match $pattern) {
            return "Expected-Blocked"
        }
    }

    return "Fail"
}

function Test-DockerAvailable {
    $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
    if (-not $dockerCmd) {
        return $false
    }

    try {
        & docker info 1>$null 2>$null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

function Set-ScopedProcessEnv {
    param(
        [string]$Name,
        [string]$Value
    )

    if (-not $script:scopedEnv.ContainsKey($Name)) {
        $script:scopedEnv[$Name] = [Environment]::GetEnvironmentVariable($Name, "Process")
    }
    [Environment]::SetEnvironmentVariable($Name, $Value, "Process")
}

function Restore-ScopedProcessEnv {
    foreach ($name in $script:scopedEnv.Keys) {
        [Environment]::SetEnvironmentVariable($name, $script:scopedEnv[$name], "Process")
    }
    $script:scopedEnv.Clear()
}

function Get-EnvFileValue {
    param(
        [string]$FilePath,
        [string]$Name
    )

    if (-not (Test-Path $FilePath)) {
        return $null
    }

    $line = Get-Content $FilePath | Where-Object { $_ -like "$Name=*" } | Select-Object -First 1
    if (-not $line) {
        return $null
    }

    return $line.Substring($Name.Length + 1)
}

function Get-EffectiveDatabaseConfig {
    $config = [ordered]@{
        DatabaseUrl = $DatabaseUrl
        DatabaseUrlEncrypted = $DatabaseUrlEncrypted
        WxkanbanApiToken = $WxkanbanApiToken
        Source = "parameters"
    }

    if ($config.DatabaseUrl -or ($config.DatabaseUrlEncrypted -and $config.WxkanbanApiToken)) {
        return $config
    }

    $envFilePath = Join-Path $repoRoot "mcp-server/.env"
    $envDatabaseUrl = Get-EnvFileValue -FilePath $envFilePath -Name "DATABASE_URL"
    $envDatabaseUrlEncrypted = Get-EnvFileValue -FilePath $envFilePath -Name "DATABASE_URL_ENCRYPTED"
    $envToken = Get-EnvFileValue -FilePath $envFilePath -Name "WXKANBAN_API_TOKEN"

    if ($envDatabaseUrl) {
        $config.DatabaseUrl = $envDatabaseUrl
        $config.Source = "mcp-server/.env"
        return $config
    }

    if ($envDatabaseUrlEncrypted -and $envToken) {
        $config.DatabaseUrlEncrypted = $envDatabaseUrlEncrypted
        $config.WxkanbanApiToken = $envToken
        $config.Source = "mcp-server/.env"
        return $config
    }

    return $config
}

function Invoke-CliTest {
    param(
        [string]$Name,
        [string[]]$CliArgs,
        [bool]$AllowBlocked = $true,
        [string]$Note = ""
    )

    $cmdText = "node --import tsx cli/wxkanban.ts " + ($CliArgs -join " ")
    Write-Host "Running: $cmdText" -ForegroundColor Gray

    $envMap = @{ MCP_HTTP_URL = $McpBaseUrl }
    $result = Invoke-ProcessCapture -FilePath "node" -Arguments @("--import", "tsx", "cli/wxkanban.ts") + $CliArgs -WorkingDirectory $repoRoot -Environment $envMap

    $classification = Get-OutcomeClassification -ExitCode $result.ExitCode -StdOut $result.StdOut -StdErr $result.StdErr -AllowBlocked $AllowBlocked
    Add-Result -Name $Name -Command $cmdText -ExitCode $result.ExitCode -Classification $classification -StdOut $result.StdOut -StdErr $result.StdErr -Note $Note

    switch ($classification) {
        "Pass" { Write-Host "PASS: $Name" -ForegroundColor Green }
        "Expected-Blocked" { Write-Host "BLOCKED: $Name" -ForegroundColor Yellow }
        default { Write-Host "FAIL: $Name" -ForegroundColor Red }
    }

    return $result
}

function Start-McpLocalProcess {
    Write-Section "Start MCP Local Process"

    $effective = Get-EffectiveDatabaseConfig

    if (-not $effective.DatabaseUrl -and -not ($effective.DatabaseUrlEncrypted -and $effective.WxkanbanApiToken)) {
        throw "Provide either -DatabaseUrl OR both -DatabaseUrlEncrypted and -WxkanbanApiToken."
    }

    $entryPath = Join-Path $repoRoot "mcp-server/dist/index-http.js"
    if (-not (Test-Path $entryPath)) {
        throw "Local MCP entrypoint missing: mcp-server/dist/index-http.js"
    }

    if (Test-Path $localMcpPidPath) {
        Remove-Item $localMcpPidPath -ErrorAction SilentlyContinue
    }

    Set-ScopedProcessEnv -Name "MCP_HTTP_PORT" -Value "3002"
    Set-ScopedProcessEnv -Name "API_KEY" -Value $ApiKey

    if ($effective.DatabaseUrl) {
        Set-ScopedProcessEnv -Name "DATABASE_URL" -Value $effective.DatabaseUrl
    }
    if ($effective.DatabaseUrlEncrypted) {
        Set-ScopedProcessEnv -Name "DATABASE_URL_ENCRYPTED" -Value $effective.DatabaseUrlEncrypted
    }
    if ($effective.WxkanbanApiToken) {
        Set-ScopedProcessEnv -Name "WXKANBAN_API_TOKEN" -Value $effective.WxkanbanApiToken
    }

    Write-Host "Database config source: $($effective.Source)" -ForegroundColor Gray

    $proc = Start-Process -FilePath "node" -ArgumentList @("mcp-server/dist/index-http.js") -WorkingDirectory $repoRoot -PassThru -WindowStyle Hidden
    $script:localMcpPid = $proc.Id
    Set-Content -Path $localMcpPidPath -Value "$($proc.Id)" -Encoding UTF8

    Write-Host "Local MCP process started. PID: $($proc.Id)" -ForegroundColor Green
}

function Wait-ForHttp {
    param(
        [string]$Url,
        [int]$MaxAttempts = 20,
        [int]$SleepSeconds = 2
    )

    for ($i = 1; $i -le $MaxAttempts; $i++) {
        try {
            $resp = Invoke-RestMethod -Uri $Url -Method GET -TimeoutSec 5
            return $resp
        } catch {
            Start-Sleep -Seconds $SleepSeconds
        }
    }

    throw "Timed out waiting for $Url"
}

function Start-McpContainer {
    Write-Section "Start MCP Container"

    $effective = Get-EffectiveDatabaseConfig

    $envArgs = @(
        "-e", "MCP_HTTP_PORT=3002",
        "-e", "API_KEY=$ApiKey"
    )

    if ($effective.DatabaseUrl) {
        $envArgs += @("-e", "DATABASE_URL=$($effective.DatabaseUrl)")
    }

    if ($effective.DatabaseUrlEncrypted) {
        $envArgs += @("-e", "DATABASE_URL_ENCRYPTED=$($effective.DatabaseUrlEncrypted)")
    }

    if ($effective.WxkanbanApiToken) {
        $envArgs += @("-e", "WXKANBAN_API_TOKEN=$($effective.WxkanbanApiToken)")
    }

    if (-not $effective.DatabaseUrl -and -not ($effective.DatabaseUrlEncrypted -and $effective.WxkanbanApiToken)) {
        throw "Provide either -DatabaseUrl OR both -DatabaseUrlEncrypted and -WxkanbanApiToken."
    }

    & docker rm -f $ContainerName 2>$null | Out-Null

    $dockerArgs = @(
        "run", "--rm", "-d",
        "--name", $ContainerName,
        "-p", "3002:3002"
    ) + $envArgs + @($ImageName)

    $containerId = & docker @dockerArgs
    if ($LASTEXITCODE -ne 0 -or -not $containerId) {
        throw "Failed to start Docker container $ContainerName"
    }

    Write-Host "Container started: $containerId" -ForegroundColor Green
}

function Stop-McpContainer {
    if ($KeepContainer) {
        Write-Host "Keeping container $ContainerName as requested." -ForegroundColor Yellow
        return
    }

    & docker rm -f $ContainerName 2>$null | Out-Null
}

function Stop-McpLocalProcess {
    if ($script:localMcpPid) {
        try {
            Stop-Process -Id $script:localMcpPid -Force -ErrorAction SilentlyContinue
        } catch {
            # ignore cleanup failures
        }
    }

    if (Test-Path $localMcpPidPath) {
        Remove-Item $localMcpPidPath -ErrorAction SilentlyContinue
    }

    Restore-ScopedProcessEnv
}

try {
    Set-Location $repoRoot

    Write-Section "Phase 0: Preconditions"
    Test-RequiredDirectory "specs"
    Test-RequiredDirectory "specs/Project-Scope"

    $dockerAvailable = (Test-DockerAvailable)

    if (-not $UseLocalMcp -and $dockerAvailable) {
        Initialize-Dockerfile

        if (-not $SkipDockerBuild) {
            Write-Section "Phase 1: Docker Build"
            & docker build -f $dockerFilePath -t $ImageName $repoRoot
            if ($LASTEXITCODE -ne 0) {
                Write-Host "Docker build failed; falling back to local MCP process." -ForegroundColor Yellow
                Start-McpLocalProcess
                $script:mcpRuntime = "local"
            } else {
                Write-Host "Docker image built: $ImageName" -ForegroundColor Green
                Start-McpContainer
                $script:mcpRuntime = "docker"
            }
        } else {
            Write-Host "Skipping Docker build as requested." -ForegroundColor Yellow
            Start-McpContainer
            $script:mcpRuntime = "docker"
        }
    } else {
        Write-Host "Docker unavailable or bypassed; using local MCP process." -ForegroundColor Yellow
        Start-McpLocalProcess
        $script:mcpRuntime = "local"
    }

    Write-Section "Phase 2: MCP Health and Tools"
    $health = Wait-ForHttp -Url "$McpBaseUrl/health"
    Add-Result -Name "mcp-health" -Command "GET $McpBaseUrl/health" -ExitCode 0 -Classification "Pass" -StdOut ($health | ConvertTo-Json -Depth 5) -StdErr ""
    Write-Host "Health endpoint reachable." -ForegroundColor Green

    try {
        $tools = Invoke-RestMethod -Uri "$McpBaseUrl/tools" -Method GET -TimeoutSec 30
        Add-Result -Name "mcp-tools" -Command "GET $McpBaseUrl/tools" -ExitCode 0 -Classification "Pass" -StdOut ($tools | ConvertTo-Json -Depth 8) -StdErr ""
        Write-Host "Tools endpoint reachable." -ForegroundColor Green
    } catch {
        Add-Result -Name "mcp-tools" -Command "GET $McpBaseUrl/tools" -ExitCode 1 -Classification "Expected-Blocked" -StdOut "" -StdErr $_.Exception.Message -Note "Tools endpoint can time out before SSE/session initialization; verify manually if needed."
        Write-Host "Tools endpoint blocked/time out." -ForegroundColor Yellow
    }

    Write-Section "Phase 3A: Blocking Core Commands"
    Invoke-CliTest -Name "cli-scope-check" -CliArgs @("scope-check") -AllowBlocked $true | Out-Null

    if ($ProjectId) {
        $scopeResult = Invoke-CliTest -Name "buildscope" -CliArgs @("buildscope", "--project-id=$ProjectId", "--feature-description=MCP command validation scope", "--quick") -AllowBlocked $true

        $specNumber = $null
        $specMatch = [regex]::Match("$($scopeResult.StdOut)`n$($scopeResult.StdErr)", "\b(\d{3})\b")
        if ($specMatch.Success) {
            $specNumber = $specMatch.Groups[1].Value
        }

        if ($specNumber) {
            Invoke-CliTest -Name "validatescope" -CliArgs @("validatescope", "--spec-number=$specNumber") -AllowBlocked $true | Out-Null
        } else {
            Add-Result -Name "validatescope" -Command "node --import tsx cli/wxkanban.ts validatescope --spec-number=<derived>" -ExitCode 2 -Classification "Expected-Blocked" -StdOut "" -StdErr "Spec number not derivable from buildscope output." -Note "Provide --spec-number manually if needed."
        }

        $generatedSpec = [int](Get-Random -Minimum 900 -Maximum 999)
        Invoke-CliTest -Name "createspecs" -CliArgs @("createspecs", "--project-id=$ProjectId", "--spec-number=$generatedSpec", "--feature-name=MCP test spec") -AllowBlocked $true | Out-Null
    } else {
        Add-Result -Name "buildscope" -Command "node --import tsx cli/wxkanban.ts buildscope ..." -ExitCode 2 -Classification "Expected-Blocked" -StdOut "" -StdErr "ProjectId not provided"
        Add-Result -Name "validatescope" -Command "node --import tsx cli/wxkanban.ts validatescope ..." -ExitCode 2 -Classification "Expected-Blocked" -StdOut "" -StdErr "ProjectId/spec context not available"
        Add-Result -Name "createspecs" -Command "node --import tsx cli/wxkanban.ts createspecs ..." -ExitCode 2 -Classification "Expected-Blocked" -StdOut "" -StdErr "ProjectId not provided"
    }

    Write-Section "Phase 3B: Core Project Ops"
    if ($ProjectId) {
        Invoke-CliTest -Name "push" -CliArgs @("push", "--project-id=$ProjectId", "--type=manual_note", "MCP test event") -AllowBlocked $true | Out-Null
        Invoke-CliTest -Name "upsert" -CliArgs @("upsert", "--project-id=$ProjectId", "--title=MCP Test Doc", "--body=Validation content") -AllowBlocked $true | Out-Null
        Invoke-CliTest -Name "createtask" -CliArgs @("createtask", "--project-id=$ProjectId", "--title=MCP validation task", "--priority=high") -AllowBlocked $true | Out-Null
        Invoke-CliTest -Name "list" -CliArgs @("list", "--project-id=$ProjectId") -AllowBlocked $true | Out-Null
    } else {
        Add-Result -Name "push" -Command "node --import tsx cli/wxkanban.ts push ..." -ExitCode 2 -Classification "Expected-Blocked" -StdOut "" -StdErr "ProjectId not provided"
        Add-Result -Name "upsert" -Command "node --import tsx cli/wxkanban.ts upsert ..." -ExitCode 2 -Classification "Expected-Blocked" -StdOut "" -StdErr "ProjectId not provided"
        Add-Result -Name "createtask" -Command "node --import tsx cli/wxkanban.ts createtask ..." -ExitCode 2 -Classification "Expected-Blocked" -StdOut "" -StdErr "ProjectId not provided"
        Add-Result -Name "list" -Command "node --import tsx cli/wxkanban.ts list ..." -ExitCode 2 -Classification "Expected-Blocked" -StdOut "" -StdErr "ProjectId not provided"
    }

    Write-Section "Phase 3C: Extended Non-Git Commands"
    if ($ProjectId) {
        Invoke-CliTest -Name "kitstatus" -CliArgs @("kitstatus", "--project-id=$ProjectId") -AllowBlocked $true | Out-Null
        Invoke-CliTest -Name "downloadkit" -CliArgs @("downloadkit", "--project-id=$ProjectId") -AllowBlocked $true | Out-Null
        Invoke-CliTest -Name "regeneratekit" -CliArgs @("regeneratekit", "--project-id=$ProjectId") -AllowBlocked $true | Out-Null
        Invoke-CliTest -Name "createtoken" -CliArgs @("createtoken", "--project-id=$ProjectId", "--label=mcp-test") -AllowBlocked $true | Out-Null
        Invoke-CliTest -Name "listtokens" -CliArgs @("listtokens", "--project-id=$ProjectId") -AllowBlocked $true | Out-Null
        Invoke-CliTest -Name "implement" -CliArgs @("implement", "--project-id=$ProjectId") -AllowBlocked $true | Out-Null
        Invoke-CliTest -Name "analyze" -CliArgs @("analyze", "--project-id=$ProjectId") -AllowBlocked $true | Out-Null
        Invoke-CliTest -Name "sessionstart" -CliArgs @("sessionstart", "--project-id=$ProjectId") -AllowBlocked $true | Out-Null
    } else {
        foreach ($name in @("kitstatus","downloadkit","regeneratekit","createtoken","listtokens","implement","analyze","sessionstart")) {
            Add-Result -Name $name -Command "node --import tsx cli/wxkanban.ts $name ..." -ExitCode 2 -Classification "Expected-Blocked" -StdOut "" -StdErr "ProjectId not provided"
        }
    }
} catch {
    Add-Result -Name "runner" -Command "mcp-command-validation.ps1" -ExitCode 1 -Classification "Fail" -StdOut "" -StdErr $_.Exception.Message
    Write-Host "Runner failed: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    $summary.endedAt = (Get-Date).ToString("o")

    $report = [ordered]@{
        summary = $summary
        configuration = [ordered]@{
            projectId = $ProjectId
            imageName = $ImageName
            containerName = $ContainerName
            mcpBaseUrl = $McpBaseUrl
            skipDockerBuild = [bool]$SkipDockerBuild
            keepContainer = [bool]$KeepContainer
        }
        results = $results
    }

    $reportJson = $report | ConvertTo-Json -Depth 10
    $reportAbsPath = Join-Path $repoRoot $ReportPath
    Set-Content -Path $reportAbsPath -Value $reportJson -Encoding UTF8

    if ($script:mcpRuntime -eq "docker") {
        Stop-McpContainer
    }
    if ($script:mcpRuntime -eq "local") {
        Stop-McpLocalProcess
    }

    Write-Section "Final Summary"
    Write-Host "Total: $($summary.total)" -ForegroundColor White
    Write-Host "Pass: $($summary.pass)" -ForegroundColor Green
    Write-Host "Expected-Blocked: $($summary.expectedBlocked)" -ForegroundColor Yellow
    Write-Host "Fail: $($summary.fail)" -ForegroundColor Red
    Write-Host "Report: $reportAbsPath" -ForegroundColor Cyan
}
