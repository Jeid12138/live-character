// Derive the runtime manifest from npm's actual publish list, never a raw source-tree walk.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
if(!/^\d+\.\d+\.\d+$/.test(pkg.version))throw Error('运行时目录需要三段数字版本号');
// The bundled DSH client and static lab page run without Node package metadata.
function stamp(relative, pattern, replacement){
 const file=path.join(root,relative),before=fs.readFileSync(file,'utf8');
 if(!pattern.test(before))throw Error('无法同步发布版本：'+relative);
 const after=before.replace(pattern,replacement);
 if(after!==before)fs.writeFileSync(file,after);
}
stamp('desktop/package.json',/"version": "\d+\.\d+\.\d+"/,'"version": "'+pkg.version+'"');
stamp('client.js',/const pluginVersion='\d+\.\d+\.\d+';/,"const pluginVersion='"+pkg.version+"';");
stamp('lab/index.html',/<small id="lcVersion">LIVE2D \/ \d+\.\d+\.\d+<\/small>/,'<small id="lcVersion">LIVE2D / '+pkg.version+'</small>');
stamp('README.md',/^# Live Character \d+\.\d+\.\d+/,'# Live Character '+pkg.version);
for(const relative of ['runtime.ps1','dependencies.ps1','release-runtime.ps1']){
 const bytes=fs.readFileSync(path.join(root,relative));
 if(!bytes.subarray(0,3).equals(Buffer.from([0xef,0xbb,0xbf])))throw Error('Windows PowerShell 5.1 需要 UTF-8 BOM：'+relative);
}
const output=path.join(root,'runtime-code-manifest.json');
if(!fs.existsSync(output))fs.writeFileSync(output,JSON.stringify({version:pkg.version,files:[]})+'\n');
const npmCli=process.env.npm_execpath;
if(!npmCli)throw Error('请通过 npm pack 运行发布准备，确保使用同一 npm 的真实发布清单');
const plan=JSON.parse(execFileSync(process.execPath,[npmCli,'pack','--dry-run','--json','--ignore-scripts'],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024}))[0];
const paths=plan.files.map(f=>f.path).sort();
// An archived script is useless if the authenticated HTTP server cannot serve it.
const serverText=fs.readFileSync(path.join(root,'lab/server.py'),'utf8');
const routeSet=serverText.match(/if rel not in (\{[^}]+\}):self\.send_error\(404\)/)?.[1];
if(!routeSet)throw Error('无法核对页面静态白名单');
const staticRoutes=new Set([...routeSet.matchAll(/'([^']+)'/g)].map(m=>m[1]));
const entryHtml=fs.readFileSync(path.join(root,'lab/index.html'),'utf8');
for(const [,resource] of entryHtml.matchAll(/(?:src|href)="([^"#]+)"/g)){
 if(resource==='profile.js'||/^[a-z]+:/.test(resource))continue;
 if(!staticRoutes.has(resource))throw Error('页面引用了 HTTP 白名单未提供的资源：'+resource);
 if(!paths.includes('lab/'+resource))throw Error('页面 HTTP 资源没有进入发布包：'+resource);
}

const runtime=paths.filter(p=>p.startsWith('desktop/')||p.startsWith('lab/'));
for(const p of runtime){
 if(p.split('/').some(v=>v.startsWith('.'))||/\.(pyc|pyo)$/.test(p)||p.includes('__pycache__'))throw Error('发布运行目录含非运行文件：'+p);
}
for(const p of ['desktop/main.cjs','desktop/package.json','desktop/core-runtime.cjs','desktop/preload.cjs','desktop/lc.ico','lab/index.html','lab/app.js','lab/server.py','lab/vendor/cubism4.js','lab/vendor/pixi.min.js','runtime.ps1','release-runtime.ps1','dependencies.ps1','index.js','client.js','runtime-code-manifest.json']){
 if(!paths.includes(p))throw Error('发布清单缺少必要文件：'+p);
}
const sha=p=>createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const manifest={version:pkg.version,files:runtime.map(p=>({path:p,sha256:sha(p)}))};
fs.writeFileSync(path.join(root,'runtime-code-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const declared=new Set(manifest.files.map(f=>f.path));
if(runtime.length!==declared.size||runtime.some(p=>!declared.has(p)))throw Error('发布清单与运行清单不相等');
const dependencies=JSON.parse(fs.readFileSync(path.join(root,'runtime-manifest.json'),'utf8')).dependencies;
for(const dep of dependencies){if(!paths.includes(dep.bundledArchive)||sha(dep.bundledArchive)!==dep.sha256)throw Error('内置依赖不完整：'+dep.id);}
console.error('Verified publish manifest:',runtime.length,'runtime files;',dependencies.length,'bundled dependency archives.');
