@echo off
setlocal
rem Remove dsh-text-reader: profile row, installed copy, settings section.
if not exist "%~dp0uninstall.ps1" (
  echo uninstall.ps1 not found next to this batch file.
  pause
  exit /b 1
)
set "RUN=%~dp0uninstall.ps1"
rem Running from the installed copy? Move the script to TEMP first so
rem the plugin folder can delete itself cleanly.
if /i "%~dp0"=="%USERPROFILE%\.dsh\plugins\dsh-text-reader\" (
  copy /y "%~dp0uninstall.ps1" "%TEMP%\dsh-trd-uninstall.ps1" >nul
  set "RUN=%TEMP%\dsh-trd-uninstall.ps1"
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%RUN%"
if defined TEMP if exist "%TEMP%\dsh-trd-uninstall.ps1" del "%TEMP%\dsh-trd-uninstall.ps1" >nul 2>&1
echo.
pause
