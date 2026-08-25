$ErrorActionPreference = 'Stop'

$starladderWorkspace = Split-Path -Parent $MyInvocation.MyCommand.Path
$starladderLockfile = Join-Path $starladderWorkspace 'pnpm-lock.yaml'
$starladderStamp = Join-Path $starladderWorkspace '.starladder-deps.lockhash'
$starladderModules = Join-Path $starladderWorkspace 'node_modules'

Set-Location -LiteralPath $starladderWorkspace

$starladderNode = Get-Command node -ErrorAction SilentlyContinue
$starladderPnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $starladderNode -or -not $starladderPnpm) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
        'STARLADDER development requires Node.js 22 or newer and pnpm 10 on PATH. Install them, reopen this launcher, and try again.',
        'STARLADDER Launcher',
        'OK',
        'Error'
    ) | Out-Null
    exit 1
}

$starladderCurrentHash = if (Test-Path -LiteralPath $starladderLockfile) {
    (Get-FileHash -LiteralPath $starladderLockfile -Algorithm SHA256).Hash
} else {
    'NO_LOCKFILE'
}
$starladderSavedHash = if (Test-Path -LiteralPath $starladderStamp) {
    Get-Content -LiteralPath $starladderStamp -Raw
} else {
    ''
}

if (-not (Test-Path -LiteralPath $starladderModules) -or $starladderCurrentHash.Trim() -ne $starladderSavedHash.Trim()) {
    Write-Host 'Updating STARLADDER dependencies...' -ForegroundColor Cyan
    & $starladderPnpm.Source install
    if ($LASTEXITCODE -ne 0) { throw 'STARLADDER dependency update failed.' }
    Set-Content -LiteralPath $starladderStamp -Value $starladderCurrentHash -NoNewline
}

Write-Host 'Launching STARLADDER...' -ForegroundColor Cyan
& $starladderPnpm.Source run dev
