/* Character semantics. Model curves are authored data, sampled before physics. */
(function(root){
 const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
 const ease=x=>{x=clamp(x);return x*x*(3-2*x)};
 function sampleCurve(s,t){
  let x=s[0],y=s[1],i=2;if(t<=x)return y;
  while(i<s.length){let kind=s[i++],endX,endY,c1,c2;if(kind===1){c1=[s[i++],s[i++]];c2=[s[i++],s[i++]];}endX=s[i++];endY=s[i++];
   if(t<=endX){if(kind===2)return t<endX?y:endY;if(kind===3)return endY;if(kind===0)return y+(endY-y)*clamp((t-x)/(endX-x||1));
    const bez=(a,b,c,d,u)=>a*(1-u)**3+3*b*u*(1-u)**2+3*c*u*u*(1-u)+d*u**3;
    let lo=0,hi=1;for(let k=0;k<20;k++){const u=(lo+hi)/2;if(bez(x,c1[0],c2[0],endX,u)<t)lo=u;else hi=u;}return bez(y,c1[1],c2[1],endY,(lo+hi)/2);
   }x=endX;y=endY;
  }return y;
 }
 function pose(m,t,loop=false){const out={};if(!m)return out;const d=m.data.Meta.Duration;if(loop&&d>0)t=((t%d)+d)%d;else t=clamp(t,0,d);for(const c of m.data.Curves)if(c.Target==='Parameter')out[c.Id]=sampleCurve(c.Segments,t);return out;}
 const pairs=[{name:'抚胸',group:'left',open:'默认手切举手',close:'举手切默认手'}, {name:'持草',group:'right',open:'狗尾草切换出来',close:'狗尾草切回默认手'}, {name:'竖食指',group:'right',open:'竖手指切出来动画',close:'竖手指切回默认'}];
 class Character{
  constructor(catalog,defaults,now=0){this.catalog=catalog;this.defaults=defaults;this.expressions=new Map();this.gestures=new Map();this.mode='tracking';this.modeStart=now;this.modeFrom={};this.output={...defaults};this.modeChanged=now;this.sequence=0;this.temporary=null;this.tracking=catalog.motions.find(m=>m.behavior?.kind==='tracking');this.detached=catalog.motions.find(m=>m.behavior?.kind==='detached');}
  modeTo(mode,now){if(mode===this.mode)return;this.modeFrom={...this.baseOutput};this.mode=mode;this.modeStart=now;this.modeChanged=now;}
  expWeight(e,now){return e.from+(e.to-e.from)*ease((now-e.changed)/Math.max(.001,e.fade));}
  setExpression(name,on,now,seconds=null){const item=this.catalog.expressions.find(e=>e.name===name);if(!item)return false;
   if(name==='竖食指开'||name==='竖食指关'){this.gesture('竖食指',name==='竖食指开'&&on,now);return true;}
   const old=this.expressions.get(name);if(!on){if(old){old.from=this.expWeight(old,now);old.to=0;old.changed=now;old.expires=null;}return true;}
   // Parameter-overlap conflicts are an app policy; the model has no VTS ExpressionGroups.
   const ids=new Set(item.data.Parameters.map(p=>p.Id));for(const [n,e] of this.expressions)if(n!==name&&e.item.data.Parameters.some(p=>ids.has(p.Id))&&e.to>0)this.setExpression(n,false,now);
   this.expressions.set(name,{item,from:old?this.expWeight(old,now):0,to:1,changed:now,fade:item.behavior?.fade??.5,expires:seconds===null?null:now+seconds});return true;
  }
  toggleExpression(name,now){if(name==='竖食指开'){this.toggleGesture('竖食指',now);return true;}if(name==='竖食指关'){this.gesture('竖食指',false,now);return true;}const behavior=this.catalog.expressions.find(e=>e.name===name)?.behavior;return this.setExpression(name,!(this.expressions.get(name)?.to>0),now,behavior?.autoOff&&behavior.autoOffSeconds>0?behavior.autoOffSeconds:null);}
  clearExpressions(now){for(const n of this.expressions.keys())this.setExpression(n,false,now);}
  gesture(name,on,now,seconds=null){const p=pairs.find(p=>p.name===name);if(!p)return;const old=this.gestures.get(p.group);if(on&&old?.pair.name===name&&old.targetOn){old.expires=seconds===null?null:now+seconds;return;}
   if(on&&old?.targetOn&&old.pair.name!==name){this.gesture(old.pair.name,false,now);this.gestures.get(p.group).queued={name,seconds};return;}
   const m=this.catalog.motions.find(m=>m.name===(on?p.open:p.close));if(!m)return;
   // Crossfade only the affected parameter layer; leave the other arm and accessories intact.
   const from={};for(const c of m.data.Curves)if(c.Target==='Parameter')from[c.Id]=this.output[c.Id]??this.defaults[c.Id]??0;
   this.gestures.set(p.group,{pair:p,m,start:now,from,targetOn:on,fade:m.behavior?.fade??.2,expires:on&&seconds!==null?now+m.data.Meta.Duration+seconds:null,seq:++this.sequence});
  }
  toggleGesture(name,now){const p=pairs.find(p=>p.name===name);this.gesture(name,!(this.gestures.get(p.group)?.targetOn&&this.gestures.get(p.group)?.pair.name===name),now);}
  motion(name,now,temporarySeconds=null){const m=this.catalog.motions.find(m=>m.name===name);if(!m)return false;if(['tracking','detached'].includes(m.behavior?.kind)){this.modeTo(m.behavior.kind,now);return true;}
   for(const p of pairs){if(name===p.open){this.gesture(p.name,true,now,temporarySeconds);return true;}if(name===p.close){this.gesture(p.name,false,now);return true;}}
   const hold=m.behavior?.kind==='hold';
   if(hold&&this.temporary?.m===m){this.temporary=null;return true;}
   this.temporary={m,start:now,until:hold?(temporarySeconds===null?Infinity:now+m.data.Meta.Duration+temporarySeconds):now+m.data.Meta.Duration};return true;
  }
  busy(now){return (!!this.temporary&&now-this.temporary.start<this.temporary.m.data.Meta.Duration)||[...this.gestures.values()].some(g=>now-g.start<g.m.data.Meta.Duration+g.fade);}
  clearGestures(now){for(const g of [...this.gestures.values()]){g.queued=null;if(g.targetOn)this.gesture(g.pair.name,false,now);}}
  reset(now){this.clearExpressions(now);this.clearGestures(now);this.modeTo('tracking',now);this.temporary=null;}
  frame(now,trackingInputs={},baseEnabled=true,breath={}){
   const b={...this.defaults};const loop=this.mode==='detached'?this.detached:this.tracking;
   if(baseEnabled)Object.assign(b,pose(loop,now-this.modeStart,true));
   if(this.mode==='tracking')Object.assign(b,trackingInputs);
   Object.assign(b,breath);
   const blend=ease((now-this.modeChanged)/.5);if(blend<1&&this.modeFrom)for(const id of new Set([...Object.keys(this.modeFrom),...Object.keys(b)]))b[id]=(this.modeFrom[id]??this.defaults[id]??0)*(1-blend)+(b[id]??0)*blend;
   this.baseOutput={...b};
   for(const g of [...this.gestures.values()].sort((a,b)=>a.seq-b.seq)){
    if(g.expires!==null&&now>=g.expires){this.gesture(g.pair.name,false,now);continue;}
    const elapsed=now-g.start,d=g.m.data.Meta.Duration;
    if(!g.targetOn&&elapsed>=d+g.fade){this.gestures.delete(g.pair.group);if(g.queued)this.gesture(g.queued.name,true,now,g.queued.seconds);continue;}
    const p=pose(g.m,elapsed),fadeIn=ease(elapsed/Math.max(.001,g.fade));
    const weight=g.targetOn?1:1-ease((elapsed-d)/Math.max(.001,g.fade));
    for(const [id,v] of Object.entries(p)){const from=g.from[id]??b[id]??0;const a=from*(1-fadeIn)+v*fadeIn;b[id]=(b[id]??0)*(1-weight)+a*weight;}
   }
   if(this.temporary){const a=this.temporary;if(now>(a.until??a.start+a.m.data.Meta.Duration))this.temporary=null;else Object.assign(b,pose(a.m,now-a.start));}
   for(const [name,e] of this.expressions){if(e.expires!==null&&now>=e.expires&&e.to>0)this.setExpression(name,false,now);const w=this.expWeight(e,now);if(w<=0&&e.to===0){this.expressions.delete(name);continue;}
    for(const p of e.item.data.Parameters){const v=b[p.Id]??0;if(p.Blend==='Multiply')b[p.Id]=v*(1+(p.Value-1)*w);else if(p.Blend==='Overwrite')b[p.Id]=v*(1-w)+p.Value*w;else b[p.Id]=v+p.Value*w;}
   }
   this.output=b;return b;
  }
 }
 const api={Character,sampleCurve,pose,pairs};if(typeof module!=='undefined')module.exports=api;else root.LabState=api;
})(globalThis);
