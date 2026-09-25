@echo off
setlocal EnableDelayedExpansion
title HavaMana - demo launcher
cd /d "%~dp0"

rem ==========================================================================
rem  Starts the HavaMana demo: forecasting API + website, waits until the
rem  trained model is loaded, warms it up, then opens Chrome full-screen.
rem  Stop everything with "Stop Demo.bat" (or close the two small windows).
rem ==========================================================================

echo.
echo   HavaMana - Climate Digital Twin
echo   --------------------------------
echo.

rem Python with the backend packages: the project venv first, then PATH.
set "PY="
if exist "..\.venv\Scripts\python.exe" set "PY=..\.venv\Scripts\python.exe"
if not defined PY if exist ".venv\Scripts\python.exe" set "PY=.venv\Scripts\python.exe"
if not defined PY set "PY=python"

rem ---- 1. forecasting API (port 5005) -------------------------------------
curl.exe -s -o nul http://127.0.0.1:5005/api/health
if !errorlevel! == 0 (
  echo   [ok] Forecasting API already running.
) else (
  echo   [..] Starting the forecasting API...
  start "HavaMana API - keep this open" /min cmd /k ""%PY%" -m backend.api.app"
)

rem ---- 2. website (port 5173) ----------------------------------------------
curl.exe -s -o nul http://localhost:5173/
if !errorlevel! == 0 (
  echo   [ok] Website already running.
) else (
  echo   [..] Starting the website...
  start "HavaMana site - keep this open" /min cmd /k "npx vite --port 5173 --strictPort"
)

rem ---- 3. wait for the trained model ---------------------------------------
echo   [..] Waiting for the model to load (about 5-20 seconds)...
set /a tries=0
:wait_model
set /a tries+=1
curl.exe -s http://127.0.0.1:5005/api/health 2>nul | findstr /r /c:"model_loaded.:true" >nul
if !errorlevel! == 0 goto model_ready
if !tries! geq 120 (
  echo.
  echo   [!!] The model did not load within 2 minutes.
  echo        Open the "HavaMana API" window in the taskbar to see the error.
  echo.
  pause
  exit /b 1
)
ping -n 2 127.0.0.1 >nul
goto wait_model
:model_ready
echo   [ok] Model loaded.

rem First prediction after startup is ~1 s slower; take that hit now.
curl.exe -s -o nul "http://127.0.0.1:5005/api/forecast/future?scenario=immediate"
curl.exe -s -o nul "http://127.0.0.1:5005/api/forecast/date?date=2024-05-04"
echo   [ok] Model warmed up.

rem ---- 4. wait for the website ---------------------------------------------
set /a tries=0
:wait_site
set /a tries+=1
curl.exe -s -o nul http://localhost:5173/
if !errorlevel! == 0 goto site_ready
if !tries! geq 60 (
  echo   [!!] The website did not start. Check the "HavaMana site" window.
  pause
  exit /b 1
)
ping -n 2 127.0.0.1 >nul
goto wait_site
:site_ready
echo   [ok] Website ready.

rem ---- 5. open it ----------------------------------------------------------
if defined HAVAMANA_NO_BROWSER goto opened
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" (
  start "" "%CHROME%" --new-window --start-fullscreen http://localhost:5173/
) else (
  start "" http://localhost:5173/
)
:opened

echo.
echo   Ready: http://localhost:5173
echo   Press F11 to leave or enter full screen.
echo   This window closes in 10 seconds. The two minimised windows must stay open.
timeout /t 10 >nul
