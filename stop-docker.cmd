@echo off
title TechSara Placement League - stop
cd /d "%~dp0"
docker compose down
echo.
echo Stopped. Your auctions, teams and uploads are kept. Start again with start-with-docker.cmd
pause
