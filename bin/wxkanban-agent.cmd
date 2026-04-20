@echo off
setlocal

rem wxkanban-agent — Windows wrapper for the orchestrator CLI
rem Spec 019 Decision #9: Node >= 20 required on PATH; this wrapper locates system Node.

set "SCRIPT_DIR=%~dp0"
set "KIT_ROOT=%SCRIPT_DIR%.."

where node >nul 2>&1
if errorlevel 1 (
  echo wxkanban-agent: 'node' not found on PATH. Install Node.js ^>= 20 from https://nodejs.org/ 1>&2
  exit /b 127
)

for /f "tokens=*" %%V in ('node -p "process.versions.node.split(^'.^')[0]"') do set "NODE_MAJOR=%%V"
if %NODE_MAJOR% LSS 20 (
  echo wxkanban-agent: Node.js ^>= 20 required 1>&2
  exit /b 1
)

node "%KIT_ROOT%\wxkanban-agent\apps\command-gateway\bin\wxai.mjs" %*
