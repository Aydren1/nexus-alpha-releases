$ErrorActionPreference = 'Stop'

$starladderRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$starladderRelease = Join-Path $starladderRoot 'release'
$starladderPackagedPathMarker = Join-Path $starladderRelease '.starladder-packaged-app-path'
$starladderApp = if (Test-Path -LiteralPath $starladderPackagedPathMarker) { (Get-Content -LiteralPath $starladderPackagedPathMarker -Raw).Trim() } else { Join-Path $starladderRelease 'STARLADDER-Desktop-win32-x64' }
$starladderZip = Join-Path $starladderRelease 'STARLADDER-0.5.0-alpha.8.0-win-x64.zip'
$starladderDocs = Join-Path $starladderRoot 'alpha-release'
$starladderChecksum = Join-Path $starladderRelease 'SHA256SUMS.txt'

if (-not (Test-Path -LiteralPath (Join-Path $starladderApp 'STARLADDER.exe'))) {
    throw 'The packaged STARLADDER application was not found.'
}
$releasePrefix = [IO.Path]::GetFullPath($starladderRelease).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (-not [IO.Path]::GetFullPath($starladderApp).StartsWith($releasePrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The packaged application path escaped the release directory.'
}

foreach ($document in @('TESTER_GUIDE.md', 'TESTER_REPORT.md', 'KNOWN_ISSUES.md', 'PRIVACY_NOTICE.md')) {
    Copy-Item -LiteralPath (Join-Path $starladderDocs $document) -Destination (Join-Path $starladderApp $document) -Force
}

if (Test-Path -LiteralPath $starladderZip) {
    Remove-Item -LiteralPath $starladderZip -Force
}

Compress-Archive -Path (Join-Path $starladderApp '*') -DestinationPath $starladderZip -CompressionLevel Optimal
$starladderHash = (Get-FileHash -LiteralPath $starladderZip -Algorithm SHA256).Hash
Set-Content -LiteralPath $starladderChecksum -Value "$starladderHash *$(Split-Path -Leaf $starladderZip)" -Encoding ascii
Write-Host "Portable alpha created: $starladderZip" -ForegroundColor Green
Write-Host "Checksum manifest created: $starladderChecksum" -ForegroundColor Green
