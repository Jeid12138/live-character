import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=process.argv[2]?path.resolve(process.argv[2]):fileURLToPath(new URL('../',import.meta.url));
const json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const pkg=json('package.json'),manifest=json('runtime-code-manifest.json');
assert.equal(manifest.version,pkg.version,'runtime manifest version must match package');
const actual=[];
function scan(dir){for(const item of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){
 if(item.name.startsWith('.')||item.name==='__pycache__'||/\.(pyc|pyo)$/.test(item.name))continue;
 const rel=dir+'/'+item.name;assert(!item.isSymbolicLink(),'symlink in runtime '+rel);if(item.isDirectory())scan(rel);else actual.push(rel);
}}
scan('desktop');scan('lab');
const declared=manifest.files.map(x=>x.path).sort();assert.equal(new Set(declared).size,declared.length);
assert(!declared.some(p=>p.split('/').some(v=>v.startsWith('.'))),'manifest must not depend on packaging control files');
assert.deepEqual(declared,[...actual].sort(),'published runtime files and manifest must match in BOTH directions');
for(const entry of manifest.files){assert(fs.existsSync(path.join(root,entry.path)),'manifest file absent: '+entry.path);assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,entry.path))).digest('hex'),entry.sha256,entry.path);}
for(const relative of [pkg.main,...Object.values(pkg.exports), 'runtime.ps1','dependencies.ps1','release-runtime.ps1','cordis.patch.yml','client.js','preset/actor.mjs'])assert(fs.existsSync(path.join(root,relative)),relative);
const html=fs.readFileSync(path.join(root,'lab/index.html'),'utf8');
for(const [,src] of html.matchAll(/<script src="([^"]+)"/g))if(src!=='profile.js')assert(declared.includes('lab/'+src),'page script absent: '+src);
for(const rel of declared.filter(p=>p.endsWith('.cjs'))){const text=fs.readFileSync(path.join(root,rel),'utf8');for(const [,ref] of text.matchAll(/require\(['"](\.\/[^'"]+)['"]\)/g)){
 const target=path.posix.normalize(path.posix.join(path.posix.dirname(rel),ref));assert(declared.includes(target),'desktop import absent: '+target);
}}
for(const dep of json('runtime-manifest.json').dependencies){
 const hash=createHash('sha256');for await(const chunk of fs.createReadStream(path.join(root,dep.bundledArchive)))hash.update(chunk);
 assert.equal(hash.digest('hex'),dep.sha256,'shipped dependency: '+dep.id);
}
assert.deepEqual(json('desktop/core-runtime.json'),json('runtime-manifest.json').dependencies.find(d=>d.id==='cubism-core'));
console.log('PASS delivered package:',manifest.files.length,'runtime files match in both directions, all hashes, page/desktop imports, host entrypoints, 3 shipped payloads');

for(const rel of declared.filter(p=>p.endsWith('.html'))){
 const html=fs.readFileSync(path.join(root,rel),'utf8');
 for(const [,ref] of html.matchAll(/(?:src|href)="([^"#]+)"/g)){
  if(ref==='profile.js'||/^[a-z]+:/.test(ref))continue;
  const target=path.posix.normalize(path.posix.join(path.posix.dirname(rel),ref));assert(declared.includes(target),'HTML runtime resource absent: '+target);
 }
}
for(const rel of ['desktop/bubble.html','desktop/bubble-preload.cjs','desktop/bubble-surface.js','desktop/bubble.css','lab/bubble-layout.js'])assert(declared.includes(rel),'bubble runtime resource absent: '+rel);
