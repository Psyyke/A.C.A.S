param([string]$ProfilePath, [string]$OverlayHandle = "0")
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class OverlayNativeBounds {
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int left, top, right, bottom; }
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr handle, out Rect rect);
    [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
}
'@
[OverlayNativeBounds]::SetThreadDpiAwarenessContext([IntPtr](-4)) | Out-Null
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$chrome = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'chrome.exe' -and $_.CommandLine -and $_.CommandLine.Contains($ProfilePath) -and -not $_.CommandLine.Contains('--type=')
} | Select-Object -First 1
if(-not $chrome) { throw 'Isolated Chrome process not found' }
$handle = (Get-Process -Id $chrome.ProcessId).MainWindowHandle
$root = [System.Windows.Automation.AutomationElement]::FromHandle($handle)
$condition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::NameProperty, 'ACAS overlay alignment test board')
$board = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
if(-not $board) { throw 'Test board accessibility element not found' }
$boardRect = $board.Current.BoundingRectangle
$browserRect = New-Object OverlayNativeBounds+Rect
[OverlayNativeBounds]::GetWindowRect($handle, [ref]$browserRect) | Out-Null
$overlayRect = New-Object OverlayNativeBounds+Rect
if($OverlayHandle -ne '0') { [OverlayNativeBounds]::GetWindowRect([IntPtr]([Int64]$OverlayHandle), [ref]$overlayRect) | Out-Null }
@{
    browser = @{ x=$browserRect.left; y=$browserRect.top; width=$browserRect.right-$browserRect.left; height=$browserRect.bottom-$browserRect.top }
    board = @{ x=$boardRect.X; y=$boardRect.Y; width=$boardRect.Width; height=$boardRect.Height }
    overlay = @{ x=$overlayRect.left; y=$overlayRect.top; width=$overlayRect.right-$overlayRect.left; height=$overlayRect.bottom-$overlayRect.top }
} | ConvertTo-Json -Compress
