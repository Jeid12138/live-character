const {JSDOM,VirtualConsole}=require(process.env.LC_TEST_JSDOM||'jsdom'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
 for(const missing of [false,true]){
  let receive,progress,reports=[],failures=[];
  const log=new VirtualConsole();log.on('jsdomError',e=>failures.push(e.message));
  const dom=await JSDOM.fromFile(path.join(__dirname,'../desktop/bubble.html'),{runScripts:'dangerously',resources:'usable',virtualConsole:log,beforeParse(window){window.bubbleSurface={onContent:fn=>receive=fn,onProgress:fn=>progress=fn,measured:payload=>reports.push(payload)};window.HTMLElement.prototype.getBoundingClientRect=function(){const width=Math.min(Number.parseFloat(this.style.maxWidth)||400,300);return {width,height:100,x:0,y:0}};}});
  try{
   await new Promise((resolve,reject)=>{if(dom.window.document.readyState==='complete')return resolve();const timer=setTimeout(()=>reject(Error('local bubble resources timed out')),5000);dom.window.addEventListener('load',()=>{clearTimeout(timer);resolve()});});
   assert.equal(typeof receive,'function');assert.equal(typeof dom.window.LiveBubble,'object');if(missing)delete dom.window.LiveBubble;
   receive({text:'完整台词 <script>不会执行</script>',font:15,paper:'#fffcf5',ink:'#263945',maxWidth:800,maxHeight:600,revision:7});
   assert.equal(reports.length,1);assert.equal(reports[0].revision,7);assert(reports[0].width>24&&reports[0].width<=800);assert.equal(reports[0].height,124);assert.equal(dom.window.document.querySelector('#words').textContent,'完整台词 <script>不会执行</script>');assert.equal(failures.length,0,failures.join(';'));receive({text:'逐字完整显示',id:42,visibleCount:1,font:15,paper:'#fffcf5',ink:'#263945',maxWidth:800,maxHeight:600,revision:8});const words=dom.window.document.querySelector('#words');assert.equal(words.firstChild.textContent,'逐');assert.equal(words.textContent,'逐字完整显示');const measures=reports.length;progress({id:42,visibleCount:4});assert.equal(words.firstChild.textContent,'逐字完整');assert.equal(reports.length,measures,'progress must not resize the window');progress({id:41,visibleCount:0});assert.equal(words.firstChild.textContent,'逐字完整','stale progress ignored');
  }finally{dom.window.close()}
 }
 console.log('PASS actual file:// bubble entry: shared module loads outside HTTP, measures/reports; missing module fallback and literal text safety');
})().catch(e=>{console.error(e);process.exitCode=1});
