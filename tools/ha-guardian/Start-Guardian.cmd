@echo off
title HA Guardian - Lokales Diagnose-Dashboard (Port 3333)
cd /d "%~dp0"
echo Starte HA Guardian auf http://localhost:3333 ...
start "" "http://localhost:3333"
node server.mjs
pause
