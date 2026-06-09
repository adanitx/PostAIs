$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

function New-RoundedRectPath {
  param(
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $Radius * 2

  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()

  return $path
}

$root = Split-Path -Parent $PSScriptRoot
$iconsDir = Join-Path $root 'assets\icons'
$pngPath = Join-Path $iconsDir 'postais-box-wings.png'
$icoPath = Join-Path $iconsDir 'postais-box-wings.ico'

if (-not (Test-Path $iconsDir)) {
  New-Item -Path $iconsDir -ItemType Directory | Out-Null
}

$size = 256
$bitmap = New-Object System.Drawing.Bitmap($size, $size)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$graphics.Clear([System.Drawing.Color]::Transparent)

# Soft midnight radial background.
$bgPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$bgPath.AddEllipse(8, 8, 240, 240)
$bgBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($bgPath)
$bgBrush.CenterColor = [System.Drawing.Color]::FromArgb(255, 21, 32, 62)
$bgBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(255, 11, 18, 38))
$graphics.FillEllipse($bgBrush, 8, 8, 240, 240)

# Magenta glow ring.
$glowPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(170, 221, 52, 187), 5)
$graphics.DrawEllipse($glowPen, 18, 18, 220, 220)

# Wing geometry.
$leftWing = New-Object System.Drawing.Point[] 6
$leftWing[0] = New-Object System.Drawing.Point(62, 126)
$leftWing[1] = New-Object System.Drawing.Point(26, 110)
$leftWing[2] = New-Object System.Drawing.Point(36, 138)
$leftWing[3] = New-Object System.Drawing.Point(20, 154)
$leftWing[4] = New-Object System.Drawing.Point(44, 170)
$leftWing[5] = New-Object System.Drawing.Point(68, 156)

$rightWing = New-Object System.Drawing.Point[] 6
$rightWing[0] = New-Object System.Drawing.Point(194, 126)
$rightWing[1] = New-Object System.Drawing.Point(230, 110)
$rightWing[2] = New-Object System.Drawing.Point(220, 138)
$rightWing[3] = New-Object System.Drawing.Point(236, 154)
$rightWing[4] = New-Object System.Drawing.Point(212, 170)
$rightWing[5] = New-Object System.Drawing.Point(188, 156)

$wingBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Point(20, 100)),
  (New-Object System.Drawing.Point(236, 170)),
  [System.Drawing.Color]::FromArgb(255, 255, 171, 235),
  [System.Drawing.Color]::FromArgb(255, 232, 105, 198)
)
$wingPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(220, 143, 24, 118), 3)

$graphics.FillPolygon($wingBrush, $leftWing)
$graphics.FillPolygon($wingBrush, $rightWing)
$graphics.DrawPolygon($wingPen, $leftWing)
$graphics.DrawPolygon($wingPen, $rightWing)

# Box shadow.
$shadowPath = New-RoundedRectPath -X 70 -Y 88 -Width 116 -Height 100 -Radius 18
$shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(95, 0, 0, 0))
$matrix = New-Object System.Drawing.Drawing2D.Matrix
$matrix.Translate(0, 7)
$shadowPath.Transform($matrix)
$graphics.FillPath($shadowBrush, $shadowPath)

# Main box.
$boxPath = New-RoundedRectPath -X 70 -Y 82 -Width 116 -Height 100 -Radius 18
$boxBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Point(70, 82)),
  (New-Object System.Drawing.Point(186, 182)),
  [System.Drawing.Color]::FromArgb(255, 255, 109, 206),
  [System.Drawing.Color]::FromArgb(255, 164, 215, 255)
)
$boxPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(230, 34, 17, 64), 3)
$graphics.FillPath($boxBrush, $boxPath)
$graphics.DrawPath($boxPen, $boxPath)

# Top flap.
$flap = New-Object System.Drawing.Point[] 4
$flap[0] = New-Object System.Drawing.Point(84, 102)
$flap[1] = New-Object System.Drawing.Point(128, 74)
$flap[2] = New-Object System.Drawing.Point(172, 102)
$flap[3] = New-Object System.Drawing.Point(128, 126)
$flapBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Point(84, 74)),
  (New-Object System.Drawing.Point(172, 126)),
  [System.Drawing.Color]::FromArgb(255, 255, 168, 232),
  [System.Drawing.Color]::FromArgb(255, 255, 84, 179)
)
$graphics.FillPolygon($flapBrush, $flap)
$graphics.DrawPolygon($boxPen, $flap)

# Monogram highlight.
$font = New-Object System.Drawing.Font('Segoe UI Semibold', 40, [System.Drawing.FontStyle]::Bold)
$letterBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(238, 20, 21, 54))
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$rect = New-Object System.Drawing.RectangleF(70, 108, 116, 66)
$graphics.DrawString('P', $font, $letterBrush, $rect, $format)

$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

# Build an ICO file containing the 256x256 PNG payload.
$pngBytes = [System.IO.File]::ReadAllBytes($pngPath)
$stream = [System.IO.File]::Open($icoPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
$writer = New-Object System.IO.BinaryWriter($stream)

$writer.Write([UInt16]0)     # Reserved
$writer.Write([UInt16]1)     # Image type: icon
$writer.Write([UInt16]1)     # Number of images
$writer.Write([Byte]0)       # Width: 0 means 256
$writer.Write([Byte]0)       # Height: 0 means 256
$writer.Write([Byte]0)       # Number of colors
$writer.Write([Byte]0)       # Reserved
$writer.Write([UInt16]1)     # Color planes
$writer.Write([UInt16]32)    # Bits per pixel
$writer.Write([UInt32]$pngBytes.Length)
$writer.Write([UInt32]22)    # Offset of image data
$writer.Write($pngBytes)

$writer.Close()
$stream.Close()

$graphics.Dispose()
$bitmap.Dispose()

Write-Output "Iconos generados:`n- $pngPath`n- $icoPath"
