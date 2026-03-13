@echo off
setlocal

set "DIR=%~dp0"
set "ROOT=%DIR%.."

rem 1. Prebuilt binary (DLLs auto-resolve from same directory on Windows)
if exist "%DIR%skill-router.exe" (
  "%DIR%skill-router.exe" %*
  exit /b %ERRORLEVEL%
)

rem 2. Fallback: node + tsx
rem cd to ROOT so node resolves tsx from the plugin's own node_modules
where node >nul 2>&1
if %ERRORLEVEL%==0 (
  if exist "%ROOT%\node_modules" (
    cd /d "%ROOT%"
    node --import tsx "%ROOT%\src\main.ts" %*
    exit /b %ERRORLEVEL%
  )
)

rem 3. Graceful failure
echo {}
echo skill-router: no binary found and node is not available. Install from https://github.com/jim80net/claude-skill-router/releases 1>&2
