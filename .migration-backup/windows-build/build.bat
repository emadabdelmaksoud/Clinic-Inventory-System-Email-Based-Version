@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo  ================================================
echo    Clinic Inventory  ^|  Windows Installer Builder
echo  ================================================
echo.

:: Step 1: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo  ERROR: Node.js is not installed.
  echo.
  echo  Download and install Node.js LTS from:
  echo    https://nodejs.org/
  echo.
  echo  After installing, run this file again.
  echo.
  pause
  exit /b 1
)
for /f "tokens=*" %%V in ('node --version') do set NODEVER=%%V
echo  Node.js %NODEVER% found.
echo.

:: Step 2: Check for app files
if exist "dist\public\index.html" (
  echo  [1/3] App files found (pre-built). Ready to package.
) else (
  echo  [1/3] Copying app files from workspace...
  if not exist "..\artifacts\store-control\dist\public\index.html" (
    echo.
    echo  ERROR: App files not found.
    echo  Make sure you are inside the windows-build folder
    echo  of the full downloaded project.
    echo.
    pause
    exit /b 1
  )
  xcopy /E /I /Y /Q "..\artifacts\store-control\dist\public" "dist\public"
  if %errorlevel% neq 0 (
    echo.
    echo  ERROR: Could not copy app files.
    echo.
    pause
    exit /b 1
  )
)
echo.

:: Step 3: Install Electron build tools
echo  [2/3] Installing Electron build tools...
echo        (First run downloads ~120 MB - please wait)
call npm install
if %errorlevel% neq 0 (
  echo.
  echo  ERROR: npm install failed.
  echo  Check your internet connection and try again.
  echo.
  pause
  exit /b 1
)
echo  Done.
echo.

:: Step 4: Build installer
echo  [3/3] Building Windows installer...
call npx electron-builder --win --config electron-builder.json
if %errorlevel% neq 0 (
  echo.
  echo  ERROR: Build failed. See the messages above.
  echo.
  pause
  exit /b 1
)

echo.
echo  ================================================
echo   BUILD COMPLETE!  Your installer is ready:
echo.
echo   Installer  (setup, recommended):
echo     dist\electron\Clinic Inventory 1.0.0 Setup.exe
echo.
echo   Portable   (no install needed):
echo     dist\electron\Clinic Inventory 1.0.0.exe
echo  ================================================
echo.
start "" "dist\electron"
pause
