#requires -Version 5.1
$ErrorActionPreference = 'Stop'
$package = Split-Path $PSScriptRoot -Parent
$root = Join-Path ([IO.Path]::GetTempPath()) ('lc-upgrade-test-'+[Guid]::NewGuid().ToString('N'))
$t = $null; $e = $null
$ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $package 'dependencies.ps1'),[ref]$t,[ref]$e)
if ($e) {throw ($e | Out-String)}
Invoke-Expression ($ast.EndBlock.Statements | Where-Object {$_.Name -eq 'Write-AtomicJson'}).Extent.Text
. (Join-Path $package 'release-runtime.ps1')

function Get-CimInstance {return $script:processes}
function Add-DependencyEvent($id,$action,$detail) {}
function Check($value,$message) {if (!$value) {throw $message}}
function Write-Fixture($relative,$value) {
  $path = Join-Path $root $relative
  [void][IO.Directory]::CreateDirectory((Split-Path $path -Parent))
  [IO.File]::WriteAllText($path,$value)
  return $path
}
try {
  $old = Write-Fixture 'app-1.0.1/desktop/main.cjs' 'owned'
  $changed = Write-Fixture 'app-1.0.1/lab/modified.py' 'owned'
  $custom = Write-Fixture 'app-1.0.1/lab/custom.py' 'custom'
  $cache = Write-Fixture 'app-1.0.1/lab/__pycache__/server.cpython-313.pyc' 'unknown'
  $active = Write-Fixture 'app-1.0.2/desktop/main.cjs' 'owned'
  $future = Write-Fixture 'app-1.0.10/desktop/main.cjs' 'owned'
  $running = Write-Fixture 'app-0.99.0/desktop/main.cjs' 'owned'
  $legacy = Write-Fixture 'app-0.12.46/desktop/main.cjs' 'owned'
  $unknown = Write-Fixture 'app-0.50.0/desktop/main.cjs' 'owned'
  $noncanonical = Write-Fixture 'app-00.12.46/desktop/main.cjs' 'owned'
  $outside = Write-Fixture 'outside/main.cjs' 'owned'
  $link = Join-Path $root 'app-1.0.1/desktop/linked'
  [void](New-Item -ItemType Junction -Path $link -Target (Split-Path $outside -Parent))
  $hash = (Get-FileHash -LiteralPath $old).Hash
  $main = @{path='desktop/main.cjs';sha256=$hash}
  $receiptFiles = @($main,
    @{path='lab/modified.py';sha256=$hash},
    @{path='desktop/linked/main.cjs';sha256=$hash},
    @{path='lab/../../outside/main.cjs';sha256=$hash})
  Save-ApplicationReceipt $root @{version='1.0.1';files=$receiptFiles}
  Save-ApplicationReceipt $root @{version='1.0.2';files=@($main)}
  Save-ApplicationReceipt $root @{version='1.0.10';files=@($main)}
  Save-ApplicationReceipt $root @{version='0.99.0';files=@($main)}
  [IO.File]::WriteAllText($changed,'modified')
  $catalog = Write-Fixture 'catalog.json' (@{
      'app-0.12.46' = @{'desktop/main.cjs'=$hash}
      'app-00.12.46' = @{'desktop/main.cjs'=$hash}
    } | ConvertTo-Json)
  $script:processes = @([pscustomobject]@{Name='python.exe';CommandLine=$null})
  Remove-RetiredApplicationReleases $root '1.0.2' $catalog
  Check (Test-Path -LiteralPath $old) 'Cleanup proceeded while a runtime command line was unreadable'
  Check (Test-Path -LiteralPath $legacy) 'Legacy cleanup proceeded while a runtime command line was unreadable'

  $script:processes = @([pscustomobject]@{Name='Live Character.exe';CommandLine='electron "'+$running.Replace('\','/')+'"'})
  $locked = [IO.File]::Open($old,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
  try {
    Remove-RetiredApplicationReleases $root '1.0.2' $catalog
    Check (Test-Path -LiteralPath $old) 'Locked release file disappeared'
    Check (!(Test-Path -LiteralPath $legacy)) 'Locked release prevented cleanup of another version'
  } finally {$locked.Dispose()}

  Remove-RetiredApplicationReleases $root '1.0.2' $catalog
  Check (!(Test-Path -LiteralPath $old)) 'Cleanup failed to retry a locked file'
  Check (!(Test-Path -LiteralPath (Join-Path $root 'app-0.12.46'))) 'Empty legacy release survived'
  foreach ($file in @($changed,$custom,$cache,$active,$future,$running,$unknown,$noncanonical,$outside,$link)) {
    Check (Test-Path -LiteralPath $file) "Cleanup removed $file"
  }
  $script:processes = @()
  Remove-RetiredApplicationReleases $root '1.0.2' $catalog
  Check (!(Test-Path -LiteralPath $running)) 'Stopped runtime release survived cleanup'
  Check (!(Test-Path -LiteralPath (Join-Path $root '.app-0.99.0.receipt.json'))) 'Removed release receipt survived'
  Check (Test-Path -LiteralPath (Join-Path $root '.app-1.0.1.receipt.json')) 'Partial cleanup removed receipt'
  Write-Output 'PASS release receipts, legacy cleanup, retry, version and process protection, preserved files and junctions'
} finally {
  if ($link -and (Test-Path -LiteralPath $link)) {[IO.Directory]::Delete($link)}
  if (Test-Path -LiteralPath $root) {Remove-Item -LiteralPath $root -Recurse -Force}
}
