$ErrorActionPreference = 'Stop'

$nexusRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$nexusRelease = Join-Path $nexusRoot 'release'
$nexusStage = Join-Path $nexusRelease '.nexus-package-stage'
$nexusOutput = Join-Path $nexusRelease '.nexus-packager-output'
$nexusInstalledApp = Join-Path $nexusRelease 'NEXUS-win32-x64'
$nexusPackagedPathMarker = Join-Path $nexusRelease '.nexus-packaged-app-path'
$nexusPackager = Join-Path $nexusRoot 'node_modules\.bin\electron-packager.cmd'
$nexusIcon = Join-Path $nexusRoot 'build\nexus.ico'

function Assert-ReleaseChild([string]$candidate) {
    $releasePrefix = [IO.Path]::GetFullPath($nexusRelease).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    $resolved = [IO.Path]::GetFullPath($candidate)
    if (-not $resolved.StartsWith($releasePrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Packaging path escaped the release directory: $resolved"
    }
}

if (-not (Test-Path -LiteralPath (Join-Path $nexusRoot 'dist\index.html'))) {
    throw 'The production renderer has not been built.'
}
if (-not (Test-Path -LiteralPath $nexusPackager)) {
    throw 'The Electron packager is not installed.'
}
if (-not (Test-Path -LiteralPath $nexusIcon)) {
    throw 'The NEXUS Windows icon was not generated.'
}

New-Item -ItemType Directory -Path $nexusRelease -Force | Out-Null
Assert-ReleaseChild $nexusStage
Assert-ReleaseChild $nexusOutput
if (Test-Path -LiteralPath $nexusStage) {
    Remove-Item -LiteralPath $nexusStage -Recurse -Force
}
if (Test-Path -LiteralPath $nexusOutput) {
    Remove-Item -LiteralPath $nexusOutput -Recurse -Force
}
New-Item -ItemType Directory -Path $nexusStage | Out-Null
New-Item -ItemType Directory -Path $nexusOutput | Out-Null

Copy-Item -LiteralPath (Join-Path $nexusRoot 'dist') -Destination $nexusStage -Recurse
Copy-Item -LiteralPath (Join-Path $nexusRoot 'electron') -Destination $nexusStage -Recurse
Copy-Item -LiteralPath (Join-Path $nexusRoot 'scripts\package-template.json') -Destination (Join-Path $nexusStage 'package.json')

try {
    # Windows executable resources accept at most four numeric components. Keep the
    # user-facing semver (0.5.0-alpha.7.13) in package.json and map it to 0.5.7.13 here.
    & $nexusPackager $nexusStage NEXUS --platform=win32 --arch=x64 --out=$nexusOutput --overwrite --prune=false --asar --icon=$nexusIcon --app-version=0.5.7.13 --build-version=0.5.7.13
    if ($LASTEXITCODE -ne 0) { throw 'Electron packaging failed.' }

    $packagedApp = Join-Path $nexusOutput 'NEXUS-win32-x64'
    $installedExe = Join-Path $nexusInstalledApp 'NEXUS.exe'
    $installedRunning = Get-Process -Name NEXUS -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $installedExe }
    if (-not $installedRunning) {
        Assert-ReleaseChild $nexusInstalledApp
        if (Test-Path -LiteralPath $nexusInstalledApp) {
            Remove-Item -LiteralPath $nexusInstalledApp -Recurse -Force
        }
        Move-Item -LiteralPath $packagedApp -Destination $nexusInstalledApp
        $packagedApp = $nexusInstalledApp
        Write-Host 'Updated the local packaged NEXUS application.' -ForegroundColor Cyan
    } else {
        Write-Host 'NEXUS is open; preserved the local application and staged the new release separately.' -ForegroundColor Yellow
    }
    Set-Content -LiteralPath $nexusPackagedPathMarker -Value $packagedApp -Encoding ascii -NoNewline
} finally {
    if (Test-Path -LiteralPath $nexusStage) {
        Remove-Item -LiteralPath $nexusStage -Recurse -Force
    }
}
