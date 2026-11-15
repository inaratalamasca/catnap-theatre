@echo off
rem SCRIPT_VERSION 0.6.0 - use built-in Windows PowerShell for local installation.
rem This invocation permits only this installer process; no persistent execution
rem policy or system-wide security setting is changed.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-windows.ps1" %*
if errorlevel 1 echo Installation failed. Review the message above before retrying.
pause
