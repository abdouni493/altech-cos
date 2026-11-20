@echo off
REM ==========================================================================
REM  Altech POS - installs the app on this PC and creates the
REM  "Altech POS" shortcut on the desktop (and in the Start menu).
REM
REM  The shortcut uses the Altech POS icon (public\altech-pos.ico). A double
REM  click starts the offline server in the background and opens the app in
REM  its own window, without any browser frame.
REM ==========================================================================
setlocal
title Altech POS - installation
cd /d "%~dp0"

echo.
echo   Altech POS - installation sur ce PC
echo   ------------------------------------
echo.

REM 1. Dependencies + build, so the first launch is instant.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\prepare.ps1"
if errorlevel 1 (
  echo.
  echo   [Altech POS] La preparation a echoue - le raccourci n'a pas ete cree.
  pause
  exit /b 1
)

REM 2. Desktop + Start menu shortcuts with the Altech POS icon.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\create-shortcut.ps1"
if errorlevel 1 (
  echo   [Altech POS] Impossible de creer le raccourci.
  pause
  exit /b 1
)

echo.
echo   Termine ! Double-cliquez sur "Altech POS" sur le bureau pour ouvrir l'application.
echo.
pause
