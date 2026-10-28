# Inspect and drive the DSH window through UI Automation.
# Usage:
#   pwsh -File scripts/uia.ps1 -List [-Filter 音乐]
#   pwsh -File scripts/uia.ps1 -Name '音乐' [-Invoke] [-Click]
param(
  [switch]$List,
  [string]$Filter = '',
  [string]$Name,
  [switch]$Invoke,
  [switch]$Click,
  [int]$Max = 40
)

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms

$root = [System.Windows.Automation.AutomationElement]::RootElement
$proc = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.ProcessName -like '*DeepSeek Harness*' } | Select-Object -First 1
if (-not $proc) { throw 'DSH window not found' }
$win = [System.Windows.Automation.AutomationElement]::FromHandle($proc.MainWindowHandle)

if ($List) {
  $all = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  $rows = foreach ($el in $all) {
    try {
      $current = $el.Current
      $name = $current.Name
      if ([string]::IsNullOrWhiteSpace($name)) { continue }
      if ($Filter -ne '' -and $name -notlike "*$Filter*") { continue }
      [pscustomobject]@{
        Type = $current.ControlType.ProgrammaticName -replace 'ControlType\.', ''
        Name = $name
        X = [int]$current.BoundingRectangle.X
        Y = [int]$current.BoundingRectangle.Y
        W = [int]$current.BoundingRectangle.Width
        H = [int]$current.BoundingRectangle.Height
      }
    } catch { }
  }
  $rows | Select-Object -First $Max | Format-Table -AutoSize | Out-String -Width 200
  "total matched: $($rows.Count)"
  exit 0
}

if (-not $Name) { throw 'pass -Name or -List' }

$cond = New-Object System.Windows.Automation.PropertyCondition ([System.Windows.Automation.AutomationElement]::NameProperty), $Name
$target = $win.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
if (-not $target) { throw "element named '$Name' not found" }
$rect = $target.Current.BoundingRectangle
"found '$Name' at $([int]$rect.X),$([int]$rect.Y) size $([int]$rect.Width)x$([int]$rect.Height) type=$($target.Current.ControlType.ProgrammaticName)"

if ($Invoke) {
  $pattern = $null
  if ($target.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) {
    $pattern.Invoke()
    'invoked'
  } else { 'no InvokePattern' }
}

if ($Click) {
  [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point ([int]($rect.X + $rect.Width / 2)), ([int]($rect.Y + $rect.Height / 2))
  Start-Sleep -Milliseconds 150
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class UiaClick {
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
}
'@
  [UiaClick]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 40
  [UiaClick]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
  'clicked'
}
