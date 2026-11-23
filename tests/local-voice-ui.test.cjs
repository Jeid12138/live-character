const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {boot,pause}=require('./fixtures/browser-lab.cjs');

function select(w,id,value) {
 const field=w.document.getElementById(id);
 field.value=value;
 field.dispatchEvent(new w.Event('change',{bubbles:true}));
}

test('desktop CSS and the DSH mirror show only the relevant voice controls in order',async()=>{
 const f=await boot();
 try {
  const {w}=f,field=id=>w.document.getElementById(id);
  for(const name of ['style.css','companion.css']){
   const css=w.document.createElement('style');
   css.textContent=fs.readFileSync(path.join(__dirname,'../lab',name),'utf8');
   w.document.head.append(css);
  }
  const fetch=w.fetch;
  w.fetch=async(url,options)=>{
   if(url==='/api/voice-local-models')return {ok:true,json:async()=>({models:[
    {id:'breeze-bf16',label:'Breeze',reference:true},{id:'piper:test',label:'Piper',reference:false}
   ]})};
   if(url==='/api/voice-local-status')return {ok:true,json:async()=>({installed:true})};
   return fetch(url,options);
  };
  const row=field('voiceStyleRow'),description=field('breezeInstruction').parentElement;
  const visible=element=>w.getComputedStyle(element).display!=='none';
  function check(style,describe,clone){
   assert.equal(visible(row),style);
   assert.equal(visible(description),describe);
   for(const control of [field('referenceLibrary'),field('referenceAIRow'),field('referenceText').parentElement]){
    assert.equal(visible(control),clone);
   }
   const mirror=w.petPanel.read({pane:'voicePanel'}).fields;
   const styleIndex=mirror.findIndex(node=>node.children?.includes('声音方式'));
   const descriptionIndex=mirror.findIndex(node=>node.children?.some(child=>child.tag==='span'&&child.children.includes('音色描述')));
   assert.equal(styleIndex!==-1,style);
   assert.equal(descriptionIndex!==-1,describe);
   if(describe)assert.equal(descriptionIndex,styleIndex+1);
   const snapshot=JSON.stringify(mirror);
   assert.equal(snapshot.includes('AI 识别文字稿'),clone);
   assert.equal(snapshot.includes('参考音频文字稿'),clone);
  }
  w.companion.applySettings({voiceMode:'breeze',breezeInstruction:'清亮温暖'});
  check(true,true,false);
  select(w,'voiceStyle','clone');check(true,false,true);
  select(w,'voiceStyle','normal');check(true,true,false);
  assert.equal(field('breezeInstruction').value,'清亮温暖');
  select(w,'voiceLocalProtocol','local');check(true,false,false);
  assert.equal(visible(field('voiceId').parentElement),true);
  select(w,'voiceStyle','clone');check(true,false,true);
  select(w,'localEngine','managed');await pause(10);
  select(w,'managedVoiceModel','breeze-bf16');check(true,false,true);
  select(w,'voiceStyle','normal');check(true,true,false);
  select(w,'managedVoiceModel','piper:test');check(false,false,false);
  select(w,'voiceMode','api');select(w,'voiceProvider','breeze');check(false,false,false);
  assert.equal(visible(field('voiceId').parentElement),true);
 }finally{f.dom.window.close();}
});

test('legacy local Breeze restores without changing its endpoint; switching engine updates the DSH fields',async()=>{
 const f=await boot();
 try {
  const {w}=f,field=id=>w.document.getElementById(id);
  w.companion.applySettings({voiceMode:'breeze',breezeEndpoint:'http://localhost:2345/v1/audio/speech',breezeInstruction:'轻轻说话'});
  assert.equal(field('voiceMode').value,'local');
  assert.equal(field('localEngine').value,'service');
  assert.equal(field('breezeEndpoint').parentElement.hidden,false);
  assert.equal(field('ttsEndpoint').parentElement.hidden,true);
  assert.equal(field('breezeEndpoint').value,'http://localhost:2345/v1/audio/speech');
  select(w,'voiceLocalProtocol','local');
  assert.equal(field('ttsEndpoint').parentElement.hidden,false);
  assert.equal(field('breezeEndpoint').parentElement.hidden,true);
  select(w,'voiceMode','api');field('breezeInstruction').value='云端语气';
  select(w,'voiceMode','local');assert.equal(field('breezeInstruction').value,'轻轻说话');
  select(w,'localEngine','managed');
  assert.equal(field('managedVoiceSetup').hidden,false);
  assert.equal(field('breezeEndpoint').parentElement.hidden,true);
  assert.equal(field('voiceApiKey').parentElement.hidden,true);
  assert.equal(field('ttsEndpoint').parentElement.hidden,true);
  const snapshot=JSON.stringify(w.petPanel.read({pane:'voicePanel'}).fields);
  assert.match(snapshot,/环境配置/);assert.doesNotMatch(snapshot,/Breeze 完整接口地址/);
  await field('saveVoice').onclick();
  assert.equal(w.companion.config.voiceMode,'managed');
  assert.equal(w.companion.config.voiceProfiles.breeze.instruction,'云端语气');
  const next=await boot({storage:new Map(f.store)});
  try{assert.equal(next.w.document.getElementById('localEngine').value,'managed');}
  finally{next.dom.window.close();}
 }finally{f.dom.window.close();}
});

test('managed preparation requires a selected weight; trial sends the saved model and omits the endpoint',async()=>{
 const f=await boot();
 try{
  const {w}=f,field=id=>w.document.getElementById(id),requests=[];let installed=false;
  w.HTMLMediaElement.prototype.play=async()=>{};
  const original=w.fetch;w.fetch=async(url,options)=>{
   requests.push([url,JSON.parse(options?.body||'{}')]);
   if(url.endsWith('-models'))return {ok:true,json:async()=>({models:[{id:'piper:test',label:'测试 Piper',download:'Piper',space:'100 MB',reference:false}]})};
   if(url.endsWith('-install'))installed=true;
   if(url.includes('/api/voice-local-'))return {ok:true,json:async()=>({installed})};
   return original(url,options);
  };
  select(w,'voiceMode','local');select(w,'localEngine','managed');await pause(20);
  assert.equal(field('managedVoiceModel').value,'');
  assert.equal(field('prepareLocalVoice').disabled,true);
  select(w,'managedVoiceModel','piper:test');await pause(1);
  await field('prepareLocalVoice').onclick();
  assert.match(field('voiceInstallSummary').textContent,/测试 Piper.*权重需自行下载.*100 MB/);
  field('cancelVoiceInstall').click();
  assert(!requests.some(([url])=>url.endsWith('-install')));
  await field('prepareLocalVoice').onclick();
  await field('confirmVoiceInstall').onclick();
  assert.deepEqual(requests.filter(([url])=>url.endsWith('-install')).map(([,body])=>body),[{model:'piper:test',confirmed:true,source:'official'}]);
  field('breezeInstruction').value='温柔';await field('saveVoice').onclick();
  await field('voiceTest').onclick();
  const request=requests.find(([url])=>url==='/api/synthesize')?.[1];
  assert.equal(request?.mode,'managed');assert.equal(request?.model,'piper:test');
  assert.equal(request.endpoint,undefined);assert.equal(request.key,undefined);assert.equal('idleVramOptimization' in request,false);
 }finally{f.dom.window.close();}
});

test('settings polling and unchanged refresh preserve draft choices and option nodes; deleted assets clear selection',async()=>{
 let models=[{id:'breeze-bf16',label:'Breeze TTS2',reference:true}],files=['first.wav','second.wav'],modelReads=0,referenceReads=0;
 const f=await boot({configure(w){
  const fetch=w.fetch;
  w.fetch=async(url,opts)=>{
   if(url==='/api/voice-local-models'){modelReads++;return {ok:true,json:async()=>({models})};}
   if(url==='/api/voice-local-status')return {ok:true,json:async()=>({installed:true})};
   return fetch(url,opts);
  };
  const asset=w.petDesktop.asset;
  w.petDesktop.asset=async(op,value)=>{
   if(op==='voiceReferences'){referenceReads++;return files;}
   if(op==='readVoiceReference')return {name:value,mime:'audio/wav',base64:'AA=='};
   return asset(op,value);
  };
 }});
 try{
  const {w}=f,field=id=>w.document.getElementById(id);
  select(w,'managedVoiceModel','breeze-bf16');await pause(1);
  assert.equal(field('prepareLocalVoice').hidden,false,'a ready environment can still be inspected');
  await field('prepareLocalVoice').onclick();
  await field('recheckVoiceEnvironment').onclick();
  assert.match(field('voiceInstallSummary').textContent,/Breeze TTS2 的环境已准备/);
  assert.equal(field('confirmVoiceInstall').disabled,true);
  field('cancelVoiceInstall').click();
  assert.equal(field('voiceTest').disabled,true,'draft settings must be saved before trial');
  assert.match(field('voiceReadyHint').textContent,/保存/);
  assert.equal(field('referenceLibrary').hidden,true);
  select(w,'voiceStyle','clone');await pause(1);
  select(w,'voiceReferenceChoice','first.wav');await pause(1);
  field('referenceText').value='第一段参考文本';
  select(w,'voiceReferenceChoice','second.wav');await pause(1);
  assert.equal(field('referenceText').value,'');
  const modelOption=field('managedVoiceModel').selectedOptions[0],referenceOption=field('voiceReferenceChoice').selectedOptions[0];
  const optionIds=()=>{
   const ids={};
   function check(node){
    if(node.tag==='option'&&['breeze-bf16','second.wav'].includes(node.value))ids[node.value]=node.id;
    for(const child of node.children||[])if(typeof child==='object')check(child);
   }
   for(const node of w.petPanel.read({pane:'voicePanel'}).fields)check(node);
   return ids;
  };
  const hostIds=optionIds();
  assert.equal(Object.keys(hostIds).length,2);
  const reads=[modelReads,referenceReads];
  Object.defineProperty(w.performance,'now',{value:()=>5000});
  w.petPanel.read({pane:'voicePanel'});await pause(1);
  assert.deepEqual([modelReads,referenceReads],reads);
  await field('refreshVoiceModels').onclick();
  await field('refreshVoiceReferences').onclick();
  assert.equal(field('managedVoiceModel').selectedOptions[0],modelOption);
  assert.equal(field('voiceReferenceChoice').selectedOptions[0],referenceOption);
  assert.deepEqual(optionIds(),hostIds);
  assert.equal(w.companion.config.managedVoiceModel,undefined,'refresh does not save a draft');
  files=['first.wav','new.wav'];
  await field('refreshVoiceReferences').onclick();
  assert.equal(field('voiceReferenceChoice').value,'');
  assert(!referenceOption.isConnected);
  assert.match(field('voiceStatus').textContent,/参考音频已移除/);
  assert.equal(field('referenceSelectionSummary').hidden,true);
  models=[{id:'piper-alt',label:'新模型',reference:false}];
  await field('refreshVoiceModels').onclick();
  assert.equal(field('managedVoiceModel').value,'');
  assert(!modelOption.isConnected);
  assert.match(field('managedVoiceStatus').textContent,/模型已移除/);
  assert.equal(field('voiceTest').disabled,true);
 }finally{f.dom.window.close();}
});

test('global AI changes refresh voice trial controls and explanation',async()=>{
 const f=await boot();
 try {
  const {w}=f,field=id=>w.document.getElementById(id);
  w.liveAI=false;w.companion.refreshVoiceActions();
  assert.equal(field('voiceTest').disabled,true);
  assert.equal(field('speakLast').disabled,true);
  assert.match(field('voiceReadyHint').textContent,/AI 总开关已关闭/);
  w.liveAI=true;w.companion.refreshVoiceActions();
  assert.doesNotMatch(field('voiceReadyHint').textContent,/AI 总开关已关闭/);
 }finally{f.dom.window.close();}
});
test('AI transcript hides the manual field then restores it after an unsupported-audio refusal',async()=>{
 const f=await boot();
 try{
  const {w}=f,$=id=>w.document.getElementById(id);
  const previous=w.petDesktop.asset;
  w.petDesktop.asset=async(op,...args)=>{
   if(op==='readVoiceReference')return {name:'sample.wav',mime:'audio/wav',base64:'UklGRg=='};
   if(op==='transcribeReference')throw Error('当前模型不支持音频输入');
   return previous(op,...args);
  };
  w.companion.applySettings({voiceMode:'breeze',voiceStyle:'clone'});
  const option=new w.Option('sample.wav','sample.wav');$('voiceReferenceChoice').append(option);
  select(w,'voiceReferenceChoice','sample.wav');await pause(20);
  $('referenceText').value='先前文字稿';
  $('referenceAI').checked=true;$('referenceAI').dispatchEvent(new w.Event('change'));
  assert.equal($('referenceText').disabled,true);
  assert.equal($('referenceText').parentElement.hidden,true);
  assert.equal($('referenceText').value,'先前文字稿');
  await pause(30);
  assert.equal($('referenceAI').checked,false);
  assert.equal($('referenceText').disabled,false);
  assert.equal($('referenceText').parentElement.hidden,false);
  assert.match($('voiceStatus').textContent,/不支持音频输入.*请自行填写/);
  assert.equal($('referenceText').value,'先前文字稿');
 }finally{f.dom.window.close();}
});
test('only the active audio and chat model can apply a transcript',async()=>{
 const f=await boot();
 try{
  const {w}=f,$=id=>w.document.getElementById(id),pending=[];
  const previous=w.petDesktop.asset;
  w.petDesktop.asset=async(op,value)=>{
   if(op==='voiceReferences')return ['first.wav','second.wav'];
   if(op==='readVoiceReference')return {name:value,mime:'audio/wav',base64:'UklGRg=='};
   if(op==='pickVoiceReference')return null;
   if(op==='transcribeReference')return new Promise((resolve,reject)=>pending.push({value,resolve,reject}));
   return previous(op,value);
  };
  w.companion.applySettings({voiceMode:'breeze',voiceStyle:'clone'});
  w.companion.modelChoices(['first-model','second-model']);
  select(w,'petModel','first-model');
  await $('refreshVoiceReferences').onclick();
  select(w,'voiceReferenceChoice','first.wav');await pause(0);
  const toggle=checked=>{$('referenceAI').checked=checked;$('referenceAI').dispatchEvent(new w.Event('change'));};
  toggle(true);
  assert.equal($('saveVoice').disabled,true);
  select(w,'voiceReferenceChoice','second.wav');await pause(0);
  assert.equal(pending[1].value.audio.name,'second.wav');
  pending[0].reject(Error('过时的失败'));await pause(0);
  assert.equal($('referenceAI').checked,true);
  assert.match($('voiceStatus').textContent,/正在识别/);
  select(w,'petModel','second-model');
  $('referenceText').value='第二段手工文字';toggle(true);
  assert.equal(pending[2].value.model,'second-model');
  select(w,'voiceReferenceChoice',':upload:');await pause(0);
  pending[1].resolve({text:'旧模型的结果'});pending[2].resolve({text:'取消选择前的结果'});await pause(0);
  assert.equal($('voiceReferenceChoice').value,'second.wav');
  assert.equal($('referenceText').value,'第二段手工文字');
  assert.equal($('referenceAI').checked,false);
  toggle(true);pending[3].resolve({text:'新结果'});await pause(0);
  assert.equal($('referenceText').value,'新结果');
  assert.equal($('referenceAI').checked,true);
  assert.equal($('referenceText').parentElement.hidden,true);
  assert.equal($('referenceText').disabled,true);
  toggle(false);
  assert.equal($('referenceText').disabled,false);
 }finally{f.dom.window.close();}
});

test('trial requires saving a different audio even when the transcript matches',async()=>{
 const f=await boot();
 try{
  const {w}=f,$=id=>w.document.getElementById(id);
  const previous=w.petDesktop.asset;
  w.petDesktop.asset=async(op,value)=>{
   if(op==='voiceReferences')return ['first.wav','second.wav'];
   if(op==='readVoiceReference')return {name:value,mime:'audio/wav',base64:'UklGRg=='};
   return previous(op,value);
  };
  w.companion.applySettings({voiceMode:'breeze',voiceStyle:'clone',referenceName:'first.wav',referenceText:'相同文字'});
  await pause(0);
  await $('refreshVoiceReferences').onclick();
  await $('saveVoice').onclick();
  assert.equal($('voiceTest').disabled,false);
  select(w,'voiceReferenceChoice','second.wav');await pause(0);
  $('referenceText').value='相同文字';$('referenceText').dispatchEvent(new w.Event('input',{bubbles:true}));
  assert.equal($('voiceTest').disabled,true);
  await $('saveVoice').onclick();
  assert.equal(w.companion.config.referenceName,'second.wav');
  assert.equal(w.companion.config.referenceText,'相同文字');
  assert.equal($('voiceTest').disabled,false);
 }finally{f.dom.window.close();}
});
test('saved reference restores by local filename during initial settings load',async()=>{
 let reads=0;
 const f=await boot({beforeCompanion(w){
  const old=w.petDesktop.asset;
  w.petDesktop.asset=async(op,...args)=>{
   if(op==='readVoiceReference'){reads++;return {name:args[0],mime:'audio/wav',base64:'UklGRg=='};}
   return old(op,...args);
  };
 }});
 try{
  f.w.companion.applySettings({voiceMode:'breeze',voiceStyle:'clone',referenceName:'reference-sample.wav',referenceText:'准确文字'});
  await pause(30);
  assert.equal(reads,1);
  assert.equal(f.w.document.getElementById('referenceText').value,'准确文字');
  assert.match(f.w.document.getElementById('referenceSelectionSummary').textContent,/reference-sample.wav/);
 }finally{f.dom.window.close();}
});

for(const ordering of ['read first','list first','deleted','changed choice']){
 test('voice tab reconciles the saved recording and library: '+ordering,async()=>{
  const f=await boot();
  try{
   const {w}=f,$=id=>w.document.getElementById(id);
   const previous=w.petDesktop.asset,oldName='saved.wav',newName='new.wav';
   const audio=name=>({name,mime:'audio/wav',base64:'UklGRg=='});
   let finishRead,finishList;
   w.petDesktop.asset=async(op,value)=>{
    if(op==='voiceReferences')return new Promise(resolve=>{finishList=resolve;});
    if(op==='readVoiceReference'){
     return value===oldName?new Promise(resolve=>{finishRead=resolve;}):audio(value);
    }
    return previous(op,value);
   };
   w.companion.applySettings({voiceMode:'breeze',voiceStyle:'clone',referenceName:oldName,referenceText:'已保存文字稿'});
   w.document.querySelector('[data-pane="voicePanel"]').click();
   const names=ordering==='deleted'?[newName]:[oldName,newName];
   if(ordering==='read first'){finishRead(audio(oldName));await pause(0);}
   finishList(names);await pause(0);
   if(ordering==='changed choice'){
    select(w,'voiceReferenceChoice',newName);await pause(0);
    $('referenceText').value='新录音草稿';
   }
   if(ordering!=='read first'){finishRead(audio(oldName));await pause(0);}
   if(ordering==='deleted'){
    assert.equal($('voiceReferenceChoice').value,'');
    assert.match($('voiceStatus').textContent,/参考音频已移除/);
    assert.equal($('referenceSelectionSummary').hidden,true);
   }else if(ordering==='changed choice'){
    assert.equal($('voiceReferenceChoice').value,newName);
    assert.match($('referenceSelectionSummary').textContent,/new\.wav/);
    assert.equal($('referenceText').value,'新录音草稿');
   }else{
    assert.equal($('voiceReferenceChoice').value,oldName);
    assert.match($('referenceSelectionSummary').textContent,/saved\.wav/);
    assert.equal($('referenceText').value,'已保存文字稿');
   }
  }finally{f.dom.window.close();}
 });
}

test('voice features require saved settings and reset on model or source changes',async()=>{
 const piper='piper-'+'0'.repeat(64);
 const requests=[];
 const f=await boot({configure(w){
  const fetch=w.fetch;
  w.fetch=async(url,options)=>{
   if(url==='/api/synthesize')requests.push(JSON.parse(options.body));
   if(url==='/api/voice-local-models')return {ok:true,json:async()=>({models:[
    {id:'breeze-bf16',label:'Breeze',reference:true},{id:piper,label:'Piper'},{id:'other',label:'Other'}
   ]})};
   if(url==='/api/voice-local-status')return {ok:true,json:async()=>({installed:true})};
   return fetch(url,options);
  };
 }});
 try{
  const {w}=f,field=id=>w.document.getElementById(id);
  w.HTMLMediaElement.prototype.play=async()=>{};
  const stream=field('managedVoiceStreaming'),cuda=field('voiceCudaGraph'),idle=field('idleVramOptimization');
  w.companion.applySettings({voiceMode:'managed',managedVoiceModel:'breeze-bf16'});
  await pause(15);
  assert.equal(field('managedStreamingRow').hidden,false);
  assert.equal(cuda.disabled,false);
  assert.equal(stream.checked,false);
  assert.equal(cuda.checked,false);
  assert.equal(idle.checked,false);
  assert.equal(field('idleVramOptimizationRow').hidden,false);
  assert.match(field('idleVramOptimizationTip').title,/保留已加载的语音进程，减少空闲显存占用。恢复本地朗读时，首句可能稍慢。/);
  assert.ok(field('voiceCudaGraphRow').compareDocumentPosition(field('idleVramOptimizationRow')) & w.Node.DOCUMENT_POSITION_FOLLOWING);
  idle.click();
  assert.equal(w.companion.config.idleVramOptimization===true,false);
  assert.equal(cuda.checked,false);
  stream.click();cuda.click();
  assert.equal(w.companion.config.voiceStreaming===true,false);
  assert.equal(w.companion.config.voiceCudaGraph===true,false);
  assert.equal(field('voiceTest').disabled,true);
  await field('saveVoice').onclick();
  assert.equal(w.companion.config.voiceStreaming,true);
  assert.equal(w.companion.config.voiceCudaGraph,true);
  assert.equal(w.companion.config.idleVramOptimization,true);
  idle.click();
  assert.equal(w.companion.config.idleVramOptimization,true,'unsaved toggle does not change config');
  idle.click();
  stream.click();await field('saveVoice').onclick();
  await field('voiceTest').onclick();
  assert.equal(requests.at(-1)?.idleVramOptimization,true);
  select(w,'managedVoiceModel',piper);
  assert.equal(field('idleVramOptimizationRow').hidden,true);
  assert.equal(idle.disabled,true);
  assert.equal(field('managedStreamingRow').hidden,false);
  assert.equal(stream.checked,false);
  assert.equal(cuda.disabled,true);
  select(w,'managedVoiceModel','other');
  assert.equal(field('managedStreamingRow').hidden,true);
  select(w,'voiceMode','api');
  assert.equal(field('idleVramOptimizationRow').hidden,true);
  assert.equal(field('managedStreamingRow').hidden,true);
  assert.equal(field('serviceStreamingRow').hidden,true);
  assert.equal(cuda.disabled,true);
 }finally{f.dom.window.close();}
});

test('saved stream starts playing PCM before EOF and stops the reader on mute',async()=>{
 const f=await boot();
 try{
  const {w}=f,field=id=>w.document.getElementById(id);
  let streamSignal,transportBody,started=false,closed=false,pendingRead;
  w.AudioContext=class{
   constructor(){this.currentTime=0;this.destination={};}
   createGain(){return {gain:{value:0},connect(){}};}
   createAnalyser(){return {frequencyBinCount:512,connect(){}};}
   createBuffer(_channels,length,rate){return {duration:length/rate,getChannelData(){return new Float32Array(length);}};}
   createBufferSource(){return {connect(){},disconnect(){},start(){started=true;}};}
   async resume(){}
   async close(){closed=true;}
  };
  const fetch=w.fetch;
  w.fetch=async(url,options)=>{
   if(url!=='/api/synthesize-stream')return fetch(url,options);
   streamSignal=options.signal;
   transportBody=JSON.parse(options.body);
   const headers=new Map([['X-Sample-Rate','24000'],['X-Sample-Format','s16le'],['X-Channels','1']]);
   let first=true;
   return {ok:true,headers,body:{getReader(){return {
    async read(){
     if(first){first=false;return {value:new Uint8Array(4097)};}
     return new Promise((resolve,reject)=>{
      pendingRead=true;
      streamSignal.addEventListener('abort',()=>reject(new w.DOMException('','AbortError')),{once:true});
     });
    },
    async cancel(){},releaseLock(){}
   };}}};
  };
  w.companion.applySettings({voiceMode:'breeze',voiceStreaming:true,breezeEndpoint:'http://localhost:7860/v1/audio/speech'});
  assert.equal(field('serviceVoiceStreaming').checked,true);
  assert.equal(await field('voiceTest').onclick(),true);
  assert.equal(started,true);
  assert.equal(pendingRead,true);
  assert.equal(streamSignal.aborted,false);
  assert.equal(transportBody.mode,'breeze');
  await w.companion.setPlayback({muted:true});
  await pause(1);
  assert.equal(streamSignal.aborted,true);
  assert.equal(closed,true);
 }finally{f.dom.window.close();}
});

test('WAV-only Breeze plays the same response and remembers its endpoint across reload',async()=>{
 const endpoint='http://localhost:7860/v1/audio/speech',requests=[];
 const raw=Buffer.alloc(48);
 raw.write('RIFF');raw.writeUInt32LE(40,4);raw.write('WAVEfmt ',8);raw.writeUInt32LE(16,16);
 raw.writeUInt16LE(1,20);raw.writeUInt16LE(1,22);raw.writeUInt32LE(24000,24);
 raw.writeUInt32LE(48000,28);raw.writeUInt16LE(2,32);raw.writeUInt16LE(16,34);
 raw.write('data',36);raw.writeUInt32LE(4,40);
 let played=0;
 const configure=w=>{
  w.HTMLMediaElement.prototype.play=async()=>{played++;};
  w.AudioContext=class{
   constructor(){this.destination={};}
   createGain(){return {gain:{value:1},connect(){}};}
   createAnalyser(){return {frequencyBinCount:512,connect(){}};}
   async resume(){}
   async close(){}
  };
  const fetch=w.fetch;
  w.fetch=async(url,options)=>{
   if(url==='/api/synthesize-stream'){
    requests.push(url);
    return {ok:true,headers:new Map([['Content-Type','audio/wav']]),arrayBuffer:async()=>Uint8Array.from(raw).buffer};
   }
   if(url==='/api/synthesize'){
    requests.push(url);
    return {ok:true,json:async()=>({audio:{mime:'audio/wav',base64:raw.toString('base64')}})};
   }
   return fetch(url,options);
  };
 };
 const f=await boot({configure});
 try{
  const {w}=f,field=id=>w.document.getElementById(id);
  w.companion.applySettings({voiceMode:'breeze',voiceStreaming:true,breezeEndpoint:endpoint});
  assert.equal(await field('voiceTest').onclick(),true);
  assert.deepEqual(requests,['/api/synthesize-stream']);
  assert.equal(played,1);
  assert.equal(field('serviceStreamingRow').hidden,true);
  assert.equal(field('voiceTest').disabled,false);
  const next=await boot({configure,storage:new Map(f.store)});
  try{
   const nextField=id=>next.w.document.getElementById(id);
   assert.equal(nextField('serviceStreamingRow').hidden,true);
   assert.equal(await nextField('voiceTest').onclick(),true);
   assert.deepEqual(requests,['/api/synthesize-stream','/api/synthesize']);
   nextField('breezeEndpoint').value='http://localhost:7861/v1/audio/speech';
   nextField('breezeEndpoint').dispatchEvent(new next.w.Event('input',{bubbles:true}));
   assert.equal(nextField('serviceStreamingRow').hidden,false);
   assert.equal(nextField('serviceVoiceStreaming').checked,false);
   assert.equal(nextField('voiceTest').disabled,true);
  }finally{next.dom.window.close();}
 }finally{f.dom.window.close();}
});

test('stopping local full synthesis aborts the active request',async()=>{
 const f=await boot();
 try{
  const {w}=f,field=id=>w.document.getElementById(id);
  let signal;
  const fetch=w.fetch;
  w.fetch=async(url,options)=>{
   if(url!=='/api/synthesize')return fetch(url,options);
   signal=options.signal;
   return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{
    reject(new w.DOMException('','AbortError'));
   },{once:true}));
  };
  w.companion.applySettings({voiceMode:'local',voiceStreaming:false});
  const trial=field('voiceTest').onclick();
  await require('./fixtures/browser-lab.cjs').waitUntil(()=>signal);
  w.liveAI=false;
  w.companion.disableVoice();
  assert.equal(signal.aborted,true);
  assert.equal(signal.reason.message,'朗读已停止');
  assert.equal(await trial,false);
  assert.doesNotMatch(field('voiceStatus').textContent,/朗读未完成/);
 }finally{f.dom.window.close();}
});

test('unexpected AbortError is localized, while HTTP read timeout keeps its classification',async()=>{
 const f=await boot();
 try{
  const {w}=f,field=id=>w.document.getElementById(id),reports=[];
  const fetch=w.fetch,asset=w.petDesktop.asset;
  w.petDesktop.asset=(op,value)=>{
   if(op==='voiceStartLocal')return Promise.resolve({requestId:'voice-fixture'});
   if(op==='voiceReport')reports.push(value);
   return asset(op,value);
  };
  let timeout=false;
  w.fetch=async(url,options)=>{
   if(url!=='/api/synthesize')return fetch(url,options);
   if(timeout)return {ok:false,json:async()=>({error:'worker timeout',voice:{errorCode:'read_timeout'}})};
   throw new w.DOMException('signal is aborted without reason','AbortError');
  };
  w.companion.applySettings({voiceMode:'local',voiceStreaming:false});
  assert.equal(await field('voiceTest').onclick(),false);
  assert.match(field('voiceStatus').textContent,/语音连接意外中断/);
  assert.equal(reports.at(-1).errorCode,'synthesis_failed');
  timeout=true;
  assert.equal(await field('voiceTest').onclick(),false);
  assert.match(field('voiceStatus').textContent,/语音服务等待超时/);
  assert.equal(reports.at(-1).errorCode,'read_timeout');
 }finally{f.dom.window.close();}
});

test('the decision deadline is disarmed before voice and failed voice still presents the reply',async()=>{
 const f=await boot();
 try{
  const {w}=f;
  const set=w.setTimeout.bind(w),clear=w.clearTimeout.bind(w),fetch=w.fetch;
  let decisionDeadline,decisionSignal,voiceSignal,disarmed=false;
  w.setTimeout=(fn,delay,...args)=>{
   const timer=set(fn,delay,...args);
   if(delay===95000)decisionDeadline=timer;
   return timer;
  };
  w.clearTimeout=timer=>{if(timer===decisionDeadline)disarmed=true;clear(timer);};
  w.fetch=async(url,options)=>{
   if(url==='/api/decide'){
    decisionSignal=options.signal;
    return {ok:true,json:async()=>({plan:{text:'气泡仍会显示',emotion:'自然',activity:.5,duration:4}})};
   }
   if(url==='/api/synthesize'){
    voiceSignal=options.signal;
    assert.equal(disarmed,true);
    throw new w.DOMException('signal is aborted without reason','AbortError');
   }
   return fetch(url,options);
  };
  w.companion.applySettings({autoVoice:true,voiceMode:'local',voiceStreaming:false});
  assert.equal(await w.companion.decide({type:'chat',text:'请朗读'}),true);
  assert.ok(decisionSignal&&voiceSignal);
  assert.notEqual(decisionSignal,voiceSignal);
  assert.equal(decisionSignal.aborted,false);
  assert.equal(voiceSignal.aborted,false);
  const bubble=w.document.getElementById('petBubble');
  assert.equal(bubble.hidden,false);
  assert.match(bubble.textContent,/气泡仍会显示/);
 }finally{f.dom.window.close();}
});

test('saved cloud stream uses native pull and cancels by request ID when AI stops',async()=>{
 const requests=[];
 let releaseRead, scheduled=false;
 const f=await boot({configure(w){
  const asset=w.petDesktop.asset;
  w.petDesktop.asset=async(op,value)=>{
   if(op==='voiceCredential')return {saved:true,encrypted:true};
   if(op==='voiceSave')return {settings:value.settings,credential:{saved:true}};
   if(op==='voiceStreamOpen'){
    requests.push([op,value]);
    return {sampleRate:'24000',format:'s16le',channels:'1',requestId:'diagnostic'};
   }
   if(op==='voiceStreamRead'){
    requests.push([op,value]);
    if(!scheduled)return {bytes:new Uint8Array(4096),done:false};
    return new Promise(resolve=>{releaseRead=resolve;});
   }
   if(op==='voiceCancel'){
    requests.push([op,value]);releaseRead?.({cancelled:true});return true;
   }
   return asset(op,value);
  };
  w.AudioContext=class{
   constructor(){this.currentTime=0;this.destination={};}
   createGain(){return {gain:{value:0},connect(){}};}
   createAnalyser(){return {frequencyBinCount:512,connect(){}};}
   createBuffer(_channels,length,rate){return {duration:length/rate,getChannelData(){return new Float32Array(length);}};}
   createBufferSource(){return {connect(){},disconnect(){},start(){scheduled=true;}};}
   async resume(){}
   async close(){}
  };
 }});
 try{
  const {w}=f,field=id=>w.document.getElementById(id);
  w.companion.applySettings({voiceMode:'api',voiceProvider:'breeze',voice:'voc_saved',voiceStreaming:false});
  await pause(10);
  assert.equal(field('apiStreamingRow').hidden,false);
  assert.equal(field('voiceCudaGraphRow').hidden,true);
  field('apiVoiceStreaming').click();
  assert.equal(field('voiceTest').disabled,true);
  assert.equal(await field('saveVoice').onclick(),true);
  assert.equal(await field('voiceTest').onclick(),true);
  assert.equal(scheduled,true);
  const open=requests.find(([op])=>op==='voiceStreamOpen')[1];
  assert.equal(open.provider,'breeze');
  assert.equal('key' in open,false);
  assert.equal('cudaGraph' in open,false);
  w.liveAI=false;w.companion.disableVoice();
  await pause(1);
  assert.equal(requests.find(([op])=>op==='voiceCancel')[1].clientRequestId,open.clientRequestId);
 }finally{f.dom.window.close();}
});
