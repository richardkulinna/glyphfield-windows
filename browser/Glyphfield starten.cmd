@echo off
setlocal
if not exist "%~dp0runtime\node.exe" (
  echo Bitte die ZIP-Datei zuerst vollstaendig entpacken und dann diesen Starter oeffnen.
  pause
  exit /b 1
)
"%~dp0runtime\node.exe" "%~dp0launcher.cjs"
if errorlevel 1 (
  pause
  exit /b 1
)
