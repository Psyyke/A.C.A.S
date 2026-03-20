@echo off
:loop
cd %CD%
call npm start
echo Dev server stopped. Restarting...
timeout /t 1 >nul
goto loop