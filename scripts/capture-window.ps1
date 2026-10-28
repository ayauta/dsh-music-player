# Capture the DSH window to a PNG for visual review.
# Usage: pwsh -File scripts/capture-window.ps1 -Out artifacts\shot.png [-Full]
param(
  [Parameter(Mandatory = $true)][string]$Out,
  [switch]$Full,
  [string]$TitleMatch = 'DeepSeek Harness'
)

Add-Type -AssemblyName System.Drawing

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public struct RECT { public int Left, Top, Right, Bottom; }
public static class Win32Cap {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint flags);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
'@

[Win32Cap]::SetProcessDPIAware() | Out-Null

$proc = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.ProcessName -like "*$TitleMatch*" } | Select-Object -First 1
if (-not $proc) { throw "DSH window not found" }
$hwnd = $proc.MainWindowHandle

if ([Win32Cap]::IsIconic($hwnd)) { [Win32Cap]::ShowWindow($hwnd, 9) | Out-Null; Start-Sleep -Milliseconds 400 }
[Win32Cap]::SetForegroundWindow($hwnd) | Out-Null
Start-Sleep -Milliseconds 400

$rect = New-Object RECT
[Win32Cap]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top
if ($width -le 0 -or $height -le 0) { throw "invalid window rect" }

$outPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $Out))
New-Item -ItemType Directory -Force -Path ([System.IO.Path]::GetDirectoryName($outPath)) | Out-Null

$bmp = New-Object System.Drawing.Bitmap $width, $height
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $gfx.GetHdc()
$ok = [Win32Cap]::PrintWindow($hwnd, $hdc, 2)
$gfx.ReleaseHdc($hdc)
$gfx.Dispose()

if ($ok) {
  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
} else {
  $bmp.Dispose()
  Add-Type -AssemblyName System.Windows.Forms
  $bmp2 = New-Object System.Drawing.Bitmap $width, $height
  $g2 = [System.Drawing.Graphics]::FromImage($bmp2)
  $g2.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size $width, $height))
  $g2.Dispose()
  $bmp2.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp2.Dispose()
}

"captured $outPath ($width x $height) printWindow=$ok pid=$($proc.Id)"
