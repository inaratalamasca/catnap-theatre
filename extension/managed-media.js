/* Catnap managed browser-media adapter, version 0.6.4.
 * Change summary: exact-row Suno playback behind the MAIN-world native guard,
 * including privately observed detached audio; source keys never leave that
 * bound extension transport. Selected media is checked atomically before play.
 * same-tab YouTube embeds are staged paused and controlled by postMessage.
 * This file never fetches/duplicates audio, navigates tabs or owns credentials.
 */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./managed-player.js'):root.CatnapManagedPlayer);if(typeof module==='object'&&module.exports)module.exports=api;else root.CatnapManagedMedia=api;})(typeof globalThis!=='undefined'?globalThis:this,function(core){
  'use strict';
  const SCRIPT_VERSION='0.6.4',NATIVE_CHANNEL='catnap-managed-native-v1';
  const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
  function sunoId(value){try{const u=new URL(value);const match=/^\/song\/([^/]+)\/?$/.exec(u.pathname);return ['suno.com','www.suno.com'].includes(u.hostname)&&match&&UUID.test(match[1])?match[1].toLowerCase():null;}catch{return null;}}
  function youtubeId(value){try{const u=new URL(value);let id='';if(u.hostname==='youtu.be')id=u.pathname.split('/')[1];else if(['youtube.com','www.youtube.com','m.youtube.com','www.youtube-nocookie.com'].includes(u.hostname))id=u.pathname==='/watch'?u.searchParams.get('v'):u.pathname.split('/').filter(Boolean).find((x,i,a)=>i>0&&['embed','shorts','live'].includes(a[i-1]));return /^[A-Za-z0-9_-]{11}$/.test(id||'')?id:null;}catch{return null;}}
  function findNativePlay(doc,id){
    if(!UUID.test(id||''))return null;id=id.toLowerCase();const candidates=new Set(),root=doc.querySelector('#catnap-theater-root');
    function eligible(scope){
      if(!scope||['BODY','HTML','MAIN'].includes(scope.tagName)||scope.contains(root))return [];
      const ids=new Set(Array.from(scope.querySelectorAll('a[href*="/song/"]')).map(anchor=>sunoId(anchor.href)).filter(Boolean));if(ids.size!==1||!ids.has(id))return [];
      return Array.from(scope.querySelectorAll('button,[role="button"]')).filter(button=>{
        const label=(button.getAttribute('aria-label')||button.title||'').trim();
        return !button.disabled&&!button.hasAttribute('disabled')&&button.getAttribute('aria-disabled')!=='true'&&!button.closest('[hidden],[inert],[aria-hidden="true"]')&&/^play(?:\s|$)/i.test(label)&&!/\bplaylist\b/i.test(label);
      });
    }
    for(const anchor of doc.querySelectorAll('a[href*="/song/"]')){
      if(anchor.closest('#catnap-theater-root')||anchor.matches('[aria-label^="Playbar:"]')||sunoId(anchor.href)!==id)continue;
      // Suno currently exposes its exact clip row as role=group, and its Play
      // control is a DIV role=button. The title link sits six levels below the
      // row; shallow HTML-button-only scans never reach that control.
      const group=anchor.closest('[role="group"]');let found=eligible(group);
      if(!found.length){let parent=anchor.parentElement;for(let depth=0;parent&&depth<12;parent=parent.parentElement,depth++){
        if(['BODY','HTML','MAIN'].includes(parent.tagName)||parent.contains(root))break;
        const ids=new Set(Array.from(parent.querySelectorAll('a[href*="/song/"]')).map(a=>sunoId(a.href)).filter(Boolean));if(ids.size>1)break;
        found=eligible(parent);if(found.length)break;
      }}
      // Duplicate title/cover links within one row resolve to the same node.
      // Two eligible controls or duplicate rendered rows remain ambiguous.
      for(const button of found)candidates.add(button);
    }
    return candidates.size===1?[...candidates][0]:null;
  }
  function create({document:doc=globalThis.document,window:win=globalThis.window,guard,getContainer=()=>doc.querySelector('#catnap-theater-root .ct-art-frame'),onEnded=()=>{},onError=()=>{},onProgress=()=>{},onPlaying=()=>{},onPaused=()=>{},onAutoplayBlocked=()=>{}}={}){
    if(typeof guard!=='function')throw Error('A MAIN-world native media guard is required.');
    let generation=0,current=null,frame=null,frameOrigin='',ready=false,wasPlaying=false,pendingPlay=null,handshake=null,readyWaiters=[],destroyed=false,startedGeneration=-1,nativeTransition=-1;
    const delay=ms=>new Promise(resolve=>win.setTimeout(resolve,ms));
    function nativeCurrentId(){return sunoId(doc.querySelector('a[aria-label^="Playbar: Title for "]')?.href);}
    const nativeButton=id=>findNativePlay(doc,id);
    function post(command,args=[]){if(frame?.contentWindow)frame.contentWindow.postMessage(JSON.stringify({event:'command',func:command,args,id:'catnap-managed-youtube'}),frameOrigin);}
    function listen(){if(frame?.contentWindow)frame.contentWindow.postMessage(JSON.stringify({event:'listening',id:'catnap-managed-youtube'}),frameOrigin);}
    function cancelPending(message){if(pendingPlay){win.clearTimeout(pendingPlay.timer);pendingPlay.reject(Error(message));pendingPlay=null;}for(const waiter of readyWaiters){win.clearTimeout(waiter.timer);waiter.reject(Error(message));}readyWaiters=[];}
    function removeFrame(){cancelPending('The selected song changed before playback started.');if(handshake!==null)win.clearInterval(handshake);handshake=null;frame?.remove();frame=null;ready=false;wasPlaying=false;frameOrigin='';}
    function notifyError(message){const token=generation;cancelPending(message);post('pauseVideo');onError(token,message);}
    function notifyBlocked(message){
      if(wasPlaying)return;
      if(pendingPlay){const pending=pendingPlay;pendingPlay=null;win.clearTimeout(pending.timer);const error=Error(message);error.code='AUTOPLAY_BLOCKED';pending.reject(error);}
      onAutoplayBlocked(generation,message);
    }
    function stateChange(state){
      if(state===1){wasPlaying=true;onPlaying(generation);if(pendingPlay){win.clearTimeout(pendingPlay.timer);pendingPlay.resolve();pendingPlay=null;}}
      if(state===2&&wasPlaying){wasPlaying=false;onPaused(generation);}
      if(state===0&&wasPlaying){wasPlaying=false;post('pauseVideo');onEnded(generation);}
    }
    function onMessage(event){
      if(event.source===win&&event.origin===win.location.origin&&event.data?.channel===NATIVE_CHANNEL){
        if(!current||core.playback(current).provider!=='suno'||event.data.generation!==generation)return;
        if(event.data.type==='ended'){const token=event.data.generation;void guard({action:'status',generation:token}).then(status=>{if(status.enabled&&!status.permitted&&generation===token)onEnded(token);}).catch(error=>{if(generation===token)onError(token,error.message);});}
        if(event.data.type==='blocked'){const token=event.data.generation;void guard({action:'status',generation:token}).then(status=>{if(generation===token&&nativeTransition!==token&&!status.permitted)onError(token,event.data.reason||'Native playback was held because its source changed.');}).catch(error=>{if(generation===token&&nativeTransition!==token)onError(token,error.message);});}
        return;
      }
      if(!frame||event.source!==frame.contentWindow||event.origin!==frameOrigin)return;
      let data=event.data;if(typeof data==='string'){if(data.length>16000)return;try{data=JSON.parse(data);}catch{return;}}if(!data||typeof data!=='object')return;
      if(data.event==='onReady'){ready=true;if(handshake!==null)win.clearInterval(handshake);handshake=null;post('addEventListener',['onStateChange']);post('addEventListener',['onError']);post('addEventListener',['onAutoplayBlocked']);for(const waiter of readyWaiters){win.clearTimeout(waiter.timer);waiter.resolve();}readyWaiters=[];}
      if(data.event==='onStateChange')stateChange(Number(data.info));
      if(data.event==='onAutoplayBlocked')notifyBlocked('YouTube blocked autoplay. Press Play inside the video to continue.');
      if(data.event==='onError')notifyError('YouTube could not play this video (code '+Number(data.info)+'). It may be unavailable or disallow embedding.');
      if(data.event==='infoDelivery'&&data.info&&typeof data.info==='object'){
        if(Number.isInteger(data.info.playerState))stateChange(data.info.playerState);
        const elapsed=Number(data.info.currentTime),duration=Number(data.info.duration);if(Number.isFinite(elapsed)&&Number.isFinite(duration))onProgress({elapsed,duration,generation});
      }
    }
    win.addEventListener('message',onMessage);
    function readyForYoutube(){if(ready)return Promise.resolve();return new Promise((resolve,reject)=>{const waiter={resolve,reject,timer:win.setTimeout(()=>{readyWaiters=readyWaiters.filter(x=>x!==waiter);reject(Error('The YouTube player did not become ready. Check embed restrictions or your connection.'));},10000)};readyWaiters.push(waiter);listen();});}
    async function stopAll(context={}){
      generation=context.generation??generation;post('pauseVideo');removeFrame();current=null;
      const status=await guard({action:'block',generation});if(!status?.ready||!status.enabled||status.permitted)throw Error('Native audio could not be held safely. Managed playback is unavailable.');
    }
    async function stage(entry,context={}){
      if(destroyed)throw Error('The media adapter has closed.');generation=context.generation??generation;const token=generation;current=entry;const source=core.playback(entry);
      const status=await guard({action:'block',generation});if(token!==generation)throw Error('The selected show entry changed.');if(!status?.ready||!status.enabled||status.permitted)throw Error('Native audio could not be held safely.');
      if(source.provider==='suno'){if(!sunoId(source.url))throw Error('Resolve this Suno short link before playing the show entry.');return;}
      const id=youtubeId(source.url);if(!id)throw Error('This YouTube link does not identify one supported video.');
      const container=getContainer();if(!container)throw Error('Open Theatre before staging a YouTube video.');
      const url=new URL('https://www.youtube-nocookie.com/embed/'+id);url.searchParams.set('enablejsapi','1');url.searchParams.set('origin',win.location.origin);url.searchParams.set('autoplay','0');url.searchParams.set('playsinline','1');url.searchParams.set('rel','0');frameOrigin=url.origin;
      frame=doc.createElement('iframe');frame.className='ct-managed-youtube';frame.title='YouTube show source';frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';frame.referrerPolicy='strict-origin-when-cross-origin';frame.allowFullscreen=true;frame.src=url.href;
      Object.assign(frame.style,{position:'absolute',inset:'0',width:'100%',height:'100%',minWidth:'200px',minHeight:'200px',border:'0',zIndex:'4',background:'#100e18'});container.appendChild(frame);frame.addEventListener('load',listen);handshake=win.setInterval(listen,500);listen();
    }
    async function play(entry,context={}){
      const token=context.generation??generation;if(token!==generation||current?.id!==entry.id)throw Error('The selected show entry changed.');
      const source=core.playback(entry);
      if(source.provider==='youtube'){
        await readyForYoutube();if(token!==generation||!frame)throw Error('The selected show entry changed.');
        return new Promise((resolve,reject)=>{pendingPlay={resolve,reject,timer:win.setTimeout(()=>notifyBlocked('YouTube did not start. Press Play inside the video to continue, or check its embed permissions.'),8000)};post('playVideo');});
      }
      const id=sunoId(source.url);if(!id)throw Error('This Suno song needs a canonical song link.');
      nativeTransition=token;
      try{
      const held=await guard({action:'block',generation});
      if(token!==generation)throw Error('The selected show entry changed.');
      const nativeAudio=()=>Array.from(doc.querySelectorAll('audio')).find(el=>!el.closest('#catnap-theater-root')&&(el.currentSrc||el.src));
      const changingSong=nativeCurrentId()!==id,previousSource=Object.hasOwn(held,'nativeAudio')?held.nativeAudio?.sourceKey||'':nativeAudio()?.currentSrc||nativeAudio()?.src||'';
      if(changingSong){const button=nativeButton(id);if(!button)throw Error('Open the destination Suno playlist and render this song before playing it. No safe native Play button was found.');button.click();}
      const deadline=Date.now()+7000;
      while(token===generation&&Date.now()<deadline){const health=await guard({action:'status',generation}),audio=nativeAudio(),prepared=Object.hasOwn(health,'nativeAudio')?health.nativeAudio:audio?{sourceKey:audio.currentSrc||audio.src,readyState:audio.readyState}:null,key=prepared?.sourceKey||'';if(token!==generation)throw Error('The selected show entry changed.');if(nativeCurrentId()===id&&prepared?.readyState>=2&&(!changingSong||key!==previousSource)){const status=await guard({action:'play',songId:id,sourceKey:key,restart:startedGeneration!==token,generation});if(!status?.permitted)throw Error('Suno playback was not authorized by the native guard.');startedGeneration=token;return;}await delay(80);}
      throw Error('Suno did not load the selected song. It remains held.');
      }finally{if(nativeTransition===token)nativeTransition=-1;}
    }
    async function pause(entry,context={}){if(context.generation!==undefined&&context.generation!==generation)return;cancelPending('Playback was paused before it started.');if(entry&&core.playback(entry).provider==='youtube')post('pauseVideo');await guard({action:'pause',generation});}
    async function dispose(){if(destroyed)return;await stopAll({generation:generation+1});destroyed=true;win.removeEventListener('message',onMessage);await guard({action:'disable',generation});}
    return {stopAll,stage,play,pause,dispose,getCurrent:()=>current,getGeneration:()=>generation};
  }
  return {SCRIPT_VERSION,create,sunoId,youtubeId,findNativePlay};
});
