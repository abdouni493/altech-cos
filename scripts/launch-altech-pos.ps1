# Altech POS - desktop launcher.
#
# 1. Starts the offline server in the background if it is not running yet.
# 2. Opens the app in its own window (Edge / Chrome "app" mode: no address bar,
#    no tabs, no browser frame).
#
#   launch-altech-pos.ps1            start (if needed) + open the window
#   launch-altech-pos.ps1 -NoServer  only open the window (server started elsewhere)
param([switch]$NoServer)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$port = if ($env:PORT) { $env:PORT } else { 5175 }
$url = "http://localhost:$port"

Add-Type -AssemblyName System.Windows.Forms
function Fail($message) {
    [System.Windows.Forms.MessageBox]::Show($message, 'Altech POS', 'OK', 'Error') | Out-Null
    exit 1
}

function Test-Server {
    try {
        $r = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 1
        return $r.Content -match 'altech-pos'
    } catch { return $false }
}

if (-not $NoServer -and -not (Test-Server)) {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Fail "Node.js est introuvable sur ce PC.`nInstallez la version LTS depuis https://nodejs.org puis relancez Altech POS."
    }

    # First run / after an update: install + build in a visible window.
    $prepare = Start-Process powershell -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSScriptRoot\prepare.ps1`"") -Wait -PassThru -WindowStyle Minimized
    if ($prepare.ExitCode -ne 0) {
        Fail "La preparation d'Altech POS a echoue.`nLancez run-app.bat pour voir le detail."
    }

    $data = Join-Path $root 'data'
    New-Item -ItemType Directory -Force -Path $data | Out-Null
    Start-Process node -ArgumentList @("`"$root\server\server.mjs`"") -WorkingDirectory $root -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $data 'server.log') -RedirectStandardError (Join-Path $data 'server-error.log')
}

# Wait for the server (60 s max).
$deadline = (Get-Date).AddSeconds(60)
while (-not (Test-Server)) {
    if ((Get-Date) -gt $deadline) { Fail "Le serveur Altech POS ne demarre pas.`nVoir data\server-error.log" }
    Start-Sleep -Milliseconds 400
}

# Chromium browser in app mode = a real application window.
$candidates = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe"
)
$browser = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if ($browser) {
    # A dedicated profile keeps the POS window separate from personal browsing
    # and always opens as a standalone, frameless app window.
    $browserProfile = Join-Path $env:LOCALAPPDATA 'AltechPOS\browser-profile'
    New-Item -ItemType Directory -Force -Path $browserProfile | Out-Null
    Start-Process $browser -ArgumentList @(
        "--app=$url",
        "--user-data-dir=`"$browserProfile`"",
        '--start-maximized',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-features=Translate',
        '--disable-pinch'
    )
} else {
    # No Chromium browser: fall back to the default browser.
    Start-Process $url
}
