param(
    [string]$Source = (Join-Path $PSScriptRoot '..\public\nexus-icon-512.png'),
    [string]$Destination = (Join-Path $PSScriptRoot '..\public\nexus-icon-512-cyan.png')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$sourcePath = (Resolve-Path -LiteralPath $Source).Path
$sourceBitmap = [System.Drawing.Bitmap]::FromFile($sourcePath)
$outputBitmap = New-Object System.Drawing.Bitmap($sourceBitmap.Width, $sourceBitmap.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($outputBitmap)
$graphics.DrawImageUnscaled($sourceBitmap, 0, 0)
$graphics.Dispose()
$sourceBitmap.Dispose()

# Tight lower-right fighter mask. Only the saturated blue body pixels are changed;
# the transparent background, white detail, navy panels, ring, and geometry remain intact.
$fighter = New-Object System.Drawing.Drawing2D.GraphicsPath
$points = [System.Drawing.Point[]]@(
    [System.Drawing.Point]::new(320, 329),
    [System.Drawing.Point]::new(362, 372),
    [System.Drawing.Point]::new(405, 376),
    [System.Drawing.Point]::new(420, 410),
    [System.Drawing.Point]::new(442, 489),
    [System.Drawing.Point]::new(370, 435),
    [System.Drawing.Point]::new(292, 449),
    [System.Drawing.Point]::new(348, 386)
)
$fighter.AddPolygon($points)

for ($y = 329; $y -lt 490; $y++) {
    for ($x = 292; $x -lt 443; $x++) {
        if (-not $fighter.IsVisible($x, $y)) { continue }
        $pixel = $outputBitmap.GetPixel($x, $y)
        if ($pixel.A -eq 0 -or $pixel.B -lt 175 -or $pixel.G -lt 95 -or $pixel.R -gt 75) { continue }

        $strength = [Math]::Min(1.0, [Math]::Max(0.0, ($pixel.B - 175) / 77.0))
        $red = [int][Math]::Round($pixel.R + ((66 - $pixel.R) * $strength))
        $green = [int][Math]::Round($pixel.G + ((217 - $pixel.G) * $strength))
        $blue = [int][Math]::Round($pixel.B + ((245 - $pixel.B) * $strength))
        $outputBitmap.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($pixel.A, $red, $green, $blue))
    }
}

$fighter.Dispose()
$destinationPath = [System.IO.Path]::GetFullPath($Destination)
$outputBitmap.Save($destinationPath, [System.Drawing.Imaging.ImageFormat]::Png)
$outputBitmap.Dispose()

Write-Host "Created $destinationPath"
