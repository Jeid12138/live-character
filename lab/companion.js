'use strict';
(()=>{
const C=CompanionCore,H=window.companionHost,el=id=>document.getElementById(id);
const defaults={persona:'你是陪伴用户进行 AI 制作和写作的桌面伙伴。性格温柔、好奇，有自己的情绪表达。结合近期互动自主选择回应，不机械重复。用户工作时适当降低主动行为频率，空闲时稍活跃。',mode:'local',endpoint:'http://127.0.0.1:61945/decide',model:'',reasonMode:'auto',reasonCap:'high',auto:true,touchAI:true,touchDebounceMs:250,interval:180,quiet:2,swapButtons:false,budget:12,speakChance:.3,voiceNetwork:'direct',voiceProvider:'breeze',voiceApiUrl:'https://api.breeze.blue',voiceApiModel:'breeze-tts-2',voiceProfiles:{},tts:'http://127.0.0.1:61946/synthesize',voice:'',referenceText:'',breezeEndpoint:'http://127.0.0.1:7860/v1/audio/speech',breezeInstruction:'',autoVoice:false,voiceGuidance:2.5,lipGain:1,lipOffset:0};
let playback={volume:.8,muted:false},playbackRevision=0,audioPCM=null,pendingSpeechText='',lastVoiceRefresh=-Infinity;
let preparingModelChange=false,generationPending=null,cancelPending=null,hostStopping=false;const userCancellations=new Map();let visualPerformance=null;
let appearance={current:null,events:[],lastEventId:null};try{appearance={...appearance,...JSON.parse(petStore.getItem('appearance-memory-v1')||'{}')}}catch{}
if(!Array.isArray(appearance.events))appearance.events=[];
let config={...defaults},memory={emotion:'平静',activity:.5,history:[],events:[],calls:[]};
try{config={...defaults,...JSON.parse(petStore.getItem('companion-config-v4')||'{}')};memory={...memory,...JSON.parse(petStore.getItem('companion-memory-v4')||'{}')};}catch{}
// Recover the old Breeze example without initiating a paid request or inventing a key.
if(config.voiceMode==='api'&&/https:\/\/api\.breeze\.blue(?:\/|$)/.test(config.voiceApiUrl||'')){
 config.voiceProvider='breeze';config.voiceApiUrl='https://api.breeze.blue';if(!['breeze-tts-2','breeze-tts-2-multilingual'].includes(config.voiceApiModel))config.voiceApiModel='breeze-tts-2';
}else if(config.voiceMode==='api'){try{if(!JSON.parse(petStore.getItem('companion-config-v4')||'{}').voiceProvider)config.voiceProvider='openai';}catch{config.voiceProvider='openai';}}
config.interval=Math.max(30,Math.min(900,Number(config.interval)||180));config.quiet=Math.max(1.2,Math.min(5,Number(config.quiet)||2));config.budget=Math.max(0,Math.min(120,Number.isFinite(Number(config.budget))?Number(config.budget):12));
config.touchDebounceMs=Number.isInteger(config.touchDebounceMs)&&config.touchDebounceMs>=50&&config.touchDebounceMs<=5000?config.touchDebounceMs:250;
const effortNotices=new Set();let voiceEpoch=0;let key='',busy=false,epoch=0,controller=null,reference=null,frames=[],audioURL='',lastText='',lastSpeech='',nextDue=performance.now()+config.interval*1000,touchTimer=null,pendingTouches=[],bubbleTimer=null,lastReply='',layer=new C.Layer(),lipValues={},lastLip=0,preview=null;
const zones=[{name:'头部',x:0,y:0,w:1,h:.23},{name:'胸口',x:.3,y:.23,w:.4,h:.15},{name:'肚子',x:.32,y:.38,w:.36,h:.16},{name:'左手臂',x:0,y:.24,w:.3,h:.3},{name:'右手臂',x:.7,y:.24,w:.3,h:.3},{name:'尾巴左侧',x:0,y:.54,w:.28,h:.38},{name:'尾巴右侧',x:.72,y:.54,w:.28,h:.38},{name:'脚',x:.28,y:.9,w:.44,h:.1}];
let strokeAt=-Infinity;let hitZones=zones;try{const z=JSON.parse(petStore.getItem('companion-zones-v4')||'null');if(z)hitZones=validateZones(z);}catch{}
function validateZones(z){if(!Array.isArray(z)||z.length>30)throw Error('最多 30 个区域');return z.map(a=>{if(!a.name||!['x','y','w','h'].every(k=>Number.isFinite(a[k])&&a[k]>=0&&a[k]<=1)||a.w<=0||a.h<=0||a.x+a.w>1.001||a.y+a.h>1.001)throw Error('区域坐标需在 0–1 内');return {name:String(a.name).slice(0,30),x:a.x,y:a.y,w:a.w,h:a.h}})}
function save(){petStore.setItem('companion-config-v4',JSON.stringify(config));memory.history=memory.history.slice(-16);memory.events=(memory.events||[]).slice(-8);memory.calls=memory.calls.filter(t=>Date.now()-t<3600000);petStore.setItem('companion-memory-v4',JSON.stringify(memory));}
function status(s,level){for(const id of ['connectionStatus','companionBrief','galStatus'])feedback(el(id),s.split('\n')[0],level);notice(s.split('\n')[0],level);}
function archive(op,value){
 const native=window.petDesktop?.store;if(native)return native(window.petStorageKey||window.petProfile,op,'chat',value);
 const k='archive-v1',old=JSON.parse(petStore.getItem(k)||'null');
 if(op==='history')return old||[];
 const next=op==='append'?[...(old||[]),value]:op==='seed'&&old?old:value;
 petStore.setItem(k,JSON.stringify(next));
}
archive('seed',memory.history);
function uiWarning(error,label){
 const text=label+'：'+String(error?.message||error);console.warn(text);
 try{window.petDesktop?.reportRenderer?.({kind:'error',message:text,stack:error?.stack});}catch{}
 return text;
}
function present(action,label){try{action();return '';}catch(error){return uiWarning(error,label);}}
function message(role,text,meta={}){const row={role,text:String(text).slice(0,2000),at:new Date().toISOString(),...meta};archive('append',row);memory.history.push(row);save();present(()=>window.petDesktop?.notify?.('chat',{...row,automatic:role==='assistant'&&memory.events?.at(-1)?.type!=='chat'}),'对话通知失败');present(renderHistory,'对话记录显示失败');}

function renderHistory(){for(const target of [el('chatHistory')])if(target){target.replaceChildren();for(const m of memory.history){const p=target.ownerDocument.createElement('p');p.textContent=(m.kind==='character_event'?'互动：':m.role==='user'?'你：':'她：')+m.text;target.append(p)}target.scrollTop=target.scrollHeight;}}
let bubbleText='',bubbleShownAt=0,bubbleExplicitTTL,bubbleSerial=0,bubbleVisible=0,bubbleRevealMs=0,bubbleMedia=null,bubbleChars=[],bubbleSpans=null;
function hideBubble(){clearTimeout(bubbleTimer);bubbleMedia=null;el('petBubble').hidden=true;present(()=>window.petDesktop?.bubble?.({hidden:true}),'隐藏气泡失败');}
let warnedBubbleClock=false;
function readingSeconds(){
 try{const value=window.studioBubbleSeconds?.(bubbleText)??window.LiveBubble?.seconds?.(bubbleText);if(Number.isFinite(value)&&value>0)return value;}catch(error){if(!warnedBubbleClock){warnedBubbleClock=true;uiWarning(error,'气泡计时已降级');}}
 if(!warnedBubbleClock){warnedBubbleClock=true;uiWarning(Error('bubble-layout.js 未就绪，使用本地计时后备规则'),'气泡计时已降级');}
 const value=id=>Number(el(id)?.value),minimum=Math.min(60,Math.max(2,value('bubbleTime')||4));
 if(el('bubbleAutoTime')?.checked===false)return minimum;
 const speed=Math.min(1200,Math.max(60,value('bubbleReadSpeed')||300)),extra=Math.min(30,Math.max(0,value('bubbleExtraTime')||0));
 return Math.max(minimum,Math.ceil(Array.from(bubbleText.replace(/\s/gu,'')).length*60/speed+extra));
}
function timeBubble(){
 clearTimeout(bubbleTimer);if(el('petBubble').hidden||!bubbleText)return;
 if(bubbleMedia)return;
 const duration=bubbleExplicitTTL??readingSeconds()*1000;
 bubbleTimer=setTimeout(hideBubble,Math.max(0,duration-(performance.now()-bubbleShownAt)));
}
function bubble(text,ttl,media=null){
 clearTimeout(bubbleTimer);bubbleText=String(text||'');bubbleChars=Array.from(bubbleText);bubbleSerial++;bubbleShownAt=performance.now();bubbleMedia=media;
 bubbleExplicitTTL=Number.isFinite(ttl)&&ttl>0?ttl:undefined;
 const total=(media?.duration>0&&Number.isFinite(media.duration)?media.duration:media?.lcDuration)||readingSeconds();
 const reserve=Math.min(total*.5,Math.max(.5,+el('bubbleReadReserve')?.value||1.5));
 bubbleRevealMs=el('bubbleTypewriter')?.checked===false?0:Math.max(0,Math.min(bubbleChars.length/Math.max(5,+el('bubbleTypingSpeed')?.value||24),total*.7,total-reserve)*1000);
 const visible=document.createElement('span'),hidden=document.createElement('span');hidden.className='speech-unrevealed';hidden.style.visibility='hidden';hidden.setAttribute('aria-hidden','true');
 bubbleSpans={visible,hidden};bubbleVisible=0;el('petBubble').replaceChildren(visible,hidden);el('petBubble').hidden=!bubbleText;revealBubble();
 if(!bubbleText){hideBubble();return;}
 timeBubble();return present(()=>window.studioPositionBubble?.(),'气泡显示失败');
}
function revealBubble(){
 if(el('petBubble').hidden||!bubbleSpans)return;
 const elapsed=bubbleMedia?bubbleMedia.currentTime*1000:performance.now()-bubbleShownAt;
 bubbleVisible=bubbleRevealMs?Math.min(bubbleChars.length,Math.floor(bubbleChars.length*Math.max(0,elapsed)/bubbleRevealMs)):bubbleChars.length;
 bubbleSpans.visible.textContent=bubbleChars.slice(0,bubbleVisible).join('');bubbleSpans.hidden.textContent=bubbleChars.slice(bubbleVisible).join('');
 window.studioRevealBubble?.({id:bubbleSerial,visibleCount:bubbleVisible});
 if(bubbleMedia?.ended)finishSpeechBubble();
}
function finishSpeechBubble(){if(!bubbleMedia)return;bubbleMedia=null;bubbleVisible=bubbleChars.length;bubbleRevealMs=0;revealBubble();bubbleShownAt=performance.now();bubbleExplicitTTL=Math.max(0,+el('bubbleSpeechTail')?.value||0)*1000;timeBubble();}
setInterval(revealBubble,35);
function safeBubble(...args){let layout='';const warning=present(()=>{layout=bubble(...args)||'';},'气泡显示失败');return warning||layout;}
window.refreshBubbleTiming=timeBubble;
function panel(id,title,html){const d=document.createElement('section');d.id=id;d.hidden=true;d.className='companion-dialog';d.setAttribute('role','dialog');d.setAttribute('aria-label',title);d.innerHTML='<button class="close" aria-label="关闭">关闭</button><h2>'+title+'</h2>'+html;d.querySelector('.close').onclick=()=>d.hidden=true;document.body.append(d);return d;}
panel('chatPanel','与她聊聊',`<div id="chatHistory" class="companion-log" aria-live="polite"></div><form id="chatForm"><textarea id="chatText" maxlength="2000" placeholder="这里的内容会发送到已配置的 AI 服务。Enter 发送，Shift+Enter 换行。"></textarea><div class="actions"><button type="submit">发送</button><button type="button" id="cancelReply">停止回复与朗读</button><button type="button" id="popChat">独立窗口</button><button type="button" id="clearChat">清空对话与情绪</button></div></form><p class="muted">对话保存在本浏览器，最多保留最近 16 条用于上下文。停止会忽略迟到回复；已提交给服务的请求可能仍计费。</p>`);
panel('companionPanel','陪伴与连接',`<label>性格卡<textarea id="persona" maxlength="5000"></textarea></label><label>DSH 模型<select id="petModel"><option value="">跟随 DSH 会话所选模型</option><option>deepseek-flash</option><option>deepseek-v4-pro</option></select></label><small id="sessionModelHint">选择“跟随 DSH”时，互动使用会话当前模型与推理设置；指定模型才启用 LC 推理上限。AI 适配作业仍使用插件默认或指定模型。</small><label>推理档位<select id="reasonMode"><option value="auto">自适应</option><option value="off">关闭思考</option><option>low</option><option>high</option><option>max</option></select></label><label>自适应最高档位<select id="reasonCap"><option value="off">关闭思考</option><option>low</option><option selected>high</option><option>max</option></select></label><p>触摸、主动演出关闭思考；日常对话 low；分析或长请求 high；明确要求深入推演时可用 max。按模型能力和上限降档。</p><label><input id="autonomy" type="checkbox"> 允许自主陪伴调用 AI</label><label><input id="touchAI" type="checkbox"> 触摸互动交给 AI</label><label>触摸合并间隔（防抖，毫秒）<input id="touchDebounceMs" type="number" min="50" max="5000" step="1"></label><p class="muted">默认 250ms。连续操作间隔不超过此值会合并；长按和滑动松开后开始计时。调用 AI 会消耗模型 tokens。</p><label>基础决策间隔（秒，30–900）<input id="decisionInterval" type="number" min="30" max="900"></label><label>专注模式下，自主演出间隔倍数（1.2–5）<input id="quietFactor" type="number" min="1.2" max="5" step=".1"></label><label>每小时自动调用上限（含触摸，0 表示禁用自动调用）<input id="autoBudget" type="number" min="0" max="120"></label><label>触摸回应说话倾向（0 偏动作–1 偏台词）<input id="speechChance" type="range" min="0" max="1" step=".1"></label><div class="actions"><button id="saveCompanion">保存设置</button><button id="tryDecision">请求一次演出（会调用 AI）</button></div><p id="connectionStatus" class="companion-status">未连接；保存设置不会发起请求。</p><p id="usageStatus" class="companion-status"></p><label>角色鼠标操作<select id="mouseButtons"><option value="normal">左键抚摸 · 右键拖动或轻点菜单</option><option value="swap">右键抚摸 · 左键拖动或轻点菜单</option></select></label><details><summary>触摸区域校准</summary><label><input id="showZones" type="checkbox"> 显示互动区域</label><button id="editZones">进入区域调整模式</button><button id="adaptTouch">AI 触摸适配</button><small class="token-note">调用 AI 会消耗模型 tokens</small><p class="muted">进入后冻结角色，通过鼠标拖动蓝框与边缘手柄调整。区域绑定到部位网格，随网格位置和尺寸移动。矩形不是像素轮廓；必要时点选重新绑定。</p></details>`);
panel('voicePanel','本地语音与多嘴型',`<p class="muted">连接本地语音适配器；需要它实际支持音色克隆。仅有音频时不会伪造 AIUEO。可导入口型时间轴测试。</p><label>语音来源<select id="voiceMode"><option value="local">通用本地模型服务</option><option value="breeze">本地 Breeze TTS2</option><option value="api">云端语音 API</option></select></label><label>语音服务商 <button id="voiceProviderHelp" type="button" class="voice-help" aria-label="语音服务说明" aria-describedby="voiceProviderTip">!</button><span id="voiceProviderTip" popover="auto" class="voice-help-tip" role="tooltip"></span><select id="voiceProvider"></select></label><label>百炼地域<select id="voiceRegion"><option value="cn">北京</option><option value="sg">新加坡</option></select></label><label>API 地址<input id="voiceApiUrl" placeholder="https://…"></label><label>语音网络<select id="voiceNetwork"><option value="direct">直连（默认，不继承代理）</option><option value="system">使用系统代理（遵循 NO_PROXY）</option></select></label><label>API 模型<select id="voiceApiModel"></select></label><label>自定义模型 ID<input id="voiceCustomModel"></label><label><span id="voiceKeyLabel">API Key（本机加密长期保存）</span><input id="voiceApiKey" type="password" autocomplete="off" placeholder="留空保留已有密钥"></label><small id="voiceKeyInputInfo"></small><small id="voiceKeyWarning" data-level="warning" style="color:#9a6700" hidden></small><small id="voiceKeyStatus">尚未保存密钥</small><small id="voiceAuthStatus">保存不联网；测试连接仅验证认证，试播可能产生语音费用。</small><button id="clearVoiceKey">删除此服务的已保存密钥</button><small id="voiceReadyHint"></small><small>使用语音 API 时，朗读文字会发送至所填服务，可能产生费用。</small><label>本地合成接口<input id="ttsEndpoint"></label><label>Breeze 完整接口地址<input id="breezeEndpoint" placeholder="http://127.0.0.1:7860/v1/audio/speech"></label><label><span id="breezeInstructionLabel">固定演绎约束（可选）</span><textarea id="breezeInstruction" maxlength="2000" placeholder="无参考音频时描述音色；有参考时可留空，或填写语气与节奏。"></textarea></label><small id="breezeHelp">先启动本地 Breeze 服务。上传参考 WAV 并填写准确文字稿，或只填音色描述。参考音频仅本次角色页面有效。本地合成不额外调用 DeepSeek。</small><label><span id="voiceIdLabel">音色 ID</span><input id="voiceId"></label><small id="localEngineHelp" hidden>IndexTTS、AuK 等本地引擎请通过通用本地模型服务连接；本版没有安装或后台启动这些引擎。</small><label>克隆参考音频（本次会话，≤8MB）<input id="referenceFile" type="file" accept="audio/*"></label><label>参考音频对应文本<textarea id="referenceText"></textarea></label><label><input id="autoVoice" type="checkbox"> AI 回复后自动朗读</label><div class="actions"><button id="saveVoice">保存语音设置</button><button id="verifyVoiceKey" hidden>测试连接</button><button id="speakLast">朗读最近回复</button><button id="voiceTest">语音试播</button><button id="clearReference">清除参考音频</button></div><div id="voiceErrorPanel" hidden><strong>最近一次语音失败</strong><pre id="voiceLastError" data-level="error" style="white-space:pre-wrap;overflow-wrap:anywhere;color:#b42318"></pre><button id="clearVoiceError">清除语音错误记录</button></div><hr><details><summary>口型校准（可选）</summary><p>选择同一句台词的录音和元音时间轴，检查嘴型与声音是否同步。时间单位为秒，A、I、U、E、O 的权重为 0 到 1。</p><label>导入测试音频（≤16MB）<input id="testAudio" type="file" accept="audio/*"></label><label>导入口型时间轴 JSON<input id="visemeFile" type="file" accept=".json"></label><audio id="speechAudio" controls></audio><button id="playCalibration">播放测试音频</button><button id="pauseCalibration">暂停</button></details><label>演绎指令强度（Breeze，1–10）<input id="voiceGuidance" type="number" min="1" max="10" step="0.5" value="2.5"></label><small id="lipAnalysisStatus">音频驱动口型：优先使用返回的时间轴，否则使用频谱近似分析；不等同于逐音素识别。</small><label>嘴型强度<input id="lipGain" type="range" min="0" max="1.5" step=".05"></label><label>口型时间偏移（秒；正值提前）<input id="lipOffset" type="number" min="-2" max="2" step=".01"></label><div id="vowelPreview" class="actions"></div><p id="voiceStatus" class="companion-status">未加载语音。时间轴与音频共用播放时钟。</p>`);
const voiceCatalog=window.LCVoiceCatalog||{openai:{name:'OpenAI 兼容协议',endpoint:'',models:[],help:''}};
for(const [id,item] of Object.entries(voiceCatalog)){if(item.kind==='local')continue;const option=document.createElement('option');option.value=id;option.textContent=item.name;el('voiceProvider').append(option);}
if(voiceCatalog[config.voiceProvider]?.kind==='local'){const o=document.createElement('option');o.value=config.voiceProvider;o.textContent=voiceCatalog[config.voiceProvider].name+'（旧配置，需改选本地来源）';el('voiceProvider').append(o);}
const voiceAdvanced=document.createElement('details');voiceAdvanced.id='voiceAdvanced';voiceAdvanced.innerHTML='<summary>高级语音设置</summary>';el('voiceId').parentElement.after(voiceAdvanced);for(const id of ['voiceApiUrl','voiceNetwork','breezeInstruction','voiceGuidance'])voiceAdvanced.append(el(id).parentElement);
const voiceComparisonFields=['voiceMode','voiceProvider','voiceApiUrl','voiceApiModel','voiceNetwork','breezeEndpoint','breezeInstruction','tts','voice','referenceText','autoVoice','voiceGuidance','lipGain','lipOffset'];
const voiceDrafts={...config.voiceProfiles};let shownProvider=config.voiceProvider||'openai',credentialScope='',keyStatusEpoch=0,voiceDiagnosticEpoch=0,lastVoiceCredential=null,voiceSaveFailed=false,speechBusy=false,voiceActionBusy=false;
function updateVoiceKeyInputInfo(){
 const raw=el('voiceApiKey').value,key=raw.trim(),breeze=el('voiceProvider').value==='breeze';
 el('voiceKeyInputInfo').textContent=raw?'本次输入 '+Array.from(raw).length+' 个字符 · 尚未保存':'本次输入框为空，将使用此服务已保存的密钥';
 const warning=el('voiceKeyWarning');warning.hidden=!(breeze&&(key.startsWith('key_')||key.startsWith('voc_')));
 warning.textContent=key.startsWith('key_')?'这可能是公开密钥 ID；请确认使用创建时显示的完整 API Key。此提示不拦截云端测试。':'这可能是音色 ID；音色应填写在音色栏目。此提示不拦截云端测试。';
}
function clearVoiceInput(){const e=el('voiceApiKey');e.value='';e.dataset.secretRevision=String((Number(e.dataset.secretRevision)||0)+1);credentialScope='';updateVoiceKeyInputInfo();}
function voiceProfile(){return {guidance:+el('voiceGuidance').value||2.5,network:el('voiceNetwork').value,endpoint:el('voiceApiUrl').value.trim(),model:shownProvider==='openai'?el('voiceCustomModel').value.trim():el('voiceApiModel').value,voice:el('voiceId').value.trim(),instruction:el('breezeInstruction').value};}
function populateVoice(profile){
 const provider=el('voiceProvider').value,item=voiceCatalog[provider];if(!item)return;
 const values=item.models.length?item.models:['custom'];el('voiceApiModel').replaceChildren(...values.map(v=>{const o=document.createElement('option');o.value=v;o.textContent=v==='custom'?'填写自定义模型 ID':v;return o}));
 el('voiceApiModel').value=values.includes(profile.model)?profile.model:values[0];el('voiceCustomModel').value=profile.model||'';
 el('voiceGuidance').value=profile.guidance??config.voiceGuidance??2.5;el('voiceGuidance').parentElement.hidden=!(el('voiceMode').value==='api'&&provider==='breeze');
 el('voiceNetwork').value=profile.network==='system'?'system':'direct';el('voiceApiUrl').value=profile.endpoint??item.endpoint??'';el('voiceId').value=profile.voice??item.voice??'';el('breezeInstruction').value=profile.instruction??'';
 el('voiceRegion').value=el('voiceApiUrl').value.includes('dashscope-intl.')?'sg':'cn';
 clearVoiceInput();shownProvider=provider;voiceModeUI();
}
async function refreshVoiceKey(){
 const n=++keyStatusEpoch,provider=el('voiceProvider').value,endpoint=el('voiceApiUrl').value.trim();
 if(voiceCatalog[provider]?.unavailable){lastVoiceCredential=null;el('voiceKeyStatus').textContent='此引擎请改选通用本地模型服务';updateVoiceActions();return;}
 try{const r=await window.petDesktop?.asset?.('voiceCredential',{action:'status',provider,endpoint});if(n!==keyStatusEpoch)return;lastVoiceCredential=r||null;el('voiceKeyStatus').textContent=r?.saved?'已加密保存 · 重启后仍可使用'+(r.hint?' · '+r.hint:'')+(r.fingerprint?' · '+r.fingerprint:'')+(r.savedAt?' · 保存于 '+new Date(r.savedAt).toLocaleString():' · 旧版保存时间未知')+(r.authState==='accepted'?' · 上次认证通过 '+new Date(r.verifiedAt).toLocaleString():r.authState==='rejected'?' · 上次认证未通过':' · 尚未验证'):r?.encrypted?'尚未保存此服务的密钥':'请在桌面角色运行后保存；需要系统加密存储';}
 catch(error){if(n===keyStatusEpoch){lastVoiceCredential=null;el('voiceKeyStatus').textContent=error.message;}}finally{updateVoiceActions();}
}
function voiceModeUI(){const mode=el('voiceMode').value,api=mode==='api',breeze=mode==='breeze',provider=el('voiceProvider').value,item=voiceCatalog[provider]||{};
 for(const id of ['voiceProvider','voiceApiModel','voiceApiKey','voiceNetwork'])el(id).parentElement.hidden=!api;
 el('voiceRegion').parentElement.hidden=!api||provider!=='qwen';el('voiceCustomModel').parentElement.hidden=!api||provider!=='openai';
 el('voiceApiUrl').parentElement.hidden=!api||provider!=='openai';
 for(const id of ['voiceKeyInputInfo','voiceKeyStatus','clearVoiceKey'])el(id).hidden=!api;
 el('voiceProviderHelp').hidden=!api;el('voiceAuthStatus').hidden=!api;
 el('voiceApiKey').placeholder='粘贴创建时显示的完整 API Key；留空保留已存密钥';
 el('voiceKeyLabel').textContent=(item.keyLabel||'API Key')+' · 本机加密长期保存';
 el('voiceIdLabel').textContent=api?item.voiceLabel||'音色 ID':'本地适配器音色 ID（可选）';el('voiceId').placeholder=api?item.voicePlaceholder||'':'';
 el('verifyVoiceKey').hidden=!api||!item.check;
 el('voiceApiUrl').readOnly=provider!=='openai';el('voiceProviderHelp').dataset.helpText=item.help||'';el('voiceProviderHelp').title=item.help||'';el('voiceProviderTip').textContent=item.help||'';
 el('voiceGuidance').parentElement.hidden=!(api&&provider==='breeze');el('localEngineHelp').hidden=mode!=='local';updateVoiceKeyInputInfo();if(!api)el('voiceKeyWarning').hidden=true;
 el('ttsEndpoint').parentElement.hidden=mode!=='local';
 for(const id of ['referenceFile','referenceText'])el(id).parentElement.hidden=api;
 el('breezeEndpoint').parentElement.hidden=!breeze;el('breezeInstruction').parentElement.hidden=!(breeze||api&&item.instruction&&(provider!=='qwen'||el('voiceApiModel').value==='qwen3-tts-instruct-flash'));
 el('breezeInstructionLabel').textContent=breeze?'音色描述 / 演绎指令':'固定演绎约束（可选；当次情绪由会话决定）';el('breezeInstruction').placeholder=breeze?'音色或语气描述':'留空也会根据本次会话生成演绎指令';el('breezeHelp').hidden=!breeze;el('voiceId').parentElement.hidden=breeze;
 if(api)void refreshVoiceKey();else lastVoiceCredential=null;updateVoiceActions();
}
el('voiceProvider').onchange=()=>{voiceDrafts[shownProvider]=voiceProfile();populateVoice(voiceDrafts[el('voiceProvider').value]||{});};
el('voiceRegion').onchange=()=>{el('voiceApiUrl').value='https://'+(el('voiceRegion').value==='sg'?'dashscope-intl.aliyuncs.com':'dashscope.aliyuncs.com')+'/api/v1/services/aigc/multimodal-generation/generation';clearVoiceInput();void refreshVoiceKey();};
el('voiceApiModel').onchange=voiceModeUI;
el('voiceApiKey').oninput=()=>{updateVoiceKeyInputInfo();if(!credentialScope&&el('voiceApiKey').value)credentialScope=el('voiceProvider').value+'|'+el('voiceApiUrl').value.trim();};
el('voiceApiKey').onchange=()=>{updateVoiceKeyInputInfo();credentialScope=el('voiceProvider').value+'|'+el('voiceApiUrl').value.trim();};
el('voiceApiUrl').onchange=()=>{clearVoiceInput();void refreshVoiceKey();};
el('clearVoiceKey').onclick=async()=>{try{await window.petDesktop?.asset?.('voiceCredential',{action:'clear',provider:el('voiceProvider').value,endpoint:el('voiceApiUrl').value.trim()});clearVoiceInput();el('voiceStatus').textContent='已删除此服务的已保存密钥';await refreshVoiceKey();}catch(error){el('voiceStatus').textContent=error.message;}};
el('playCalibration').onclick=()=>el('speechAudio').play().catch(()=>{el('voiceStatus').textContent='请先导入可播放的测试音频。';});
el('pauseCalibration').onclick=()=>el('speechAudio').pause();
el('voiceMode').onchange=voiceModeUI;
function fill(){for(const k of Object.keys(voiceDrafts))delete voiceDrafts[k];Object.assign(voiceDrafts,config.voiceProfiles||{});el('voiceProvider').value=config.voiceProvider||'openai';if(!el('voiceProvider').value)el('voiceProvider').value='openai';el('voiceMode').value=config.voiceMode||'local';el('voiceApiUrl').value=config.voiceApiUrl||'';el('voiceApiModel').value=config.voiceApiModel||'';voiceModeUI();el('petModel').value=config.model;el('reasonMode').value=config.reasonMode;el('reasonCap').value=config.reasonCap;el('reasonMode').disabled=!el('petModel').value;el('reasonCap').disabled=!el('petModel').value||config.reasonMode!=='auto';el('persona').value=config.persona;el('autonomy').checked=config.auto;el('touchAI').checked=config.touchAI;el('touchDebounceMs').value=config.touchDebounceMs;el('decisionInterval').value=config.interval;el('quietFactor').value=config.quiet;el('autoBudget').value=config.budget;el('speechChance').value=config.speakChance;el('breezeEndpoint').value=config.breezeEndpoint;el('breezeInstruction').value=config.breezeInstruction;el('ttsEndpoint').value=config.tts;el('voiceId').value=config.voice;el('referenceText').value=config.referenceText;el('autoVoice').checked=config.autoVoice;el('lipGain').value=config.lipGain;el('lipOffset').value=config.lipOffset;populateVoice({endpoint:config.voiceApiUrl,model:config.voiceApiModel,voice:config.voice,instruction:config.breezeInstruction,network:config.voiceNetwork,guidance:config.voiceGuidance});}
fill();renderHistory();el('reasonMode').onchange=()=>el('reasonCap').disabled=!el('petModel').value||el('reasonMode').value!=='auto';el('petModel').onchange=()=>{el('reasonMode').disabled=!el('petModel').value;el('reasonMode').onchange();};
el('mouseButtons').value=config.swapButtons?'swap':'normal';
el('mouseButtons').onchange=()=>{config.swapButtons=el('mouseButtons').value==='swap';save();};
function schedule(){
 nextDue=performance.now()+C.activityDelay(config.interval,H.focused?1:0,config.quiet,memory.activity)*1000;
}
schedule();
window.zoneEditor=ZoneEditor.init(H,hitZones);el('editZones').onclick=()=>window.zoneEditor.begin();
for(const id of ['companionPanel','voicePanel']){
 const section=el(id);section.className='settings-pane';section.removeAttribute('role');section.querySelector('.close').remove();el('settingsDock').append(section);
}
function showPane(id){if(id==='voicePanel')void refreshVoiceKey();
 const editor=el('zoneEditPanel');
 if(editor)editor.hidden=!window.zoneEditor?.editing||id!=='companionPanel';
 document.querySelectorAll('[data-pane]').forEach(button=>{
  const selected=button.dataset.pane===id;
  button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));
  el(button.dataset.pane).hidden=!selected;
 });
}
for(const b of document.querySelectorAll('[data-pane]'))b.onclick=()=>showPane(b.dataset.pane);
showPane('renderPanel');window.addEventListener('focus',()=>{if(config.voiceMode==='api')void refreshVoiceKey();});
function chatIndicator(){
 const active=!el('galForm').hidden||!el('chatPanel').hidden;
 el('openChat').setAttribute('aria-expanded',String(active));
 el('openChat').title=active?'返回对话':'打开对话';
}
el('openChat').onclick=()=>{window.companion.openChat();chatIndicator();};
el('chatPanel').querySelector('.close').onclick=()=>{el('chatPanel').hidden=true;chatIndicator();};

el('saveCompanion').onclick=()=>{const delay=Number(el('touchDebounceMs').value);if(!Number.isInteger(delay)||delay<50||delay>5000){status('触摸合并间隔须为 50–5000ms 的整数','error');return;}config={...config,model:el('petModel').value,reasonMode:el('reasonMode').value,reasonCap:el('reasonCap').value,persona:el('persona').value.slice(0,5000),auto:el('autonomy').checked,touchAI:el('touchAI').checked,touchDebounceMs:delay,interval:Math.max(30,Math.min(900,+el('decisionInterval').value||180)),quiet:Math.max(1.2,Math.min(5,+el('quietFactor').value||2)),budget:Math.max(0,Math.min(120,+el('autoBudget').value||0)),speakChance:+el('speechChance').value};touchBatch.setDelay(delay);if(!config.touchAI)resetTouches();save();fill();schedule();status('设置已保存；尚未验证连接');};
function collectVoiceSettings(){
 const provider=el('voiceProvider').value,profile=voiceProfile();
 return {voiceMode:el('voiceMode').value,voiceProvider:provider,voiceApiUrl:profile.endpoint,voiceApiModel:profile.model,voiceNetwork:profile.network,voiceProfiles:{...voiceDrafts,[provider]:profile},breezeEndpoint:el('breezeEndpoint').value.trim(),breezeInstruction:profile.instruction.slice(0,2000),tts:el('ttsEndpoint').value.trim(),voice:profile.voice,referenceText:el('referenceText').value,autoVoice:el('autoVoice').checked,voiceGuidance:profile.guidance,lipGain:+el('lipGain').value,lipOffset:Math.max(-2,Math.min(2,+el('lipOffset').value||0))};
}
function voiceDirty(){const current=collectVoiceSettings();return !!el('voiceApiKey').value||voiceComparisonFields.some(k=>current[k]!== (k==='voiceMode'?config[k]||'local':k==='voiceNetwork'?config[k]||'direct':config[k]));}
function voiceTrialAllowed(){
 if(voiceSaveFailed||voiceDirty())return false;
 if(el('voiceMode').value!=='api')return true;
 if(voiceCatalog[el('voiceProvider').value]?.unavailable||!lastVoiceCredential?.saved)return false;
 return !!el('voiceId').value.trim()&&!!voiceProfile().model;
}
function updateVoiceActions(){
 const busy=voiceActionBusy||speechBusy,api=el('voiceMode').value==='api',provider=el('voiceProvider').value,item=voiceCatalog[provider]||{};
 el('saveVoice').textContent='保存语音设置';el('saveVoice').disabled=busy||api&&!!item.unavailable;
 el('verifyVoiceKey').disabled=busy||!api||!item.check||!el('voiceApiKey').value&&!lastVoiceCredential?.saved;
 const muted=typeof playback!=='undefined'&&(playback.muted||playback.volume<=0);el('voiceTest').disabled=busy||muted||!voiceTrialAllowed();el('speakLast').disabled=busy||muted||!voiceTrialAllowed();
 el('voiceReadyHint').textContent=muted?'已静音：朗读与语音合成调用已暂停':api&&item.unavailable?'此引擎请改选通用本地模型服务':voiceDirty()?'设置已修改，请先保存；保存不发起云端请求':api&&!lastVoiceCredential?.saved?'请先输入并保存此服务的 API Key':api&&!el('voiceId').value.trim()?'请填写所选服务的音色':api?'可直接试播，无需先测试连接；试播可能产生语音费用':'试播使用已保存的本地服务设置';
}
async function saveVoice(){
 el('voiceStatus').textContent='正在加密保存语音设置（不联网）…';const prefs=collectVoiceSettings(),poll=setInterval(()=>{void refreshVoiceDiagnostic(true)},350);
 try{
  let result;
  if(prefs.voiceMode==='api'){
   if(!window.petDesktop?.asset)throw Error('需要通过桌面角色安全保存语音设置');
   const at=credentialScope.indexOf('|'),scope=credentialScope?{provider:credentialScope.slice(0,at),endpoint:credentialScope.slice(at+1)}:undefined;
   result=await window.petDesktop.asset('voiceSave',{settings:prefs,key:el('voiceApiKey').value,scope});
  }else{
   const next={...config,...prefs};petStore.setItem('companion-config-v4',JSON.stringify(next));result={settings:prefs,credential:null,validated:false};
  }
  voiceSaveFailed=false;Object.assign(config,result.settings);Object.assign(voiceDrafts,config.voiceProfiles||{});clearVoiceInput();lastVoiceCredential=result.credential;el('voiceApiUrl').value=config.voiceApiUrl;
  if(prefs.voiceMode==='api')await refreshVoiceKey();updateVoiceActions();
  el('voiceAuthStatus').textContent=result.validated?'设置已保存；此密钥上次认证通过，音色与额度仍需试播。':'设置已保存，尚未验证；可选测试连接或直接试播。';
  el('voiceStatus').textContent='语音设置已保存；本次未发起网络请求。';await refreshVoiceDiagnostic();return true;
 }catch(error){
  voiceSaveFailed=true;const message=String(error.message||error).replace(/^Error invoking remote method 'pet-asset':\s*Error:\s*/,'');
  el('voiceStatus').textContent='保存未完成，未发起网络请求：'+message;el('voiceAuthStatus').textContent='保存未完成，请查看最近一次失败';
  if(prefs.voiceMode!=='api')await reportVoice({stage:'save',errorCode:'settings_write_failed',errorType:error.name});
  if(prefs.voiceMode==='api')await refreshVoiceKey();await refreshVoiceDiagnostic();updateVoiceActions();return false;
 }finally{clearInterval(poll)}
}
async function checkVoiceConnection(){
 const prefs=collectVoiceSettings();if(prefs.voiceMode!=='api'||!voiceCatalog[prefs.voiceProvider]?.check)return false;
 el('voiceStatus').textContent='正在由服务商验证密钥（不合成语音）…';
 try{
  if(!window.petDesktop?.asset)throw Error('请在桌面角色运行后测试连接');
  const at=credentialScope.indexOf('|'),scope=credentialScope?{provider:credentialScope.slice(0,at),endpoint:credentialScope.slice(at+1)}:undefined;
  const result=await window.petDesktop.asset('voiceCheck',{settings:prefs,key:el('voiceApiKey').value,scope});
  await refreshVoiceKey();el('voiceAuthStatus').textContent=result.stored?'已保存密钥认证通过；尚未验证音色与额度。':'本次输入认证通过，尚未保存；请点击保存语音设置。';
  el('voiceStatus').textContent=el('voiceAuthStatus').textContent;return true;
 }catch(error){el('voiceStatus').textContent='云端测试未完成：'+String(error.message||error);el('voiceAuthStatus').textContent='测试失败不修改已保存的设置或密钥；仍可修改后保存或试播。';await refreshVoiceKey();return false;
 }finally{await refreshVoiceDiagnostic();updateVoiceActions();}
}
el('saveVoice').onclick=()=>runVoiceAction(saveVoice);
el('verifyVoiceKey').onclick=()=>runVoiceAction(checkVoiceConnection);
// Mouth tuning is a local preference: persist directly without saving credentials or calling TTS.
function saveMouthTuning(){
 if(el('lipGain').value===''||el('lipOffset').value==='')return;
 const gain=Number(el('lipGain').value),offset=Number(el('lipOffset').value);
 if(!Number.isFinite(gain)||gain<0||gain>1.5||!Number.isFinite(offset)||offset< -2||offset>2)return;
 if(config.lipGain===gain&&config.lipOffset===offset){updateVoiceActions();return;}
 try{const next={...config,lipGain:gain,lipOffset:offset};petStore.setItem('companion-config-v4',JSON.stringify(next));Object.assign(config,{lipGain:gain,lipOffset:offset});}
 catch(error){status('口型设置未保存：'+error.message,'error');}
 updateVoiceActions();
}
for(const id of ['lipGain','lipOffset']){el(id).addEventListener('input',saveMouthTuning);el(id).addEventListener('change',saveMouthTuning);}
el('voicePanel').addEventListener('input',updateVoiceActions);el('voicePanel').addEventListener('change',updateVoiceActions);
function showVoiceHelp(){const tip=el('voiceProviderTip'),anchor=el('voiceProviderHelp');if(!tip.showPopover)return;try{tip.showPopover()}catch{}const a=anchor.getBoundingClientRect(),r=tip.getBoundingClientRect();tip.style.left=Math.max(8,Math.min(innerWidth-r.width-8,a.left))+'px';tip.style.top=Math.max(8,a.bottom+8+r.height<=innerHeight-8?a.bottom+8:a.top-r.height-8)+'px';}
el('voiceProviderHelp').onclick=showVoiceHelp;el('voiceProviderHelp').onmouseenter=showVoiceHelp;el('voiceProviderHelp').onfocus=showVoiceHelp;
el('voiceProviderHelp').onmouseleave=()=>{try{el('voiceProviderTip').hidePopover()}catch{}};

function capabilities(){
 const {motions,expressions}=C.animationInfo(H.catalog,H.params);
 const rig=H.catalog.controlRig;
 return {
  motions:motions.filter(m=>m.kind==='once'),baseMotions:motions.filter(m=>m.kind!=='once'),
  expressions:expressions.filter(e=>e.usable).map(({bindings,...e})=>e),
  gestures:C.gestureInfo(H.catalog,LabState.pairs).map(p=>p.name),gestureTiming:C.gestureInfo(H.catalog,LabState.pairs),
  fine:rig.filter(r=>r.role==='精细表情'),pose:rig.filter(r=>r.role!=='精细表情')
 };
}
function injectedModelSettings(){
 const label=appearance.current?.label||H.catalog?.model||'';let bindings=[];
 try{const saved=JSON.parse(petStore.getItem('mouth-profile-v1')||'null');bindings=saved?.profile===H.catalog?.profile?LCSpeech.validateMappings(saved.bindings,H.catalog,H.params):LCSpeech.detectMappings(H.catalog,H.params);}catch{bindings=LCSpeech.detectMappings(H.catalog,H.params);}
 return {label,mouth:{bindings}};
}
function injectedVoiceSettings(){return {mode:config.voiceMode||'local',provider:config.voiceProvider,model:config.voiceApiModel,voice:config.voice,fixedDirection:config.breezeInstruction,guidance:config.voiceGuidance,referenceConfigured:!!reference};}
let publishedContext='',publishingContext=false;
async function publishConfiguration(){
 if(!H.ready||!window.petDesktop?.asset||window.petAdapting||window.petChangingMemory||publishingContext)return;
 publishingContext=true;try{const route=await window.petDesktop.asset('route');if(!route)return;const payload={route,persona:config.persona,modelSettings:injectedModelSettings(),voiceSettings:injectedVoiceSettings(),context:{characterId:window.petCharacterId,profile:H.catalog.profile},capabilities:capabilities()};
 const signature=JSON.stringify(payload);if(signature!==publishedContext){await window.petDesktop.asset('publishContext',payload);publishedContext=signature;publishedContextError='';}}
 finally{publishingContext=false;}
}
window.addEventListener('pet-ready',()=>{void publishConfiguration().catch(e=>status(e.message,'error'));});
setInterval(()=>{void publishConfiguration().catch(e=>{if(e.message!==publishedContextError){publishedContextError=e.message;status(e.message,'error');}});},2000);let publishedContextError='';
async function post(path,body,signal){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Request':'companion'},body:JSON.stringify(body),signal});const d=await r.json();if(!r.ok)throw Object.assign(Error(d.error||'连接失败'),{code:d.code,submitted:typeof d.submitted==='boolean'?d.submitted:undefined});return d;}
const experienceOwners=new Map();
async function recordExperience(event,status,details={}){
 if(!window.petDesktop?.asset)return null;
 let identity=experienceOwners.get(event.id);if(!identity){const current={characterId:window.petCharacterId,profile:H.catalog?.profile},route=await window.petDesktop.asset('route');if(!route?.id)throw Error('经历记录缺少角色会话');identity={...current,sessionId:route.id};experienceOwners.set(event.id,identity);while(experienceOwners.size>512)experienceOwners.delete(experienceOwners.keys().next().value);}
 const row=await window.petDesktop.asset('experienceRecord',{...identity,event,status,...details});
 if(!row?.eventId)throw Error('结构化经历记录不可用，请重载当前版本');
 if(!row.duplicate)window.petDesktop.notify?.('experience',{eventId:row.eventId,characterId:row.characterId,sessionId:row.sessionId,status:row.status,occurredAt:row.occurredAt});return row;
}
let parameterOwners={};try{parameterOwners=JSON.parse(petStore.getItem('parameter-owner-index-v1')||'{}')}catch{}
if(!parameterOwners||typeof parameterOwners!=='object'||Array.isArray(parameterOwners))parameterOwners={};
function validateResponse(raw){
 const profile=H.catalog.profile,ids=(H.catalog.controlRig||[]).map(r=>r.id).slice(0,512),old=JSON.stringify(parameterOwners);delete parameterOwners[profile];parameterOwners[profile]=ids;
 while(Object.keys(parameterOwners).length>12)delete parameterOwners[Object.keys(parameterOwners)[0]];
 if(JSON.stringify(parameterOwners)!==old)petStore.setItem('parameter-owner-index-v1',JSON.stringify(parameterOwners));
 return C.validatePlan(raw,H.catalog,H.params,{gestureNames:capabilities().gestures,gestureDefinitions:capabilities().gestureTiming,previousParameterIds:Object.entries(parameterOwners).filter(([key])=>key!==profile).flatMap(([,v])=>Array.isArray(v)?v:[])});
}
function performanceSummary(p){return p?{duration:p.duration,actionEnd:p.actionEnd,authoredVisualSpan:Math.max(p.duration,p.actionEnd||0),audioDuration:0,scale:1,effectiveActionEnd:p.actionEnd||0,actions:p.actions,authoredActions:p.actions,phase:'authored'}:undefined;}
let timingWrites=Promise.resolve();
function performanceDiagnostics(result){return {profile:H.catalog.profile,count:result.diagnostics.length,warnings:result.diagnostics};}
function performResponse(p,raw,media={},receipt){const now=performance.now()/1000;visualPerformance?.release(now,true);const instance=new C.Performance(layer,H.character,summary=>{
 if(visualPerformance===instance){try{lastReply=JSON.stringify({...p,...(receipt?.validation?{validation:receipt.validation}:{}),performance:summary});}catch{}if(summary.notes.length)status(summary.notes.includes('short-audio-tail')?'语音短于动作，剩余动作原速演完':'音频时长延迟更新，已平滑调整后续排期','warning');}
 if(receipt)timingWrites=timingWrites.catch(()=>{}).then(()=>window.petDesktop.asset('experiencePerformance',{...receipt,performance:summary})).catch(e=>status('回复已保存；演出时序记录失败：'+e.message,'warning'));
 });visualPerformance=instance;instance.start(p,now,media);}

function finishPerformance(cancel=false,mediaOnly=false){if(!mediaOnly||visualPerformance?.media)visualPerformance?.release(performance.now()/1000,cancel);}
function advancePerformance(now){if(H.manual){visualPerformance?.release(now,true);return;}const a=el('speechAudio');if(visualPerformance?.media&&!visualPerformance.audioEnded&&a.paused&&!a.ended)return;visualPerformance?.tick(now,a.currentTime);}
function extendPerformance(){const audio=el('speechAudio');if(!audio.paused&&!audio.ended)visualPerformance?.extend(Number.isFinite(audio.duration)&&audio.duration>0?audio.duration:audio.lcDuration,audio.currentTime||0,performance.now()/1000);}
async function decide(event,automatic=false,options={}){
 event={...event,id:event.id||crypto.randomUUID(),at:event.at||new Date().toISOString()};let chargedAt=null,requestStarted=false;
 if(options.onFailure)options.failure=null;
 if(cancelPending||hostStopping){status('DSH 仍在结束上一轮，请稍候','warning');return false;}
 if(preparingModelChange&&event.type!=='model_change'){status('正在准备形象互动，请稍候');return false;}
 if(window.liveAI===false){status('AI 调用已关闭');return false;}
 if(window.petAdapting||window.petChangingMemory)return false;if(!H.ready){status('请先加载模型');return false;}if(window.zoneEditor?.editing){status('请先保存或取消区域调整');return false;}if(busy){status('正在等待上一条回复');return false;}if(config.mode!=='local'&&!config.endpoint){status('请先配置接口');return false;}
 memory.calls=memory.calls.filter(t=>Date.now()-t<3600000);if(automatic&&memory.calls.length>=config.budget){await recordExperience(event,'skipped',{reason:'automatic-budget'}).catch(e=>status(e.message,'error'));status('已达到自动调用上限；本地跟随与待机继续');return false;}
 memory.events=(memory.events||[]);memory.events.push({type:event.type,zones:event.touches?.map(x=>x.zone),time:Date.now()});busy=true;const token=++epoch;controller=new AbortController();const requestController=controller;const timeout=setTimeout(()=>requestController.abort(),95000);if(automatic){chargedAt=Date.now();memory.calls.push(chargedAt);}save();status('正在请求自主演出…');
 const m=H.metrics;const current={speech:{enabled:config.autoVoice&&!voiceMuted(),provider:config.voiceProvider},characterId:window.petCharacterId,profile:H.catalog?.profile,emotion:memory.emotion,emotionSource:memory.emotionSource,activity:memory.activity,focusMode:H.focused,workLevel:Math.min(1,m.rate/180),mode:H.character.mode,expressions:[...H.character.expressions].filter(([n,e])=>e.to>0).map(([n])=>n),gestures:[...H.character.gestures.values()].filter(g=>g.targetOn).map(g=>g.pair.name),fine:{...layer.current},appearance:appearance.current,recentAppearanceEvents:appearance.events.slice(-2).map(e=>({at:e.at,reason:e.reason,from:e.from,to:e.to,reply:String(e.reply||'').slice(0,240)})),speakingPreference:['chat','model_change','observe'].includes(event.type)?1:config.speakChance};
 try{
  const route=['chat','touch','observe','model_change'].includes(event.type)?await window.petDesktop?.asset?.('route'):undefined;
  if(['chat','touch','observe','model_change'].includes(event.type)&&!route?.id)throw Error('未取得角色的 DSH 会话，未改走直连推理');
  await recordExperience(event,'occurred');await recordExperience(event,'submitting');
  const retrievalRequested=event.type==='chat'&&/(刚才|刚刚|之前|上次|记得|回忆|经历|换过|摸了|remember|earlier|last\s+time|just\s+now)/i.test(event.text||'');
  let recentExperiences=[];if(retrievalRequested)try{const found=await window.petDesktop?.asset?.('experienceQuery',{sessionId:route?.id,limit:8});recentExperiences=(found?.rows||[]).filter(r=>r.eventId!==event.id).map(r=>({eventId:r.eventId,event:r.event,status:r.status,reply:r.reply,sessionSeq:r.sessionSeq}));recentExperiences=C.limitLists({events:recentExperiences.reverse()},6000).events.reverse();}catch{}
  if(token!==epoch||requestController.signal.aborted)throw Object.assign(Error('已在提交前取消'),{code:'LC_CANCELLED',submitted:false});
  generationPending={eventId:event.id,sessionId:route.id};requestStarted=true;const r=await post('/api/decide',{mode:config.mode,endpoint:config.endpoint,model:config.model,key,payload:{route,...(options.visuals?{visuals:options.visuals}:{}),inference:{model:config.model,followSessionModel:!config.model,mode:config.reasonMode,cap:config.reasonCap},persona:config.persona,modelSettings:injectedModelSettings(),voiceSettings:injectedVoiceSettings(),event,context:{...current,retrievalRequested,recentExperiences},capabilities:capabilities()}},requestController.signal);
  if(generationPending?.eventId===event.id)generationPending=null;
  if(token!==epoch){if(userCancellations.has(event.id)){const stopped=await userCancellations.get(event.id);await recordExperience(event,stopped?.running===false&&stopped?.pending===false?'cancelled':'unknown',{reason:'user_stop'});}return false;}if(r.sessionId)await window.petDesktop.asset('markSession',r.sessionId);if(token!==epoch)return false;
  if(r.duplicate){if(chargedAt!==null){const i=memory.calls.indexOf(chargedAt);if(i>=0)memory.calls.splice(i,1);save();}return true;}
  if(event.type==='observe')message('user','自主陪伴事件',{kind:'character_event',eventId:event.id,eventType:event.type,userTyped:false,event,sessionId:r.sessionId});
  const validated=validateResponse(r.plan),{plan:p,warnings}=validated,validation=performanceDiagnostics(validated),oldEmotion=memory.emotion;
  memory.emotion=p.emotion;memory.activity=p.activity;memory.emotionSource={eventId:event.id,sessionId:r.sessionId,seq:r.sessionSeq,at:r.sessionAt||event.at};
  // Persist the successful response BEFORE any animation, notification or DOM work.
  if(event.type==='model_change'){
   const summary=r.appearanceSource==='image'&&typeof r.plan.appearance?.summary==='string'?r.plan.appearance.summary.trim().slice(0,800):'';
   if(r.appearanceSource==='image'&&!summary)r.appearanceNote='形象互动已完成，但未返回可用的形象摘要；已有记录已保留';
   if(summary){appearance.current={...appearance.current,summary,source:'image',visualAt:event.at};petStore.setItem('model-appearance-v1',JSON.stringify(appearance.current));}
   const row=appearance.events.find(x=>x.id===event.id);if(row)Object.assign(row,{reply:p.text,status:'completed',evidence:r.appearanceSource||'metadata',completedAt:new Date().toISOString()});saveAppearance();
  }
  await recordExperience(event,'completed',{sessionSeq:r.sessionSeq,reply:{text:p.text,emotion:p.emotion,speech:p.speech,validation,performance:performanceSummary(p),...(event.type==='model_change'?{appearanceEvidence:r.appearanceSource,appearanceSummary:r.appearanceSource==='image'?appearance.current?.summary||'':''}:{})}});
  if(token!==epoch)return false;
  if(r.sessionId&&Number.isSafeInteger(r.sessionSeq)){memory.presented=[...(memory.presented||[]),{sessionId:r.sessionId,seq:r.sessionSeq}].slice(-256);save();}
  if(r.captionWarning){p.text='';status(r.captionWarning,'warning');}
  if(p.text){lastText=p.text;lastSpeech=LCSpeech.instruction({direction:p.speech.instructions,emotion:p.emotion,persona:config.persona,event:event.type,baseline:config.breezeInstruction});message('assistant',p.text,{kind:event.type==='model_change'?'model_change':'chat',eventId:event.id,eventType:event.type,profile:event.profile||H.catalog?.profile,sessionId:r.sessionId,seq:r.sessionSeq,...(r.sessionAt?{at:r.sessionAt}:{})});}else save();
  const displayWarnings=[];
  if(oldEmotion!==p.emotion)present(()=>window.petDesktop?.notify?.('emotion',{emotion:p.emotion}),'情绪通知失败');
  const perform=media=>{if(token!==epoch)return;const animationWarning=present(()=>{
   performResponse(p,r.plan,media,{eventId:event.id,sessionId:r.sessionId||route?.id,characterId:window.petCharacterId,profile:H.catalog.profile,validation});

  },'演出显示失败');if(animationWarning)displayWarnings.push(animationWarning);};
  if(p.text&&config.autoVoice&&!voiceMuted())await speak(p.text,token,{instruction:lastSpeech,present:true,onStart:perform,warnings:displayWarnings});else{perform();if(p.text){const warning=safeBubble(p.text);if(warning)displayWarnings.push(warning);}}
  lastReply=JSON.stringify({...p,validation,performance:visualPerformance?.summary()});present(()=>{
   status((r.sessionNote||'已连接')+' · '+p.emotion+(warnings.length?' · 演出校验：'+warnings.slice(0,2).join('；')+(warnings.length>2?'（共 '+warnings.length+' 项）':''):''),warnings.length?'warning':undefined);if(!r.sessionNote&&r.effortNote&&!effortNotices.has(r.model+r.effortNote)){effortNotices.add(r.model+r.effortNote);status(r.effortNote,'warning');}el('usageStatus').textContent='近一小时自动请求 '+memory.calls.length+'/'+config.budget+ ' · '+(r.model||'')+' / '+(r.effort||'')+'；本次用量 '+JSON.stringify(r.usage||'服务未提供');
   if(r.appearanceNote)status(r.appearanceNote,'warning');if(r.captionWarning)status(r.captionWarning,'warning');if(displayWarnings.length)status('回复与记忆已保存；'+displayWarnings.join('；'),'warning');
  },'回复状态显示失败');
  return true;
 }catch(e){const stopped=userCancellations.has(event.id)?await userCancellations.get(event.id):null;await recordExperience(event,userCancellations.has(event.id)?stopped?.running===false&&stopped?.pending===false?'cancelled':'unknown':e.code==='LC_CANCELLED'?'cancelled':e.code==='SESSION_BUSY'&&e.submitted===false?'queued':['LC_RESPONSE_INVALID','LC_EMPTY_AUTONOMY'].includes(e.code)||e.submitted===false?'failed':requestStarted?'unknown':'failed',{reason:e.code||e.name||'request_failed'}).catch(error=>status(error.message,'error'));if(e.submitted===false&&chargedAt!==null){const i=memory.calls.indexOf(chargedAt);if(i>=0)memory.calls.splice(i,1);save();}options.onFailure?.(e);if(token===epoch)status(e.name==='AbortError'?'请求已停止或超时':'连接/返回错误：'+e.message);return false;}finally{if(generationPending?.eventId===event.id)generationPending=null;clearTimeout(timeout);if(token===epoch){busy=false;controller=null;}schedule();}
}
function saveAppearance(){
 appearance.capabilities=capabilities();appearance.events=appearance.events.slice(-8);
 petStore.setItem('appearance-memory-v1',JSON.stringify(appearance));
}
async function modelChanged(event,capture){
 if(typeof event?.id!=='string'||!/^[a-f0-9-]{36}$/i.test(event.id)||!Number.isFinite(Date.parse(event.at))||event.type!=='model_change'||event.characterId!==window.petCharacterId||event.profile!==H.catalog?.profile||appearance.lastEventId===event.id||preparingModelChange)return false;
 preparingModelChange=event.id;const requestEpoch=epoch;
 appearance.lastEventId=event.id;
 let cached;try{cached=JSON.parse(petStore.getItem('model-appearance-v1')||'null')}catch{}
 appearance.current={characterId:event.characterId,profile:event.profile,label:event.to,at:event.at,summary:cached?.summary||'',source:cached?.summary?'cached':'metadata',visualAt:cached?.visualAt||null};
 const row={...event,reply:'',status:'pending'};if(event.reason==='appearance_refresh'){const prior=appearance.events.findLast(e=>e.profile===event.profile&&['failed','not-completed','cancelled'].includes(e.status));if(prior)row.retryOf=prior.id;}appearance.events.push(row);
 try{
  saveAppearance();
  const prefs=await window.petDesktop?.asset?.('preferences');
  if(requestEpoch!==epoch)return false;
  if(window.liveAI===false||prefs?.ai===false){row.status='ai-disabled';saveAppearance();status('形象已就绪；AI 已关闭，未请求形象互动');return false;}
  memory.calls=memory.calls.filter(t=>Date.now()-t<3600000);
  if(memory.calls.length>=config.budget){row.status='budget-limited';saveAppearance();status('形象已就绪；自动调用额度已用完，未请求形象互动');return false;}
  if(busy||window.petAdapting||window.petChangingMemory){row.status='deferred';row.retry='manual';saveAppearance();return false;}
  const visuals=await capture();if(requestEpoch!==epoch)return false;
  await window.petDesktop?.asset?.('appearanceSnapshot',{profile:event.profile,image:visuals[0]});
  if(requestEpoch!==epoch||window.liveAI===false)return false;
  const description=event.reason==='initial_import'?'角色首次建立，当前形象为「'+event.to+'」。没有旧形象记录，请首次确认自己的外观':event.reason==='model_added'?'同一角色新增并使用形象「'+event.to+'」'+(event.from?'，之前使用「'+event.from+'」':''):event.reason==='appearance_refresh'?'用户主动请求重新确认当前形象「'+event.to+'」。形象没有切换，请只确认当前外观，不虚构换装':'同一角色的形象从「'+event.from+'」切换为「'+event.to+'」';
  const result=await decide({...event,text:description+'。这是一条形象事件，并非用户发言。请结合自己的性格自然主动互动一次。'},true,{visuals});
  if(!result&&row.status==='pending'){row.status='failed';row.retry='manual';saveAppearance();}
  return result;
 }catch(error){row.status='failed';row.retry='manual';row.error=String(error.message||error).slice(0,200);saveAppearance();status('形象互动未完成：'+error.message+'；可在演出与渲染中重新确认当前形象','error');return false;}
 finally{try{if(row.status==='pending'){row.status='cancelled';row.retry='manual';saveAppearance();}}finally{if(preparingModelChange===event.id)preparingModelChange=false;}}
}
async function send(text){if(cancelPending)await cancelPending;if(hostStopping){await checkStopped();if(hostStopping)return;}if(window.liveAI===false){status('AI 调用已关闭');return;}text=text.trim().slice(0,2000);if(!text)return;if(busy||preparingModelChange){status('请等待或停止当前回复');return;}H.activate();voiceEpoch++;el('speechAudio').pause();hideBubble();const event={type:'chat',text,id:crypto.randomUUID(),at:new Date().toISOString()};message('user',text,{eventId:event.id,eventType:'chat',userTyped:true});el('chatText').value='';await decide(event);}
el('chatPanel').querySelector('h2').textContent='对话记录';
el('chatForm').onsubmit=e=>{e.preventDefault();send(el('chatText').value)};el('chatText').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229){e.preventDefault();send(el('chatText').value)}};
el('tryDecision').onclick=()=>decide({type:'observe',note:'用户手动请求一次自主表演'});
async function checkStopped(){try{const result=await window.petDesktop?.asset?.('sessionState');hostStopping=result?.running!==false||result?.pending!==false;status(hostStopping?'DSH 仍在结束中，尚未确认停止':'DSH 已停止，可继续发送',hostStopping?'warning':undefined);return result;}catch(e){hostStopping=true;status('取消状态未确认：'+e.message,'warning');return null;}}
function stop(){
 if(activeVoiceRequest)void reportVoice({requestId:activeVoiceRequest,stage:'cancelled'});preparingModelChange=false;const pending=generationPending;generationPending=null;
 if(pending&&!cancelPending){hostStopping=true;cancelPending=(async()=>{try{const result=await window.petDesktop?.asset?.('sessionCancel',pending);if(Number.isSafeInteger(result?.cursor)){memory.cancelledThrough={...(memory.cancelledThrough||{}),[pending.sessionId]:Math.max(memory.cancelledThrough?.[pending.sessionId]||0,result.cursor)};save();}hostStopping=result?.running!==false||result?.pending!==false;status(hostStopping?'本地已停止；DSH 仍在结束中':'DSH 已停止，临时演出已清理',hostStopping?'warning':undefined);return result;}catch(e){hostStopping=true;status('本地已停止；DSH 取消未确认：'+e.message,'warning');return null;}})();userCancellations.set(pending.eventId,cancelPending);while(userCancellations.size>256)userCancellations.delete(userCancellations.keys().next().value);void cancelPending.finally(()=>{cancelPending=null;});}
 epoch++;voiceEpoch++;controller?.abort();controller=null;busy=false;finishPerformance(true);layer.clear();preview=null;el('speechAudio').pause();lipValues={};resetTouches();bubble('');if(!pending&&!cancelPending&&!hostStopping)status('已停止回复、朗读与临时动作');
 if(!pending&&hostStopping&&!cancelPending)return checkStopped();return cancelPending||Promise.resolve({running:false,pending:false});
}
el('cancelReply').onclick=stop;
el('clearChat').onclick=async()=>{if(!window.confirm('重置当前角色的记忆和会话？同角色的所有模型会一起重置，原 DSH 会话将归档保留。'))return;await stop();if(hostStopping){status('请等待 DSH 确认停止后再重置会话','warning');return;}await window.petDesktop?.asset?.('resetSession');archive('replaceHistory',[]);memory={emotion:'平静',activity:.5,history:[],events:[],calls:memory.calls};appearance.events=[];appearance.lastEventId=null;saveAppearance();save();renderHistory();status('当前记忆已重置；下次聊天将使用新的会话。')};
el('popChat').remove();
function closeChat(){el('galForm').hidden=true;el('chatPanel').hidden=true;chatIndicator();}
function openChat(){
 if(document.documentElement.classList.contains('pet-only')){el('galForm').hidden=!el('galForm').hidden;if(!el('galForm').hidden)el('galText').focus();}
 else {el('chatPanel').hidden=false;renderHistory();}
 chatIndicator();
}
el('viewHistory').onclick=()=>{closeChat();renderHistory();el('chatPanel').hidden=false;chatIndicator();};
el('galClose').onclick=closeChat;el('galStop').onclick=stop;
el('galForm').onsubmit=async e=>{e.preventDefault();if(busy)return status('请等待本次回复，或点击停止。','warning');const field=el('galText'),text=field.value.trim();if(!text)return;field.value='';await send(text);};
el('galText').onkeydown=e=>{if(e.key==='Escape'){closeChat();return;}if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229){e.preventDefault();el('galForm').requestSubmit();}};
// Only completed gesture batches are queued. A physical hold stays local until release.
let touchFlushing=false,touchQueueEpoch=0;
const touchBatch=new LCTouchBatch({delay:config.touchDebounceMs,onError:error=>{uiWarning(error,'触摸计时失败，本次触摸未提交');status('触摸计时失败，本次触摸未提交：'+error.message,'error');},onBatch:batch=>{
 if(!touchAllowed())return;
 if(pendingTouches.length>=8){status('触摸事件待发送列表已满，已跳过本次事件','warning');return;}
 message('user','触摸：'+batch.touches.map(t=>t.zone).join('、')+'（'+batch.presses+' 次操作）',{kind:'character_event',eventId:batch.id,eventType:'touch',userTyped:false,event:batch});
 void recordExperience(batch,'occurred').catch(e=>status(e.message,'error'));
 pendingTouches.push({...batch,queuedAt:Date.now()});void flushTouches();
}});
function touchAllowed(){return !cancelPending&&!hostStopping&&config.touchAI&&window.liveAI!==false&&!window.petAdapting&&!window.petChangingMemory&&!window.zoneEditor?.editing&&H.ready;}
function resetTouches(){touchQueueEpoch++;touchBatch.reset();for(const batch of pendingTouches)void recordExperience(batch,'cancelled',{reason:'pending-input-cleared'}).catch(()=>{});pendingTouches=[];clearTimeout(touchTimer);touchTimer=null;}
function localTouch(z){if(!z)return;const now=performance.now();if(now-strokeAt<100)return;strokeAt=now;
 window.petDesktop?.notify?.('touch',{zone:z.name});const hit=H.catalog.hitAreas?.find(a=>(a.Name||a.Id.replace(/^HitArea/,''))===z.name||a.Id===z.anchor?.id);
 const groups=H.catalog.motionGroups||{},clips=groups['Tap@'+(hit?.Name||'')]||groups.Tap;
 if(clips?.length){const path=clips[Math.floor(Math.random()*clips.length)],m=H.catalog.motions.find(m=>m.path===path);if(m)H.character.motion(m.name,now/1000);}
 H.activate();status('触碰：'+z.name);
}
function touch(x,y){if(window.petAdapting)return;const z=window.zoneEditor?.hit(x,y);if(!z)return;localTouch(z);if(touchAllowed())touchBatch.pulse(z.name);}
function beginTouch(x,y){if(window.petAdapting)return;const z=window.zoneEditor?.hit(x,y);localTouch(z);if(touchAllowed())touchBatch.begin(z?.name);}
function stroke(x,y){const z=window.zoneEditor?.hit(x,y);if(!window.petAdapting)localTouch(z);if(!touchAllowed()){touchBatch.reset();return;}touchBatch.sample(z?.name);}
function endTouch(){touchBatch.end();}
async function flushTouches(){
 clearTimeout(touchTimer);touchTimer=null;if(touchFlushing)return;if(!touchAllowed()){resetTouches();return;}if(!pendingTouches.length)return;
 touchFlushing=true;const queueEpoch=touchQueueEpoch;try{
 const batch=pendingTouches[0];if(Date.now()-batch.queuedAt>60000){pendingTouches.shift();await recordExperience(batch,'skipped',{reason:'expired'});status('等待超过一分钟的触摸事件已跳过','warning');}
 else if(!busy&&!preparingModelChange&&!el('speechAudio').paused){/* finish current speech before another turn */}
 else if(!busy&&!preparingModelChange){
  pendingTouches.shift();let error;const {queuedAt,...event}=batch;
  await decide(event,true,{onFailure:e=>{error=e;}});
  if(error?.code==='SESSION_BUSY'&&error.submitted===false&&touchAllowed()&&queueEpoch===touchQueueEpoch)pendingTouches.unshift(batch);
 }
 }finally{touchFlushing=false;if(pendingTouches.length)touchTimer=setTimeout(flushTouches,500);}
}
// Stop queued physical input as soon as editing, adaptation or the AI master switch changes.
setInterval(()=>{if(!touchAllowed()&&(pendingTouches.length||touchBatch.pending||touchBatch.active))resetTouches();},100);
setInterval(()=>{if(cancelPending||hostStopping||window.liveAI===false||window.petAppearancePending||!el('petBubble').hidden||window.petAdapting||window.petChangingMemory||window.zoneEditor?.editing||!H.ready||busy||preparingModelChange||document.hidden||!config.auto||!el('speechAudio').paused||H.manual||visualPerformance&&!visualPerformance.done||H.character.busy(performance.now()/1000))return;if(performance.now()>=nextDue){nextDue=performance.now()+config.interval*1000;decide({type:'observe',note:'主动与用户互动一次：结合当前状态与经历，用自然简短的台词回应，并自主安排本模型可用的动作或表情'},true)}},1000);
// Local voice contract accepts real audio and optional measured/aligned viseme frames.
function fileBase64(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]);r.onerror=rej;r.readAsDataURL(file)})}
el('referenceFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;if(f.size>8*1024*1024){el('voiceStatus').textContent='参考音频超过 8MB';return;}reference={name:f.name,mime:f.type,base64:await fileBase64(f)};el('voiceStatus').textContent='参考音频已载入内存；仅在调用本地合成时发送。'};
el('clearReference').onclick=()=>{reference=null;el('referenceFile').value='';el('voiceStatus').textContent='已清除参考音频'};
function setAudio(blob,visemes=[],duration=null){const a=el('speechAudio');a.pause();if(audioURL)URL.revokeObjectURL(audioURL);audioURL=URL.createObjectURL(blob);a.src=audioURL;a.lcDuration=duration;audioPCM=null;applyPlayback();frames=visemes;lipValues={};el('voiceStatus').textContent=frames.length?'音频和嘴型时间轴已载入':'音频已载入；播放时使用实际音频频谱近似口型。';}

let activeVoiceRequest=null;
function voiceContext(){return {provider:config.voiceMode==='api'?config.voiceProvider:'local',endpoint:config.voiceMode==='api'?config.voiceApiUrl:config.tts,model:config.voiceApiModel,voice:config.voice,network:config.voiceNetwork||'direct'};}
async function reportVoice(value){try{await window.petDesktop?.asset?.('voiceReport',{...voiceContext(),...value});await refreshVoiceDiagnostic();}catch{}}
function voiceErrorText(error){return [new Date(error.at).toLocaleString(),error.provider+' · '+error.stage+' · '+(error.network==='system'?'系统代理':'直连'),error.httpStatus?'HTTP '+error.httpStatus:'',error.upstreamCode||error.errorCode||'',error.errorType||'',error.causeCode||'',error.keySource?'密钥来源：'+(error.keySource==='candidate'?'本次输入':'已保存的密钥'):'',error.keyLength!==null&&error.keyLength!==undefined?'密钥长度：'+error.keyLength+' · 前缀：'+(error.keyPrefix||'未知'):'',error.message,error.keyFingerprint?'密钥指纹 '+error.keyFingerprint:'',error.keySavedAt?'密钥保存于 '+new Date(error.keySavedAt).toLocaleString():''].filter(Boolean).join('\n');}
async function refreshVoiceDiagnostic(progress=false){
 const generation=++voiceDiagnosticEpoch;try{const snapshot=await window.petDesktop?.asset?.('voiceStatus');if(!snapshot||generation!==voiceDiagnosticEpoch)return;
 const failure=snapshot.lastError;updateVoiceActions();el('voiceErrorPanel').hidden=!failure;if(failure)el('voiceLastError').textContent=voiceErrorText(failure);else el('voiceLastError').textContent='';
 if(progress&&snapshot.status)el('voiceStatus').textContent=snapshot.status.message;
 }catch{}
}
el('clearVoiceError').onclick=async()=>{try{await window.petDesktop?.asset?.('voiceClearError');await refreshVoiceDiagnostic();}catch{}};
void refreshVoiceDiagnostic();
function voiceMuted(){return playback.muted||playback.volume<=0;}
function applyPlayback(){const a=el('speechAudio');a.volume=playback.volume;a.muted=voiceMuted();el('petVolume').value=Math.round(playback.volume*100);el('petVolumeValue').textContent=Math.round(playback.volume*100)+'%';el('petMute').setAttribute('aria-pressed',String(voiceMuted()));el('petMute').textContent=voiceMuted()?'取消静音':'静音';el('volumePet').setAttribute('aria-pressed',String(voiceMuted()));el('volumePet').title=voiceMuted()?'已静音 · 语音调用暂停':'语音音量 '+Math.round(playback.volume*100)+'%';updateVoiceActions();}
async function changePlayback(next){const revision=++playbackRevision;playback={...playback,...next};applyPlayback();if(voiceMuted()){voiceEpoch++;finishPerformance(true,true);el('speechAudio').pause();lipValues={};if(pendingSpeechText){safeBubble(pendingSpeechText);pendingSpeechText='';}if(bubbleMedia){bubbleMedia=null;bubbleShownAt=performance.now();bubbleExplicitTTL=undefined;timeBubble();}}
 try{const saved=await window.petDesktop?.asset?.('voicePlayback',playback);if(saved&&revision===playbackRevision){playback=saved;applyPlayback();}}catch(error){el('voiceStatus').textContent='音量保存失败：'+error.message;}}
el('volumePet').onclick=()=>{el('volumePopover').hidden=!el('volumePopover').hidden;el('volumePet').setAttribute('aria-expanded',String(!el('volumePopover').hidden));};
el('petVolume').oninput=()=>changePlayback({volume:+el('petVolume').value/100,muted:false});el('petMute').onclick=()=>changePlayback({muted:!voiceMuted(),volume:playback.volume||.8});
document.addEventListener('pointerdown',e=>{if(!e.target.closest?.('#volumePopover,#volumePet')){el('volumePopover').hidden=true;el('volumePet').setAttribute('aria-expanded','false');}});
void (async()=>{const revision=playbackRevision;try{const p=await window.petDesktop?.asset?.('voicePlayback');if(p&&Number.isFinite(p.volume)&&typeof p.muted==='boolean'&&revision===playbackRevision){playback=p;applyPlayback();}}catch{}})();
async function analyzeAudio(data){
 const direct=LCSpeech.pcm(data);if(direct)return direct;
 const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return null;
 let context;try{context=new Context();const decoded=await Promise.race([context.decodeAudioData(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)),new Promise((_,reject)=>setTimeout(()=>reject(Error('音频分析解码超时')),4000))]);const source=decoded.getChannelData(0);return {data:Float32Array.from(source),sampleRate:decoded.sampleRate};}catch(error){el('lipAnalysisStatus').textContent='音频分析不可用：'+error.message;return null;}finally{context?.close().catch(()=>{});}
}
async function speak(text,token=epoch,options={}){
 const show=(media=null)=>{const warning=safeBubble(text,undefined,media);if(warning)options.warnings?.push(warning);};
 if(voiceMuted()){options.onStart?.();if(options.present)show();el('voiceStatus').textContent='已静音，未发起语音调用';return false;}
 if(speechBusy){el('voiceStatus').textContent='语音正在生成，请稍后再试；未重复提交';options.onStart?.();if(options.present)show();return false;}
 const voiceToken=++voiceEpoch;speechBusy=true;let stage='request',requestId=null,started=false;const poll=setInterval(()=>{void refreshVoiceDiagnostic(true);},350);
 try{
  if(options.present){hideBubble();pendingSpeechText=text;}if(window.liveAI===false){await reportVoice({stage:'key',errorCode:'ai_disabled'});throw Error('AI 调用已关闭');}
  const direction=options.instruction||config.breezeInstruction;
  const body=config.voiceMode==='api'?{mode:'api',...voiceContext(),text,instruction:direction,guidance:config.voiceGuidance}:config.voiceMode==='breeze'?{mode:'breeze',endpoint:config.breezeEndpoint,text,instruction:direction,reference,reference_text:config.referenceText}:{endpoint:config.tts,text,voice:config.voice,reference,reference_text:config.referenceText};
  el('voiceStatus').textContent='正在读取已保存密钥并请求语音服务…';
  let r;if(config.voiceMode==='api'){if(!window.petDesktop?.asset)throw Error('需要桌面角色安全读取已保存的 API Key');r=await window.petDesktop.asset('voiceSynthesize',body);requestId=r.requestId;}else{const state=await window.petDesktop?.asset?.('voiceStartLocal',voiceContext());requestId=state?.requestId;r=await post('/api/synthesize',body,controller?.signal);}
  activeVoiceRequest=requestId;
  if(token!==epoch||voiceToken!==voiceEpoch||voiceMuted()){await reportVoice({requestId,stage:'cancelled'});if(options.present&&token===epoch&&voiceMuted()&&bubbleText!==text)show();return false;}
  stage='audio';const data=Uint8Array.from(atob(r.audio.base64),x=>x.charCodeAt(0)),vf=r.visemes?C.timeline(r.visemes):[];setAudio(new Blob([data],{type:r.audio.mime}),vf,LCSpeech.duration(data));
  const analyzed=await analyzeAudio(data);if(token!==epoch||voiceToken!==voiceEpoch||voiceMuted())return false;audioPCM=analyzed;
  stage='play';await reportVoice({requestId,stage});await el('speechAudio').play();
  if(token!==epoch||voiceToken!==voiceEpoch||voiceMuted()){el('speechAudio').pause();await reportVoice({requestId,stage:'cancelled'});return false;}
  started=true;options.onStart?.({media:true,audioElapsed:el('speechAudio').currentTime||0,audioDuration:Number.isFinite(el('speechAudio').duration)&&el('speechAudio').duration>0?el('speechAudio').duration:el('speechAudio').lcDuration});if(options.present)show(el('speechAudio'));
  await reportVoice({requestId,stage:'playing'});el('voiceStatus').textContent='正在播放 · '+(vf.length?'使用返回的口型时间轴':'实际音频频谱近似口型');return true;
 }catch(error){
  if(stage==='play')await reportVoice({requestId,stage,errorCode:error.name==='NotAllowedError'?'play_blocked':'play_failed',errorType:error.name});else if(requestId&&stage==='audio')await reportVoice({requestId,stage,errorCode:'invalid_audio',errorType:error.name});
  if(token===epoch&&voiceToken===voiceEpoch){if(options.present){if(!started)options.onStart?.();show();}el('voiceStatus').textContent='朗读未完成（'+stage+'）：'+error.message;}
  await refreshVoiceDiagnostic();return false;
 }finally{pendingSpeechText='';clearInterval(poll);speechBusy=false;updateVoiceActions();}
}
el('speechAudio').addEventListener('ended',()=>{const a=el('speechAudio');visualPerformance?.end(performance.now()/1000,a.currentTime>0?a.currentTime:Number.isFinite(a.duration)?a.duration:a.lcDuration);finishSpeechBubble();});
for(const event of ['loadedmetadata','durationchange','timeupdate'])el('speechAudio').addEventListener(event,extendPerformance);
el('speechAudio').addEventListener('pause',()=>{if(!el('speechAudio').ended)finishPerformance(true,true);});
el('speechAudio').addEventListener('error',()=>{finishPerformance(true,true);if(bubbleMedia){bubbleMedia=null;bubbleShownAt=performance.now();bubbleExplicitTTL=undefined;timeBubble();}});
async function runVoiceAction(action){
 if(voiceActionBusy||speechBusy)return false;voiceActionBusy=true;
 const nodes=[...el('voicePanel').querySelectorAll('input,select,textarea,button')],disabled=nodes.map(e=>e.disabled);nodes.forEach(e=>e.disabled=true);
 try{return await action();}finally{voiceActionBusy=false;nodes.forEach((e,i)=>e.disabled=disabled[i]);updateVoiceActions();}
}
el('voiceTest').onclick=()=>{if(!voiceTrialAllowed()){el('voiceStatus').textContent='请先保存当前设置并填写音色';return false;}return runVoiceAction(()=>speak('Live Character试播启动中'));};
el('speakLast').onclick=()=>{if(!voiceTrialAllowed()){el('voiceStatus').textContent='请先保存当前语音设置并填写音色';return false;}return runVoiceAction(()=>lastText?speak(lastText,epoch,{instruction:lastSpeech}):el('voiceStatus').textContent='还没有可朗读的回复');};
el('testAudio').onchange=async e=>{const f=e.target.files[0];if(f&&f.size<=16*1024*1024){const token=++voiceEpoch,data=new Uint8Array(await f.arrayBuffer()),analyzed=await analyzeAudio(data);if(token!==voiceEpoch)return;setAudio(f,[],LCSpeech.duration(data));audioPCM=analyzed;}else el('voiceStatus').textContent='音频超过 16MB';};
el('visemeFile').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>16*1024*1024)throw Error('时间轴文件过大');frames=C.timeline(JSON.parse(await f.text()));el('voiceStatus').textContent='嘴型时间轴已载入：'+frames.length+' 帧；以当前音频时间同步';}catch(err){el('voiceStatus').textContent=err.message}};
for(const v of [...C.vowels,'silence']){const b=document.createElement('button');b.textContent='预览 '+v;b.onclick=()=>{preview={v,until:performance.now()/1000+2};};el('vowelPreview').append(b)}
function livingPose(now,base){
 if(!H.ready||H.manual||H.focused||!config.auto||H.character.mode!=='tracking'||H.character.temporary||H.character.busy(now))return base;
 const strength=Number(el('amp').value)/100,out={...base};
 for(const row of H.catalog.controlRig||[]){
  const {id,role,min,max}=row;let offset=0;
  if(role==='视线横向'||role==='视线纵向'){
   const phase=now*(role==='视线横向'?.54:.35);offset=.17*Math.tanh(2*Math.sin(phase)+Math.sin(phase*.37));
  }else if(role==='头部姿态')offset=.075*Math.sin(now*.65+(id.endsWith('Z')?1.2:0));
  else if(role==='身体姿态')offset=.045*Math.sin(now*.53+.6);
  if(offset){const value=out[id]??row.neutral;out[id]=Math.max(min,Math.min(max,value+strength*offset*(max-min)/2));}
 }
 return out;
}
function frame(now,base){base=livingPose(now,base);if(H.manual)layer.clear();let out=layer.frame(now,base);if(!H.focused&&gaze&&now<gaze.until)for(const row of H.catalog.controlRig||[]){
  if(!row.role.startsWith('视线'))continue;const v=row.role==='视线横向'?gaze.x:gaze.y;out[row.id]=row.neutral+v*(v<0?row.neutral-row.min:row.max-row.neutral);
 }const audio=el('speechAudio'),speech=!audio.paused&&!audio.ended&&!voiceMuted();let weights=null;
 if(preview&&now<preview.until){weights={A:0,I:0,U:0,E:0,O:0,silence:0};weights[preview.v]=1;}
 else if(speech&&frames.length)weights=C.sample(frames,Math.max(0,audio.currentTime+(+el('lipOffset').value||0)));
 else if(speech&&audioPCM)weights=LCSpeech.sampleAudio(audioPCM,Math.max(0,audio.currentTime+(+el('lipOffset').value||0)));
 const dt=Math.min(.1,Math.max(0,now-lastLip));lastLip=now;
 const desired=weights?(window.mouthProfile?.targets(weights)??LCSpeech.targets(weights,H.catalog,H.params)):{};
 const gain=Math.min(1.5,Math.max(0,+el('lipGain').value||0));
 for(const id of new Set([...Object.keys(desired),...Object.keys(lipValues)])){const i=H.params.ids.indexOf(id);if(i<0)continue;const neutral=H.params.defaultValues[i],target=id in desired?Math.max(H.params.minimumValues[i],Math.min(H.params.maximumValues[i],neutral+(desired[id]-neutral)*gain)):base[id]??neutral;
 lipValues[id]=(lipValues[id]??base[id]??neutral)+(target-(lipValues[id]??base[id]??neutral))*(1-Math.exp(-dt*(weights?28:15)));if(!(id in desired)&&Math.abs(lipValues[id]-target)<.001)delete lipValues[id];}
 // Speech owns the speech shape; incompatible tongue/roll modifications yield while speaking.
 if(!audio.paused&&!audio.ended)for(const id of ['TongueOut','ParamTongueOut','MouthRollUpper','MouthRollLower'])if(H.params?.ids.includes(id))out[id]=H.params.defaultValues[H.params.ids.indexOf(id)];
 return {...out,...lipValues};}
let gaze=null;
window.companion={clearStatus:clearFeedback,bubble,setPlayback:changePlayback,bubblePresentation(){return {id:bubbleSerial,visibleCount:bubbleVisible}},refreshVoice(){if(performance.now()-lastVoiceRefresh>2000){lastVoiceRefresh=performance.now();return refreshVoiceKey();}},
 externalState(){return {online:true,characterId:window.petCharacterId,profile:H.catalog?.profile,model:H.catalog?.model||'',emotion:memory.emotion,activity:memory.activity,focus:el('focusMode').value,busy};},
 perform(cmd){
  if(!H.ready)throw Error('MODEL_NOT_READY');if(window.petAdapting||window.zoneEditor?.editing)throw Error('CHARACTER_LOCKED');
  const {expression:e,motion:m,bubble:b}=cmd;
  if(e&&!H.catalog.expressions.some(x=>x.name===e.name))throw Error('UNKNOWN_EXPRESSION');
  if(m&&!H.catalog.motions.some(x=>x.name===m.name))throw Error('UNKNOWN_MOTION');
  const now=performance.now()/1000;
  if(m)H.character.motion(m.name,now,m.seconds??null);
  if(e)H.character.setExpression(e.name,true,now,e.seconds??4);
  if('gaze' in cmd)gaze=cmd.gaze?{...cmd.gaze,until:now+4}:null;
  if(b)bubble(b.text,b.ttlMs);
 },
 modelChoices(ids){const e=el('petModel'),value=e.value||config.model||'';e.replaceChildren(new Option('跟随 DSH 会话所选模型',''));for(const id of new Set([...ids,value].filter(Boolean)))e.add(new Option(id,id));e.value=value;},
 async receiveSession(row){
  if(cancelPending||hostStopping||busy||!row||row.role==='assistant'&&Number.isSafeInteger(row.seq)&&row.seq<=(memory.cancelledThrough?.[row.sessionId]??-1)||row.role==='assistant'&&(memory.presented||[]).some(x=>x.sessionId===row.sessionId&&x.seq===row.seq)||!['user','assistant'].includes(row.role)||!row.text&&!row.plan||memory.history.some(x=>x.role===row.role&&((row.seq!=null&&row.sessionId&&x.sessionId===row.sessionId&&x.seq===row.seq)||(row.eventId&&x.eventId===row.eventId))))return;
  const validated=row.role==='assistant'&&row.plan?validateResponse(row.plan):null,plan=validated?.plan,validation=validated?performanceDiagnostics(validated):undefined;
  if(plan){memory.emotion=plan.emotion;memory.activity=plan.activity;memory.emotionSource={sessionId:row.sessionId,seq:row.seq,at:row.at};}else if(typeof row.emotion==='string')memory.emotion=row.emotion;
  if(row.role==='assistant'&&row.sessionId&&Number.isSafeInteger(row.seq))memory.presented=[...(memory.presented||[]),{sessionId:row.sessionId,seq:row.seq}].slice(-256);
  const stored={...row,text:plan?plan.text:row.text||''};memory.history.push(stored);save();renderHistory();
  const event={id:row.eventId||'dsh:'+row.sessionId+':'+row.seq,type:row.role==='assistant'?'dsh_reply':row.eventType||'chat',at:row.at||new Date().toISOString(),text:stored.text,source:'dsh'};
  await recordExperience(event,'completed',{sessionSeq:row.seq,...(row.role==='assistant'?{reply:{text:stored.text,emotion:memory.emotion,speech:row.speech,validation,performance:performanceSummary(plan)}}:{})}).catch(e=>status(e.message,'error'));
  if(row.role!=='assistant'||window.liveAI===false||window.petAdapting||window.zoneEditor?.editing)return;
  if(validated?.warnings.length)status('演出校验：'+validated.warnings.slice(0,2).join('；'),'warning');
  const token=epoch,perform=media=>{if(token===epoch&&plan)present(()=>performResponse(plan,row.plan,media,{eventId:event.id,sessionId:row.sessionId,characterId:window.petCharacterId,profile:H.catalog.profile,validation}),'会话演出失败');};
  lastText=stored.text;lastSpeech=LCSpeech.instruction({direction:typeof row.speech?.instructions==='string'?row.speech.instructions:'',emotion:memory.emotion,persona:config.persona,event:'外部会话回复',baseline:config.breezeInstruction});
  if(stored.text&&config.autoVoice&&!voiceMuted())await speak(stored.text,token,{instruction:lastSpeech,present:true,onStart:perform});else{perform();if(stored.text)safeBubble(stored.text);}
 },
 experiencesQuery(options){return window.petDesktop.asset('experienceQuery',options);},
 history(){return archive('history');},
 async fullHistory(limit=100000){
  const local=archive('history');let remote;try{remote=await window.petDesktop?.asset?.('sessionHistory',limit);}catch(e){status('会话读取暂不可用，显示本地记录 · '+e.message,'warning');}
  if(!remote?.rows)return {rows:local.slice(-limit),total:local.length};
  const rows=[...remote.rows],times=new Map();for(const x of remote.rows){const key=x.role+'\n'+x.text;if(!times.has(key))times.set(key,[]);times.get(key).push(Date.parse(x.at));}
  for(const m of local){
   if(m.kind==='model_change'&&!m.sessionId){rows.push(m);continue;}
   if(remote.rows.some(x=>x.role===m.role&&((m.seq!=null&&m.sessionId&&x.sessionId===m.sessionId&&x.seq===m.seq)||(m.eventId&&x.eventId===m.eventId))))continue;
   const t=times.get(m.role+'\n'+m.text),i=t?t.findIndex(v=>Math.abs(Date.parse(m.at)-v)<120000):-1;
   if(i<0)rows.push(m);else t.splice(i,1);
  }
  rows.sort((a,b)=>(Date.parse(a.at)||0)-(Date.parse(b.at)||0));
  return {rows:rows.slice(-limit),total:rows.length+(remote.more?1:0)};
 },
 capabilities,publishConfiguration,modelChanged,flushMemory:save,exportMemory(){return {state:JSON.parse(JSON.stringify(memory)),history:archive('history'),...(appearance.current?{appearance:JSON.parse(JSON.stringify(appearance))}:{})};},
 importMemory(bundle){if(bundle.appearance?.current?.characterId===window.petCharacterId){appearance=JSON.parse(JSON.stringify(bundle.appearance));saveAppearance();}memory={...bundle.state,history:bundle.history.slice(-16)};archive('replaceHistory',bundle.history);save();renderHistory();},
 chatState(){return {last:memory.history.at(-1)?.at||'',busy:busy||!!preparingModelChange||!!cancelPending||hostStopping,status:el('galStatus').textContent};},
 sendFromPanel(text){
  if(typeof text!=='string'||!text.trim()||text.length>2000)throw Error('消息须为 1–2000 字');
  if(busy||preparingModelChange||cancelPending||hostStopping)throw Error('角色正在回复或 DSH 正在停止');
  if(!H.ready||window.zoneEditor?.editing)throw Error('请先加载角色并退出区域编辑');
  void send(text).catch(e=>status(e.message,'error'));
 },applySettings(values){Object.assign(config,values);config.touchDebounceMs=Number.isInteger(config.touchDebounceMs)&&config.touchDebounceMs>=50&&config.touchDebounceMs<=5000?config.touchDebounceMs:250;touchBatch.setDelay(config.touchDebounceMs);if(!config.touchAI)resetTouches();fill();el('mouseButtons').value=config.swapButtons?'swap':'normal';save();schedule();},frame,advance:advancePerformance,touch,beginTouch,endTouch,resetTouches,stop,decide,schedule,get swapButtons(){return config.swapButtons},openChat,closeChat,stroke,get performing(){return performance.now()/1000<Math.max(layer.until,layer.holdUntil)},get config(){return config},get lastReply(){return lastReply}};
window.addEventListener('beforeunload',()=>{if(audioURL)URL.revokeObjectURL(audioURL)});
})();
