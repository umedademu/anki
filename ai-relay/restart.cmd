@echo off
rem Restarts the relay and tunnel started by the AnkiAI-Autostart task (loads new code and settings).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0restart.ps1"
echo.
pause
