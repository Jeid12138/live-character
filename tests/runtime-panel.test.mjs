import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../client.js',import.meta.url),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function mount(initialStatus){
 const hooks=[],timers=new Map(),calls=[];
 let index=0,effects=[],tree,Settings,scheduled=false,status=initialStatus,timerId=0;
 const update=()=>{
  if(scheduled)return;
  scheduled=true;
  queueMicrotask(()=>{scheduled=false;render();});
 };
 const effect=(fn,deps)=>{
  const i=index++,previous=hooks[i];
  if(previous&&deps.length===previous.deps.length&&deps.every((value,j)=>Object.is(value,previous.deps[j])))return;
  effects.push(()=>{previous?.cleanup?.();hooks[i]={deps,cleanup:fn()};});
 };
 const React={
  createElement:(type,props,...children)=>({type,props:props||{},children:children.flat()}),
  useState(initial){
   const i=index++;
   if(!hooks[i])hooks[i]={value:typeof initial==='function'?initial():initial};
   return [hooks[i].value,value=>{
    const next=typeof value==='function'?value(hooks[i].value):value;
    if(!Object.is(next,hooks[i].value)){hooks[i].value=next;update();}
   }];
  },
  useRef(value){const i=index++;return hooks[i]??={current:value};},
  useEffect:effect,useLayoutEffect:effect
 };
 const rpc={async call(_route,_method,command){
  calls.push(command.op);
  if(command.op==='dependencies')return {ok:true,value:status};
  if(command.op==='launch'){
   status={phase:'checking',preparing:true,online:false,runId:command.runId};
   return {ok:true,value:{starting:true,runId:command.runId}};
  }
  if(command.op==='read')return status.online
   ?{ok:true,value:{epoch:'role',revision:1,ready:false}}
   :{ok:false,error:{message:'桌宠尚未就绪，请确认桌面角色已启动'}};
  throw Error('unexpected operation '+command.op);
 }};
 const layout={};
 const context={
  window:{__ModuleLoader__:{load(descriptor){
   descriptor.factory(()=>React).apply({
    connection:{rpc},layout,effect(){},
    slots:{inject(name,fn){if(name==='main')fn();},register(_options,component){Settings=component;}}
   });
  }}},
  document:{hidden:false,addEventListener(){},removeEventListener(){}},
  localStorage:{getItem:()=>null},crypto:{randomUUID},AbortController,AbortSignal,
  setTimeout(fn){const id=++timerId;timers.set(id,fn);return id;},
  clearTimeout(id){timers.delete(id);}
 };
 vm.runInNewContext(source,context);
 function render(){
  index=0;effects=[];
  const page=Settings();
  tree=page.type(page.props);
  tree.props.ref.current={};
  for(const run of effects)run();
 }
 function find(predicate,node=tree){
  if(!node||typeof node!=='object')return;
  if(predicate(node))return node;
  for(const child of node.children){const found=find(predicate,child);if(found)return found;}
 }
 render();
 return {
  calls,find,button(label){return find(node=>node.type==='button'&&node.children.includes(label));},
  setStatus(value){status={...status,...value};},
  async poll(){const pending=[...timers.values()];timers.clear();for(const fn of pending)fn();await settle();},
  stop(){for(const hook of hooks)hook.cleanup?.();timers.clear();}
 };
}
const idle={phase:'idle',online:false,preparing:false,starting:false};
const page=mount(idle);
await settle();await page.poll();
assert.deepEqual(page.calls,['dependencies','dependencies']);
await page.button('启动角色').props.onClick();await settle();
assert.equal(page.button('正在准备…').props.disabled,true);
page.setStatus({phase:'ready',preparing:false,starting:true});
await page.poll();
assert.equal(page.button('正在连接角色…').props.disabled,true);
assert(!page.calls.includes('read'));
page.setStatus({starting:false,online:true});
await page.poll();
assert(page.find(node=>node.props.className==='lc-workspace'));
assert.equal(page.calls.filter(op=>op==='launch').length,1);
page.setStatus(idle);await page.poll();
assert(page.button('启动角色'));
await page.button('启动角色').props.onClick();await settle();
page.setStatus({...idle,phase:'failed',message:'运行环境准备失败'});
await page.poll();
assert.equal(page.button('检查与修复依赖').props.disabled,false);
assert(page.find(node=>node.props.role==='status'&&node.children.includes('运行环境准备失败')));
page.stop();

const alreadyRunning=mount({...idle,phase:'ready',online:true});
await settle();
assert(alreadyRunning.find(node=>node.props.className==='lc-workspace'));
assert.deepEqual(alreadyRunning.calls,['dependencies','read']);
alreadyRunning.stop();
