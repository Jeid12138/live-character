# Fixed runtime installer; AI assistance is opt-in and selects only preset actions.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$script:depRoot = $root
$script:depPackageRoot = $PSScriptRoot
$script:depVersion = (Get-Content (Join-Path $PSScriptRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
$script:depManifest = Get-Content (Join-Path $PSScriptRoot 'runtime-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$script:depStateFile = Join-Path $root 'install-state.json'
$script:depStatusFile = Join-Path $root 'install-status.json'
$script:depState = $null
try { $script:depState = Get-Content $script:depStateFile -Raw -Encoding UTF8 | ConvertFrom-Json } catch {}
if ($script:depState.schema -ne 1 -or !$script:depState.dependencies) { $script:depState = $null }
$script:depInstalled = $false
if (!$script:depState) { $script:depState = [pscustomobject]@{schema=1;pluginVersion=$script:depVersion;installedAt=[DateTime]::UtcNow.ToString('o');dependencies=[pscustomobject]@{}} }
$script:depProgress = $null
$script:depLog = Join-Path $root ('logs\dependency-install-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff')+'-'+[Guid]::NewGuid().ToString('N')+'.json')
$script:depEvents = New-Object 'System.Collections.Generic.List[object]'

function Write-AtomicJson($file,$value) {
  [void][IO.Directory]::CreateDirectory((Split-Path $file -Parent))
  $tmp = $file+'.'+[Guid]::NewGuid().ToString('N')
  try {
    [IO.File]::WriteAllText($tmp,($value | ConvertTo-Json -Depth 20),(New-Object Text.UTF8Encoding($false)))
    if (Test-Path -LiteralPath $file) { [IO.File]::Replace($tmp,$file,[NullString]::Value) } else { [IO.File]::Move($tmp,$file) }
  } finally { if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force } }
}
function Write-DependencyStatus($phase,$text,$issues=@()) {
  try {Write-AtomicJson $script:depStatusFile @{phase=$phase;message=$text;issues=@($issues);installed=$script:depInstalled;manualStart=($phase -eq 'ready' -and $script:depInstalled);runId=$env:PET_PREPARE_ID;at=[DateTime]::UtcNow.ToString('o');version=$script:depVersion;log=$script:depLog}} catch {Write-Verbose $_.Exception.Message}
  if ($script:depProgress -and !$script:depProgress.IsDisposed) { $script:depProgress.Controls['message'].Text=$text;[Windows.Forms.Application]::DoEvents() }
}
function Add-DependencyEvent($id,$action,$detail) {
  $script:depEvents.Add(@{id=$id;action=$action;detail=$detail;at=[DateTime]::UtcNow.ToString('o')})
  try {Write-AtomicJson $script:depLog @{version=$script:depVersion;events=@($script:depEvents.ToArray())}} catch {Write-Verbose $_.Exception.Message}
}
function New-DependencyForm($title) {
  $form=New-Object Windows.Forms.Form
  $form.Icon=[Drawing.Icon]::new((Join-Path $script:depPackageRoot 'desktop/lc.ico'))
  $form.Text=$title;$form.ClientSize=New-Object Drawing.Size(650,355);$form.StartPosition='CenterScreen';$form.Font=New-Object Drawing.Font('Microsoft YaHei UI',10);$form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false;$form.MinimizeBox=$false;$form.TopMost=$true
  return $form
}
function Add-DependencyLabel($form,$name,$text,$x,$y,$w,$h) {
  $label=New-Object Windows.Forms.Label;$label.Name=$name;$label.Text=$text;$label.Location=New-Object Drawing.Point($x,$y);$label.Size=New-Object Drawing.Size($w,$h);$form.Controls.Add($label);return $label
}
function Add-DependencyButton($form,$text,$x,$y,$w,$result) {
  $b=New-Object Windows.Forms.Button;$b.Text=$text;$b.Location=New-Object Drawing.Point($x,$y);$b.Size=New-Object Drawing.Size($w,35);$b.Tag=$result
  $b.Add_Click({$this.FindForm().Tag=$this.Tag;$this.FindForm().Close()});$form.Controls.Add($b)
}
function Open-DependencyProgress() {
  $script:depProgress=New-DependencyForm 'Live Character · 检查与修复运行环境'
  $script:depProgress.ClientSize=New-Object Drawing.Size(650,190)
  [void](Add-DependencyLabel $script:depProgress 'title' '正在准备 Live Character' 22 20 600 30)
  [void](Add-DependencyLabel $script:depProgress 'message' '正在检查运行依赖…' 22 60 600 55)
  $bar=New-Object Windows.Forms.ProgressBar;$bar.Location=New-Object Drawing.Point(22,125);$bar.Size=New-Object Drawing.Size(600,18);$bar.Style='Marquee';$script:depProgress.Controls.Add($bar)
  $script:depProgress.ControlBox=$false;$script:depProgress.Show();[Windows.Forms.Application]::DoEvents()
}
function Close-DependencyProgress() { if ($script:depProgress) { $script:depProgress.Close();$script:depProgress.Dispose();$script:depProgress=$null } }
function Get-DependencyRecord($id) {
  $dep=$script:depManifest.dependencies | Where-Object {$_.id -eq $id}
  if ($dep.files) {
    # These hashes were built from the pinned, SHA-256-verified official archives at release time.
    $record=[pscustomobject]@{version=$dep.version;path=(Join-Path $root $dep.directory);sha256=$dep.sha256;files=@($dep.files)}
    $prior=$script:depState.dependencies.PSObject.Properties[$id].Value
    if ($prior.licenseRevision) {$record | Add-Member NoteProperty licenseRevision $prior.licenseRevision}
    return $record
  }
  return $script:depState.dependencies.PSObject.Properties[$id].Value
}
function Save-InstallState() {
  $script:depState.pluginVersion=$script:depVersion
  Write-AtomicJson $script:depStateFile $script:depState
}
function Resolve-PayloadPath($directory,$relative) {
  if (!$relative -or [IO.Path]::IsPathRooted($relative) -or $relative.Contains(':')) {throw '校验清单含无效相对路径'}
  $base=[IO.Path]::GetFullPath($directory).TrimEnd([IO.Path]::DirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar;$file=[IO.Path]::GetFullPath((Join-Path $directory $relative))
  if (!$file.StartsWith($base,[StringComparison]::OrdinalIgnoreCase)) {throw '校验路径超出运行目录'}
  return $file
}
function Assert-Payload($directory,$dependency,$record) {
  if (!$record -or $record.version -ne $dependency.version -or $record.sha256 -ne $dependency.sha256 -or @($record.files).Count -lt @($dependency.required).Count) {throw '缺少可信校验清单或版本不匹配'}
  foreach ($relative in $dependency.required) {
    $match=@($record.files | Where-Object {$_.path -eq $relative});if ($match.Count -ne 1) {throw "校验清单缺少 $relative"}
  }
  $base=[IO.Path]::GetFullPath($directory).TrimEnd([IO.Path]::DirectorySeparatorChar)
  foreach ($entry in $record.files) {
    $chain=New-Object 'System.Collections.Generic.List[string]'
    try {
      $file=Resolve-PayloadPath $directory $entry.path
      if (!(Test-Path -LiteralPath $file -PathType Leaf)) {throw '文件缺失'}
      $cursor=Get-Item -LiteralPath $file -Force
      while ($cursor) {
        if ($chain.Count -lt 3) {$chain.Add($cursor.FullName+' ['+$cursor.GetType().Name+']')}
        if ($cursor.Attributes -band [IO.FileAttributes]::ReparsePoint) {throw '不允许链接文件或链接目录'}
        if ([string]::Equals($cursor.FullName,$base,[StringComparison]::OrdinalIgnoreCase)) {break}
        # .Directory/.Parent return raw .NET objects without provider-only PSIsContainer.
        if ($cursor -is [System.IO.DirectoryInfo]) {$cursor=$cursor.Parent}
        elseif ($cursor -is [System.IO.FileInfo]) {$cursor=$cursor.Directory}
        else {throw ('无法识别的文件系统类型：'+$cursor.GetType().FullName)}
      }
      if (!$cursor) {throw '父目录链未到达运行根目录'}
      if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $entry.sha256) {throw 'SHA-256 不匹配'}
    } catch {
      throw ('依赖文件校验失败 ['+$entry.path+']：'+$_.Exception.Message+'；期望根目录：'+$base+'；父目录链（最多 3 层）：'+($chain.ToArray() -join ' → '))
    }
  }
}
function Assert-Runtime($directory,$dependency) {
  # Core is a browser runtime, not an executable. Its pinned SHA-256 is verified above;
  # its actual Core/MOC version is checked in the renderer before loading any model.
  if ($dependency.kind -eq 'cubism-core') {return}
  $psi=New-Object Diagnostics.ProcessStartInfo
  $psi.FileName=Join-Path $directory $dependency.executable;$psi.Arguments=$dependency.probe;$psi.WorkingDirectory=$directory;$psi.UseShellExecute=$false;$psi.CreateNoWindow=$true;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
  $process=New-Object Diagnostics.Process;$process.StartInfo=$psi
  try {
    if ($dependency.id -eq 'electron') {
      # Let Windows inherit the native environment block. .NET Framework's
      # ProcessStartInfo.EnvironmentVariables rejects case-duplicate proxy keys.
      $previousNodeMode=$env:ELECTRON_RUN_AS_NODE
      try {
        $env:ELECTRON_RUN_AS_NODE='1'
        [void]$process.Start()
      } finally {
        $env:ELECTRON_RUN_AS_NODE=$previousNodeMode
      }
    } else {
      [void]$process.Start()
    }
    $stdout=$process.StandardOutput.ReadToEndAsync()
    $stderr=$process.StandardError.ReadToEndAsync()
    if (!$process.WaitForExit(20000)) {try {$process.Kill()} catch {};throw '运行依赖自检超时'}
    $output=$stdout.GetAwaiter().GetResult().Trim();$errorText=$stderr.GetAwaiter().GetResult().Trim()
    if ($process.ExitCode -ne 0 -or $output -ne $dependency.version) {throw "运行自检失败，期望 $($dependency.version)，实际 $output $errorText"}
  } finally {$process.Dispose()}
}
function Test-CoreConsent($dep) {
  return $script:depState.dependencies.PSObject.Properties[$dep.id].Value.licenseRevision -eq $dep.licenseRevision
}
function Confirm-CoreConsent($dep) {
  if (Test-CoreConsent $dep) {return}
  Close-DependencyProgress
  $form=New-DependencyForm 'Live Character · Cubism Core 使用许可'
  $form.ClientSize=New-Object Drawing.Size(650,280)
  [void](Add-DependencyLabel $form 'note' '角色渲染需要 Live2D Cubism Core。阅读并同意官方许可后，插件会从安装包本地解包、校验和修复运行库，不会联网下载。此过程不调用 AI。' 20 20 610 70)
  $link=New-Object Windows.Forms.LinkLabel;$link.Text='阅读 Live2D Proprietary Software License Agreement';$link.Location=New-Object Drawing.Point(20,100);$link.AutoSize=$true;$link.Tag=$dep.licenseUrl
  $link.Add_LinkClicked({Start-Process ([string]$this.Tag)});$form.Controls.Add($link)
  $check=New-Object Windows.Forms.CheckBox;$check.Text='我已阅读并同意上述官方许可';$check.Location=New-Object Drawing.Point(20,150);$check.Size=New-Object Drawing.Size(600,30);$form.Controls.Add($check)
  Add-DependencyButton $form '同意并继续' 20 210 290 'agree'
  Add-DependencyButton $form '取消' 330 210 290 'cancel'
  $accept=$form.Controls | Where-Object {$_.Tag -eq 'agree'};$accept.Enabled=$false
  $check.Add_CheckedChanged({foreach($control in $this.FindForm().Controls){if($control.Tag -eq 'agree'){$control.Enabled=$this.Checked}}})
  $form.Tag='cancel';[void]$form.ShowDialog();$choice=$form.Tag;$form.Dispose()
  if ($choice -ne 'agree') {throw [OperationCanceledException]::new('未同意 Cubism Core 许可，准备已取消')}
  $record=Get-DependencyRecord $dep.id;$record | Add-Member -Force NoteProperty licenseRevision $dep.licenseRevision
  $script:depState.dependencies | Add-Member -Force NoteProperty $dep.id $record;Save-InstallState
}
function Get-DependencyIssues() {
  foreach ($dep in $script:depManifest.dependencies) {
    $directory=Join-Path $root $dep.directory
    Write-DependencyStatus 'checking' ("正在检查 "+$dep.label+' '+$dep.version+'…')
    try {
      if ($dep.kind -eq 'cubism-core' -and !(Test-CoreConsent $dep)) {throw '请在依赖安装时阅读并同意 Cubism Core 官方许可'}
      $record=Get-DependencyRecord $dep.id
      if ($dep.kind -eq 'cubism-core') {
        $record | Add-Member -Force NoteProperty licenseRevision $dep.licenseRevision
        # Reuse only the exact pinned official file in this installation's current asset location.
        if (!(Test-Path -LiteralPath $directory)) {
          try {
            $assets=Get-Content (Join-Path $root 'assets.json') -Raw -Encoding UTF8 | ConvertFrom-Json
            $candidate=[string]$assets.core
            if (!$candidate) {$candidate=Join-Path $root 'asset/core/live2dcubismcore.min.js'}
            $source=Split-Path $candidate -Parent
            if ((Split-Path $candidate -Leaf) -eq $dep.executable) {Assert-Payload $source $dep $record;[void][IO.Directory]::CreateDirectory($directory);Copy-Item -LiteralPath $candidate -Destination (Join-Path $directory $dep.executable)}
          } catch {Write-Verbose $_.Exception.Message}
        }
      }
      Assert-Payload $directory $dep $record;Assert-Runtime $directory $dep
      if ($dep.files) {$script:depState.dependencies | Add-Member -Force NoteProperty $dep.id $record}
    }
    catch {[pscustomobject]@{id=$dep.id;name=$dep.label;version=$dep.version;path=$directory;detail=$_.Exception.Message}}
  }
}
function Get-BundledArchive($dep) {
  $archive=Resolve-PayloadPath $script:depPackageRoot $dep.bundledArchive
  if (!(Test-Path -LiteralPath $archive -PathType Leaf)) {throw ('安装包缺少内置依赖 '+$dep.label+'，请重新安装完整插件包；不会联网下载。')}
  if ((Get-Item -LiteralPath $archive).Attributes -band [IO.FileAttributes]::ReparsePoint) {throw '内置依赖不能是链接文件'}
  Write-DependencyStatus 'installing' ('正在校验安装包内的 '+$dep.label+' '+$dep.version+'…')
  if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $dep.sha256) {throw ('安装包内 '+$dep.label+' 校验失败，请重新安装完整插件包；不会联网下载。')}
  Add-DependencyEvent $dep.id 'bundled-archive-verified' $dep.bundledArchive
  return $archive
}
function Install-Dependency($dep,$source='') {
  $stage=Join-Path $root ('.dependency-'+[Guid]::NewGuid().ToString('N'));$dest=Join-Path $root $dep.directory;$backup=$dest+'.repair-'+[Guid]::NewGuid().ToString('N');$installed=$false;$committed=$false
  $previous=$script:depState | ConvertTo-Json -Depth 20
  try {
    if ($dep.kind -eq 'cubism-core') {
      Confirm-CoreConsent $dep;$previous=$script:depState | ConvertTo-Json -Depth 20
      if (!$script:depProgress) {Open-DependencyProgress}
      # Consent may be the only missing item. Reuse verified existing files before any download.
      if (!$source) {
        $candidates=@($dest,(Join-Path $root 'asset/core'))
        try {
          $assets=Get-Content (Join-Path $root 'assets.json') -Raw -Encoding UTF8 | ConvertFrom-Json
          if ($assets.core -and (Split-Path $assets.core -Leaf) -eq $dep.executable) {$candidates+=Split-Path $assets.core -Parent}
        } catch {}
        foreach ($candidate in $candidates) {
          try {Assert-Payload $candidate $dep (Get-DependencyRecord $dep.id);$source=$candidate;break} catch {}
        }
      }
    }
    if (!$source) {$source=Get-BundledArchive $dep}
    Write-DependencyStatus 'installing' ('正在校验并准备 '+$dep.label+' '+$dep.version+'…')
    if (Test-Path -LiteralPath $source -PathType Container) {
      $record=Get-DependencyRecord $dep.id
      if (!$record) {throw '缺少此版本的可信文件清单，请重新安装完整插件包。'}
      Assert-Payload $source $dep $record
      [void][IO.Directory]::CreateDirectory($stage)
      if ($dep.kind -eq 'cubism-core') {
        foreach ($entry in $dep.files) {Copy-Item -LiteralPath (Resolve-PayloadPath $source $entry.path) -Destination (Resolve-PayloadPath $stage $entry.path)}
      } else {Get-ChildItem -LiteralPath $source -Force | Copy-Item -Destination $stage -Recurse -Force}
    } else {
      if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $dep.sha256) {throw '离线文件 SHA-256 不匹配，已拒绝安装。请选择本插件对应的内置 ZIP 或匹配目录。'}
      if ($dep.kind -eq 'cubism-core') {
        # Extract only pinned runtime files; do not install SDK sample characters or source maps.
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [void][IO.Directory]::CreateDirectory($stage)
        $archive=[IO.Compression.ZipFile]::OpenRead($source)
        try {
          foreach ($entry in $dep.files) {
            $member=$archive.GetEntry($dep.archivePrefix+'/'+$entry.path)
            if (!$member) {throw ('官方 SDK ZIP 缺少 '+$entry.path)}
            [IO.Compression.ZipFileExtensions]::ExtractToFile($member,(Resolve-PayloadPath $stage $entry.path))
          }
        } finally {$archive.Dispose()}
      } else {Expand-Archive -LiteralPath $source -DestinationPath $stage}
      $files=@(Get-ChildItem -LiteralPath $stage -File -Recurse -Force | Sort-Object FullName | ForEach-Object {@{path=$_.FullName.Substring($stage.Length+1);sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}})
      $record=[pscustomobject]@{version=$dep.version;path=$dest;sha256=$dep.sha256;files=$files}
      if ($dep.files) {$record=Get-DependencyRecord $dep.id}
    }
    Assert-Payload $stage $dep $record
    Assert-Runtime $stage $dep
    $reuse=$false;try {Assert-Payload $dest $dep $record;Assert-Runtime $dest $dep;$reuse=$true} catch {}
    if (!$reuse) {
      if (Test-Path -LiteralPath $dest) {
        $running=@(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {$_.ExecutablePath -and $_.ExecutablePath.StartsWith($dest+'\',[StringComparison]::OrdinalIgnoreCase)})
        if ($running.Count) {throw '运行依赖仍被占用，请先退出桌面角色再修复。'}
        [IO.Directory]::Move($dest,$backup)
      }
      [IO.Directory]::Move($stage,$dest);$installed=$true
    }
    if ($dep.kind -eq 'cubism-core') {$record | Add-Member -Force NoteProperty licenseRevision $dep.licenseRevision}
    $record.path=$dest;$script:depState.dependencies | Add-Member -Force NoteProperty $dep.id $record
    Save-InstallState;$committed=$true;$script:depInstalled=$true
    Add-DependencyEvent $dep.id $(if ($reuse) {'reused'} else {'installed'}) $dest
  } catch {
    if (!$committed) {
      $script:depState=$previous | ConvertFrom-Json
      if ($installed -and (Test-Path -LiteralPath $dest)) {Remove-Item -LiteralPath $dest -Recurse -Force}
      if (Test-Path -LiteralPath $backup) {[IO.Directory]::Move($backup,$dest)}
    }
    Add-DependencyEvent $dep.id 'install-failed' $_.Exception.Message;throw
  } finally {
    if (Test-Path -LiteralPath $stage) {Remove-Item -LiteralPath $stage -Recurse -Force}
    if ($committed -and (Test-Path -LiteralPath $backup)) {Remove-Item -LiteralPath $backup -Recurse -Force}
  }
}
function Get-DependencyAssistanceAvailability() {
  if(!$env:PET_BRIDGE -or !$env:PET_SECRET){return @{enabled=$false;reason='未连接 DSH'}}
  $web=$null
  try{
    $bridge=[Uri]$env:PET_BRIDGE
    if($bridge.Scheme -ne 'http' -or $bridge.Host -ne '127.0.0.1'){return @{enabled=$false;reason='DSH 本机连接地址无效'}}
    $web=New-Object Net.WebClient;$web.Encoding=[Text.Encoding]::UTF8;$web.Headers['Authorization']='Bearer '+$env:PET_SECRET
    $watch=[Diagnostics.Stopwatch]::StartNew();$task=$web.DownloadStringTaskAsync([Uri]($bridge.GetLeftPart([UriPartial]::Authority)+'/dependency-assist-status'))
    while(!$task.IsCompleted){[Windows.Forms.Application]::DoEvents();[Threading.Thread]::Sleep(50);if($watch.Elapsed.TotalSeconds -gt 3){$web.CancelAsync();throw 'timeout'}}
    $text=$task.GetAwaiter().GetResult();$status=$text|ConvertFrom-Json
    if($status.enabled -isnot [bool]){throw 'invalid response'}
    return @{enabled=$status.enabled;reason=([string]$status.reason)}
  }catch{return @{enabled=$false;reason='DSH 连接或模型服务暂不可用'}}
  finally{if($web){$web.Dispose()}}
}
function Request-DependencyAssistance($issues) {
  if (!$env:PET_BRIDGE -or !$env:PET_SECRET) {throw '未连接 DSH，请使用无需 AI 的一键修复'}
  $bridge=[Uri]$env:PET_BRIDGE
  if ($bridge.Scheme -ne 'http' -or $bridge.Host -ne '127.0.0.1') {throw 'DSH 本机连接地址无效'}
  $rows=@($issues | ForEach-Object {@{id=$_.id;version=$_.version;detail=[regex]::Replace($_.detail,[regex]::Escape($root),'<运行目录>',[Text.RegularExpressions.RegexOptions]::IgnoreCase)}})
  $payload=@{issues=$rows}|ConvertTo-Json -Depth 8 -Compress
  $web=New-Object Net.WebClient;$web.Encoding=[Text.Encoding]::UTF8;$web.Headers['Authorization']='Bearer '+$env:PET_SECRET;$web.Headers['Content-Type']='application/json'
  try {
    Write-DependencyStatus 'assisting' 'AI 正在分析安装故障（调用 AI 会消耗模型 tokens）…' $issues
    $watch=[Diagnostics.Stopwatch]::StartNew();$task=$web.UploadStringTaskAsync([Uri]($bridge.GetLeftPart([UriPartial]::Authority)+'/dependency-assist'),'POST',$payload)
    while (!$task.IsCompleted) {[Windows.Forms.Application]::DoEvents();[Threading.Thread]::Sleep(100);if ($watch.Elapsed.TotalSeconds -gt 60) {$web.CancelAsync();throw 'AI 诊断超时，可使用无需 AI 的一键修复'}}
    $response=$task.GetAwaiter().GetResult();$result=$response|ConvertFrom-Json
    if ($result.action -notin @('install','recheck','manual') -or $result.summary -isnot [string] -or !$result.summary.Trim() -or $result.summary.Length -gt 700) {throw 'AI 诊断结果无效，可使用无需 AI 的一键修复'}
    Add-DependencyEvent 'assistant' $result.action $result.summary
    return $result
  } catch {
    $detail=$_.Exception.Message;$cause=$_.Exception
    while($cause -and $cause -isnot [Net.WebException]){$cause=$cause.InnerException}
    if($cause -and $cause.Response){
      try{$reader=New-Object IO.StreamReader($cause.Response.GetResponseStream());try{$errorBody=$reader.ReadToEnd()|ConvertFrom-Json;if($errorBody.error -is [string]){$detail=$errorBody.error.Substring(0,[Math]::Min(400,$errorBody.error.Length))}}finally{$reader.Dispose()}}catch{}
    }
    throw ('AI 协助未完成：'+$detail+'；可使用无需 AI 的一键修复。')
  }
  finally {$web.Dispose()}
}
function Show-DependencyProblem($issues,$reason) {
  $availability=Get-DependencyAssistanceAvailability
  Close-DependencyProgress
  $form=New-DependencyForm 'Live Character · 运行依赖需要修复';$form.ClientSize=New-Object Drawing.Size(650,450)
  [void](Add-DependencyLabel $form 'title' '角色尚未启动，请先检查与修复运行环境' 20 15 610 30)
  $text=($issues | ForEach-Object {$_.name+' '+$_.version+'：'+$_.detail+"`r`n"+$_.path}) -join "`r`n`r`n"
  $box=New-Object Windows.Forms.TextBox;$box.Multiline=$true;$box.ReadOnly=$true;$box.ScrollBars='Vertical';$box.Text=$text+$(if ($reason) {"`r`n`r`n"+$reason} else {''});$box.Location=New-Object Drawing.Point(20,50);$box.Size=New-Object Drawing.Size(610,140);$form.Controls.Add($box)
  [void](Add-DependencyLabel $form 'steps' '固定流程：校验内置依赖 → 从本地安装包修复 → 自检。没有联网下载；可离线导入匹配的 ZIP 或目录。AI 仅提供诊断和处理选择，不执行生成的命令或下载地址。' 20 200 610 55)
  $cost=Add-DependencyLabel $form 'cost' 'AI 协助：调用 AI 会消耗模型 tokens。一键修复/重新检测/离线导入不调用 AI。' 20 255 610 35;$cost.ForeColor=[Drawing.Color]::Gray
  $availabilityText=if($availability.enabled){'AI 协助可用；只有点击该按钮才会请求模型。'}else{'AI 协助不可用：'+$availability.reason}
  $note=Add-DependencyLabel $form 'availability' $availabilityText 20 290 610 35;$note.ForeColor=[Drawing.Color]::Gray
  Add-DependencyButton $form 'AI 协助修复' 20 330 190 'assist'
  foreach($control in $form.Controls){if($control.Tag -eq 'assist'){$control.Enabled=$availability.enabled}}
  Add-DependencyButton $form '一键修复（无需 AI）' 230 330 190 'install'
  Add-DependencyButton $form '离线导入…' 440 330 190 'offline'
  Add-DependencyButton $form '取消' 20 380 250 'cancel'
  Add-DependencyButton $form '重新检测' 290 380 160 'check'
  $copy=New-Object Windows.Forms.LinkLabel;$copy.Text='复制诊断';$copy.Location=New-Object Drawing.Point(540,390);$copy.AutoSize=$true;$copy.Tag=$box.Text+"`r`n"+$availabilityText+"`r`n日志："+$script:depLog
  $copy.Add_LinkClicked({[Windows.Forms.Clipboard]::SetText([string]$this.Tag)});$form.Controls.Add($copy)
  $form.Tag='cancel';[void]$form.ShowDialog();$choice=$form.Tag;$form.Dispose();return $choice
}
function Choose-OfflineDependency($issues) {
  $form=New-DependencyForm 'Live Character · 离线导入运行依赖';$form.ClientSize=New-Object Drawing.Size(650,180)
  [void](Add-DependencyLabel $form 'caption' '选择需要修复的依赖，然后选择官方 ZIP 或匹配的运行时目录。' 20 15 610 40)
  $combo=New-Object Windows.Forms.ComboBox;$combo.DropDownStyle='DropDownList';$combo.Location=New-Object Drawing.Point(20,65);$combo.Size=New-Object Drawing.Size(610,30)
  foreach ($issue in $issues) {[void]$combo.Items.Add($issue.name+' '+$issue.version)};$combo.SelectedIndex=0;$form.Controls.Add($combo)
  Add-DependencyButton $form '选择 ZIP' 20 115 190 'zip';Add-DependencyButton $form '选择目录' 230 115 190 'directory';Add-DependencyButton $form '取消' 440 115 190 'cancel'
  $form.Tag='cancel';[void]$form.ShowDialog();$choice=$form.Tag;$id=$issues[$combo.SelectedIndex].id;$form.Dispose()
  if ($choice -eq 'cancel') {return $null}
  if ($choice -eq 'zip') {
    $pick=New-Object Windows.Forms.OpenFileDialog;$pick.Filter='官方运行依赖 ZIP (*.zip)|*.zip';$pick.Title='选择对应版本的官方 Windows x64 ZIP'
    try {if ($pick.ShowDialog() -eq 'OK') {return @{id=$id;path=$pick.FileName}}} finally {$pick.Dispose()}
  } else {
    $pick=New-Object Windows.Forms.FolderBrowserDialog
    try {if ($pick.ShowDialog() -eq 'OK') {return @{id=$id;path=$pick.SelectedPath}}} finally {$pick.Dispose()}
  }
  return $null
}
function Ensure-Dependencies() {
  $script:depInstalled=$false
  Open-DependencyProgress
  $reason='';$issues=@(Get-DependencyIssues)
  while ($issues.Count) {
    Write-DependencyStatus 'missing' '运行依赖需要修复，请在安装弹窗中选择修复、离线导入或重新检测。' $issues
    $choice=Show-DependencyProblem $issues $reason
    if ($choice -eq 'cancel') {Write-DependencyStatus 'cancelled' '依赖安装已取消；自行安装后可点击“重新检测依赖”。' $issues;throw [OperationCanceledException]::new('Dependency installation cancelled')}
    try {
      $advice=$null
      if ($choice -eq 'assist') {
        Open-DependencyProgress;$advice=Request-DependencyAssistance $issues
        Write-DependencyStatus 'assisting' ('AI 建议：'+$advice.summary) $issues
        $choice=$advice.action
      }
      if ($choice -eq 'install') {
        if (!$script:depProgress) {Open-DependencyProgress}
        foreach ($issue in $issues) {Install-Dependency ($script:depManifest.dependencies | Where-Object {$_.id -eq $issue.id})}
      } elseif ($choice -eq 'offline') {
        $selection=Choose-OfflineDependency $issues
        if ($selection) {Open-DependencyProgress;Install-Dependency ($script:depManifest.dependencies | Where-Object {$_.id -eq $selection.id}) $selection.path}
      }
      $reason=if ($advice) {'AI 建议：'+$advice.summary} else {''}
    } catch [OperationCanceledException] {Write-DependencyStatus 'cancelled' '准备已取消。' $issues;throw} catch {$reason=$_.Exception.Message}
    if (!$script:depProgress) {Open-DependencyProgress};$issues=@(Get-DependencyIssues)
  }
  Save-InstallState
  $message=if($script:depInstalled){'依赖修复完成，运行环境已就绪。请点击“启动角色”。'}else{'运行依赖检查通过，正在启动角色…'}
  Write-DependencyStatus 'ready' $message;Close-DependencyProgress
}
