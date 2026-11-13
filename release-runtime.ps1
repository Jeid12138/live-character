# Package-local application verification and atomic repair. No download paths.
function Assert-ApplicationFiles($directory,$manifest) {
  $dependency=[pscustomobject]@{version=$manifest.version;sha256='package-code';required=@('desktop/main.cjs','lab/index.html')}
  $record=[pscustomobject]@{version=$manifest.version;sha256='package-code';files=@($manifest.files)}
  Assert-Payload $directory $dependency $record
}
function Ensure-ApplicationRelease($runtimeRoot,$sourceRoot,$manifest) {
  # Verify the source before trusting a cached app-version directory.
  Assert-ApplicationFiles $sourceRoot $manifest
  $release=Join-Path $runtimeRoot ('app-'+$manifest.version);$exists=Test-Path -LiteralPath $release
  if($exists){try{Assert-ApplicationFiles $release $manifest;return @{path=$release;repaired=$false}}catch{Add-DependencyEvent 'application' 'verification-failed' $_.Exception.Message}}
  $stage=Join-Path $runtimeRoot ('.app-stage-'+[Guid]::NewGuid().ToString('N'));$backup=$release+'.repair-'+[Guid]::NewGuid().ToString('N');$moved=$false
  try{
    [void][IO.Directory]::CreateDirectory($stage)
    foreach($entry in $manifest.files){
      $src=Resolve-PayloadPath $sourceRoot $entry.path;$dest=Resolve-PayloadPath $stage $entry.path
      [void][IO.Directory]::CreateDirectory((Split-Path $dest -Parent));Copy-Item -LiteralPath $src -Destination $dest
    }
    Assert-ApplicationFiles $stage $manifest
    if($exists){
      $running=@(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {$_.CommandLine -and $_.CommandLine.IndexOf($release,[StringComparison]::OrdinalIgnoreCase) -ge 0 -and $_.Name -match '^(electron|python)(w)?\.exe$'})
      if($running.Count){throw '角色仍在运行，请退出角色后修复程序文件'}
      [IO.Directory]::Move($release,$backup);$moved=$true
    }
    try{[IO.Directory]::Move($stage,$release)}catch{if($moved){[IO.Directory]::Move($backup,$release)};throw}
    if($moved){
      $known=@{};foreach($entry in $manifest.files){$known[$entry.path.Replace('\','/')]=1}
      $extras=@(Get-ChildItem -LiteralPath $backup -Recurse -Force | Where-Object {($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -or (!$_.PSIsContainer -and !$known.ContainsKey($_.FullName.Substring($backup.Length+1).Replace('\','/')))})
      if($extras.Count -or ((Get-Item -LiteralPath $backup -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){Add-DependencyEvent 'application' 'custom-backup-preserved' $backup}
      else{Remove-Item -LiteralPath $backup -Recurse -Force}
    }
    Add-DependencyEvent 'application' $(if($exists){'repaired'}else{'prepared'}) $release
    return @{path=$release;repaired=[bool]$exists}
  }finally{if(Test-Path -LiteralPath $stage){Remove-Item -LiteralPath $stage -Recurse -Force}}
}
