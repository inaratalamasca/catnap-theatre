/* Catnap Theatre managed-show presentation, version 0.6.3.
 * Change summary: reload-safe binding status, first-entry Play, trusted native
 * controls routed through manual/AP coordination, staged artwork and timed
 * warnings. Host-only notes remain in the extension window.
 */
(() => {
  'use strict';
  const SCRIPT_VERSION='0.6.3';
  if(globalThis.CatnapManagedShow)return;
  let active=false,show=null,coordinator=null,adapter=null,observedSignature='',queueSignature='',revision=0,timing={elapsed:0,duration:0};
  const state=()=>coordinator?.snapshot()||null;
  const root=()=>document.getElementById('catnap-theater-root');
  const view=()=>globalThis.CatnapTheatreView;
  function style(){
    if(document.getElementById('catnap-managed-show-style'))return;
    const element=document.createElement('style');element.id='catnap-managed-show-style';element.textContent=`
#catnap-theater-root[data-managed-show=true] .ct-lineup:not(.ct-managed-lineup){display:none!important}
#catnap-theater-root .ct-managed-lineup{display:none}
#catnap-theater-root[data-layout=lineup][data-managed-show=true] .ct-managed-lineup{display:block}
#catnap-theater-root .ct-managed-warning{position:absolute;z-index:30;top:76px;left:50%;transform:translateX(-50%);max-width:min(850px,90%);padding:18px 26px;border:1px solid #e4b86e;border-radius:14px;background:rgba(38,25,12,.95);color:#ffe6af;box-shadow:0 8px 35px #0009;font:650 clamp(16px,1.5vw,25px)/1.4 system-ui;text-align:center;pointer-events:none}
#catnap-theater-root .ct-managed-warning[hidden]{display:none}
#catnap-theater-root .ct-managed-status{font-size:11px;color:#c2aad4;max-width:180px;overflow-wrap:anywhere}
#catnap-theater-root .ct-managed-source{font-size:12px;letter-spacing:.09em;color:#b5dcd5}
#catnap-theater-root .ct-managed-lineup button{display:block;width:100%;text-align:left;padding:10px 5px;border-bottom:1px solid #51405e55;font-size:13px}
#catnap-theater-root .ct-managed-lineup button[aria-current=true]{color:#f4d59c;background:#c69be513}
`;document.documentElement.appendChild(element);
  }
  async function guard(command){
    const response=await chrome.runtime.sendMessage({target:'managed-native',showId:show?.id,bindingId:show?.bindingId,...command});
    if(!response?.ok)throw Error(response?.error||'The playback guard is unavailable.');return response.data;
  }
  function emit(playback){
    render();
    const payload={phase:playback.phase,index:playback.index,generation:playback.generation,occurrenceId:playback.occurrenceId,autoplay:playback.autoplay,error:playback.error,source:playback.current?.playbackSource||playback.current?.preferredSource,current:playback.current?{id:playback.current.id}:null};
    const signature=JSON.stringify(payload);if(signature===observedSignature)return;observedSignature=signature;
    void chrome.runtime.sendMessage({target:'catnap-show-observed',showId:show?.id,bindingId:show?.bindingId,revision:++revision,playback:payload}).catch(()=>{});
  }
  function warning(value){
    const stage=root();if(!stage)return;
    let banner=stage.querySelector('.ct-managed-warning');if(!banner){banner=document.createElement('div');banner.className='ct-managed-warning';banner.setAttribute('role','alert');stage.append(banner);}
    banner.textContent=value?.text||'';banner.hidden=!value;
  }
  function renderQueue(stage,snapshot){
    let panel=stage.querySelector('.ct-managed-lineup');if(!panel){queueSignature='';panel=document.createElement('aside');panel.className='ct-lineup ct-managed-lineup';panel.setAttribute('aria-label','Managed show running order');stage.querySelector('.ct-main').prepend(panel);}
    const signature=JSON.stringify([snapshot.index,snapshot.queue.map(e=>[e.id,e.title,e.preferredSource,e.disclaimer,e.state])]);if(signature===queueSignature)return;queueSignature=signature;
    panel.replaceChildren();const heading=document.createElement('h2');heading.textContent='SHOW ORDER';panel.append(heading);
    snapshot.queue.forEach((entry,index)=>{const button=document.createElement('button');button.type='button';button.textContent=`${String(index+1).padStart(2,'0')}  ${entry.title}${entry.preferredSource==='youtube'?' · YT':''}${entry.disclaimer==='yes'?' ⚠':''}`;button.setAttribute('aria-current',String(index===snapshot.index));button.disabled=entry.state==='held';button.title='Load quietly · press Play separately';button.onclick=()=>{void command('load',{index}).catch(displayError);};panel.append(button);});
  }
  function render(){
    const stage=root(),snapshot=state();if(!active||!stage||!snapshot)return;
    style();stage.dataset.managedShow='true';
    const entry=snapshot.current,select=selector=>stage.querySelector(selector);
    select('.ct-song-title').textContent=entry?.title||show?.name||'Your show is ready';
    select('.ct-artist').textContent=entry?.artist||'Load a song, then press Play';
    select('.ct-desc').textContent=entry?`${(entry.playbackSource||entry.preferredSource||'held').toUpperCase()} · ${snapshot.error|| (snapshot.phase==='playing'?'Playing':snapshot.phase==='ended'?'Finished':'Loaded quietly')}${entry.disclaimer==='yes'?' · Content disclaimer requested':''}`:'Manual Load next never starts audio.';
    const art=select('.ct-art'),frame=select('.ct-art-frame');
    let artwork=entry?.artworkUrl||'';
    const native=view()?.nativeSong();
    if(!artwork&&entry?.preferredSource==='suno'&&native?.id===entry.sunoId)artwork=view()?.nativeCover(native)?.src||'';
    if(artwork){if(art.getAttribute('src')!==artwork)art.src=artwork;frame.classList.remove('ct-no-art');}
    else{art.removeAttribute('src');frame.classList.add('ct-no-art');}
    const lyricText=entry?.preferredSource==='suno'&&native?.id===entry.sunoId?view()?.nativeLyrics(native):'';
    if(stage.dataset.managedLyrics!==String(entry?.id)+String(lyricText)){
      stage.dataset.managedLyrics=String(entry?.id)+String(lyricText);view()?.writeLyrics(lyricText||'',entry?.preferredSource==='youtube'?'YouTube source · video plays in the artwork area.':entry?'Lyrics appear when Suno loads this song.':'Choose a song from your show controls.');
    }
    select('.ct-up-next-label').textContent=snapshot.autoplay?'UP NEXT · AP AUTOPLAY':'UP NEXT · LOAD MANUALLY';
    select('.ct-up-next-title').textContent=snapshot.queue[snapshot.index+1]?.title||'End of show queue';
    select('.ct-prev').setAttribute('aria-label','Load previous song');select('.ct-prev').title='Load previous · does not play';
    select('.ct-next').setAttribute('aria-label','Load next song');select('.ct-next').title='Load next · does not play';
    select('.ct-progress').disabled=entry?.preferredSource==='youtube';
    renderQueue(stage,snapshot);warning(snapshot.warning);
  }
  function displayError(error){const stage=root();if(stage){stage.querySelector('.ct-desc').textContent=String(error?.message||error);}}
  async function enable(next){
    if(active)await disable();
    show=next;observedSignature='';queueSignature='';revision=0;timing={elapsed:0,duration:0};
    await guard({action:'enable',generation:0});
    view()?.open(true);active=true;
    adapter=CatnapManagedMedia.create({document,window,guard,getContainer:()=>root()?.querySelector('.ct-art-frame'),
      onEnded:token=>{void coordinator?.ended(token).catch(displayError);},onError:(token,message)=>{void coordinator?.failed(token,message).catch(displayError);},
      onPlaying:token=>coordinator?.observedPlaying(token),onPaused:token=>coordinator?.observedPaused(token),onAutoplayBlocked:(token,message)=>coordinator?.autoplayBlocked(token,message),
      onProgress:value=>{if(value.generation===state()?.generation)timing=value;}});
    coordinator=CatnapManagedPlayer.create({adapter,onState:emit,onWarning:warning,warningSeconds:next.warningSeconds});
    await coordinator.setQueue(next.entries,{showId:next.id,mode:next.mode,autoplay:next.autoplay});render();return {enabled:true};
  }
  async function disable(){
    if(coordinator)await coordinator.dispose();
    else await guard({action:'disable',generation:0});
    active=false;coordinator=null;adapter=null;show=null;timing={elapsed:0,duration:0};
    const stage=root();if(stage){delete stage.dataset.managedShow;delete stage.dataset.managedLyrics;stage.querySelector('.ct-managed-lineup')?.remove();stage.querySelector('.ct-managed-warning')?.remove();stage.querySelector('.ct-progress').disabled=false;}
    return {enabled:false};
  }
  async function update(next){
    if(!active||!coordinator)return {enabled:false};if(next.id!==show.id)return enable(next);
    show=next;coordinator.appendQueue(next.entries);coordinator.setWarningSeconds(next.warningSeconds);coordinator.setAutoplay(next.mode==='ap'&&next.autoplay);render();return {updated:true};
  }
  async function command(action,args={}){
    if(action==='status')return {enabled:active,showId:show?.id||null,bindingId:show?.bindingId||null,playback:state(),guard:active?await guard({action:'status'}):null,stageOpen:!!root()};
    if(!active||!coordinator)throw Error('Enable the managed show in Inbox & show controls first.');
    const wasClosed=!root();
    if(['load','next','previous','play','toggle'].includes(action))view()?.open(true);
    if(['play','toggle'].includes(action)){
      if(state().index<0){
        if(!state().queue.length)throw Error('The show queue is empty. Refresh the selected inbox before pressing Play.');
        // Entry zero is authoritative. Never skip a held FIFO submission in
        // order to make a later song play when the host presses Play.
        await coordinator.load(0);
      }else if(wasClosed||coordinator.needsRestage){coordinator.needsRestage=false;await coordinator.load(state().index);}
      if(!['ready','paused','playing','ended'].includes(state().phase))throw Error(state().error||'The first show entry is held. Resolve it or choose a source deliberately.');
    }
    if(action==='play'&&state().phase==='playing')return {playback:state()};
    let result;
    if(action==='load')result=await coordinator.load(args.index);
    else if(action==='next')result=await coordinator.loadNext();
    else if(action==='previous')result=await coordinator.loadPrevious();
    else if(action==='play')result=await coordinator.play();
    else if(action==='toggle')result=await (state().phase==='playing'?coordinator.pause():coordinator.play());
    else if(action==='pause')result=await coordinator.pause();
    else if(action==='stop')result=await coordinator.stop();
    else if(action==='repeat-warning')result=coordinator.repeatWarning();
    else throw Error('Unknown managed playback command.');
    render();return {playback:result};
  }
  function progress(){
    const snapshot=state();if(!active||!snapshot)return null;
    if(snapshot.current?.preferredSource==='suno'&&view()?.nativeSong()?.id===snapshot.current.sunoId){const info=view().nativeInfo();return {...info,paused:snapshot.phase!=='playing'};}
    return {elapsed:snapshot.phase==='ready'?0:timing.elapsed||0,duration:timing.duration||snapshot.current?.durationSeconds||0,paused:snapshot.phase!=='playing'};
  }
  function seek(ratio){if(!active||state()?.current?.preferredSource!=='suno'||view()?.nativeSong()?.id!==state().current.sunoId)return;view()?.nativeSeek(ratio);}
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if(message?.target!=='catnap-show-tab'||sender.id!==chrome.runtime.id||sender.tab)return;
    (async()=>{
      // A tab reload clears this content-world binding while the worker may
      // still retain its previous lease. Status must be readable before the
      // show-ID check, so the worker can detect and explicitly rebind it.
      if(message.action==='status')return command('status');
      if(message.action==='enable')return enable(message.show);
      if(message.action==='update')return update(message.show);
      if(message.action==='disable')return disable();
      if(message.showId!==show?.id)throw Error('This playback command belongs to another show.');
      return command(message.action,message);
    })().then(reply,error=>reply({error:error.message}));return true;
  });
  function metadata(){
    const snapshot=state(),entry=snapshot?.current;
    // The deployed v1 listener accepts only Suno song identities. Clear it
    // during YouTube playback instead of publishing a paused Suno song as live.
    if(!active||!entry||entry.preferredSource!=='suno'||!entry.sunoId)return {version:1,active:false};
    const clock=progress();return {version:1,song:{id:entry.sunoId,url:entry.sunoUrl,title:entry.title,artist:entry.artist,artworkUrl:entry.artworkUrl||null,durationSeconds:clock?.duration||null,currentTimeSeconds:clock?.elapsed??null,playing:snapshot.phase==='playing'},playlist:null,shuffle:false};
  }
  function closedTheatre(){
    if(!active||!coordinator)return;
    // Closing the stage destroys its YouTube iframe. Re-stage it paused when
    // Theatre is reopened, so Play cannot address an old, disconnected frame.
    const closingCoordinator=coordinator,index=state().index,token=state().generation;void closingCoordinator.pause().then(()=>{
      if(index>=0&&coordinator===closingCoordinator&&state().generation===token)closingCoordinator.needsRestage=true;
    }).catch(displayError);
  }
  function songId(url){try{const value=new URL(url,location.href);return ['suno.com','www.suno.com'].includes(value.hostname)?/^\/song\/([a-f0-9-]{36})\/?$/i.exec(value.pathname)?.[1]?.toLowerCase()||null:null;}catch{return null;}}
  function rowSong(button){
    let parent=button.parentElement;
    for(let depth=0;parent&&depth<5;parent=parent.parentElement,depth++){
      if(['BODY','HTML','MAIN'].includes(parent.tagName)||parent.contains(root()))break;
      const ids=new Set(Array.from(parent.querySelectorAll('a[href*="/song/"]')).map(anchor=>songId(anchor.href)).filter(Boolean));
      if(ids.size===1)return [...ids][0];if(ids.size>1)break;
    }
    return null;
  }
  function routeNativeControl(event){
    // Programmatic native-row clicks made by managed-media.js must reach
    // Suno so it can prepare its source, while the MAIN guard keeps it muted.
    if(!active||!coordinator||event.isTrusted!==true)return false;
    const target=event.target instanceof Element?event.target:null;if(!target||target.closest('#catnap-theater-root'))return false;
    let action=null,index=null,error='';
    if(event.type==='click'){
      if(event.button!==undefined&&event.button!==0)return false;
      const button=target.closest('button');if(!button)return false;
      const label=(button.getAttribute('aria-label')||button.title||'').trim();
      const exact={'Playbar: Play button':'play','Playbar: Pause button':'pause','Playbar: Next Song button':'next','Playbar: Previous Song button':'previous'};
      action=exact[label]||null;
      if(!action&&/^play playlist$/i.test(label)){action='play';index=0;}
      else if(!action&&/^(?:play|pause)(?:\s|$)/i.test(label)&&!/playlist/i.test(label)){
        const id=rowSong(button);if(!id)return false;
        const matches=state().queue.map((entry,at)=>({entry,at})).filter(value=>value.entry.sunoId===id);
        const current=matches.find(value=>value.at===state().index),chosen=current||(matches.length===1?matches[0]:null);
        if(!chosen)error=matches.length?'This song has multiple show submissions. Choose the intended entry in the show controls.':'This song is outside the active show queue. Choose a show entry or return to ordinary Suno.';
        else if(/^pause/i.test(label)){if(chosen.at!==state().index)error='Choose the playing show entry before pausing it.';else action='pause';}
        else{action='play';index=chosen.at;}
      }
    }else if(event.type==='keydown'){
      if(event.ctrlKey||event.altKey||event.metaKey||target.closest('input,textarea,select,[contenteditable="true"]'))return false;
      if(target.closest('button')&&!/Playbar:/.test(target.closest('button').getAttribute('aria-label')||''))return false;
      if(event.key===' '||event.code==='Space'||event.key==='MediaPlayPause')action='toggle';
      else if(event.key==='MediaTrackNext'||event.key==='ArrowRight'&&event.shiftKey)action='next';
      else if(event.key==='MediaTrackPrevious'||event.key==='ArrowLeft'&&event.shiftKey)action='previous';
    }
    if(!action&&!error)return false;
    event.preventDefault();event.stopImmediatePropagation();
    if(error){displayError(Error(error));return true;}
    const owner=coordinator;
    void (async()=>{
      if(index!==null){const expected=state().queue[index]?.id;if(!expected)throw Error('The show queue is empty. Refresh the selected inbox before pressing Play.');await command('load',{index});if(coordinator!==owner||state()?.current?.id!==expected)throw Error('The show selection changed before playback could start.');}
      return command(action);
    })().catch(displayError);
    return true;
  }
  window.addEventListener('click',routeNativeControl,true);window.addEventListener('keydown',routeNativeControl,true);
  globalThis.CatnapManagedShow={SCRIPT_VERSION,get active(){return active;},snapshot:state,command,render,progress,seek,metadata,closed:closedTheatre,routeNativeControl};
  setInterval(()=>{
    const stage=root();if(!stage)return;
    if(!stage.querySelector('.ct-inbox-controls')){
      const button=document.createElement('button');button.type='button';button.className='ct-inbox-controls';button.textContent='Inbox & show ↗';button.setAttribute('aria-label','Inbox and show controls');
      Object.assign(button.style,{fontSize:'12px',color:'#d7b7ee',whiteSpace:'nowrap'});button.onclick=()=>{void chrome.runtime.sendMessage({target:'catnap-show-worker',action:'open'}).catch(displayError);};stage.querySelector('.ct-header').append(button);
    }
    if(active){if(coordinator?.needsRestage){coordinator.needsRestage=false;const index=state().index;void coordinator.load(index).catch(displayError);}render();}
  },400);
})();
