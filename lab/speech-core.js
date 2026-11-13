/* Audio-driven approximation and model-specific retargeting. Not a phoneme recognizer. */
(function(root){
 const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,Number.isFinite(n)?n:0)),vowels=['A','I','U','E','O'];
 function duration(bytes){
  try{const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(d.getUint32(0,false)!==0x52494646||d.getUint32(8,false)!==0x57415645)return null;let rate=0,size=0;for(let at=12;at+8<=d.byteLength;){const id=d.getUint32(at,false),n=d.getUint32(at+4,true);if(id===0x666d7420&&n>=16&&at+24<=d.byteLength)rate=d.getUint32(at+16,true);if(id===0x64617461)size=Math.min(n,d.byteLength-at-8);at+=8+n+(n%2);}return rate&&size?size/rate:null;}catch{return null;}
 }
 function pcm(bytes){
  try{const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(d.getUint32(0,false)!==0x52494646||d.getUint32(8,false)!==0x57415645)return null;let format,channels,rate,bits,start,size;
   for(let at=12;at+8<=d.byteLength;){const id=d.getUint32(at,false),n=d.getUint32(at+4,true);if(id===0x666d7420&&n>=16&&at+24<=d.byteLength){format=d.getUint16(at+8,true);channels=d.getUint16(at+10,true);rate=d.getUint32(at+12,true);bits=d.getUint16(at+22,true);}if(id===0x64617461){start=at+8;size=Math.min(n,d.byteLength-start);}at+=8+n+(n%2);}
   if(![1,3].includes(format)||!channels||channels>8||!rate||!start||![8,16,24,32].includes(bits)||format===3&&bits!==32)return null;
   const stride=bits/8,count=Math.floor(size/(channels*stride)),data=new Float32Array(count);for(let i=0;i<count;i++){let x=0;for(let c=0;c<channels;c++){const k=start+(i*channels+c)*stride;let v;if(format===3)v=d.getFloat32(k,true);else if(bits===8)v=(d.getUint8(k)-128)/128;else if(bits===16)v=d.getInt16(k,true)/32768;else if(bits===24){v=d.getUint8(k)|(d.getUint8(k+1)<<8)|(d.getUint8(k+2)<<16);if(v&0x800000)v-=0x1000000;v/=8388608;}else v=d.getInt32(k,true)/2147483648;x+=Number.isFinite(v)?v:0;}data[i]=x/channels;}return {data,sampleRate:rate};
  }catch{return null;}
 }
 function sampleAudio(audio,time){
  const n=1024;audio.work||={real:new Float64Array(n),imag:new Float64Array(n),time:new Float32Array(n),db:new Float32Array(n/2)};const w=audio.work,at=Math.floor(Math.max(0,time)*audio.sampleRate)-n/2;
  for(let i=0;i<n;i++){w.time[i]=audio.data[at+i]||0;w.real[i]=w.time[i]*(.5-.5*Math.cos(2*Math.PI*i/(n-1)));w.imag[i]=0;}
  for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){const v=w.real[i];w.real[i]=w.real[j];w.real[j]=v;}}
  for(let len=2;len<=n;len<<=1){const angle=-2*Math.PI/len;for(let start=0;start<n;start+=len)for(let j=0;j<len/2;j++){const c=Math.cos(angle*j),s=Math.sin(angle*j),a=start+j,b=a+len/2,tr=c*w.real[b]-s*w.imag[b],ti=s*w.real[b]+c*w.imag[b];w.real[b]=w.real[a]-tr;w.imag[b]=w.imag[a]-ti;w.real[a]+=tr;w.imag[a]+=ti;}}
  for(let i=0;i<n/2;i++)w.db[i]=20*Math.log10(Math.max(1e-8,Math.hypot(w.real[i],w.imag[i])/n));
  return estimate(w.time,w.db,audio.sampleRate,n);
 }
 function estimate(samples,db,sampleRate,fftSize){
  let sum=0;for(const x of samples)sum+=x*x;const rms=Math.sqrt(sum/Math.max(1,samples.length)),open=clamp((rms-.004)*9);
  const w={A:0,I:0,U:0,E:0,O:0,silence:1,open:0};if(open<=0)return w;
  const energy=(center,radius)=>{let e=0,n=0;for(let f=Math.max(100,center-radius);f<=center+radius;f+=sampleRate/fftSize){const x=db[Math.round(f*fftSize/sampleRate)];if(Number.isFinite(x)){e+=10**(clamp(x,-120,0)/10);n++;}}return e/Math.max(1,n)};
  const shape={A:[800,1300],I:[300,2500],U:[350,900],E:[500,2100],O:[550,1000]};let total=0;
  for(const [v,[f1,f2]]of Object.entries(shape)){w[v]=Math.sqrt(energy(f1,140)*energy(f2,250));total+=w[v];}
  if(total>1e-12){for(const v of vowels)w[v]=open*w[v]/total;}else w.A=open;
  w.open=open;w.silence=1-open;return w;
 }
 function source(weights){
  const A=clamp(weights.A),I=clamp(weights.I),U=clamp(weights.U),E=clamp(weights.E),O=clamp(weights.O),open=clamp(weights.open??A+I+U+E+O),round=clamp(U+O),wide=clamp(I+E);
  return {A,I,U,E,O,Silence:clamp(weights.silence??1-open),MouthOpen:open,MouthOpenY:open,JawOpen:open,MouthForm:clamp(wide-round,-1,1),MouthFunnel:clamp(O+.4*U),MouthPucker:round,MouthPuckerWiden:clamp(wide-round,-1,1),MouthPressLipOpen:clamp(.5*open-.25*round,-1,1),MouthShrug:.3*round,VoiceVolume:open,VoiceVolumePlusMouthOpen:open};
 }
 function targets(weights,catalog,params){
  const values=source(weights),out={},outputs=new Set(catalog.physicsIO?.Output||[]),ids=params.ids||[];
  const bounds=id=>{const i=ids.indexOf(id);return i<0||outputs.has(id)?null:{min:params.minimumValues[i],max:params.maximumValues[i],neutral:params.defaultValues[i]}};
  const write=(id,value,signed=false)=>{const b=bounds(id);if(!b)return;out[id]=clamp(signed?b.neutral+value*(value<0?b.neutral-b.min:b.max-b.neutral):b.neutral+value*(b.max-b.neutral),b.min,b.max)};
  const aliases=new Map(Object.keys(values).map(k=>[k.toLowerCase(),k]));for(const v of vowels)aliases.set('mouth'+v.toLowerCase(),v);
  for(const id of ids){const name=id.replace(/^Param/i,'').replaceAll('_','').toLowerCase(),clean=aliases.get(name);if(clean)write(id,values[clean],['MouthForm','MouthPuckerWiden','MouthPressLipOpen'].includes(clean));}
  for(const id of catalog.parameterGroups?.filter(g=>g.Name==='LipSync').flatMap(g=>g.Ids||[])||[])if(!Object.hasOwn(out,id))write(id,values.MouthOpen);
  // Authored VTS mapping wins over conventional names; respect each real model's bounds.
  for(const r of catalog.vts?.tracking||[]){const id=r.OutputLive2D,input=values[r.Input],b=bounds(id);if(!b||input===undefined)continue;const {InputRangeLower:l,InputRangeUpper:h,OutputRangeLower:a,OutputRangeUpper:z}=r;if([l,h,a,z].every(Number.isFinite)&&h!==l)out[id]=clamp(a+(z-a)*clamp((input-l)/(h-l)),b.min,b.max);}
  return out;
 }
 function detectMappings(catalog,params){
  const values=source({}),map=new Map(),blocked=new Set(catalog.physicsIO?.Output||[]),signed=new Set(['MouthForm','MouthPuckerWiden','MouthPressLipOpen']);
  const known=new Map(Object.keys(values).map(k=>[k.toLowerCase(),k]));for(const v of vowels)known.set('mouth'+v.toLowerCase(),v);
  function row(id,input){const i=params.ids.indexOf(id);if(i<0||blocked.has(id))return;const center=signed.has(input);map.set(id,{id,input,enabled:true,mode:center?'centered':'linear',inputMin:center?-1:0,inputMax:1,outputMin:center?params.minimumValues[i]:params.defaultValues[i],outputMax:params.maximumValues[i],neutral:params.defaultValues[i]});}
  for(const id of params.ids){const input=known.get(id.replace(/^Param/i,'').replaceAll('_','').toLowerCase());if(input)row(id,input);}
  for(const g of catalog.parameterGroups||[])if(g.Name==='LipSync')for(const id of g.Ids||[])if(!map.has(id))row(id,'MouthOpen');
  for(const r of catalog.vts?.tracking||[]){if(!Object.hasOwn(values,r.Input)||!params.ids.includes(r.OutputLive2D)||blocked.has(r.OutputLive2D))continue;const v=[r.InputRangeLower,r.InputRangeUpper,r.OutputRangeLower,r.OutputRangeUpper];if(!v.every(Number.isFinite)||v[0]>=v[1])continue;const i=params.ids.indexOf(r.OutputLive2D);map.set(r.OutputLive2D,{id:r.OutputLive2D,input:r.Input,enabled:true,mode:'linear',inputMin:v[0],inputMax:v[1],outputMin:clamp(v[2],params.minimumValues[i],params.maximumValues[i]),outputMax:clamp(v[3],params.minimumValues[i],params.maximumValues[i]),neutral:params.defaultValues[i]});}
  return [...map.values()];
 }
 function validateMappings(rows,catalog,params){
  if(!Array.isArray(rows)||rows.length>128)throw Error('口型映射须为最多 128 项');const ids=new Set(),blocked=new Set(catalog.physicsIO?.Output||[]),inputs=source({});
  return rows.map(r=>{const i=params.ids.indexOf(r?.id);if(i<0||blocked.has(r.id)||ids.has(r.id)||!Object.hasOwn(inputs,r.input))throw Error('口型映射含未知、重复或物理输出参数');ids.add(r.id);
   const fields=['inputMin','inputMax','outputMin','outputMax','neutral'];if(!fields.every(k=>Number.isFinite(r[k]))||r.inputMin>=r.inputMax||!['linear','centered'].includes(r.mode)||typeof r.enabled!=='boolean')throw Error('口型范围或模式无效');
   if(r.inputMin< -10||r.inputMax>100||['outputMin','outputMax','neutral'].some(k=>r[k]<params.minimumValues[i]||r[k]>params.maximumValues[i])||r.mode==='centered'&&!(r.inputMin<0&&r.inputMax>0))throw Error('口型映射超出模型真实范围');
   return {id:r.id,input:r.input,enabled:r.enabled,mode:r.mode,...Object.fromEntries(fields.map(k=>[k,r[k]]))};
  });
 }
 function mappedTargets(weights,catalog,params,rows){const inputs=source(weights),out={},blocked=new Set(catalog.physicsIO?.Output||[]);for(const r of rows){const i=params.ids.indexOf(r.id),x=inputs[r.input];if(!r.enabled||i<0||blocked.has(r.id)||!Number.isFinite(x))continue;let value;if(r.mode==='centered')value=x<0?r.neutral+(r.outputMin-r.neutral)*clamp(x/r.inputMin):r.neutral+(r.outputMax-r.neutral)*clamp(x/r.inputMax);else value=r.outputMin+(r.outputMax-r.outputMin)*clamp((x-r.inputMin)/(r.inputMax-r.inputMin));out[r.id]=clamp(value,params.minimumValues[i],params.maximumValues[i]);}return out;}
 function instruction({direction='',emotion='',persona='',event='',baseline=''}={}){
  const clean=x=>String(x||'').replace(/[\x00-\x1f]/g,' ').trim();
  return [clean(direction)||('以自然口语表达此刻的'+clean(emotion||'情绪')+'；意图是回应'+clean(event||'当前互动')+'。结合角色性格：'+clean(persona).slice(0,160)+'。按语意停顿并强调关键词，情感清晰但不要夸张。'),clean(baseline)].filter(Boolean).join('\n').slice(0,1000);
 }
 const api={duration,pcm,sampleAudio,estimate,source,targets,detectMappings,validateMappings,mappedTargets,instruction};if(typeof module!=='undefined')module.exports=api;else root.LCSpeech=api;
})(globalThis);
