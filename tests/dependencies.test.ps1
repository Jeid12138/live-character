#requires -Version 5.1
# No network, Electron, Cubism Core or Windows Forms required.
$ErrorActionPreference='Stop'
$source=Join-Path (Split-Path $PSScriptRoot -Parent) 'dependencies.ps1'
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($source,[ref]$tokens,[ref]$errors)
if($errors){throw ($errors|Out-String)}
foreach($node in $ast.EndBlock.Statements){if($node -is [Management.Automation.Language.FunctionDefinitionAst]){Invoke-Expression $node.Extent.Text}}
$root=Join-Path ([IO.Path]::GetTempPath()) ('LC 角色 dependency test-'+[Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($root)
$script:depStateFile=Join-Path $root 'install-state.json';$script:depStatusFile=Join-Path $root 'install-status.json';$script:depLog=Join-Path $root 'logs/dependency-test.json'
$script:depState=[pscustomobject]@{schema=1;installedAt='preserved';pluginVersion='test';dependencies=[pscustomobject]@{}}
$script:depEvents=New-Object 'System.Collections.Generic.List[object]';$script:depVersion='test';$script:depInstalled=$false;$script:depProgress=$null
$script:probeCalls=0;$script:downloadCalls=0;$script:problemCalls=0
# Native runtime execution/UI are explicitly outside this filesystem regression test.
function Assert-Runtime($directory,$dependency){$script:probeCalls++}
function Open-DependencyProgress(){}
function Close-DependencyProgress(){}
$realStatusWriter=${function:Write-DependencyStatus}
function Write-DependencyStatus($phase,$text,$issues=@()){$script:lastPhase=$phase;$script:lastMessage=$text;$script:lastInstalled=$script:depInstalled}
function Get-BundledArchive($dep){$script:downloadCalls++;throw 'Unexpected download'}
function Show-DependencyProblem($issues,$reason){$script:problemCalls++;return 'cancel'}
function Check($ok,$message){if(!$ok){throw $message}}
function Write-Fixture($relative,$body){$file=Join-Path $directory $relative;[void][IO.Directory]::CreateDirectory((Split-Path $file -Parent));[IO.File]::WriteAllText($file,$body)}
function Expect-Rejection($name,$pattern,$work){
 $message='';try{& $work}catch{$message=$_.Exception.Message}
 Check ($message -match $pattern) ($name+': expected rejection matching '+$pattern+', got '+$message)
 return $message
}
try{
 $directory=Join-Path $root 'electron-test'
 foreach($relative in @('electron.exe','resources.pak','icudtl.dat','locales/af.pak','locales/am.pak','resources/default_app.asar','resources/deep/one/two/content.dat')){Write-Fixture $relative ('original '+$relative)}
 $files=@(Get-ChildItem -LiteralPath $directory -Recurse -File | ForEach-Object {@{path=$_.FullName.Substring($directory.Length+1).Replace([IO.Path]::DirectorySeparatorChar,'/');sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}})
 $dep=[pscustomobject]@{id='electron';label='Electron';version='test';directory='electron-test';sha256=('a'*64);required=@('electron.exe','resources.pak','icudtl.dat');files=$files}
 $script:depManifest=[pscustomobject]@{dependencies=@($dep)}
 $record=Get-DependencyRecord 'electron'
 # Provider-only metadata is deliberately removed so raw DirectoryInfo behavior is exercised on every PS version.
 $node=$ast.EndBlock.Statements | Where-Object {$_ -is [Management.Automation.Language.FunctionDefinitionAst] -and $_.Name -eq 'Assert-Payload'}
 $definition=$node.Extent.Text.Replace('$cursor=$cursor.Directory','$cursor=[IO.FileInfo]::new($cursor.FullName).Directory')
 Invoke-Expression $definition
 Assert-Payload $directory $dep $record
 Check ([IO.FileInfo]::new((Join-Path $directory 'locales/af.pak')).Directory -is [IO.DirectoryInfo]) 'Directory parent is not a raw .NET DirectoryInfo'
 Write-Output 'PASS nested locales, resources, deep raw DirectoryInfo parent chains'
 # Without install-state, a bundled trusted file list must validate and register the existing directory with no downloads.
 Ensure-Dependencies
 Check ($script:downloadCalls -eq 0) 'Existing directory triggered a download'
 Check ($script:problemCalls -eq 0) 'Existing directory unexpectedly opened the error prompt'
 Check ($script:lastPhase -eq 'ready') 'Existing directory did not become ready'
 $saved=Get-Content $script:depStateFile -Raw | ConvertFrom-Json
 Check (@($saved.dependencies.electron.files).Count -eq $files.Count) 'Trusted file list was not persisted'
 Ensure-Dependencies
 Check ($script:downloadCalls -eq 0) 'Valid update downloaded dependencies'
 Check ($script:lastInstalled -eq $false) 'Ready existing dependency was mislabeled as newly installed'
 Write-Output 'PASS no-state reuse, persisted complete list, update reuse without downloads' 
 # A malformed/stale local list cannot override the bundled trusted reference.
 $script:depState.dependencies.electron.files=@(@{path='electron.exe';sha256='wrong'})
 Check (@(Get-DependencyIssues).Count -eq 0) 'Stale local metadata prevented validation against the trusted catalog'
 Check (@($script:depState.dependencies.electron.files).Count -eq $files.Count) 'Stale local metadata was not repaired'
 $nested=Join-Path $directory 'locales/af.pak';$original=[IO.File]::ReadAllBytes($nested)
 Remove-Item -LiteralPath $nested
 $downloads=$script:downloadCalls;$cancelled=$false
 try{Ensure-Dependencies}catch [OperationCanceledException]{$cancelled=$true}
 Check $cancelled 'Missing dependencies bypassed the explicit installation prompt'
 Check ($script:downloadCalls -eq $downloads) 'Missing dependencies were installed automatically'
 $issue=@(Get-DependencyIssues)
 Check ($issue.Count -eq 1 -and $issue[0].detail -match 'locales[/\\]af.pak' -and $issue[0].detail.Contains($directory)) 'Missing file diagnostic lacks path/root'
 [IO.File]::WriteAllBytes($nested,$original)
 [IO.File]::WriteAllText($nested,'corrupted')
 $message=Expect-Rejection 'hash mismatch' 'SHA-256' {Assert-Payload $directory $dep $record}
 Check ($message -match 'locales[/\\]af.pak' -and $message -match 'DirectoryInfo') 'Hash diagnostic lacks the failed file and parent trace'
 [IO.File]::WriteAllBytes($nested,$original)
 Assert-Payload $directory $dep $record
 # Do not execute a runtime that fails payload validation.
 $probes=$script:probeCalls;Remove-Item -LiteralPath $nested
 [void]@(Get-DependencyIssues);Check ($script:probeCalls -eq $probes) 'Corrupt runtime was executed before verification'
 [IO.File]::WriteAllBytes($nested,$original)
 $escaped=[pscustomobject]@{version='test';sha256=$dep.sha256;files=@($files)+@(@{path='../outside';sha256=('b'*64)})}
 [void](Expect-Rejection 'traversal' 'outside' {Assert-Payload $directory $dep $escaped})
 Write-Output 'PASS missing/corrupt nested files, contextual diagnostics, no execution before validation, path containment'
 # Symlink creation may require Windows Developer Mode/admin, so report a skip rather than relaxing checks.
 $outside=Join-Path $root 'outside';[void][IO.Directory]::CreateDirectory($outside);[IO.File]::WriteAllBytes((Join-Path $outside 'af.pak'),$original)
 $link=Join-Path $directory 'linked';$created=$false
 try{$null=New-Item -ItemType SymbolicLink -Path $link -Target $outside -ErrorAction Stop;$created=$true}catch{Write-Output 'SKIP symlink creation unavailable on this host'}
 if($created){
  $linked=[pscustomobject]@{version='test';sha256=$dep.sha256;files=@($files)+@(@{path='linked/af.pak';sha256=(Get-FileHash -LiteralPath (Join-Path $outside 'af.pak') -Algorithm SHA256).Hash})}
  [void](Expect-Rejection 'parent symlink' 'linked' {Assert-Payload $directory $dep $linked})
  [void](Expect-Rejection 'parent symlink reason' '不允许链接' {Assert-Payload $directory $dep $linked})
  [IO.Directory]::Delete($link)
  Write-Output 'PASS symlink parent rejection'
 }
 # Installation and offline repairs must use the same nested-file validation path.
 function Get-CimInstance {return @()}
 $zip=Join-Path $root 'runtime-fixture.zip';Compress-Archive -Path (Join-Path $directory '*') -DestinationPath $zip
 $dep.sha256=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash;$dep.directory='fresh-runtime'
 Install-Dependency $dep $zip
 $installed=Join-Path $root 'fresh-runtime';Assert-Payload $installed $dep (Get-DependencyRecord 'electron')
 Remove-Item -LiteralPath (Join-Path $installed 'locales/af.pak')
 Install-Dependency $dep $directory
 Assert-Payload $installed $dep (Get-DependencyRecord 'electron')
 $before=[IO.File]::ReadAllText($script:depStateFile);$bad=Join-Path $root 'bad.zip';[IO.File]::WriteAllText($bad,'bad archive')
 [void](Expect-Rejection 'bad ZIP' 'SHA-256' {Install-Dependency $dep $bad})
 Check ([IO.File]::ReadAllText($script:depStateFile) -eq $before) 'Rejected archive changed install-state'
 $damaged=Join-Path $installed 'locales/af.pak';[IO.File]::WriteAllText($damaged,'preserve on failure')
 $realSave=${function:Save-InstallState}
 function Save-InstallState(){throw 'test state persistence failure'}
 [void](Expect-Rejection 'state rollback' 'test state persistence failure' {Install-Dependency $dep $zip})
 Check ([IO.File]::ReadAllText($damaged) -eq 'preserve on failure') 'Persistence failure did not restore previous directory'
 Set-Item Function:\Save-InstallState -Value $realSave
 Install-Dependency $dep $zip
 Assert-Payload $installed $dep (Get-DependencyRecord 'electron')
 Check ($script:downloadCalls -eq 0) 'Explicit offline install unexpectedly downloaded dependencies'
 Write-Output 'PASS nested ZIP installation, offline directory repair, rejected ZIP state preservation, installation rollback'
 # AI output chooses only a fixed installer/recheck/manual branch; these stubs do not call a model.
 $script:aiCalls=0;$script:plan='install';$script:prompts=0;$script:downloadCalls=0
 function Get-BundledArchive($dep){$script:downloadCalls++;return $zip}
 function Show-DependencyProblem($issues,$reason){$script:lastReason=$reason;$script:prompts++;if($script:prompts -eq 1){return 'assist'};return 'cancel'}
 function Request-DependencyAssistance($issues){$script:aiCalls++;if($script:plan -eq 'error'){throw 'AI unavailable'};if($script:plan -eq 'recheck'){[IO.File]::WriteAllBytes($damaged,$original)};return @{action=$script:plan;summary='test advice'}}
 Remove-Item -LiteralPath $damaged;Ensure-Dependencies
 Check ($script:lastInstalled -eq $true -and $script:lastMessage -match '依赖修复完成') 'Installed completion message/flag missing'
 Check ($script:aiCalls -eq 1 -and $script:downloadCalls -eq 1) 'AI install did not delegate exactly once to the fixed installer'
 foreach($plan in @('manual','error')){
  $script:plan=$plan;$script:prompts=0;$downloads=$script:downloadCalls;Remove-Item -LiteralPath $damaged
  $cancelled=$false;try{Ensure-Dependencies}catch [OperationCanceledException]{$cancelled=$true}
  Check $cancelled 'Manual/error advice did not return to the native prompt'
  if($plan -eq 'manual'){Check ($script:lastReason -match 'test advice') 'Manual advice was not passed back into the dialog'}
  Check ($script:downloadCalls -eq $downloads -and !(Test-Path $damaged)) 'Manual/error advice unexpectedly installed dependencies'
  [IO.File]::WriteAllBytes($damaged,$original)
 }
 $script:plan='recheck';$script:prompts=0;$downloads=$script:downloadCalls;Remove-Item -LiteralPath $damaged;Ensure-Dependencies
 Check ($script:downloadCalls -eq $downloads) 'AI recheck unexpectedly installed dependencies'
 Write-Output 'PASS AI install/manual/recheck/failure branches with no real model calls'
 $script:depInstalled=$true;$env:PET_PREPARE_ID='11111111-1111-4111-8111-111111111111'
 & $realStatusWriter 'ready' '依赖修复完成'
 $status=Get-Content $script:depStatusFile -Raw | ConvertFrom-Json
 Check ($status.installed -eq $true -and $status.manualStart -eq $true -and $status.runId -eq $env:PET_PREPARE_ID) 'Completion handshake fields missing'
 Write-Output 'PASS explicit install consent, completion flag/handshake, visible manual advice'
 Write-Output 'PASS dependency filesystem regression suite'   
}finally{if(Test-Path -LiteralPath $root){Remove-Item -LiteralPath $root -Recurse -Force}}
