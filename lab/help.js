/* Convert static explanations into accessible, on-demand help. Dynamic status and cost notes stay visible. */
(()=>{
 let serial=0;
 function attach(anchor,text){
  if(!anchor||!text)return null;
  const button=document.createElement('button'),tip=document.createElement('span');
  const id='lc-help-'+(++serial);
  button.type='button';button.className='lc-help';button.textContent='!';button.title=text;button.setAttribute('aria-label','说明：'+text);button.setAttribute('aria-describedby',id);button.setAttribute('aria-expanded','false');button.dataset.helpText=text;
  tip.id=id;tip.className='lc-help-popup';tip.setAttribute('role','tooltip');tip.hidden=true;tip.textContent=text;
  const close=()=>{tip.hidden=true;button.setAttribute('aria-expanded','false');};
  button.addEventListener('click',event=>{event.preventDefault();tip.hidden=!tip.hidden;button.setAttribute('aria-expanded',String(!tip.hidden));});
  button.addEventListener('blur',close);
  button.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();close();}});
  anchor.classList.add('lc-help-anchor');
  anchor.append(button,tip);return button;
 }
 function collapse(node){
  if(!node||node.dataset.lcHelpDone||node.id||node.children.length)return;
  const text=node.textContent.trim();if(!text||/tokens?|计费|费用|额度|消耗/i.test(text))return;
  const before=node.previousElementSibling;
  node.dataset.lcHelpDone='true';node.textContent='';
  if(before?.matches('label,h2,h3,.actions')){attach(before,text);node.hidden=true;}
  else {node.classList.add('lc-help-line');attach(node,text);}
 }
 window.lcHelp={attach,collapse};
 for(const old of document.querySelectorAll('label span[data-help-text]')){
  const label=old.closest('label'),button=attach(label,old.dataset.helpText);
  button.id=old.id;button.classList.add('cuda-graph-tip');
  old.remove();
 }
 document.querySelectorAll('#zoneEditPanel p:not([id])').forEach(collapse);
 for(const selector of ['#focusPanel p:not([id])','#renderPanel p:not([id])','#bubblePanel p:not([id])','#bubblePanel small:not([id])','#assetPanel>p:not([id])','#configurationTransfer>p:not([id])','#companionPanel p:not([id])','#voicePanel details>p:not([id])','#chatPanel p.muted'])document.querySelectorAll(selector).forEach(collapse);
 for(const [sourceId,controlId] of [['sessionModelHint','petModel'],['breezeHelp','voiceStyle'],['localEngineHelp','ttsEndpoint']]){
  const source=document.getElementById(sourceId),anchor=document.getElementById(controlId)?.closest('label');
  if(!source||!anchor)continue;
  const button=attach(anchor,source.textContent.trim()),tip=button.nextElementSibling;
  source.dataset.lcHelpSource='true';
  const sync=()=>{const text=source.textContent.trim();button.hidden=source.hidden;button.title=button.dataset.helpText=tip.textContent=text;button.setAttribute('aria-label','说明：'+text);if(source.hidden){tip.hidden=true;button.setAttribute('aria-expanded','false');}};
  new MutationObserver(sync).observe(source,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['hidden']});sync();
 }
 const analysis=document.getElementById('lipAnalysisStatus');
 if(analysis){attach(document.getElementById('lipGain').closest('label'),analysis.textContent);analysis.textContent='';}
 const statusIds='activity diagnostics ruleLog focusStatus ruleNotice breathStatus adaptReport configResult balanceResult companionBrief assetRootPath voiceReadyHint voiceKeyInputInfo voiceKeyWarning voiceKeyStatus voiceAuthStatus lipAnalysisStatus galStatus toolLayoutStatus adaptMessage zoneAnchorStatus'.split(' ');
 for(const id of statusIds){const field=document.getElementById(id);if(field)field.dataset.ui='status';}
})();
