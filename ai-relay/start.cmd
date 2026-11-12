@echo off
rem Starts the anki "AI question" relay. Closing this window stops it (minimizing is fine).
title anki AI relay
node "%~dp0main.mjs"
echo.
echo The relay has stopped.
pause
