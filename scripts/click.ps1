# Click (or double-click) inside the DSH window at window-relative coordinates.
# Usage: pwsh -File scripts/click.ps1 -X 400 -Y 300 [-Double] [-Right] [-Move]
param(
  [Parameter(Mandatory = $true)][int]$X,
  [Parameter(Mandatory = $true)][int]$Y,
  [switch]$Double,
  [switch]$Right,
  [switch]$Move,
  [ValidateSet('click', 'down', 'up')][string]$Action = 'click',
  [string]$TitleMatch = 'DeepSeek Harness'
)

Add-Type -AssemblyName System.Windows.Forms

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public struct RECTCLICK { public int Left, Top, Right, Bottom; }
public static class Win32Click {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECTCLICK rect);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
}
'@

[Win32Click]::SetProcessDPIAware() | Out-Null

$proc = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.ProcessName -like "*$TitleMatch*" } | Select-Object -First 1
if (-not $proc) { throw "DSH window not found" }
$hwnd = $proc.MainWindowHandle
[Win32Click]::SetForegroundWindow($hwnd) | Out-Null
Start-Sleep -Milliseconds 150

$rect = New-Object RECTCLICK
[Win32Click]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
$absX = $rect.Left + $X
$absY = $rect.Top + $Y
[Win32Click]::SetCursorPos($absX, $absY) | Out-Null
Start-Sleep -Milliseconds 120
if ($Move) { "moved to $absX,$absY"; exit 0 }

$down = 0x0002
$up = 0x0004
$rightDown = 0x0008
$rightUp = 0x0010

if ($Action -eq 'down') {
  [Win32Click]::mouse_event($down, 0, 0, 0, [UIntPtr]::Zero)
  "mouse down at $absX,$absY"
  exit 0
}
if ($Action -eq 'up') {
  [Win32Click]::mouse_event($up, 0, 0, 0, [UIntPtr]::Zero)
  "mouse up at $absX,$absY"
  exit 0
}

if ($Right) {
  [Win32Click]::mouse_event($rightDown, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 40
  [Win32Click]::mouse_event($rightUp, 0, 0, 0, [UIntPtr]::Zero)
} else {
  [Win32Click]::mouse_event($down, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 40
  [Win32Click]::mouse_event($up, 0, 0, 0, [UIntPtr]::Zero)
  if ($Double) {
    Start-Sleep -Milliseconds 60
    [Win32Click]::mouse_event($down, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 40
    [Win32Click]::mouse_event($up, 0, 0, 0, [UIntPtr]::Zero)
  }
}
"clicked $absX,$absY (window +$X,+$Y)"
