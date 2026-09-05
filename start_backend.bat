@echo off
echo Starting HavaMana Climate Forecasting Flask API...
py -m backend.api.app
if %ERRORLEVEL% NEQ 0 (
    "C:\Users\Abhay\AppData\Local\Programs\Python\Python311\python.exe" -m backend.api.app
)
pause
