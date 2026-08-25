$ErrorActionPreference = 'Stop'

$starladderRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$starladderRelease = Join-Path $starladderRoot 'release'
$starladderStage = Join-Path $starladderRelease '.starladder-package-stage'
$starladderOutput = Join-Path $starladderRelease '.starladder-packager-output'
$starladderInstalledApp = Join-Path $starladderRelease 'STARLADDER-Desktop-win32-x64'
$starladderPackagedPathMarker = Join-Path $starladderRelease '.starladder-packaged-app-path'
$starladderPackager = Join-Path $starladderRoot 'node_modules\.bin\electron-packager.cmd'
$starladderIcon = Join-Path $starladderRoot 'build\starladder.ico'

function Assert-ReleaseChild([string]$candidate) {
    $releasePrefix = [IO.Path]::GetFullPath($starladderRelease).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    $resolved = [IO.Path]::GetFullPath($candidate)
    if (-not $resolved.StartsWith($releasePrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Packaging path escaped the release directory: $resolved"
    }
}

if (-not (Test-Path -LiteralPath (Join-Path $starladderRoot 'dist\index.html'))) {
    throw 'The production renderer has not been built.'
}
if (-not (Test-Path -LiteralPath $starladderPackager)) {
    throw 'The Electron packager is not installed.'
}
if (-not (Test-Path -LiteralPath $starladderIcon)) {
    throw 'The STARLADDER Windows icon was not generated.'
}

New-Item -ItemType Directory -Path $starladderRelease -Force | Out-Null
Assert-ReleaseChild $starladderStage
Assert-ReleaseChild $starladderOutput
if (Test-Path -LiteralPath $starladderStage) {
    Remove-Item -LiteralPath $starladderStage -Recurse -Force
}
if (Test-Path -LiteralPath $starladderOutput) {
    Remove-Item -LiteralPath $starladderOutput -Recurse -Force
}
New-Item -ItemType Directory -Path $starladderStage | Out-Null
New-Item -ItemType Directory -Path $starladderOutput | Out-Null

Copy-Item -LiteralPath (Join-Path $starladderRoot 'dist') -Destination $starladderStage -Recurse
Copy-Item -LiteralPath (Join-Path $starladderRoot 'electron') -Destination $starladderStage -Recurse
Copy-Item -LiteralPath (Join-Path $starladderRoot 'scripts\package-template.json') -Destination (Join-Path $starladderStage 'package.json')

try {
    # Windows executable resources accept at most four numeric components. Keep the
    # user-facing semver (0.5.0-alpha.8.0) in package.json and map it to 0.5.8.0 here.
    & $starladderPackager $starladderStage STARLADDER --platform=win32 --arch=x64 --out=$starladderOutput --overwrite --prune=false --asar --icon=$starladderIcon --app-version=0.5.8.0 --build-version=0.5.8.0
    if ($LASTEXITCODE -ne 0) { throw 'Electron packaging failed.' }

    $packagedApp = Join-Path $starladderOutput 'STARLADDER-win32-x64'
    $installedExe = Join-Path $starladderInstalledApp 'STARLADDER.exe'
    $installedRunning = Get-Process -Name STARLADDER -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $installedExe }
    if (-not $installedRunning) {
        Assert-ReleaseChild $starladderInstalledApp
        if (Test-Path -LiteralPath $starladderInstalledApp) {
            Remove-Item -LiteralPath $starladderInstalledApp -Recurse -Force
        }
        Move-Item -LiteralPath $packagedApp -Destination $starladderInstalledApp
        $packagedApp = $starladderInstalledApp
        Write-Host 'Updated the local packaged STARLADDER application.' -ForegroundColor Cyan
    } else {
        Write-Host 'STARLADDER is open; preserved the local application and staged the new release separately.' -ForegroundColor Yellow
    }
    Set-Content -LiteralPath $starladderPackagedPathMarker -Value $packagedApp -Encoding ascii -NoNewline
} finally {
    if (Test-Path -LiteralPath $starladderStage) {
        Remove-Item -LiteralPath $starladderStage -Recurse -Force
    }
}
