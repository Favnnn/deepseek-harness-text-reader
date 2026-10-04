@echo off
setlocal
rem Remove dsh-text-reader: profile row, installed copy, settings section.
if not exist "%~dp0uninstall.ps1" (
  echo uninstall.ps1 not found next to this batch file.
  pause
  exit /b 1
)
set "RUN=%~dp0uninstall.ps1"
rem Running from an installed copy? Move the script to TEMP first so the
rem plugin folder can delete itself cleanly. Covers the legacy copy
rem (%USERPROFILE%\.dsh\plugins\dsh-text-reader) and the rc.2 bundle copy
rem (%USERPROFILE%\.dsh\profiles\web\node_modules\dsh-text-reader).
set "LEGACY=%USERPROFILE%\.dsh\plugins\dsh-text-reader\"
set "BUNDLE=%USERPROFILE%\.dsh\profiles\web\node_modules\dsh-text-reader\"
if /i "%~dp0"=="%LEGACY%" goto selfdelete
if /i "%~dp0"=="%BUNDLE%" goto selfdelete
goto run
:selfdelete
copy /y "%~dp0uninstall.ps1" "%TEMP%\dsh-trd-uninstall.ps1" >nul
set "RUN=%TEMP%\dsh-trd-uninstall.ps1"
:run
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%RUN%"
if defined TEMP if exist "%TEMP%\dsh-trd-uninstall.ps1" del "%TEMP%\dsh-trd-uninstall.ps1" >nul 2>&1
echo.
pause
