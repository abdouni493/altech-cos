# Altech POS - prepares the app on this PC: installs the dependencies and builds
# the app, only when needed. Used by run-app.bat, create-desktop-shortcut.bat
# and the desktop shortcut itself. Exit code 0 = ready.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Say($text, $color = 'Gray') { Write-Host "  [Altech POS] $text" -ForegroundColor $color }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Say 'Node.js est introuvable sur ce PC.' Red
    Say 'Installez la version LTS depuis https://nodejs.org puis relancez.' Yellow
    exit 2
}

# The build needs some room on small PCs.
$env:NODE_OPTIONS = '--max-old-space-size=4096'

# 1. Dependencies - missing, or package-lock.json changed since the last install.
$lock = Join-Path $root 'package-lock.json'
$installed = Join-Path $root 'node_modules\.package-lock.json'
$needInstall = -not (Test-Path $installed)
if (-not $needInstall -and (Test-Path $lock)) {
    $needInstall = (Get-Item $lock).LastWriteTime -gt (Get-Item $installed).LastWriteTime
}
if ($needInstall) {
    Say 'Installation des dependances (premiere fois uniquement, quelques minutes)...' Cyan
    & npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { Say "L'installation a echoue." Red; exit 1 }
}

# 2. Build - missing, or any source file newer than the last build.
$built = Join-Path $root 'dist\index.html'
$needBuild = -not (Test-Path $built)
if (-not $needBuild) {
    $builtAt = (Get-Item $built).LastWriteTime
    $sources = @('src', 'public', 'index.html', 'package.json', 'tailwind.config.js', 'vite.config.ts') |
        ForEach-Object { Join-Path $root $_ } | Where-Object { Test-Path $_ }
    $newest = Get-ChildItem $sources -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $needBuild = $newest -and $newest.LastWriteTime -gt $builtAt
}
if ($needBuild) {
    Say "Preparation de l'application (build)..." Cyan
    & npm run build
    if ($LASTEXITCODE -ne 0) { Say 'La construction a echoue.' Red; exit 1 }
}

Say 'Application prete.' Green
exit 0
