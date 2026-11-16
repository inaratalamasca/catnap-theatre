/* Catnap per-tab Radio indicator, version 0.7.0.
 * Displays only sanitized worker state for this exact source tab. Clicking an
 * indicator opens controls; capture always needs the extension toolbar grant.
 * No capture, playback, credentials or private relay URL here. Only the fixed
 * public Catnap listener link may be displayed for its actual live source.
 */
(function(scope,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {scope.CatnapRadioTab=api;if(scope.document&&scope.chrome?.runtime)api.install(scope);}
})(globalThis,()=>{
  'use strict';
  const SCRIPT_VERSION='0.7.0',POLL_MS=2000,REQUEST_MS=5000,LISTENER='https://listen.catnapradio.com/';
  const ROOT='catnap-theater-root',LAUNCH='catnap-theater-launch',PILL='catnap-radio-indicator',STYLE='catnap-radio-tab-styles';
  const STATES=new Set(['idle','starting','connecting','reconnecting','live','error']),installed=new WeakMap();
  function sanitize(value){
    if(!value||!STATES.has(value.state)||typeof value.source!=='boolean'||typeof value.hideTheatreButton!=='boolean'||typeof value.radioOnly!=='boolean')return null;
    return {state:value.state,source:value.source,hideTheatreButton:value.hideTheatreButton,radioOnly:value.radioOnly,listenerUrl:value.state==='live'&&value.source===true&&value.listenerUrl===LISTENER?LISTENER:null};
  }
  function trustedSender(runtime,sender){
    if(!runtime?.id||sender?.id!==runtime.id||sender.tab||sender.frameId!==undefined&&sender.frameId!==0)return false;
    let entry='broadcast-worker.js';
    try{const configured=runtime.getManifest?.()?.background?.service_worker;if(typeof configured==='string'&&configured)entry=configured;}catch{return false;}
    return sender.url===runtime.getURL(entry);
  }
  function install(window){
    if(installed.has(window))return installed.get(window);
    if(!window.document||!window.chrome?.runtime||window.top!==window)return null;
    const document=window.document,runtime=window.chrome.runtime;
    let current={state:'idle',source:false,hideTheatreButton:false,radioOnly:false},pill=null,timer=null,disposed=false,epoch=0,inFlight=false;
    const boundHeaders=new Set(),createdLabels=new Set(),createdCaptions=new Set(),createdLinks=new Set();
    const kind=()=>{try{return window.CatnapBroadcastSource?.kind(window.location.href)||null;}catch{return null;}};
    const live=()=>current.state==='live'&&current.source===true;
    function style(){
      if(document.getElementById(STYLE))return;
      const element=document.createElement('style');element.id=STYLE;
      element.textContent=`
#${PILL}{all:initial!important;position:fixed!important;right:25px!important;bottom:104px!important;z-index:2147483646!important;display:inline-flex!important;align-items:center!important;gap:7px!important;box-sizing:border-box!important;padding:8px 11px!important;border:1px solid #78618b!important;border-radius:999px!important;background:rgba(17,14,29,.96)!important;color:#eee7f6!important;font:600 12px/1.2 system-ui,sans-serif!important;cursor:pointer!important;box-shadow:0 5px 20px #0005!important}
#${PILL}[hidden]{display:none!important}#${PILL}:focus-visible{outline:2px solid #a5e8bc!important;outline-offset:3px!important}
#${PILL} .catnap-radio-dot{width:7px;height:7px;border-radius:50%;background:#969aa6;flex:none}
#${PILL}[data-state="live"]{border-color:#69ce8b!important;color:#bff5d1!important}#${PILL}[data-state="live"] .catnap-radio-dot{background:#72ed9b}
#${PILL}[data-source-kind="aiu"]{top:20px!important;right:clamp(160px,10vw,220px)!important;bottom:auto!important;padding:6px 9px!important;font-size:11px!important}
#${ROOT} .ct-aiu{flex-direction:column;align-items:flex-end;justify-content:center}
#${ROOT} .ct-aiu-logo{max-height:33px;filter:brightness(0) invert(1)}
#${ROOT} .ct-aiu .ct-radio-status{display:block;margin:2px 0 0;padding:0;border:0;background:none;color:#959aa8;font:600 9px/11px system-ui,sans-serif;white-space:nowrap;cursor:pointer}
#${ROOT} .ct-radio-caption{display:flex;align-items:center;justify-content:flex-end;gap:6px;max-width:100%;min-width:0}
#${ROOT} .ct-radio-listener{color:#b5ebc4;font:500 9px/11px system-ui,sans-serif;text-decoration:none;white-space:nowrap}
#${ROOT} .ct-radio-listener:hover{text-decoration:underline}
#${ROOT} .ct-radio-listener[hidden]{display:none!important}
#${ROOT} .ct-aiu .ct-radio-caption .ct-radio-status{margin:0}
#${ROOT} .ct-aiu.ct-radio-on-air .ct-aiu-logo{filter:brightness(0) saturate(100%) invert(82%) sepia(35%) saturate(754%) hue-rotate(78deg) brightness(105%) contrast(95%)}
#${ROOT} .ct-aiu.ct-radio-on-air .ct-radio-status,#${ROOT} .ct-aiu.ct-radio-on-air .ct-aiu-fallback{color:#8df2ac}
@media(max-width:840px){#${ROOT} .ct-aiu-logo{max-height:28px}}
@media(max-width:610px){#${ROOT} .ct-radio-caption{gap:4px}#${ROOT} .ct-radio-listener{font-size:8px}#${ROOT} .ct-aiu:has(.ct-radio-listener:not([hidden])){flex-basis:150px;max-width:170px}}
@media(max-width:520px){#${PILL}[data-source-kind="aiu"]{top:88px!important;right:12px!important;padding:5px 7px!important;font-size:10px!important}}
`;
      document.documentElement.appendChild(element);
    }
    async function open(){
      try{const result=await runtime.sendMessage({target:'catnap-radio-ui',action:'open'});if(result?.ok!==true)throw Error('Controls unavailable');}
      catch{if(pill)pill.title='Open Radio controls from the extension toolbar.';}
    }
    function paintHeaders(){
      // Theatre can close/reopen repeatedly during a long session. Do not keep
      // removed header nodes or their listeners alive in the status display.
      for(const label of boundHeaders)if(!label.isConnected){label.removeEventListener('click',open);boundHeaders.delete(label);}
      for(const group of [createdLabels,createdCaptions,createdLinks])for(const node of group)if(!node.isConnected)group.delete(node);
      for(const header of document.querySelectorAll('#'+ROOT+' .ct-aiu')){
        header.classList.toggle('ct-radio-on-air',live());
        let label=header.querySelector('.ct-radio-status');
        if(!label){label=document.createElement('button');label.type='button';label.className='ct-radio-status';label.dataset.catnapRadioStatus='true';header.appendChild(label);createdLabels.add(label);}
        let caption=header.querySelector('.ct-radio-caption');
        if(!caption){caption=document.createElement('div');caption.className='ct-radio-caption';header.append(caption);createdCaptions.add(caption);}
        if(label.parentElement!==caption)caption.append(label);
        let link=caption.querySelector('.ct-radio-listener');
        if(!link){link=document.createElement('a');link.className='ct-radio-listener';link.textContent='listen.catnapradio.com';link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label','Open the live Catnap listener');caption.insertBefore(link,label);createdLinks.add(link);}
        if(link.textContent!=='listen.catnapradio.com')link.textContent='listen.catnapradio.com';
        link.hidden=!(live()&&current.listenerUrl===LISTENER);if(link.hidden)link.removeAttribute('href');else link.href=LISTENER;
        if(!boundHeaders.has(label)){label.addEventListener('click',open);boundHeaders.add(label);}
        const text=live()?'On Air':'No Radio';if(label.textContent!==text)label.textContent=text;
        label.setAttribute('aria-label',text+' · open Radio controls');
        label.title=live()?'This tab is broadcasting. Open Radio controls.':'This tab is not broadcasting. Open Radio controls.';
      }
    }
    function clearHeaders(){
      for(const label of boundHeaders){label.removeEventListener('click',open);if(!createdLabels.has(label)){label.textContent='No Radio';label.setAttribute('aria-label','No Radio · open Radio controls');label.title='This tab is not broadcasting. Open Radio controls.';}}boundHeaders.clear();
      for(const link of createdLinks)link.remove();createdLinks.clear();
      for(const caption of createdCaptions){for(const child of Array.from(caption.children))if(!createdLabels.has(child))caption.parentElement?.insertBefore(child,caption);caption.remove();}createdCaptions.clear();
      for(const label of createdLabels)label.remove();createdLabels.clear();
      for(const header of document.querySelectorAll('#'+ROOT+' .ct-aiu'))header.classList.remove('ct-radio-on-air');
    }
    function removePill(){if(pill){pill.remove();pill=null;}}
    function render(){
      if(disposed)return;
      const sourceKind=kind();
      if(!sourceKind){removePill();clearHeaders();return;}
      style();paintHeaders();
      const adapter=sourceKind==='suno'&&!current.radioOnly?window.CatnapTheatreRadioUI:null;
      if(typeof adapter?.update==='function'){adapter.update(current,open);removePill();return;}
      // Legacy Lite launch handlers remain owned by Lite. A separate Radio pill
      // can coexist safely, while the known Lite header gets the same status.
      if(!pill?.isConnected){pill=document.createElement('button');pill.id=PILL;pill.type='button';pill.innerHTML='<span class="catnap-radio-dot" aria-hidden="true"></span><span class="catnap-radio-label"></span>';pill.addEventListener('click',open);document.documentElement.appendChild(pill);}
      const text=live()?'On Air':'Radio',label=pill.querySelector('.catnap-radio-label');if(label.textContent!==text)label.textContent=text;
      pill.dataset.state=live()?'live':current.state==='live'?'idle':current.state;pill.dataset.sourceKind=sourceKind;
      pill.setAttribute('aria-label',live()?'On Air · open Radio controls':'Open Radio controls');
      pill.title=live()?'This tab is broadcasting. Open Radio controls.':['starting','connecting','reconnecting'].includes(current.state)&&current.source?(current.state==='reconnecting'?'Radio is reconnecting. Open controls.':'Radio is starting. Open controls.'):current.state==='error'?'Radio is not live. Open controls.':'Open Radio controls. Start broadcasting from the extension toolbar.';
      pill.hidden=sourceKind==='suno'&&!!document.getElementById(ROOT);
      if(sourceKind==='suno')pill.style.setProperty('bottom',document.getElementById(LAUNCH)?'152px':'104px','important');
    }
    function apply(value){const next=sanitize(value);if(!next)return false;current=next;epoch++;render();return true;}
    function receive(message,sender){if(message?.target!=='catnap-radio-state'||!trustedSender(runtime,sender))return;apply(message);}
    async function poll(){
      render();if(disposed||inFlight||!kind())return;
      inFlight=true;const before=epoch,url=window.location.href;let timeout;
      try{
        const result=await Promise.race([runtime.sendMessage({target:'catnap-radio-ui',action:'status'}),new Promise(resolve=>{timeout=window.setTimeout(()=>resolve(null),REQUEST_MS);})]);
        if(disposed||before!==epoch||url!==window.location.href)return;
        if(result?.ok===true&&apply(result))return;
        apply({...current,state:'error',source:false});
      }catch{if(!disposed&&before===epoch)apply({...current,state:'error',source:false});}
      finally{window.clearTimeout(timeout);inFlight=false;}
    }
    function relevant(node){return node?.nodeType===1&&(node.id===ROOT||node.id===LAUNCH||node.matches?.('.ct-aiu')||node.querySelector?.('#'+ROOT+',#'+LAUNCH+',.ct-aiu'));}
    const observer=new window.MutationObserver(records=>{if(records.some(record=>Array.from(record.addedNodes).some(relevant)||Array.from(record.removedNodes).some(relevant)))render();});
    observer.observe(document.documentElement,{childList:true,subtree:true});
    const resume=()=>{void poll();};
    runtime.onMessage?.addListener(receive);window.addEventListener('pageshow',resume);document.addEventListener('visibilitychange',resume);
    const api={version:SCRIPT_VERSION,refresh:poll,status:()=>({...current}),dispose(){disposed=true;window.clearInterval(timer);observer.disconnect();runtime.onMessage?.removeListener?.(receive);window.removeEventListener('pageshow',resume);document.removeEventListener('visibilitychange',resume);removePill();clearHeaders();installed.delete(window);}};
    installed.set(window,api);timer=window.setInterval(()=>{void poll();},POLL_MS);void poll();return api;
  }
  return {SCRIPT_VERSION,POLL_MS,sanitize,trustedSender,install};
});
