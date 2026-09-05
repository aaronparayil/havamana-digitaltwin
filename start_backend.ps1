# PowerShell script to launch the Climate Forecasting Flask API
$pythonPath = "C:\Users\Abhay\AppData\Local\Programs\Python\Python311\python.exe"

if (Get-Command py -ErrorAction SilentlyContinue) {
    py -m backend.api.app
} elseif (Test-Path $pythonPath) {
    & $pythonPath -m backend.api.app
} else {
    python -m backend.api.app
}
