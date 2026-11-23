# Package-local application verification and atomic repair. No download paths.
function Assert-ApplicationFiles($directory,$manifest) {
  $dependency=[pscustomobject]@{version=$manifest.version;sha256='package-code';required=@('desktop/main.cjs','lab/index.html')}
  $record=[pscustomobject]@{version=$manifest.version;sha256='package-code';files=@($manifest.files)}
  Assert-Payload $directory $dependency $record
}
function Ensure-ApplicationRelease($runtimeRoot,$sourceRoot,$manifest) {
  if (!(Get-ApplicationVersion ('app-'+$manifest.version))) {throw '安装包程序清单版本无效'}
  if (!(Get-RegularApplicationItem $runtimeRoot).PSIsContainer) {throw '运行环境目录无效'}
  foreach ($entry in $manifest.files) {
    if (!(Test-ApplicationFilePath $entry.path)) {throw '安装包程序清单路径无效'}
  }
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
      $processes = @(Get-CimInstance Win32_Process -ErrorAction Stop)
      if (Test-ApplicationReleaseInUse $release $processes) {throw '角色仍在运行，请退出角色后修复程序文件'}
      [IO.Directory]::Move($release,$backup);$moved=$true
    }
    try{[IO.Directory]::Move($stage,$release)}catch{if($moved){[IO.Directory]::Move($backup,$release)};throw}
    if ($moved) {
      Remove-VerifiedApplicationFiles $backup $manifest.files
      if (Test-Path -LiteralPath $backup) {Add-DependencyEvent 'application' 'custom-backup-preserved' $backup}
    }
    Add-DependencyEvent 'application' $(if($exists){'repaired'}else{'prepared'}) $release
    return @{path=$release;repaired=[bool]$exists}
  }finally{Remove-VerifiedApplicationFiles $stage $manifest.files}
}

function Get-ApplicationVersion([string]$name) {
  if ($name -cmatch '^app-(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$') {
    $parsed = $null
    if ([version]::TryParse($name.Substring(4), [ref]$parsed) -and 'app-'+$parsed.ToString() -ceq $name) {return $parsed}
  }
}
function Test-ApplicationFilePath([string]$relative) {
  if ($relative -cnotmatch '^(desktop|lab)/') {return $false}
  foreach ($part in $relative.Split('/')) {
    if ($part -notmatch '^[a-z0-9_][a-z0-9_.-]*$' -or $part.EndsWith('.') -or
        $part -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)') {return $false}
  }
  return $true
}
function Get-RegularApplicationItem($path) {
  $item = Get-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
  if ($item -and !($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {return $item}
}
function Test-ApplicationReleaseInUse($path,$processes) {
  $reference = [regex]::Escape($path) + '(?=\\|["''\s]|$)'
  foreach ($process in $processes) {
    if ([string]::IsNullOrWhiteSpace($process.CommandLine)) {
      if ($process.Name -match '^(Live Character|electron|python)(w)?\.exe$') {return $true}
    } elseif ($process.CommandLine.Replace('/','\') -match $reference) {
      return $true
    }
  }
  return $false
}
function Save-ApplicationReceipt($runtimeRoot,$manifest) {
  $name = 'app-'+$manifest.version
  $root = Get-RegularApplicationItem $runtimeRoot
  if (!(Get-ApplicationVersion $name) -or !$root.PSIsContainer) {return}
  $receipt = Join-Path $root.FullName ('.'+$name+'.receipt.json')
  $existing = Get-Item -LiteralPath $receipt -Force -ErrorAction SilentlyContinue
  if ($existing -and ($existing.PSIsContainer -or ($existing.Attributes -band [IO.FileAttributes]::ReparsePoint))) {return}
  Write-AtomicJson $receipt ([ordered]@{version=$manifest.version;files=@($manifest.files)})
}
function Remove-VerifiedApplicationFiles($directory,$records) {
  if (!(Get-RegularApplicationItem $directory).PSIsContainer) {return}
  $directories = @{$directory = 1}
  foreach ($record in $records) {
    try {
      if (!(Test-ApplicationFilePath $record.path) -or $record.sha256 -notmatch '\A[0-9a-f]{64}\z') {continue}
      $parts = $record.path.Split('/')
      $cursor = $directory
      for ($i=0; $i -lt $parts.Length-1; $i++) {
        $cursor = Join-Path $cursor $parts[$i]
        if (!(Get-RegularApplicationItem $cursor).PSIsContainer) {break}
        $directories[$cursor] = 1
      }
      if ($i -ne $parts.Length-1) {continue}
      $file = Get-RegularApplicationItem (Join-Path $cursor $parts[$i])
      if ($file -is [IO.FileInfo] -and (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256 -ErrorAction Stop).Hash -eq $record.sha256) {
        [IO.File]::Delete($file.FullName)
      }
    } catch {Write-Verbose $_.Exception.Message}
  }
  foreach ($dir in ($directories.Keys | Sort-Object Length -Descending)) {
    try {
      if ((Get-RegularApplicationItem $dir).PSIsContainer -and !(Get-ChildItem -LiteralPath $dir -Force -ErrorAction Stop | Select-Object -First 1)) {
        [IO.Directory]::Delete($dir)
      }
    } catch {Write-Verbose $_.Exception.Message}
  }
}
function Remove-RetiredApplicationReleases($runtimeRoot,$activeVersion,$catalogPath) {
  $root = Get-RegularApplicationItem $runtimeRoot
  $active = Get-ApplicationVersion ('app-'+$activeVersion)
  if (!$root.PSIsContainer -or !$active) {return}
  $processes = @(Get-CimInstance Win32_Process -ErrorAction Stop)
  $catalog = $null
  try {
    $catalog = Get-Content -LiteralPath $catalogPath -Raw -Encoding UTF8 -ErrorAction Stop | ConvertFrom-Json
  } catch {Write-Verbose $_.Exception.Message}
  foreach ($old in (Get-ChildItem -LiteralPath $root.FullName -Filter 'app-*' -Directory -Force -ErrorAction Stop)) {
    try {
      $version = Get-ApplicationVersion $old.Name
      if (!$version -or $version -ge $active -or ($old.Attributes -band [IO.FileAttributes]::ReparsePoint)) {continue}
      if (Test-ApplicationReleaseInUse $old.FullName $processes) {
        Add-DependencyEvent 'application' 'cleanup-deferred-process' $old.Name
        continue
      }
      $receipt = Get-RegularApplicationItem (Join-Path $root.FullName ('.'+$old.Name+'.receipt.json'))
      $records = @()
      if ($receipt -is [IO.FileInfo]) {
        try {
          $saved = Get-Content -LiteralPath $receipt.FullName -Raw -Encoding UTF8 -ErrorAction Stop | ConvertFrom-Json
          if ($saved.version -ceq $version.ToString()) {$records = @($saved.files)}
        } catch {Write-Verbose $_.Exception.Message}
      }
      $legacy = $catalog.PSObject.Properties[$old.Name]
      if ($legacy) {
        $records += @($legacy.Value.PSObject.Properties | ForEach-Object {@{path=$_.Name;sha256=$_.Value}})
      }
      if (!$records.Count) {continue}
      Remove-VerifiedApplicationFiles $old.FullName $records
      if (Test-Path -LiteralPath $old.FullName) {
        Add-DependencyEvent 'application' 'retained-files' $old.Name
      } else {
        if ($receipt -is [IO.FileInfo]) {[IO.File]::Delete($receipt.FullName)}
        Add-DependencyEvent 'application' 'retired' $old.Name
      }
    } catch {Write-Verbose $_.Exception.Message}
  }
}
