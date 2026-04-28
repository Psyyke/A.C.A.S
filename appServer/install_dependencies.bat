@echo off

:: Auto-elevate if not admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    powershell -Command "Start-Process cmd -ArgumentList '/c %~s0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"

call npm install
call pause