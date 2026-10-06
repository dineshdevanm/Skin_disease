@echo off
REM Starts the FastAPI backend on http://localhost:8000
REM Double-click this, or run it from a terminal. Leave the window open —
REM closing it stops the server. Ctrl+C also stops it.

cd /d "%~dp0backend"

if not exist ".venv\Scripts\python.exe" (
  echo.
  echo   No virtualenv found at backend\.venv
  echo   Create it first:
  echo.
  echo     cd backend
  echo     python -m venv .venv
  echo     .venv\Scripts\python.exe -m pip install -r requirements.txt
  echo     .venv\Scripts\python.exe -m app.seed
  echo.
  pause
  exit /b 1
)

echo Starting DermaScan API on http://localhost:8000  (docs at /docs)
echo Press Ctrl+C to stop.
echo.
".venv\Scripts\python.exe" -m uvicorn app.main:app --port 8000 --reload

pause
