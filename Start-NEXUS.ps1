$ErrorActionPreference = 'Stop'

$nexusWorkspace = Split-Path -Parent $MyInvocation.MyCommand.Path
$nexusLockfile = Join-Path $nexusWorkspace 'pnpm-lock.yaml'
$nexusStamp = Join-Path $nexusWorkspace '.nexus-deps.lockhash'
$nexusModules = Join-Path $nexusWorkspace 'node_modules'

Set-Location -LiteralPath $nexusWorkspace

$nexusNode = Get-Command node -ErrorAction SilentlyContinue
$nexusPnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $nexusNode -or -not $nexusPnpm) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
        'NEXUS development requires Node.js 22 or newer and pnpm 10 on PATH. Install them, reopen this launcher, and try again.',
        'NEXUS Launcher',
        'OK',
        'Error'
    ) | Out-Null
    exit 1
}

$nexusCurrentHash = if (Test-Path -LiteralPath $nexusLockfile) {
    (Get-FileHash -LiteralPath $nexusLockfile -Algorithm SHA256).Hash
} else {
    'NO_LOCKFILE'
}
$nexusSavedHash = if (Test-Path -LiteralPath $nexusStamp) {
    Get-Content -LiteralPath $nexusStamp -Raw
} else {
    ''
}

if (-not (Test-Path -LiteralPath $nexusModules) -or $nexusCurrentHash.Trim() -ne $nexusSavedHash.Trim()) {
    Write-Host 'Updating NEXUS dependencies...' -ForegroundColor Cyan
    & $nexusPnpm.Source install
    if ($LASTEXITCODE -ne 0) { throw 'NEXUS dependency update failed.' }
    Set-Content -LiteralPath $nexusStamp -Value $nexusCurrentHash -NoNewline
}

Write-Host 'Launching NEXUS...' -ForegroundColor Cyan
& $nexusPnpm.Source run dev
