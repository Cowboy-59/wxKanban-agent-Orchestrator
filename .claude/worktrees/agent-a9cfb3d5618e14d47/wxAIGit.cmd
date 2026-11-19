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

REM Resolve a real Git-Bash. Prefer the known Git for Windows locations FIRST so
REM we never pick C:\Windows\System32\bash.exe — that is the WSL launcher stub,
REM which fails with "<3>WSL (13 - Relay) ... execvpe(/bin/bash) failed" when no
REM WSL distro is installed. Only fall back to a PATH lookup if Git isn't found,
REM and reject the System32 stub even then.
set "BASH_EXE="
if exist "C:\Program Files\Git\bin\bash.exe" set "BASH_EXE=C:\Program Files\Git\bin\bash.exe"
if not defined BASH_EXE if exist "C:\Program Files\Git\usr\bin\bash.exe" set "BASH_EXE=C:\Program Files\Git\usr\bin\bash.exe"
if not defined BASH_EXE if exist "C:\Program Files (x86)\Git\bin\bash.exe" set "BASH_EXE=C:\Program Files (x86)\Git\bin\bash.exe"
if defined BASH_EXE goto :havebash

REM Fallback: PATH lookup, but reject the WSL System32 stub.
set "PATH_BASH="
for %%B in (bash.exe) do set "PATH_BASH=%%~$PATH:B"
if not defined PATH_BASH goto :havebash
echo %PATH_BASH%| findstr /I "\System32\" >nul
if errorlevel 1 set "BASH_EXE=%PATH_BASH%"

:havebash
if defined BASH_EXE goto :gotbash
echo wxAIGit: Git-Bash not found. Install Git for Windows, or ensure bash.exe is on PATH (the WSL System32 stub is not usable). >&2
exit /b 1

:gotbash
"%BASH_EXE%" "%TARGET%" %1 %2 %3 %4 %5 %6 %7 %8 %9
exit /b %errorlevel%

:usage
echo wxAIGit - scope-branch lifecycle (SPEC-058)
echo.
echo Usage:
echo   wxAIGit branch --create ^<name^>            Create (if absent) + switch to branch
echo   wxAIGit merge  --source-branch ^<branch^>   Merge a scope/* branch into integration (local)
exit /b 1
