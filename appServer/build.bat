@echo off
setlocal EnableExtensions
cd /d "%~dp0"

:: electron-builder unpacks a signing toolkit that contains symlinks, and Windows only allows those as admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c %~s0' -Verb RunAs"
    exit /b
)

set "NODE_DIR=%~dp0.node"
set "NODE_TMP=%~dp0.node-tmp"
set "CURL=%SystemRoot%\System32\curl.exe"
set "TAR=%SystemRoot%\System32\tar.exe"

if exist "%NODE_DIR%\node.exe" set "PATH=%NODE_DIR%;%PATH%"
call :node_ok
if errorlevel 1 (
    call :get_node
    if errorlevel 1 goto fail
)

echo.
echo Installing build tools...
if exist "node_modules\" (
    call npm install --no-audit --no-fund
) else (
    call npm ci --no-audit --no-fund
)
:: npm can exit with a negative code, which "if errorlevel 1" would miss
if %errorLevel% neq 0 goto fail

echo.
echo Building the Windows installer...
call npx --no-install electron-builder --win --publish never
if %errorLevel% neq 0 goto fail

echo.
echo All done! Your installer is in the dist folder.
start "" "%~dp0dist"
pause
exit /b 0

:fail
echo.
echo The build stopped because something went wrong. The messages above say what.
pause
exit /b 1

:node_ok
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)" >nul 2>&1
exit /b %errorLevel%

:get_node
echo Node.js 22.12 or newer isn't installed, so grabbing a private copy just for this folder...
set "ARCH=x64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "ARCH=arm64"
if /i "%PROCESSOR_ARCHITEW6432%"=="ARM64" set "ARCH=arm64"
set "BASE=https://nodejs.org/dist/latest-v24.x"
if exist "%NODE_TMP%" rmdir /s /q "%NODE_TMP%"
mkdir "%NODE_TMP%" || exit /b 1
"%CURL%" -fsSL "%BASE%/SHASUMS256.txt" -o "%NODE_TMP%\sums.txt" || exit /b 1
set "HASH="
set "FILE="
for /f "tokens=1,2" %%a in ('findstr /l /c:"-win-%ARCH%.zip" "%NODE_TMP%\sums.txt"') do (
    set "HASH=%%a"
    set "FILE=%%b"
)
if not defined FILE (
    echo Couldn't find a Node.js download for Windows %ARCH%.
    exit /b 1
)
"%CURL%" -fL --progress-bar "%BASE%/%FILE%" -o "%NODE_TMP%\%FILE%" || exit /b 1
set "GOT="
for /f "skip=1 delims=" %%h in ('certutil -hashfile "%NODE_TMP%\%FILE%" SHA256') do if not defined GOT set "GOT=%%h"
set "GOT=%GOT: =%"
if /i not "%GOT%"=="%HASH%" (
    echo The Node.js download didn't match its checksum, so it wasn't used.
    exit /b 1
)
"%TAR%" -xf "%NODE_TMP%\%FILE%" -C "%NODE_TMP%" || exit /b 1
if exist "%NODE_DIR%" rmdir /s /q "%NODE_DIR%"
move "%NODE_TMP%\%FILE:.zip=%" "%NODE_DIR%" >nul || exit /b 1
rmdir /s /q "%NODE_TMP%"
set "PATH=%NODE_DIR%;%PATH%"
call :node_ok
exit /b %errorLevel%