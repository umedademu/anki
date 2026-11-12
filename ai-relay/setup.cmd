@echo off
rem First-time setup for the anki "AI question" relay (access key and Claude token).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
pause
