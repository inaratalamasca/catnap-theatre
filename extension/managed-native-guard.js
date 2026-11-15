/* Catnap native audio guard, version 0.6.3. MAIN world, document_start.
 * Change summary: native playback is inert until explicitly enabled, then each
 * audible lease is bound to an exact song, media element and current source.
 * Source/load changes revoke the lease synchronously. Detached Audio elements
 * are tracked and end events are caught before React's document listeners.
 * Integrity is verified rather than inferring protection from installed state.
 * This guards cooperative Suno playback; it is not a security boundary against
 * the web page itself. It reads no account/session data and makes no requests.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else if(!root.CatnapManagedNative)root.CatnapManagedNative=api.install(root);})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SCRIPT_VERSION='0.6.3',CHANNEL='catnap-managed-native-v1';
  function install(win){
    const doc=win.document,proto=win.HTMLMediaElement?.prototype;
    if(!doc||!proto)return {command:()=>({ready:false,error:'Native media controls are unavailable.'})};
    const originalPlay=proto.play,originalPause=proto.pause,originalLoad=proto.load,originalSetAttribute=win.Element.prototype.setAttribute,originalAudio=win.Audio,originalCreate=win.Document.prototype.createElement;
    const descriptors={};for(const key of ['src','srcObject','muted','autoplay','loop'])descriptors[key]=Object.getOwnPropertyDescriptor(proto,key);
    const sourceProto=win.HTMLSourceElement?.prototype,sourceDescriptor=sourceProto&&Object.getOwnPropertyDescriptor(sourceProto,'src');
    let enabled=false,lease=null,generation=0,disposed=false;
    const saved=new Map(),known=new WeakSet(),tracked=new Set();
    const native=el=>el instanceof win.HTMLMediaElement&&!el.closest('#catnap-theater-root');
    function track(el){if(el instanceof win.HTMLMediaElement&&!known.has(el)){known.add(el);tracked.add(typeof win.WeakRef==='function'?new win.WeakRef(el):el);el.addEventListener('ended',onEnded,true);el.addEventListener('play',onPlay,true);el.addEventListener('playing',onPlay,true);el.addEventListener('loadstart',onLoadStart,true);if(enabled&&el.tagName==='AUDIO'&&native(el))silence(el);}return el;}
    function media(){const found=new Set(Array.from(doc.querySelectorAll('audio,video')).map(track));for(const ref of tracked){const el=typeof ref.deref==='function'?ref.deref():ref;if(el)found.add(el);else tracked.delete(ref);}return [...found].filter(native);}
    const source=el=>el.currentSrc||el.src||'';
    const valid=el=>enabled&&lease?.media===el&&lease.source===source(el)&&!!lease.source;
    function remember(el){if(!saved.has(el))saved.set(el,{muted:el.muted,loop:el.loop});}
    function setMuted(el,value){const setter=descriptors.muted?.set;if(setter)setter.call(el,value);else el.muted=value;}
    function silence(el){remember(el);setMuted(el,true);if(descriptors.loop?.set)descriptors.loop.set.call(el,false);try{originalPause.call(el);}catch{/* Detached/uninitialized media stays muted. */}}
    function emit(type,extra={}){try{win.postMessage({channel:CHANNEL,type,generation,...extra},win.location.origin);}catch{/* Diagnostics never reopen the gate. */}}
    function block(reason='',notify=false){const hadLease=!!lease;lease=null;for(const el of media())silence(el);if(notify&&hadLease)emit('blocked',{reason});}
    function changing(el){if(!enabled||!native(el))return;if(lease?.media===el)block('The native audio source changed.',true);else silence(el);}
    function expectedSong(){const anchor=doc.querySelector('a[aria-label^="Playbar: Title for "]');try{return /^\/song\/([a-f0-9-]{36})\/?$/i.exec(new URL(anchor?.href||'',win.location.href).pathname)?.[1]?.toLowerCase()||'';}catch{return '';}}
    function candidateAudio(){const candidates=media().filter(el=>el.tagName==='AUDIO'&&source(el)),id=expectedSong();const matching=id?candidates.filter(el=>source(el).toLowerCase().includes(id)):[];if(matching.length===1)return matching[0];if(matching.length>1)return null;return candidates.length===1?candidates[0]:null;}
    function denied(){return Promise.reject(new win.DOMException('Managed show is holding native audio. Use Theatre Play.','NotAllowedError'));}
    const guardedPlay=function(...args){track(this);if(enabled&&native(this)&&!valid(this)){silence(this);return denied();}return originalPlay.apply(this,args);};proto.play=guardedPlay;
    const guardedLoad=function(...args){track(this);changing(this);return originalLoad.apply(this,args);};proto.load=guardedLoad;
    const guardedCreate=function(...args){return track(originalCreate.apply(this,args));};win.Document.prototype.createElement=guardedCreate;
    let guardedAudio=originalAudio;
    if(typeof originalAudio==='function'){guardedAudio=function Audio(...args){return track(new originalAudio(...args));};guardedAudio.prototype=originalAudio.prototype;Object.setPrototypeOf(guardedAudio,originalAudio);win.Audio=guardedAudio;}
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
    // Window capture precedes document/React capture regardless of listener
    // registration order. Prototype source/load guards remain the backstop if
    // an older window-level listener attempts to advance first.
    win.addEventListener('ended',onEnded,true);
    doc.addEventListener('play',onPlay,true);doc.addEventListener('playing',onPlay,true);doc.addEventListener('ended',onEnded,true);doc.addEventListener('loadstart',onLoadStart,true);
    const observer=new win.MutationObserver(records=>{if(!enabled)return;for(const record of records){if(record.type==='attributes'&&record.attributeName==='src'&&native(record.target)&&lease?.media===record.target&&!valid(record.target))block('The native audio source changed.',true);}for(const el of media())if(!valid(el)){if(el.autoplay&&descriptors.autoplay?.set)descriptors.autoplay.set.call(el,false);silence(el);}});
    observer.observe(doc,{subtree:true,childList:true,attributes:true,attributeFilter:['src','autoplay','loop']});
    const installedSetters={};for(const key of ['src','srcObject','muted','autoplay','loop'])installedSetters[key]=Object.getOwnPropertyDescriptor(proto,key)?.set;
    function status(){
      const details={play:proto.play===guardedPlay,load:proto.load===guardedLoad,src:Object.getOwnPropertyDescriptor(proto,'src')?.set===installedSetters.src,muted:Object.getOwnPropertyDescriptor(proto,'muted')?.set===installedSetters.muted,loop:Object.getOwnPropertyDescriptor(proto,'loop')?.set===installedSetters.loop,audioConstructor:win.Audio===guardedAudio,createElement:win.Document.prototype.createElement===guardedCreate};
      const integrity=!disposed&&Object.values(details).every(Boolean),candidates=media(),audio=candidateAudio();
      // This source key is private transport state for the bound extension
      // adapter. Never copy it into listener metadata or diagnostic logs.
      return {ready:integrity,version:SCRIPT_VERSION,integrity,integrityDetails:details,enabled,permitted:!!lease&&valid(lease.media),generation,songId:lease?.songId||null,nativeMediaCount:candidates.length,nativeAudioCount:candidates.filter(el=>el.tagName==='AUDIO').length,detachedMediaCount:candidates.filter(el=>!el.isConnected).length,nativeAudio:audio?{songId:expectedSong(),sourceKey:source(audio),readyState:audio.readyState,durationSeconds:Number.isFinite(audio.duration)?audio.duration:null}:null};
    }
    async function command(message={}){
      if(disposed)throw Error('The native media guard has closed.');
      if(message.action==='status')return status();
      if(message.generation!==undefined){if(!Number.isInteger(message.generation)||message.generation<0)throw Error('Invalid playback generation.');if(message.generation<generation&&!(message.action==='enable'&&!enabled))throw Error('This playback command is stale.');generation=message.generation;}
      switch(message.action){
        case 'status':return status();
        case 'enable':enabled=true;block();return status();
        case 'block':enabled=true;block();return status();
        case 'pause':block();return status();
        case 'play':{
          if(!enabled)throw Error('Enable managed playback before playing native audio.');
          if(!status().integrity){block();throw Error('Native playback protection changed. Refresh the intended Suno tab before linking it again.');}
          const id=String(message.songId||'').toLowerCase();if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id)||expectedSong()!==id){block();throw Error('The selected Suno song has not loaded into its native player.');}
          const el=candidateAudio();
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
    function dispose(){block();enabled=false;disposed=true;observer.disconnect();win.removeEventListener('ended',onEnded,true);doc.removeEventListener('play',onPlay,true);doc.removeEventListener('playing',onPlay,true);doc.removeEventListener('ended',onEnded,true);doc.removeEventListener('loadstart',onLoadStart,true);for(const ref of tracked){const el=typeof ref.deref==='function'?ref.deref():ref;if(el){el.removeEventListener('ended',onEnded,true);el.removeEventListener('play',onPlay,true);el.removeEventListener('playing',onPlay,true);el.removeEventListener('loadstart',onLoadStart,true);}}proto.play=originalPlay;proto.load=originalLoad;win.Audio=originalAudio;win.Document.prototype.createElement=originalCreate;for(const [key,descriptor]of Object.entries(descriptors))if(descriptor)Object.defineProperty(proto,key,descriptor);if(sourceDescriptor)Object.defineProperty(sourceProto,'src',sourceDescriptor);win.Element.prototype.setAttribute=originalSetAttribute;for(const [el,prefs]of saved)try{setMuted(el,prefs.muted);if(descriptors.loop?.set)descriptors.loop.set.call(el,prefs.loop);}catch{}saved.clear();tracked.clear();}
    return {command,status,dispose};
  }
  return {SCRIPT_VERSION,CHANNEL,install};
});
