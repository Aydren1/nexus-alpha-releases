$ErrorActionPreference = 'Stop'

$nexusRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$nexusRelease = Join-Path $nexusRoot 'release'
$nexusPackagedPathMarker = Join-Path $nexusRelease '.nexus-packaged-app-path'
$nexusApp = if (Test-Path -LiteralPath $nexusPackagedPathMarker) { (Get-Content -LiteralPath $nexusPackagedPathMarker -Raw).Trim() } else { Join-Path $nexusRelease 'NEXUS-win32-x64' }
$nexusZip = Join-Path $nexusRelease 'NEXUS-0.5.0-alpha.7.12-win-x64.zip'
$nexusDocs = Join-Path $nexusRoot 'alpha-release'
$nexusChecksum = Join-Path $nexusRelease 'SHA256SUMS.txt'

if (-not (Test-Path -LiteralPath (Join-Path $nexusApp 'NEXUS.exe'))) {
    throw 'The packaged NEXUS application was not found.'
}
$releasePrefix = [IO.Path]::GetFullPath($nexusRelease).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (-not [IO.Path]::GetFullPath($nexusApp).StartsWith($releasePrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The packaged application path escaped the release directory.'
}

foreach ($document in @('TESTER_GUIDE.md', 'TESTER_REPORT.md', 'KNOWN_ISSUES.md', 'PRIVACY_NOTICE.md')) {
    Copy-Item -LiteralPath (Join-Path $nexusDocs $document) -Destination (Join-Path $nexusApp $document) -Force
}

if (Test-Path -LiteralPath $nexusZip) {
    Remove-Item -LiteralPath $nexusZip -Force
}

Compress-Archive -Path (Join-Path $nexusApp '*') -DestinationPath $nexusZip -CompressionLevel Optimal
$nexusHash = (Get-FileHash -LiteralPath $nexusZip -Algorithm SHA256).Hash
Set-Content -LiteralPath $nexusChecksum -Value "$nexusHash *$(Split-Path -Leaf $nexusZip)" -Encoding ascii
Write-Host "Portable alpha created: $nexusZip" -ForegroundColor Green
Write-Host "Checksum manifest created: $nexusChecksum" -ForegroundColor Green
