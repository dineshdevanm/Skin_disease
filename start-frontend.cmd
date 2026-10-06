@echo off
REM Starts the Vite dev server on http://localhost:5173
REM Leave the window open — closing it stops the server.

cd /d "%~dp0"

if not exist "node_modules" (
  echo Installing dependencies first...
  call npm install
)

echo Starting DermaScan frontend on http://localhost:5173
echo Press Ctrl+C to stop.
echo.
call npm run dev

pause
