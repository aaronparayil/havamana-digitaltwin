@echo off
title HavaMana - stop demo
rem Stops the forecasting API (port 5005) and the website (port 5173).
powershell -NoProfile -Command "foreach ($p in 5005, 5173) { Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"
echo HavaMana demo stopped.
timeout /t 3 >nul
