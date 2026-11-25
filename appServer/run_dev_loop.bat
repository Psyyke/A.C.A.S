@echo off

:loop
cd /d "%~dp0"
call npm start
echo Dev server stopped. Restarting...
timeout /t 1 >nul
goto loop