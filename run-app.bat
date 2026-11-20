@echo off
REM ==========================================================================
REM  Altech POS - run the app locally (offline).
REM
REM  - installs the dependencies and builds the app the first time
REM    (and again automatically after an update),
REM  - starts the local server + database (folder "data\"),
REM  - opens Altech POS in its own window (no browser frame).
REM
REM  Keep this window open while you work: closing it stops the server.
REM ==========================================================================
setlocal
title Altech POS - serveur local
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\prepare.ps1"
if errorlevel 1 (
  echo.
  echo   [Altech POS] Impossible de preparer l'application - voir les messages ci-dessus.
  pause
  exit /b 1
)

REM Already running (e.g. started by the desktop shortcut)? Just open the window.
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5175/api/health -TimeoutSec 1).Content -match 'altech-pos' | Out-Null; exit 0 } catch { exit 1 }"
if not errorlevel 1 (
  echo   [Altech POS] Le serveur tourne deja - ouverture de la fenetre.
  powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0scripts\launch-altech-pos.ps1" -NoServer
  exit /b 0
)

REM Open the app window as soon as the server answers...
start "" /min powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0scripts\launch-altech-pos.ps1" -NoServer

REM ...and run the server in this window.
node "%~dp0server\server.mjs"

echo.
echo   [Altech POS] Serveur arrete.
pause
