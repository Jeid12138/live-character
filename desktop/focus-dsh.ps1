$ErrorActionPreference = 'SilentlyContinue'
$ancestor = [int]$env:PET_HOST
$shell = New-Object -ComObject WScript.Shell
for ($i=0; $i -lt 12 -and $ancestor -gt 0; $i++) {
  $row = Get-CimInstance Win32_Process -Filter "ProcessId=$ancestor"
  if (!$row) { break }
  $proc = Get-Process -Id $ancestor
  if ($proc.MainWindowHandle -and $proc.MainWindowTitle -match 'DeepSeek|Harness') {
    if ($shell.AppActivate($ancestor)) { break }
  }
  if ($row.Name -match '^(DeepSeek[ -]?Harness|dsh[ -]?desktop)\.exe$' -and $row.ExecutablePath) {
    Start-Process -FilePath $row.ExecutablePath
    break
  }
  $ancestor = [int]$row.ParentProcessId
}
