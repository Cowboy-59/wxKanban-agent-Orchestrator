# Generate the social-preview card (1200x630) for windev.wxperts.com.
# Composites the founder avatar (circular, amber ring) beside the headline.
# Usage:  pwsh marketing/site/deploy/make-og-image.ps1
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"

$root       = "marketing/site"
$avatarPath = Resolve-Path (Join-Path $root "avatar.png")
$outPath    = Join-Path (Get-Location) (Join-Path $root "og-image.png")

$W = 1200; $H = 630
$bmp = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.TextRenderingHint  = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

# --- background gradient (navy) ---
$rect = New-Object System.Drawing.Rectangle(0, 0, $W, $H)
$c1 = [System.Drawing.Color]::FromArgb(27, 40, 64)
$c2 = [System.Drawing.Color]::FromArgb(15, 23, 34)
$bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, 60)
$g.FillRectangle($bg, $rect)

# --- brushes ---
$amber   = [System.Drawing.Color]::FromArgb(200, 118, 27)
$amberLt = [System.Drawing.Color]::FromArgb(240, 184, 120)
$brAmber   = New-Object System.Drawing.SolidBrush($amber)
$brAmberLt = New-Object System.Drawing.SolidBrush($amberLt)
$brWhite   = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$brGrey    = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(200, 208, 220))

# --- accent bar + text (left) ---
$g.FillRectangle($brAmber, 66, 92, 84, 8)
$fH    = New-Object System.Drawing.Font("Segoe UI", 40, [System.Drawing.FontStyle]::Bold)
$fSub  = New-Object System.Drawing.Font("Segoe UI", 24, [System.Drawing.FontStyle]::Regular)
$fSubB = New-Object System.Drawing.Font("Segoe UI", 24, [System.Drawing.FontStyle]::Bold)
$fFoot = New-Object System.Drawing.Font("Segoe UI", 23, [System.Drawing.FontStyle]::Bold)

$g.DrawString("From WINDEV to AI",        $fH,    $brWhite,   62, 122)
$g.DrawString("software you actually own", $fH,    $brWhite,   62, 186)
$g.DrawString("Built by converting a real WINDEV app.", $fSub,  $brGrey,    66, 290)
$g.DrawString("wxKanban is the proof.",    $fSubB, $brAmberLt, 66, 326)
$g.DrawString("windev.wxperts.com",        $fFoot, $brAmberLt, 66, 446)
$g.DrawString("5 hands-on beta spots",     $fFoot, $brWhite,   66, 490)

# --- avatar circle (right) ---
$avatar = [System.Drawing.Image]::FromFile($avatarPath)
$side = [Math]::Min($avatar.Width, $avatar.Height)
$srcX = [int](($avatar.Width - $side) / 2)
$src = New-Object System.Drawing.Rectangle($srcX, 0, $side, $side)  # top square = head & shoulders

$cx = 975; $cy = 315; $r = 212
$x0 = $cx - $r; $y0 = $cy - $r; $d = $r * 2          # precompute (comma binds tighter than '-')
$rx = $cx - $r - 7; $ry = $cy - $r - 7; $rd = ($r + 7) * 2
$g.FillEllipse($brAmber, $rx, $ry, $rd, $rd)        # amber ring
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddEllipse($x0, $y0, $d, $d)
$g.SetClip($path)
$dest = New-Object System.Drawing.Rectangle($x0, $y0, $d, $d)
$g.DrawImage($avatar, $dest, $src, [System.Drawing.GraphicsUnit]::Pixel)
$g.ResetClip()

$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose(); $avatar.Dispose()
Write-Host "Wrote $outPath ($W x $H)"
