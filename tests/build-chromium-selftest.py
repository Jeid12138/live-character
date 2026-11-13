"""Build an offline real-browser test page with actual LC scripts and local-only fixtures."""
from pathlib import Path
import re,sys
ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/'lab/index.html').read_text(encoding='utf-8')
html=re.sub(r'<script src="(?:profile.js|vendor/[^\"]+)"[^>]*></script>','',html)
fixture=(ROOT/'tests/touch-interaction-ui.test.cjs').read_text(encoding='utf-8')
boot=fixture[fixture.index('w.petCharacterId='):fixture.index('for(const [,file]')].replace('w.','window.')
boot="const store=new Map(),calls=[],snapshots=[];let inferenceFailure=false,appearanceSource='image';\n"+boot
start=fixture.index(' vm.runInContext(`ready=true;')+len(' vm.runInContext(`')
setup=fixture[start:fixture.index('`,ctx);',start)]
run=r'''
window.addEventListener('load',async()=>{const results=[];try{
await new Promise(r=>setTimeout(r,50));SETUP
window.zoneEditor.hit=()=>({name:'头部'});window.companion.applySettings({auto:false,touchAI:true,touchDebounceMs:250});
window.companion.beginTouch(10,10);await new Promise(r=>setTimeout(r,600));if(calls.length)throw Error('hold flushed early');window.companion.endTouch();await new Promise(r=>setTimeout(r,450));if(calls.length!==1||calls[0].payload.event.type!=='touch')throw Error('startup touch failed: '+document.getElementById('status').textContent);results.push('PASS 未先聊天，首次长按/松手后成功投递一次触摸');
let strict=0;const x=new LCTouchBatch({delay:50,setTimer:function(fn,ms){if(this!==globalThis)throw Error('Illegal invocation: wrong set receiver');strict++;return globalThis.setTimeout(fn,ms)},clearTimer:function(id){if(this!==globalThis)throw Error('Illegal invocation: wrong clear receiver');globalThis.clearTimeout(id)},onBatch:()=>strict++});x.pulse('头');x.setDelay(60);await new Promise(r=>setTimeout(r,100));if(strict<2)throw Error('strict receiver did not flush');x.pulse('手');x.reset();results.push('PASS 原生定时器＋严格 Window 接收者＋修改间隔和取消');
}catch(e){results.push('FAIL '+e.stack)}
const out=document.createElement('pre');out.id='browserResult';out.textContent='Live Character 0.12.36 · 离线浏览器自检\n\n'+results.join('\n')+'\n\n本页使用真实前端脚本和浏览器计时器，网络/模型/角色资产为替身。\n不读取密钥，不调用付费模型；不能代替 DSH 或真实皮套联调。';out.style='position:fixed;inset:0;z-index:999999;background:#f5fafa;color:#164b50;padding:32px;font:17px/1.8 sans-serif;white-space:pre-wrap;overflow:auto';document.body.append(out);document.title=results.some(s=>s.startsWith('FAIL'))?'FAIL LC browser selftest':'PASS LC browser selftest';
});
'''.replace('SETUP',setup)
html=html.replace('<script src="renderer-health.js">','<script>'+boot+'</script><script src="renderer-health.js">')
html=html.replace('</html>','<script>'+run+'</script></html>')
def inline(m):
    source=(ROOT/'lab'/m.group(1)).read_text(encoding='utf-8')
    return '<script>'+source.replace('</script','<\\/script')+'</script>'
html=re.sub(r'<script src="([^\"]+)"[^>]*></script>',inline,html)
html=re.sub(r'<link[^>]+href="([^\"]+\.css)"[^>]*>',lambda m:'<style>'+(ROOT/'lab'/m.group(1)).read_text(encoding='utf-8')+'</style>',html)
out=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'chromium-selftest.html'
out.write_text(html,encoding='utf-8');print(out)
