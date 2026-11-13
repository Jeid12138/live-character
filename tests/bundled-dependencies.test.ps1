#requires -Version 5.1
# Validates real shipped Windows payloads. Native Windows executable probes are explicitly stubbed.
$ErrorActionPreference='Stop'
$script:depPackageRoot=Split-Path $PSScriptRoot -Parent
$t=$null;$e=$null;$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $script:depPackageRoot 'dependencies.ps1'),[ref]$t,[ref]$e);if($e){throw ($e|Out-String)}
foreach($n in $ast.EndBlock.Statements){if($n -is [Management.Automation.Language.FunctionDefinitionAst]){Invoke-Expression $n.Extent.Text}}
function Open-DependencyProgress(){}
function Close-DependencyProgress(){}
function Assert-Runtime($directory,$dependency){}
function Get-CimInstance{return @()}
function Confirm-CoreConsent($dep){if(!(Test-CoreConsent $dep)){throw 'test setup must supply explicit consent'}}
function Check($v,$message){if(!$v){throw $message}}
$root=Join-Path ([IO.Path]::GetTempPath()) ('lc-bundled-test-'+[Guid]::NewGuid().ToString('N'));[void][IO.Directory]::CreateDirectory($root)
$script:depVersion='test';$script:depProgress=$null;$script:depInstalled=$false;$script:depEvents=New-Object 'System.Collections.Generic.List[object]';$script:depStateFile=Join-Path $root 'install-state.json';$script:depStatusFile=Join-Path $root 'install-status.json';$script:depLog=Join-Path $root 'dependency-log.json'
$script:depManifest=Get-Content (Join-Path $script:depPackageRoot 'runtime-manifest.json') -Raw|ConvertFrom-Json
$script:depState=[pscustomobject]@{schema=1;pluginVersion='test';dependencies=[pscustomobject]@{}}
try{
 $core=$script:depManifest.dependencies|Where-Object {$_.id -eq 'cubism-core'};$record=Get-DependencyRecord $core.id;$record|Add-Member NoteProperty licenseRevision $core.licenseRevision;$script:depState.dependencies|Add-Member NoteProperty $core.id $record
 foreach($dep in $script:depManifest.dependencies){
  $archive=Get-BundledArchive $dep;Check (Test-Path $archive) 'Bundled archive missing'
  Install-Dependency $dep
  Assert-Payload (Join-Path $root $dep.directory) $dep (Get-DependencyRecord $dep.id)
  $first=Join-Path (Join-Path $root $dep.directory) $dep.required[0];[IO.File]::WriteAllText($first,'test corruption')
  Check (@(Get-DependencyIssues|Where-Object {$_.id -eq $dep.id}).Count -eq 1) 'Corrupted runtime not rejected'
  Install-Dependency $dep
  Assert-Payload (Join-Path $root $dep.directory) $dep (Get-DependencyRecord $dep.id)
  Write-Output ('PASS shipped '+$dep.id+' archive hash, extraction, full file hashes, corruption detection and local repair')
 }
 Check (@(Get-DependencyIssues).Count -eq 0) 'All repaired shipped dependencies must be valid'
 $bad=$script:depManifest.dependencies[0].PSObject.Copy();$bad.bundledArchive='not-shipped.zip';$denied=$false
 try{Get-BundledArchive $bad}catch{$denied=$_.Exception.Message -match '不会联网下载'};Check $denied 'Missing bundled payload did not fail closed'
 $fake=Join-Path $root 'bad.zip';[IO.File]::WriteAllText($fake,'corrupt zip');$originalRoot=$script:depPackageRoot;$script:depPackageRoot=$root;$bad.bundledArchive='bad.zip';$denied=$false
 try{Get-BundledArchive $bad}catch{$denied=$_.Exception.Message -match '校验失败'};Check $denied 'Corrupt bundled archive accepted';$script:depPackageRoot=$originalRoot
 Write-Output 'PASS absent/corrupt shipped archives fail with local reinstall instructions; no dependency network path exists'
}finally{Remove-Item -LiteralPath $root -Recurse -Force}
