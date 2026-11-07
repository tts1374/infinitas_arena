param(
  [ValidateSet('Capture','Focus')][string]$Action,
  [long]$WindowHandle = 0,
  [int]$ExpectedPid,
  [string]$CreatedAt,
  [string]$ExecutablePath,
  [string]$WindowTitle = '',
  [switch]$MemoryCapture,
  [string]$Destination = ''
)
$ErrorActionPreference = 'Stop'
$ownedProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $ExpectedPid"
if (!$ownedProcess -or $ownedProcess.ExecutablePath -ne $ExecutablePath -or $ownedProcess.CreationDate.ToUniversalTime().ToString('o') -ne $CreatedAt) { throw 'Window process identity mismatch' }
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class DevControlWindow {
  public delegate bool EnumWindowProc(IntPtr hwnd, IntPtr parameter);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowProc callback, IntPtr parameter);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd, System.Text.StringBuilder text, int count);
  public static IntPtr FindOwnedWindow(uint expectedPid, string expectedTitle) {
    IntPtr found=IntPtr.Zero; bool duplicate=false;
    EnumWindows((hwnd, parameter) => {
      uint pid; GetWindowThreadProcessId(hwnd, out pid);
      if(pid==expectedPid) {
        var title=new System.Text.StringBuilder(1024); GetWindowText(hwnd,title,title.Capacity);
        if(title.ToString()==expectedTitle) { if(found!=IntPtr.Zero)duplicate=true; found=hwnd; }
      }
      return true;
    }, IntPtr.Zero);
    return duplicate?IntPtr.Zero:found;
  }
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd, int command);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
}
'@
if ($WindowHandle -eq 0) {
  if (!$WindowTitle) { throw 'An exact owned window title is required' }
  $WindowHandle = [DevControlWindow]::FindOwnedWindow([uint32]$ExpectedPid, $WindowTitle).ToInt64()
}
$captureWindow = [IntPtr]::new($WindowHandle)
[uint32]$actualPid = 0
[void][DevControlWindow]::GetWindowThreadProcessId($captureWindow, [ref]$actualPid)
if ($captureWindow -eq [IntPtr]::Zero -or $actualPid -ne $ExpectedPid) { throw 'Owned window is unavailable' }
if ($Action -eq 'Focus') {
  [void][DevControlWindow]::ShowWindow($captureWindow, 9)
  if (![DevControlWindow]::SetForegroundWindow($captureWindow)) { throw 'Window focus was not confirmed' }
  @{ status = 'focused' } | ConvertTo-Json -Compress
  exit
}
if (![DevControlWindow]::IsWindowVisible($captureWindow) -or [DevControlWindow]::IsIconic($captureWindow)) { throw 'Window is hidden or minimized; image unavailable' }
Add-Type -AssemblyName System.Drawing
$bounds = New-Object DevControlWindow+Rect
if (![DevControlWindow]::GetWindowRect($captureWindow, [ref]$bounds)) { throw 'Cannot read window bounds' }
$width = $bounds.Right - $bounds.Left
$height = $bounds.Bottom - $bounds.Top
if ($width -lt 1 -or $height -lt 1 -or $width -gt 8192 -or $height -gt 8192) { throw 'Invalid window image dimensions' }
$bitmap = [System.Drawing.Bitmap]::new($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $dc = $graphics.GetHdc()
  try { if (![DevControlWindow]::PrintWindow($captureWindow, $dc, 2)) { throw 'Native window capture failed' } }
  finally { $graphics.ReleaseHdc($dc) }
  $first = $bitmap.GetPixel(0, 0).ToArgb()
  $different = $false
  for ($x = 0; $x -lt $width; $x += [Math]::Max(1, [int]($width / 32))) {
    for ($y = 0; $y -lt $height; $y += [Math]::Max(1, [int]($height / 32))) {
      if ($bitmap.GetPixel($x, $y).ToArgb() -ne $first) { $different = $true }
    }
  }
  if (!$different) { throw 'Native window capture is blank; image unavailable' }
  if ($MemoryCapture) {
    $buffer = [System.IO.MemoryStream]::new()
    try {
      $bitmap.Save($buffer, [System.Drawing.Imaging.ImageFormat]::Png)
      $bytes = $buffer.ToArray()
      [Console]::OpenStandardOutput().Write($bytes, 0, $bytes.Length)
    } finally { $buffer.Dispose() }
  } else {
    $bitmap.Save($Destination, [System.Drawing.Imaging.ImageFormat]::Png)
    @{ status = 'captured' } | ConvertTo-Json -Compress
  }
} finally { $graphics.Dispose(); $bitmap.Dispose() }
