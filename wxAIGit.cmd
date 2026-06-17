@echo off
REM [SCOPE 058 / T025] Windows launcher for wxAIGit (scope-branch lifecycle).
REM Only `branch` and `merge` are supported (SPEC-058 Amendment B / FR-009).
REM Backing bash scripts live beside this launcher in scripts\wxaigit\ and run
REM via Git-Bash. Replaces the orphaned _wxAI-global\... dispatch.
setlocal

set "ROOT_DIR=%~dp0"
set "SCRIPT_DIR=%ROOT_DIR%scripts\wxaigit"

if "%~1"=="" goto :usage

set "SUBCOMMAND=%~1"
shift

if /I "%SUBCOMMAND%"=="branch" (
  set "TARGET=%SCRIPT_DIR%\gitbranch.sh"
  goto :run
)
if /I "%SUBCOMMAND%"=="merge" (
  set "TARGET=%SCRIPT_DIR%\gitmerge.sh"
  goto :run
)

echo wxAIGit: unsupported subcommand "%SUBCOMMAND%" (only "branch" and "merge"). >&2
goto :usage

:run
if not exist "%TARGET%" (
  echo wxAIGit: backing script not found: "%TARGET%" >&2
  exit /b 1
)

set "BASH_EXE="
for %%B in (bash.exe) do set "BASH_EXE=%%~$PATH:B"
if not defined BASH_EXE if exist "C:\Program Files\Git\bin\bash.exe" set "BASH_EXE=C:\Program Files\Git\bin\bash.exe"
if not defined BASH_EXE if exist "C:\Program Files\Git\usr\bin\bash.exe" set "BASH_EXE=C:\Program Files\Git\usr\bin\bash.exe"

if not defined BASH_EXE (
  echo wxAIGit: bash not found in PATH or default Git locations. >&2
  exit /b 1
)

"%BASH_EXE%" "%TARGET%" %1 %2 %3 %4 %5 %6 %7 %8 %9
exit /b %errorlevel%

:usage
echo wxAIGit - scope-branch lifecycle (SPEC-058)
echo.
echo Usage:
echo   wxAIGit branch --create ^<name^>            Create (if absent) + switch to branch
echo   wxAIGit merge  --source-branch ^<branch^>   Merge a scope/* branch into integration (local)
exit /b 1
