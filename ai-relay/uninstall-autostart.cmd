@echo off
rem Removes the AnkiAI-Autostart task and stops the relay and tunnel.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-autostart.ps1"
echo.
pause
