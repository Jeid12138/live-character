#requires -Version 5.1
$ErrorActionPreference='Stop'
foreach($file in @('dependencies.ps1','release-runtime.ps1')){
 $t=$null;$e=$null;$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path (Split-Path $PSScriptRoot -Parent) $file),[ref]$t,[ref]$e);if($e){throw ($e|Out-String)}
 foreach($n in $ast.EndBlock.Statements){if($n -is [Management.Automation.Language.FunctionDefinitionAst]){Invoke-Expression $n.Extent.Text}}
}
$package=Split-Path $PSScriptRoot -Parent
$actual=Get-Content (Join-Path $package 'runtime-code-manifest.json') -Raw|ConvertFrom-Json
Assert-ApplicationFiles $package $actual
function Add-DependencyEvent($id,$action,$detail){}
function Get-CimInstance{return @()}
function Check($value,$message){if(!$value){throw $message}}
$root=Join-Path ([IO.Path]::GetTempPath()) ('lc-release-test-'+[Guid]::NewGuid().ToString('N'));$source=Join-Path $root 'source';$data=Join-Path $root 'data'
try{
 [void][IO.Directory]::CreateDirectory($data)
 foreach($rel in @('desktop/main.cjs','lab/index.html','lab/vendor/cubism4.js')){$file=Join-Path $source $rel;[void][IO.Directory]::CreateDirectory((Split-Path $file -Parent));[IO.File]::WriteAllText($file,$rel)}
 $manifest=[pscustomobject]@{version='test';files=@(Get-ChildItem $source -Recurse -File|ForEach-Object {@{path=$_.FullName.Substring($source.Length+1);sha256=(Get-FileHash $_.FullName).Hash}})}
 $result=Ensure-ApplicationRelease $data $source $manifest;Check (!$result.repaired) 'Fresh preparation incorrectly marked as repair';Assert-ApplicationFiles $result.path $manifest
 $reuse=Ensure-ApplicationRelease $data $source $manifest;Check (!$reuse.repaired) 'Valid release was recopied'
 [IO.File]::WriteAllText((Join-Path $result.path 'lab/vendor/cubism4.js'),'corrupt')
 [IO.File]::WriteAllText((Join-Path $result.path 'custom-note.txt'),'preserve me')
 $fixed=Ensure-ApplicationRelease $data $source $manifest;Check $fixed.repaired 'Corrupt release was not repaired';Assert-ApplicationFiles $fixed.path $manifest
 Check (@(Get-ChildItem $data -Directory -Filter '*.repair-*').Count -eq 1) 'Custom backup was lost'
 [IO.File]::WriteAllText((Join-Path $source 'lab/index.html'),'source corrupt')
 $denied=$false;try{Ensure-ApplicationRelease $data $source $manifest}catch{$denied=$true};Check $denied 'Corrupt bundled code was trusted'
 Assert-ApplicationFiles $fixed.path $manifest
 Write-Output 'PASS source/cached application checks, local atomic repair, intact release reuse, custom backup preservation, damaged source rejection'
}finally{Remove-Item -LiteralPath $root -Recurse -Force}
