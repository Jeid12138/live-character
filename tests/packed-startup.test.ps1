#requires -Version 5.1
# Run FROM AN EXTRACTED DELIVERABLE. Windows GUI and native EXE probes are stubbed explicitly.
$ErrorActionPreference='Stop'
$script:depPackageRoot=Split-Path $PSScriptRoot -Parent
foreach($name in @('dependencies.ps1','release-runtime.ps1')){
 $tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $script:depPackageRoot $name),[ref]$tokens,[ref]$errors)
 if($errors){throw ($errors|Out-String)}
 foreach($n in $ast.EndBlock.Statements){if($n -is [Management.Automation.Language.FunctionDefinitionAst]){Invoke-Expression $n.Extent.Text}}
}
function Open-DependencyProgress(){}
function Close-DependencyProgress(){}
function Assert-Runtime($directory,$dependency){}
function Get-CimInstance{return @()}
function Show-DependencyProblem($issues,$reason){if($reason){throw $reason};return 'install'}
function Confirm-CoreConsent($dep){if(!(Test-CoreConsent $dep)){throw 'test fixture must supply consent'}}
function Check($ok,$message){if(!$ok){throw $message}}
$root=Join-Path ([IO.Path]::GetTempPath()) ('LC packed startup '+[Guid]::NewGuid().ToString('N'));[void][IO.Directory]::CreateDirectory($root)
$script:depVersion=(Get-Content (Join-Path $script:depPackageRoot 'package.json') -Raw -Encoding UTF8|ConvertFrom-Json).version
$script:depManifest=Get-Content (Join-Path $script:depPackageRoot 'runtime-manifest.json') -Raw -Encoding UTF8|ConvertFrom-Json
$script:depState=[pscustomobject]@{schema=1;pluginVersion=$script:depVersion;dependencies=[pscustomobject]@{}};$script:depInstalled=$false;$script:depProgress=$null;$script:depEvents=New-Object 'System.Collections.Generic.List[object]'
$script:depStateFile=Join-Path $root 'install-state.json';$script:depStatusFile=Join-Path $root 'install-status.json';$script:depLog=Join-Path $root 'dependency-log.json';$env:PET_PREPARE_ID=[Guid]::NewGuid().ToString()
try{
 $code=Get-Content (Join-Path $script:depPackageRoot 'runtime-code-manifest.json') -Raw -Encoding UTF8|ConvertFrom-Json
 Assert-ApplicationFiles $script:depPackageRoot $code
 $core=$script:depManifest.dependencies|Where-Object {$_.id -eq 'cubism-core'};$record=Get-DependencyRecord $core.id;$record|Add-Member NoteProperty licenseRevision $core.licenseRevision;$script:depState.dependencies|Add-Member NoteProperty $core.id $record
 # First-run repair: real shipped ZIPs, real hashes/extraction/state, user-consent and GUI simulated.
 Ensure-Dependencies
 $status=Get-Content $script:depStatusFile -Raw -Encoding UTF8|ConvertFrom-Json
 Check ($status.phase -eq 'ready' -and $status.installed -and $status.manualStart) 'First repair must wait for another explicit launch'
 Check ($status.runId -eq $env:PET_PREPARE_ID -and $status.version -eq $script:depVersion) 'Ready status must match current launch/version'
 $release=Ensure-ApplicationRelease $root $script:depPackageRoot $code;Assert-ApplicationFiles $release.path $code
 Check (!(Test-Path (Join-Path $release.path 'lab/.npmignore'))) 'Published runtime must not require packaging files'
 # Explicit next launch reuses every payload and program file, with installed=false.
 Ensure-Dependencies;$again=Ensure-ApplicationRelease $root $script:depPackageRoot $code
 $status=Get-Content $script:depStatusFile -Raw -Encoding UTF8|ConvertFrom-Json
 Check ($status.phase -eq 'ready' -and !$status.installed -and !$status.manualStart -and !$again.repaired) 'Second explicit launch should pass without repair'
 # Actual application cache repair from the extracted package.
 [IO.File]::WriteAllText((Join-Path $release.path 'lab/vendor/cubism4.js'),'corrupted')
 $fixed=Ensure-ApplicationRelease $root $script:depPackageRoot $code;Check $fixed.repaired 'Program corruption was not locally repaired';Assert-ApplicationFiles $fixed.path $code
 Write-Output ('PASS extracted '+$script:depVersion+' startup preparation: first repair/manual pause, matching handshake, second launch/reuse, application repair; native GUI/EXE probes stubbed')
}finally{Remove-Item -LiteralPath $root -Recurse -Force}
