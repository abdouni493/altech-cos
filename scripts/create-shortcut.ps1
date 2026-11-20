# Altech POS - creates the "Altech POS" shortcut (desktop + Start menu by default).
#
#   create-shortcut.ps1                      desktop + Start menu
#   create-shortcut.ps1 -Folders D:\test     somewhere else
param([string[]]$Folders)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $Folders) {
    $Folders = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))
}

$launcher = Join-Path $root 'scripts\launch-altech-pos.ps1'
$icon = Join-Path $root 'public\altech-pos.ico'
if (-not (Test-Path $icon)) { throw "Icone introuvable : $icon" }

$shell = New-Object -ComObject WScript.Shell
foreach ($folder in $Folders) {
    New-Item -ItemType Directory -Force -Path $folder | Out-Null
    $lnk = $shell.CreateShortcut((Join-Path $folder 'Altech POS.lnk'))
    $lnk.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $lnk.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $launcher + '"'
    $lnk.WorkingDirectory = $root
    $lnk.IconLocation = "$icon,0"
    $lnk.Description = 'Altech POS - caisse et gestion de boutique (hors ligne)'
    $lnk.WindowStyle = 7  # minimized: no console flash before the app window opens
    $lnk.Save()
    Write-Host "  [Altech POS] Raccourci cree : $($lnk.FullName)" -ForegroundColor Green
}
