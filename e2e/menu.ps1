# Voci del menu nativo di Pagina via Win32 (GetMenu + WM_COMMAND): la UI Automation non espone la barra dei menu di muda.
#   menu.ps1 "Vista" "Solo testo"              clic sulla voce (percorso di voci per nome, senza acceleratore)
#   menu.ps1 -Stato "Vista" "Solo testo"       stampa checked=True/False senza cliccare
param([switch]$Stato, [Parameter(ValueFromRemainingArguments = $true)][string[]]$Voci)
$src = @'
using System; using System.Text; using System.Runtime.InteropServices;
public static class W {
 [DllImport("user32.dll")] public static extern IntPtr GetMenu(IntPtr h);
 [DllImport("user32.dll")] public static extern int GetMenuItemCount(IntPtr m);
 [DllImport("user32.dll")] public static extern IntPtr GetSubMenu(IntPtr m, int i);
 [DllImport("user32.dll")] public static extern uint GetMenuItemID(IntPtr m, int i);
 [DllImport("user32.dll")] public static extern uint GetMenuState(IntPtr m, uint pos, uint flags);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetMenuString(IntPtr m, uint id, StringBuilder s, int max, uint flags);
 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
}
'@
if (-not ('W' -as [type])) { Add-Type -TypeDefinition $src }
$p = Get-Process pagina -ErrorAction Stop | Where-Object MainWindowHandle -ne 0 | Select-Object -First 1
$h = $p.MainWindowHandle
$menu = [W]::GetMenu($h)
$id = 0; $checked = $false
foreach ($name in $Voci) {
  $n = [W]::GetMenuItemCount($menu); $found = $false
  for ($i = 0; $i -lt $n; $i++) {
    $sb = New-Object Text.StringBuilder 256
    [void][W]::GetMenuString($menu, $i, $sb, 256, 0x400)
    $txt = ($sb.ToString() -split "`t")[0] -replace '&', ''
    if ($txt -eq $name) {
      $found = $true
      $id = [W]::GetMenuItemID($menu, $i)
      $checked = (([W]::GetMenuState($menu, $i, 0x400) -band 8) -ne 0)
      $sub = [W]::GetSubMenu($menu, $i)
      if ($sub -ne [IntPtr]::Zero) { $menu = $sub }
      break
    }
  }
  if (-not $found) { Write-Error "voce non trovata: $name"; exit 1 }
}
if ($Stato) { Write-Output "checked=$checked"; exit 0 }
[void][W]::PostMessage($h, 0x111, [IntPtr]([int]$id), [IntPtr]::Zero)
Write-Output "ok: $($Voci -join ' > ')"
