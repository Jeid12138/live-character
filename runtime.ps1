$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = Join-Path $env:LOCALAPPDATA 'LiveCharacter'
[void][IO.Directory]::CreateDirectory($root)
$mutex = New-Object Threading.Mutex($false,'Local\LiveCharacterRuntime05')
try {
  try { $locked = $mutex.WaitOne(300000) } catch [Threading.AbandonedMutexException] { $locked = $true }
  if (!$locked) { throw 'Another desktop pet installation is still running.' }
  . (Join-Path $PSScriptRoot 'dependencies.ps1')
  Ensure-Dependencies
  . (Join-Path $PSScriptRoot 'release-runtime.ps1')
  $codeManifest=Get-Content (Join-Path $PSScriptRoot 'runtime-code-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if($codeManifest.version -ne $script:depVersion){throw '安装包程序清单版本不匹配，请重新安装完整插件包'}
  $application=Ensure-ApplicationRelease $root $PSScriptRoot $codeManifest
  if($application.repaired){$script:depInstalled=$true}
  $release=$application.path

  # Retire only unmodified generated files from known versions. Leave custom files and running releases alone.
  try {
    $processes = @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.Name -match '^(electron|python)(w)?\.exe$' })
    $catalog = Get-Content (Join-Path $PSScriptRoot 'desktop/release-files.json') -Raw | ConvertFrom-Json
    foreach ($version in $catalog.PSObject.Properties) {
      $old = Join-Path $root $version.Name
      if (!(Test-Path -LiteralPath $old) -or ($processes | Where-Object { !$_.CommandLine -or $_.CommandLine.IndexOf($old,[StringComparison]::OrdinalIgnoreCase) -ge 0 })) {continue}
      if ((Get-Item -LiteralPath $old).Attributes -band [IO.FileAttributes]::ReparsePoint) {continue}
      foreach ($record in $version.Value.PSObject.Properties) {
        $file = Join-Path $old $record.Name
        $cursor = $file
        $safe = $true
        while ($cursor -ne $old) {
          if (!(Test-Path -LiteralPath $cursor) -or ((Get-Item -LiteralPath $cursor).Attributes -band [IO.FileAttributes]::ReparsePoint)) {$safe=$false;break}
          $cursor = Split-Path $cursor -Parent
        }
        if ($safe -and (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -eq $record.Value) {[IO.File]::Delete($file)}
      }
      $labDir = Join-Path $old 'lab'
      $cache = Join-Path $labDir '__pycache__'
      if ((Test-Path -LiteralPath $cache) -and !((Get-Item -LiteralPath $labDir).Attributes -band [IO.FileAttributes]::ReparsePoint) -and !((Get-Item -LiteralPath $cache).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        Get-ChildItem -LiteralPath $cache -File | Where-Object { $_.Name -match '^(server|companion|focus_input)\.cpython-\d+(\.opt-[12])?\.pyc$' -and !($_.Attributes -band [IO.FileAttributes]::ReparsePoint) } | ForEach-Object { [IO.File]::Delete($_.FullName) }
        if (!(Get-ChildItem -LiteralPath $cache -Force)) {[IO.Directory]::Delete($cache)}
      }
      foreach ($sub in @('lab/vendor','lab','desktop','')) {
        $dir=if ($sub) {Join-Path $old $sub} else {$old}
        if ((Test-Path -LiteralPath $dir) -and !((Get-Item -LiteralPath $dir).Attributes -band [IO.FileAttributes]::ReparsePoint) -and !(Get-ChildItem -LiteralPath $dir -Force)) {[IO.Directory]::Delete($dir)}
      }
    }
  } catch { Write-Verbose $_.Exception.Message }

  $message=if($script:depInstalled){'依赖修复完成，运行环境已就绪。请点击“启动角色”。'}else{'运行依赖检查通过，正在启动角色…'}
  Write-DependencyStatus 'ready' $message
} catch [OperationCanceledException] {
  exit 2
} catch {
  $detail=$_.Exception.Message
  if (Get-Command Write-DependencyStatus -ErrorAction SilentlyContinue) {
    try {Write-DependencyStatus 'failed' ('运行环境准备失败：'+$detail)} catch {}
  }
  Add-Type -AssemblyName System.Windows.Forms
  [void][Windows.Forms.MessageBox]::Show($detail,'Live Character · 运行环境')
  exit 1
} finally {
  if (Get-Command Close-DependencyProgress -ErrorAction SilentlyContinue) {Close-DependencyProgress}
  if ($locked) { $mutex.ReleaseMutex() }; $mutex.Dispose()
}
