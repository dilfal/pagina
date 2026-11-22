# Mouse vero (SendInput-like via mouse_event) sullo schermo: mouse.ps1 drag|click|dbl x1 y1 [x2 y2]   (px dello schermo)
param([string]$Az, [int]$X1, [int]$Y1, [int]$X2 = 0, [int]$Y2 = 0)
$src = @'
using System; using System.Runtime.InteropServices;
public static class M {
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint f, int dx, int dy, uint d, IntPtr e);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
'@
if (-not ('M' -as [type])) { Add-Type -TypeDefinition $src }
[void][M]::SetProcessDPIAware()
$p = Get-Process pagina -ErrorAction SilentlyContinue | Where-Object MainWindowHandle -ne 0 | Select-Object -First 1
if ($p) { [void][M]::SetForegroundWindow($p.MainWindowHandle); Start-Sleep -Milliseconds 150 }
$DOWN = 0x2; $UP = 0x4
function Click { [M]::mouse_event($DOWN,0,0,0,[IntPtr]::Zero); Start-Sleep -Milliseconds 40; [M]::mouse_event($UP,0,0,0,[IntPtr]::Zero) }
[void][M]::SetCursorPos($X1, $Y1); Start-Sleep -Milliseconds 80
switch ($Az) {
  'click' { Click }
  'dbl' { Click; Start-Sleep -Milliseconds 60; Click }
  'drag' {
    [M]::mouse_event($DOWN,0,0,0,[IntPtr]::Zero); Start-Sleep -Milliseconds 80
    $steps = 12
    for ($i = 1; $i -le $steps; $i++) { [void][M]::SetCursorPos([int]($X1 + ($X2 - $X1) * $i / $steps), [int]($Y1 + ($Y2 - $Y1) * $i / $steps)); Start-Sleep -Milliseconds 25 }
    Start-Sleep -Milliseconds 80; [M]::mouse_event($UP,0,0,0,[IntPtr]::Zero)
  }
}
