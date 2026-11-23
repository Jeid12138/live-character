const {execFile}=require('node:child_process');
const path=require('node:path');

const MAX_IMAGE_LENGTH=850000;
const captureScript=String.raw`
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class ScreenCaptureDpi {
    [DllImport("user32.dll")]
    public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
}
'@
$previous = [ScreenCaptureDpi]::SetThreadDpiAwarenessContext([IntPtr](-4))
if ($previous -eq [IntPtr]::Zero) { exit 1 }
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$display = [System.Windows.Forms.Screen]::FromPoint([System.Windows.Forms.Cursor]::Position)
$bounds = $display.Bounds
$bitmap = [System.Drawing.Bitmap]::new($bounds.Width, $bounds.Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
try {
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try { $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size) }
    finally { $graphics.Dispose() }
    foreach ($limit in @(1440, 1080, 720)) {
        $scale = [Math]::Min(1, $limit / [Math]::Max($bounds.Width, $bounds.Height))
        $w = [Math]::Max(1, [int]($bounds.Width * $scale))
        $h = [Math]::Max(1, [int]($bounds.Height * $scale))
        $image = [System.Drawing.Bitmap]::new($bitmap, $w, $h)
        try {
            $stream = [System.IO.MemoryStream]::new()
            try {
                $image.Save($stream, [System.Drawing.Imaging.ImageFormat]::Jpeg)
                if ($stream.Length -le 637482) {
                    if ([System.Windows.Forms.Screen]::FromPoint([System.Windows.Forms.Cursor]::Position).DeviceName -cne $display.DeviceName) { exit 1 }
                    [Console]::Write([Convert]::ToBase64String($stream.ToArray()))
                    exit
                }
            } finally { $stream.Dispose() }
        } finally { $image.Dispose() }
    }
} finally { $bitmap.Dispose() }
`;

function captureWindowsDisplay(){
 if(process.platform!=='win32'||!process.env.SystemRoot)return Promise.resolve(null);
 const powershell=path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
 const encoded=Buffer.from(captureScript,'utf16le').toString('base64');
 return new Promise(resolve=>execFile(powershell,
  ['-NoProfile','-NonInteractive','-NoLogo','-EncodedCommand',encoded],
  {windowsHide:true,timeout:7000,maxBuffer:MAX_IMAGE_LENGTH},
  (error,stdout)=>resolve(error||!stdout?null:'data:image/jpeg;base64,'+stdout)));
}

module.exports=function createScreenObservation({eligible,capture=captureWindowsDisplay}){
 let revision=0;
 const valid=(request,stamp)=>stamp===revision&&request?.event?.type==='observe'&&request.event.automatic===true&&eligible(request);
 return {
  invalidate(){revision++;},
  valid,
  async capture(request){
   const stamp=revision;
   if(!valid(request,stamp))return null;
   try{
    const image=await capture();
    if(!valid(request,stamp)||typeof image!=='string'||image.length>MAX_IMAGE_LENGTH||!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(image))return null;
    return {image,stamp};
   }catch{return null;}
  }
 };
};
