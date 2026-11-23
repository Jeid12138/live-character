$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
# Hosts launched from PowerShell 7 can pass incompatible built-in modules to Windows PowerShell.
$env:PSModulePath = [IO.Path]::Combine($PSHOME, 'Modules') + [IO.Path]::PathSeparator + $env:PSModulePath
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
  & (Join-Path $root 'python-3.13.9/python.exe') -I -B (Join-Path $release 'desktop/brand-runtime.py') (Join-Path $root 'electron-45.2.3')
  if ($LASTEXITCODE -ne 0) {throw '无法准备 Live Character 桌面程序，请重试运行环境检查。'}

  try {Save-ApplicationReceipt $root $codeManifest} catch {Add-DependencyEvent 'application' 'receipt-deferred' $_.Exception.Message}
  try {
    Remove-RetiredApplicationReleases $root $codeManifest.version (Join-Path $PSScriptRoot 'desktop/release-files.json')
  } catch {Add-DependencyEvent 'application' 'cleanup-deferred' $_.Exception.Message}

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
