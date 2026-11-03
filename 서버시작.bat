@echo off
title webmaker preview server
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ERROR] Node.js is not installed.
  echo Install LTS from https://nodejs.org and run this file again.
  echo.
  pause
  exit /b 1
)

start "" http://localhost:8732/
echo Server running at http://localhost:8732/
echo Close this window to stop the server.
node static_server.js
pause
