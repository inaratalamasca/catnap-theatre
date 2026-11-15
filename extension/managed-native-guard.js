/* Catnap native audio guard, version 0.6.0. MAIN world, document_start.
 * Change summary: native playback is inert until explicitly enabled, then each
 * audible lease is bound to an exact song, media element and current source.
 * Source changes revoke the lease synchronously. Stage never grants a lease.
 * This guards cooperative Suno playback; it is not a security boundary against
 * the web page itself. It reads no account/session data and makes no requests.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else if(!root.CatnapManagedNative)root.CatnapManagedNative=api.install(root);})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SCRIPT_VERSION='0.6.0',CHANNEL='catnap-managed-native-v1';
  function install(win){
    const doc=win.document,proto=win.HTMLMediaElement?.prototype;
    if(!doc||!proto)return {command:()=>({ready:false,error:'Native media controls are unavailable.'})};
    const originalPlay=proto.play,originalPause=proto.pause,originalSetAttribute=win.Element.prototype.setAttribute;
    const descriptors={};for(const key of ['src','srcObject','muted','autoplay','loop'])descriptors[key]=Object.getOwnPropertyDescriptor(proto,key);
    const sourceProto=win.HTMLSourceElement?.prototype,sourceDescriptor=sourceProto&&Object.getOwnPropertyDescriptor(sourceProto,'src');
    let enabled=false,lease=null,generation=0,disposed=false;
    const saved=new Map();
    const native=el=>el instanceof win.HTMLMediaElement&&!el.closest('#catnap-theater-root');
    const media=()=>Array.from(doc.querySelectorAll('audio,video')).filter(native);
    const source=el=>el.currentSrc||el.src||'';
    const valid=el=>enabled&&lease?.media===el&&lease.source===source(el)&&!!lease.source;
    function remember(el){if(!saved.has(el))saved.set(el,{muted:el.muted,loop:el.loop});}
    function setMuted(el,value){const setter=descriptors.muted?.set;if(setter)setter.call(el,value);else el.muted=value;}
    function silence(el){remember(el);setMuted(el,true);if(descriptors.loop?.set)descriptors.loop.set.call(el,false);try{originalPause.call(el);}catch{/* Detached/uninitialized media stays muted. */}}
    function emit(type,extra={}){try{win.postMessage({channel:CHANNEL,type,generation,...extra},win.location.origin);}catch{/* Diagnostics never reopen the gate. */}}
    function block(reason='',notify=false){const hadLease=!!lease;lease=null;for(const el of media())silence(el);if(notify&&hadLease)emit('blocked',{reason});}
    function changing(el){if(!enabled||!native(el))return;if(lease?.media===el)block('The native audio source changed.',true);else silence(el);}
    function expectedSong(){const anchor=doc.querySelector('a[aria-label^="Playbar: Title for "]');try{return /^\/song\/([a-f0-9-]{36})\/?$/i.exec(new URL(anchor?.href||'',win.location.href).pathname)?.[1]?.toLowerCase()||'';}catch{return '';}}
    function denied(){return Promise.reject(new win.DOMException('Managed show is holding native audio. Use Theatre Play.','NotAllowedError'));}
    proto.play=function(...args){if(enabled&&native(this)&&!valid(this)){silence(this);return denied();}return originalPlay.apply(this,args);};
    for(const key of ['src','srcObject']){
      const descriptor=descriptors[key];if(!descriptor?.set)continue;
      Object.defineProperty(proto,key,{...descriptor,set(value){changing(this);return descriptor.set.call(this,value);}});
    }
    if(descriptors.muted?.set)Object.defineProperty(proto,'muted',{...descriptors.muted,set(value){if(enabled&&native(this)&&!valid(this)&&!value)return descriptors.muted.set.call(this,true);return descriptors.muted.set.call(this,value);}});
    if(descriptors.autoplay?.set)Object.defineProperty(proto,'autoplay',{...descriptors.autoplay,set(value){return descriptors.autoplay.set.call(this,enabled&&native(this)?false:value);}});
    if(descriptors.loop?.set)Object.defineProperty(proto,'loop',{...descriptors.loop,set(value){if(enabled&&native(this)){remember(this);return descriptors.loop.set.call(this,false);}return descriptors.loop.set.call(this,value);}});
    if(sourceDescriptor?.set)Object.defineProperty(sourceProto,'src',{...sourceDescriptor,set(value){if(this.parentElement instanceof win.HTMLMediaElement)changing(this.parentElement);return sourceDescriptor.set.call(this,value);}});
    win.Element.prototype.setAttribute=function(name,value){
      const attr=String(name).toLowerCase();
      if(enabled&&native(this)){
        if(attr==='src')changing(this);
        if(attr==='autoplay')return;
        if(attr==='loop'){remember(this);if(descriptors.loop?.set)descriptors.loop.set.call(this,false);return;}
        if(attr==='muted')remember(this);
      }else if(enabled&&this instanceof win.HTMLSourceElement&&this.parentElement instanceof win.HTMLMediaElement&&attr==='src')changing(this.parentElement);
      return originalSetAttribute.call(this,name,value);
    };
    function onPlay(event){if(enabled&&native(event.target)&&!valid(event.target)){silence(event.target);event.stopImmediatePropagation();}}
    function onLoadStart(event){if(enabled&&native(event.target)&&lease?.media===event.target&&!valid(event.target))block('The native audio source changed.',true);}
    function onEnded(event){if(!enabled||!native(event.target))return;const current=lease?.media===event.target;if(current){block();emit('ended');}else silence(event.target);event.stopImmediatePropagation();}
    doc.addEventListener('play',onPlay,true);doc.addEventListener('playing',onPlay,true);doc.addEventListener('ended',onEnded,true);doc.addEventListener('loadstart',onLoadStart,true);
    const observer=new win.MutationObserver(records=>{if(!enabled)return;for(const record of records){if(record.type==='attributes'&&record.attributeName==='src'&&native(record.target)&&lease?.media===record.target&&!valid(record.target))block('The native audio source changed.',true);}for(const el of media())if(!valid(el)){if(el.autoplay&&descriptors.autoplay?.set)descriptors.autoplay.set.call(el,false);silence(el);}});
    observer.observe(doc,{subtree:true,childList:true,attributes:true,attributeFilter:['src','autoplay','loop']});
    function status(){return {ready:!disposed,version:SCRIPT_VERSION,enabled,permitted:!!lease,generation,songId:lease?.songId||null};}
    async function command(message={}){
      if(disposed)throw Error('The native media guard has closed.');
      if(message.generation!==undefined){if(!Number.isInteger(message.generation)||message.generation<0)throw Error('Invalid playback generation.');if(message.generation<generation&&!(message.action==='enable'&&!enabled))throw Error('This playback command is stale.');generation=message.generation;}
      switch(message.action){
        case 'status':return status();
        case 'enable':enabled=true;block();return status();
        case 'block':enabled=true;block();return status();
        case 'pause':block();return status();
        case 'play':{
          if(!enabled)throw Error('Enable managed playback before playing native audio.');
          const id=String(message.songId||'').toLowerCase();if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id)||expectedSong()!==id){block();throw Error('The selected Suno song has not loaded into its native player.');}
          const elements=media().filter(el=>source(el));const el=elements.find(el=>el.tagName==='AUDIO'&&Number.isFinite(el.duration)&&el.duration>0)||elements.find(el=>el.tagName==='AUDIO');
          if(!el){block();throw Error('Suno has not exposed a usable native audio element.');}
          if(message.sourceKey&&message.sourceKey!==source(el)){block();throw Error('Suno changed the prepared audio source.');}
          block();lease={media:el,source:source(el),songId:id};remember(el);setMuted(el,saved.get(el).muted);
          if(message.restart===true)try{el.currentTime=0;}catch{block();throw Error('The selected Suno song could not be reset before playback.');}
          try{await originalPlay.call(el);}catch(error){block();throw error;}
          if(!valid(el)){block();throw Error('Suno changed the audio source before playback could start.');}
          return status();
        }
        case 'disable':block();enabled=false;for(const [el,prefs]of saved)try{setMuted(el,prefs.muted);if(descriptors.loop?.set)descriptors.loop.set.call(el,prefs.loop);}catch{}saved.clear();return status();
        default:throw Error('Unsupported managed native command.');
      }
    }
    function dispose(){block();enabled=false;disposed=true;observer.disconnect();doc.removeEventListener('play',onPlay,true);doc.removeEventListener('playing',onPlay,true);doc.removeEventListener('ended',onEnded,true);doc.removeEventListener('loadstart',onLoadStart,true);proto.play=originalPlay;for(const [key,descriptor]of Object.entries(descriptors))if(descriptor)Object.defineProperty(proto,key,descriptor);if(sourceDescriptor)Object.defineProperty(sourceProto,'src',sourceDescriptor);win.Element.prototype.setAttribute=originalSetAttribute;for(const [el,prefs]of saved)try{setMuted(el,prefs.muted);if(descriptors.loop?.set)descriptors.loop.set.call(el,prefs.loop);}catch{}saved.clear();}
    return {command,status,dispose};
  }
  return {SCRIPT_VERSION,CHANNEL,install};
});
