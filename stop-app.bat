@echo off
REM Altech POS - stops the background server started by the desktop shortcut
REM (needed only before updating the app or moving its folder).
setlocal
powershell -NoProfile -Command ^
  "$c = Get-NetTCPConnection -LocalPort 5175 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1;" ^
  "if (-not $c) { Write-Host '  [Altech POS] Le serveur ne tourne pas.'; exit 0 }" ^
  "$p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue;" ^
  "if ($p -and $p.ProcessName -eq 'node') { Stop-Process -Id $p.Id; Write-Host '  [Altech POS] Serveur arrete.' -ForegroundColor Green }" ^
  "else { Write-Host '  [Altech POS] Le port 5175 est utilise par un autre programme.' -ForegroundColor Yellow }"
timeout /t 3 >nul
