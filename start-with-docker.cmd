@echo off
setlocal
title TechSara Placement League - Docker
cd /d "%~dp0"

rem ---- Docker Desktop must be installed and its engine running --------------------------
where docker >nul 2>nul
if errorlevel 1 (
  echo Docker is not installed. Install Docker Desktop from https://www.docker.com/products/docker-desktop/
  echo and run this file again.
  pause
  exit /b 1
)
docker info >nul 2>nul
if errorlevel 1 (
  echo Starting Docker Desktop...
  if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
  for /l %%i in (1,1,90) do (
    docker info >nul 2>nul && goto docker_ready
    timeout /t 2 /nobreak >nul
  )
  echo Docker Desktop did not start within 3 minutes. Open it, wait for "Engine running", then run this file again.
  pause
  exit /b 1
)
:docker_ready

rem ---- Port: 3000 unless APP_PORT is set in .env ------------------------------------------
set "APP_PORT=3000"
if exist ".env" for /f "usebackq tokens=1,* delims==" %%A in (".env") do if /i "%%A"=="APP_PORT" set "APP_PORT=%%B"

echo Building and starting TechSara Placement League on port %APP_PORT% (the first build takes a few minutes)...
docker compose up -d --build
if errorlevel 1 (
  echo.
  echo Start failed. If the message says port %APP_PORT% is already allocated, another program uses it:
  echo put APP_PORT=3100 in the .env file next to this script and run it again.
  pause
  exit /b 1
)

echo Waiting for the app on http://localhost:%APP_PORT% ...
for /l %%i in (1,1,90) do (
  curl -fs http://localhost:%APP_PORT%/api/health >nul 2>nul && goto app_ready
  timeout /t 2 /nobreak >nul
)
echo The app did not answer within 3 minutes. Last log lines:
docker compose logs --tail 40 app
pause
exit /b 1

:app_ready
echo.
echo   TechSara Placement League is running.
echo     Organizer console : http://localhost:%APP_PORT%/admin
echo     Live screen       : use "Open display" in the console
echo     Other devices     : http://^<this computer's IP address^>:%APP_PORT%
echo     Organizer password: ADMIN_PASSWORD in .env, or the generated one below
echo     Stop              : stop-docker.cmd  (your data is kept)
echo.
docker compose logs app 2>nul | findstr /c:"generated password"
start "" "http://localhost:%APP_PORT%/admin"
pause
