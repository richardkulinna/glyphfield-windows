@echo off
setlocal
"%~dp0runtime\node.exe" "%~dp0launcher.cjs" --stop
if errorlevel 1 (
  pause
  exit /b 1
)
