#requires -Version 5.1
$ErrorActionPreference='Stop'
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path (Split-Path $PSScriptRoot -Parent) 'dependencies.ps1'),[ref]$tokens,[ref]$errors)
if($errors){throw ($errors|Out-String)}
foreach($node in $ast.EndBlock.Statements){if($node -is [Management.Automation.Language.FunctionDefinitionAst]){Invoke-Expression $node.Extent.Text}}
$root=Join-Path ([IO.Path]::GetTempPath()) ('lc-core-test-'+[Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($root)
$script:depStateFile=Join-Path $root 'install-state.json';$script:depStatusFile=Join-Path $root 'install-status.json';$script:depLog=Join-Path $root 'logs/dependency-test.json'
$script:depState=[pscustomobject]@{schema=1;pluginVersion='test';dependencies=[pscustomobject]@{}};$script:depEvents=New-Object 'System.Collections.Generic.List[object]';$script:depVersion='test';$script:depInstalled=$false;$script:depProgress=$null
function Open-DependencyProgress(){}
function Close-DependencyProgress(){}
function Check($ok,$message){if(!$ok){throw $message}}
function Get-CimInstance{return @()}
$realConsent=${function:Confirm-CoreConsent};$script:consents=0
function Confirm-CoreConsent($dep){$script:consents++;if(!(Test-CoreConsent $dep)){throw [OperationCanceledException]::new('consent-required')}}
try{
 $payload=Join-Path $root 'sdk';$nested=Join-Path $payload 'SDK-R5/Core';[void][IO.Directory]::CreateDirectory($nested)
 $js=Join-Path $nested 'live2dcubismcore.min.js';[IO.File]::WriteAllText($js,'official Core fixture')
 [IO.File]::WriteAllText((Join-Path $payload 'sample-character.txt'),'must not be installed')
 # Match the official SDK's forward-slash ZIP entry names on Windows PowerShell 5.1.
 Add-Type -AssemblyName System.IO.Compression,System.IO.Compression.FileSystem
 $zip=Join-Path $root 'official-sdk.zip'
 $fixtureArchive=[IO.Compression.ZipFile]::Open($zip,[IO.Compression.ZipArchiveMode]::Create)
 try {
  [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($fixtureArchive,$js,'SDK-R5/Core/live2dcubismcore.min.js')
  [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($fixtureArchive,(Join-Path $payload 'sample-character.txt'),'sample-character.txt')
 } finally {$fixtureArchive.Dispose()}
 $dep=[pscustomobject]@{id='cubism-core';label='Cubism Core';version='test';kind='cubism-core';directory='core';archivePrefix='SDK-R5/Core';executable='live2dcubismcore.min.js';sha256=(Get-FileHash $zip).Hash;files=@(@{path='live2dcubismcore.min.js';sha256=(Get-FileHash $js).Hash});required=@('live2dcubismcore.min.js');licenseRevision='test-r5'}
 $script:depManifest=[pscustomobject]@{dependencies=@($dep)}
 $issues=@(Get-DependencyIssues);Check ($issues.Count -eq 1 -and $issues[0].detail -match '许可') 'Missing consent did not block readiness'
 $cancelled=$false;try{Install-Dependency $dep $zip}catch [OperationCanceledException]{$cancelled=$true};Check $cancelled 'Install without consent proceeded';Check (!(Test-Path (Join-Path $root 'core'))) 'Core extracted without consent'
 $consent=Get-DependencyRecord $dep.id;$consent|Add-Member NoteProperty licenseRevision $dep.licenseRevision;$script:depState.dependencies|Add-Member NoteProperty $dep.id $consent
 Install-Dependency $dep $zip
 Check (@(Get-DependencyIssues).Count -eq 0) 'Pinned nested Core ZIP did not pass integrity check'
 Check (!(Test-Path (Join-Path $root 'core/sample-character.txt'))) 'SDK sample files were installed'
 Check (@(Get-ChildItem (Join-Path $root 'core') -File -Recurse).Count -eq 1) 'Only the pinned runtime should be extracted'
 $state=Get-Content $script:depStateFile -Raw|ConvertFrom-Json;Check ($state.dependencies.'cubism-core'.licenseRevision -eq 'test-r5') 'Consent marker was lost'
 $core=Join-Path $root 'core/live2dcubismcore.min.js';[IO.File]::WriteAllText($core,'corrupted');Check (@(Get-DependencyIssues).Count -eq 1) 'Corrupt Core was accepted'
 Install-Dependency $dep $zip;Check (@(Get-DependencyIssues).Count -eq 0) 'Core ZIP repair failed'
 $existing=Join-Path $root 'asset/core';[void][IO.Directory]::CreateDirectory($existing);Copy-Item -LiteralPath $js -Destination $existing
 Remove-Item -LiteralPath (Join-Path $root 'core') -Recurse -Force
 Write-AtomicJson (Join-Path $root 'assets.json') @{core=(Join-Path $existing 'live2dcubismcore.min.js')}
 Check (@(Get-DependencyIssues).Count -eq 0) 'Matching existing Core was not reused'
 Check (Test-Path $core) 'Reuse did not install canonical Core'
 function Get-BundledArchive($dep){throw 'Matching Core must not download'}
 Remove-Item -LiteralPath (Join-Path $root 'core') -Recurse -Force
 Install-Dependency $dep
 Check (@(Get-DependencyIssues).Count -eq 0) 'Existing matching asset should be reused before downloading'
 Check (@(Get-ChildItem (Join-Path $root 'core') -File -Recurse).Count -eq 1) 'Directory reuse copied unrelated files'
 $before=${function:Assert-Runtime};Assert-Runtime (Join-Path $root 'core') $dep # Must never try to execute JS as a Windows EXE.
 Write-Output 'PASS Core consent gate, nested official SDK extraction, runtime-only install, file hash/repair, consent persistence, exact existing-file reuse, no JS process probe'
}finally{Remove-Item -LiteralPath $root -Recurse -Force}
