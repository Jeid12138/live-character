/* Pure rule evaluator, shared by browser and Node tests. */
(function(root){
 const defaults=[
 {id:'start',enabled:true,name:'开始工作',event:'typing',threshold:1,hold:0,expressionMode:'on',motionMode:'hold',expression:'黑框眼镜',motion:'',duration:3,cooldown:.2},
 {id:'work-end',enabled:true,name:'停止打字后恢复',event:'typingIdle',threshold:3,hold:0,expressionMode:'off',motionMode:'hold',expression:'黑框眼镜',motion:'',duration:3,cooldown:.2},
 {id:'fast',enabled:true,name:'快速输入',event:'rate',threshold:180,hold:1,expressionMode:'pulse',motionMode:'hold',expression:'加载',motion:'',duration:2,cooldown:15},
 ];
 const events={typing:'开始打字',typingIdle:'停止打字 ≥（秒）',rate:'按键频率 ≥（次/分）',count:'每累计按键（次）',idle:'键鼠无操作 ≥（秒）',pointer:'鼠标速度 ≥（像素/秒）',interval:'定时触发（秒）',click:'点击模型'};
 function validate(input){if(!Array.isArray(input)||input.length>50)throw Error('规则应为最多 50 项的数组');const used=new Set();return input.map((r,i)=>{let id=String(r.id||'rule-'+i).slice(0,80);while(used.has(id))id+='-'+i;used.add(id);const finite=(v,d,min,max)=>{const n=Number(v??d);if(!Number.isFinite(n)||n<min||n>max)throw Error('规则 '+(i+1)+' 的数字超出范围');return n;};if(!Object.hasOwn(events,r.event))throw Error('未知触发条件');return {id,enabled:r.enabled!==false,name:String(r.name||'自定义规则').slice(0,60),event:r.event,threshold:finite(r.threshold,1,0.1,100000),hold:finite(r.hold,0,0,300),expressionMode:['pulse','on','off','toggle'].includes(r.expressionMode)?r.expressionMode:'pulse',motionMode:r.motionMode==='temporary'?'temporary':'hold',expression:String(r.expression||'').slice(0,100),motion:String(r.motion||'').slice(0,100),duration:finite(r.duration,3,.2,60),cooldown:finite(r.cooldown,10,.2,3600)};});}
 class Engine{
  constructor(rules,now=0,metrics={}){this.reset(rules,now,metrics);}
  reset(rules,now,metrics={}){this.rules=rules;this.states=new Map(rules.map(r=>[r.id,{since:null,last:-Infinity,latched:false,typing:metrics.typingSerial||0,click:metrics.clickSerial||0,bucket:Math.floor((metrics.count||0)/r.threshold),next:now+r.threshold*1000}]));}
  step(m,now,available=true){
   let selected=null;
   for(const r of this.rules){const s=this.states.get(r.id);if(!r.enabled)continue;let yes=false;
    if(r.event==='rate')yes=m.rate>=r.threshold;
    if(r.event==='idle')yes=m.idle>=r.threshold;
    if(r.event==='typingIdle')yes=m.count>0&&m.typingIdle>=r.threshold;
    if(r.event==='pointer')yes=m.speed>=r.threshold;
    if(r.event==='typing'){yes=m.typingSerial>s.typing;s.typing=m.typingSerial;}
    if(r.event==='click'){yes=m.clickSerial>s.click;s.click=m.clickSerial;}
    if(r.event==='count'){const b=Math.floor(m.count/r.threshold);yes=b>s.bucket;s.bucket=b;}
    if(r.event==='interval'){yes=now>=s.next;if(yes)s.next=now+r.threshold*1000;}
    const level=['rate','idle','typingIdle','pointer'].includes(r.event);
    if(!yes){s.since=null;s.latched=false;continue;}
    s.since??=now;
    // Edge events ignore "hold"; sustained conditions use it. Idle fires once per idle episode.
    if(level&&now-s.since<r.hold*1000)continue;
    if(['idle','typingIdle'].includes(r.event)&&s.latched)continue;
    if(now-s.last<r.cooldown*1000||!available||selected)continue;
    s.last=now;s.latched=true;selected=r;
   }
   return selected;
  }
 }
 const api={Engine,validate,defaults,events};if(typeof module!=='undefined')module.exports=api;else root.LabRules=api;
})(globalThis);
