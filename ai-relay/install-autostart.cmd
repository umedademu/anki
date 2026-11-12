@echo off
rem Registers the AnkiAI-Autostart task (relay and tunnel start at Windows sign-in) and starts it.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-autostart.ps1"
echo.
pause
