import assert from 'node:assert/strict';
import {diagnoseDependencies,dependencyAssistanceAvailability} from '../dependency-assist.js';
const issues=[{id:'electron',version:'45.2.3',detail:'文件缺失：locales/af.pak'}];
function mock({efforts=['off','low'],reply={summary:'缺少语言资源，使用固定安装器修复。',action:'install'},chunks,finish='stop'}={}){
 const calls=[];
 return {calls,listProviders:()=>[{id:'deepseek-account'}],resolveModelInfo:async()=>({reasoning:{efforts:efforts.map(id=>({id}))}}),async *stream(request){
  calls.push(request);
  if(chunks){yield* chunks;return;}
  const text=JSON.stringify(reply);yield{type:'text-delta',index:0,text:text.slice(0,10)};yield{type:'text-delta',index:0,text:text.slice(10)};yield{type:'finish',reason:{kind:finish}};
 }};
}
const signal=AbortSignal.timeout(10000);
let llm=mock();let result=await diagnoseDependencies(llm,{},issues,signal);assert.equal(result.action,'install');assert.equal(llm.calls.length,1);assert.equal(llm.calls[0].reasoningEffort,'off');assert.deepEqual(llm.calls[0].tools,[]);assert.equal(llm.calls[0].maxTokens,1400);
llm=mock({efforts:['low']});await diagnoseDependencies(llm,{},issues,signal);assert.equal(llm.calls[0].reasoningEffort,'low');
llm=mock({efforts:['high']});await assert.rejects(()=>diagnoseDependencies(llm,{},issues,signal),/off\/low/);assert.equal(llm.calls.length,0);
llm=mock({efforts:[]});await diagnoseDependencies(llm,{},issues,signal);assert(!('reasoningEffort' in llm.calls[0]));
llm=mock({reply:{summary:'用户需要先退出占用进程。',action:'manual',command:'untrusted',url:'untrusted'}});result=await diagnoseDependencies(llm,{},issues,signal);assert.deepEqual(Object.keys(result).sort(),['action','summary']);
llm=mock({reply:{summary:'任意操作',action:'shell'}});await assert.rejects(()=>diagnoseDependencies(llm,{},issues,signal),/无效/);
llm=mock();await assert.rejects(()=>diagnoseDependencies(llm,{},[{id:'core',version:'1.0.0',detail:'x'}],signal),/无效/);assert.equal(llm.calls.length,0);
llm=mock({finish:'max-tokens'});await assert.rejects(()=>diagnoseDependencies(llm,{},issues,signal),/完整/);assert.equal(llm.calls.length,1);
llm=mock({chunks:[{type:'block-end',index:0,block:{type:'text',text:JSON.stringify({summary:'重新检查。',action:'recheck'})}}]});assert.equal((await diagnoseDependencies(llm,{},issues,signal)).action,'recheck');
llm=mock({chunks:[{type:'text-delta',text:'{"summary":'}]});await assert.rejects(()=>diagnoseDependencies(llm,{},issues,signal),/完整/);
console.log('PASS AI diagnosis: single request, no tools, low reasoning, allowed actions only, output whitelist, partial/block-end handling');

let streams=0;const metadataOnly={listProviders:()=>[{id:'deepseek-account'}],stream(){streams++;throw Error('must not generate');},resolveModelInfo(){throw Error('metadata query must not resolve a model');}};
assert.equal(dependencyAssistanceAvailability(metadataOnly,{},{}).enabled,true);
assert.equal(dependencyAssistanceAvailability(metadataOnly,{}, {ai:false}).enabled,false);
assert.equal(dependencyAssistanceAvailability(metadataOnly,{}, {busy:true}).enabled,false);
assert.equal(dependencyAssistanceAvailability(null).enabled,false);
assert.equal(dependencyAssistanceAvailability(metadataOnly,{provider:'disabled'}).enabled,false);assert.equal(streams,0);
console.log('PASS read-only AI availability: disabled/busy/disconnected/provider states, no model calls');

llm=mock();await diagnoseDependencies(llm,{},[{id:'cubism-core',version:'06.00.0001',detail:'缺少固定 Core 文件或许可确认'}],signal);assert.equal(llm.calls.length,1);
console.log('PASS Core dependency is accepted by the opt-in diagnostic whitelist');
