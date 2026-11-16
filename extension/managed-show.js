/* Catnap Theatre managed-show presentation, version 0.7.0.
 * Change summary: managed Suno lyrics prepare the matching native details
 * panel; stale and YouTube slots cannot borrow old native lyrics. A second
 * toggle cancels pending playback; reload-safe binding
 * status, first-entry Play, trusted native
 * controls routed through manual/AP coordination, staged artwork and timed
 * warnings. One YouTube stage expands within the Theatre viewport on Play,
 * with view/playback/exit controls and no browser fullscreen. Local held rows
 * stay disabled, Up next skips them, and every observation retains completed IDs.
 * Source status stays above the progress bar. Host-only notes
 * remain in the extension window.
 */
(() => {
  'use strict';
  const SCRIPT_VERSION='0.7.0';
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
#catnap-theater-root.ct-managed-window-video>.ct-managed-media-stage{position:fixed!important;inset:0!important;width:100%!important;height:100%!important;border-radius:0!important;z-index:24!important;background:#000}
#catnap-theater-root.ct-managed-window-video>.ct-header,#catnap-theater-root.ct-managed-window-video>.ct-main,#catnap-theater-root.ct-managed-window-video>.ct-bottom{visibility:hidden}
#catnap-theater-root .ct-managed-video-controls{position:absolute;right:18px;bottom:94px;z-index:35;display:flex;flex-wrap:wrap;gap:6px;padding:8px;max-width:calc(100% - 24px);border:1px solid #8c7caa;border-radius:12px;background:#10121bec;box-shadow:0 5px 24px #0008;font:12px/1.3 system-ui}
#catnap-theater-root .ct-managed-video-controls button{padding:7px 10px;border:1px solid #695b80;border-radius:7px;background:#242031;color:#fff}
#catnap-theater-root.ct-managed-window-video>.ct-managed-video-controls{left:50%;right:auto;bottom:16px;transform:translateX(-50%);width:max-content}
#catnap-theater-root .ct-managed-yt{display:inline-flex;align-items:center;justify-content:center;width:19px;height:13px;margin-left:6px;border-radius:4px;background:#df202c;vertical-align:middle}
#catnap-theater-root .ct-managed-yt svg{width:8px;height:8px;fill:white}

#catnap-theater-root .ct-managed-status{font-size:11px;color:#c2aad4;max-width:180px;overflow-wrap:anywhere}
#catnap-theater-root .ct-managed-source{font-size:12px;letter-spacing:.09em;color:#b5dcd5}
#catnap-theater-root .ct-managed-lineup button{display:block;width:100%;text-align:left;padding:10px 5px;border-bottom:1px solid #51405e55;font-size:13px;overflow-wrap:anywhere}
#catnap-theater-root .ct-managed-held{display:inline-block;margin-left:6px;padding:1px 5px;border:1px solid #8b739855;border-radius:4px;color:#bea9ce;font:600 10px/1.4 system-ui}
#catnap-theater-root .ct-managed-lineup button:disabled{cursor:default;opacity:.6}
#catnap-theater-root .ct-managed-lineup button[aria-current=true]{color:#f4d59c;background:#c69be513}
`;document.documentElement.appendChild(element);
  }
  async function guard(command){
    const response=await chrome.runtime.sendMessage({target:'managed-native',showId:show?.id,bindingId:show?.bindingId,...command});
    if(!response?.ok)throw Error(response?.error||'The playback guard is unavailable.');return response.data;
  }
  function emit(playback){
    render();
    const payload={phase:playback.phase,index:playback.index,generation:playback.generation,occurrenceId:playback.occurrenceId,autoplay:playback.autoplay,error:playback.error,completedEntryIds:playback.queue.filter(CatnapManagedPlayer.wasPlayed).map(CatnapManagedPlayer.identity).slice(0,1000),source:playback.current?.playbackSource||playback.current?.preferredSource,current:playback.current?{id:playback.current.id}:null};
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
    const signature=JSON.stringify([snapshot.index,snapshot.autoplay,snapshot.queue.map(e=>[e.id,e.title,e.preferredSource,e.playbackSource,e.disclaimer,e.state,e.effectiveHeld,e.effectiveHoldReason,e.playedAt])]);if(signature===queueSignature)return;queueSignature=signature;
    panel.replaceChildren();const heading=document.createElement('h2');heading.textContent='INBOX SHOW ORDER';panel.append(heading);
    const source=document.createElement('small');source.textContent=snapshot.autoplay?'Inbox submissions · AP autoplay':'Inbox submissions · manual advance';panel.append(source);
    snapshot.queue.forEach((entry,index)=>{const button=document.createElement('button');button.type='button';button.textContent=`${String(index+1).padStart(2,'0')}  ${entry.title}${entry.disclaimer==='yes'?' ⚠':''}`;
      if((entry.playbackSource||entry.preferredSource)==='youtube'){
        const icon=document.createElement('span');icon.className='ct-managed-yt';icon.setAttribute('role','img');icon.setAttribute('aria-label','YouTube');icon.title='YouTube source';
        const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');svg.setAttribute('viewBox','0 0 10 10');svg.setAttribute('aria-hidden','true');path.setAttribute('d','M2 1 9 5 2 9Z');svg.append(path);icon.append(svg);button.append(icon);
      }
      const held=CatnapManagedPlayer.isHeld(entry);if(held){const badge=document.createElement('span');badge.className='ct-managed-held';badge.textContent='Held';button.append(badge);}
      button.setAttribute('aria-current',String(index===snapshot.index));button.disabled=held;button.title=held?(entry.effectiveHoldReason||entry.holdReason||'Held · release this entry in Inbox & show'): 'Load · press Play separately';button.onclick=()=>{void command('load',{index}).catch(displayError);};panel.append(button);});
  }
  function matchingLyricsSong(snapshot,native){
    const entry=snapshot?.current,target=songId(entry?.sunoUrl);
    return !['idle','loading','stopping'].includes(snapshot?.phase)&&(entry?.playbackSource||entry?.preferredSource)==='suno'&&!!target&&target===entry.sunoId&&target===songId(native?.href)&&native?.id===target;
  }
  function readManagedLyrics(snapshot,native,{reload=false}={}){
    if(!matchingLyricsSong(snapshot,native)){view()?.cancelNativeLyrics?.();return '';}
    const generation=snapshot.generation,entryId=snapshot.current.id;
    return view()?.prepareNativeLyrics?.(native,{reload,key:generation+':'+entryId,isCurrent:()=>active&&state()?.generation===generation&&state()?.current?.id===entryId&&matchingLyricsSong(state(),view()?.nativeSong())})||'';
  }
  function reloadLyrics(){
    const snapshot=state(),native=view()?.nativeSong();
    if(!root())throw Error('Open Theatre before reloading lyrics.');
    if(!active||!matchingLyricsSong(snapshot,native))throw Error('Lyrics can reload once Suno has loaded the selected Suno song.');
    readManagedLyrics(snapshot,native,{reload:true});const stage=root();if(stage)delete stage.dataset.managedLyrics;render();return true;
  }
  function videoControls(stage,snapshot){
    const video=adapter?.videoView?.(),youtube=(snapshot.current?.playbackSource||snapshot.current?.preferredSource)==='youtube';
    let controls=stage.querySelector('.ct-managed-video-controls');
    if(!youtube||!video?.available){controls?.remove();return;}
    if(!controls){
      controls=document.createElement('div');controls.className='ct-managed-video-controls';controls.setAttribute('role','group');controls.setAttribute('aria-label','YouTube view and playback');
      const button=(name,label,action)=>{const item=document.createElement('button');item.type='button';item.className=name;item.textContent=label;item.onclick=action;controls.append(item);return item;};
      button('ct-managed-video-view','Window view',()=>{adapter?.setWindowView?.(!adapter.videoView().expanded);render();});
      button('ct-managed-video-toggle','Play',()=>{void command('toggle').catch(displayError);});
      button('ct-managed-video-next','Load next',()=>{void command('next').catch(displayError);});
      button('ct-managed-video-close','Close Theatre',()=>view()?.open(false));stage.append(controls);
    }
    const toggle=controls.querySelector('.ct-managed-video-view');toggle.textContent=video.expanded?'Artwork view':'Window view';toggle.setAttribute('aria-pressed',String(video.expanded));toggle.title=video.expanded?'Restore artwork layout · Esc also works while Theatre controls are focused':'Fill the Theatre window without browser fullscreen';
    if(controls.dataset.expanded!==String(video.expanded)){controls.dataset.expanded=String(video.expanded);if(video.expanded&&stage.contains(document.activeElement)&&!controls.contains(document.activeElement))toggle.focus();}
    controls.querySelector('.ct-managed-video-toggle').textContent=['playing','starting'].includes(snapshot.phase)?'Pause':'Play';
    controls.querySelector('.ct-managed-video-next').disabled=snapshot.nextIndex<0;
    adapter?.refreshVideoView?.();
  }
  function restoreVideoOnEscape(event){
    if(!active||!(event.key==='Escape'||event.code==='Escape')||!adapter?.videoView?.().expanded)return false;
    event.preventDefault();event.stopImmediatePropagation();adapter.setWindowView(false);render();return true;
  }
  function playbackStatus(stage,text){
    const line=stage?.querySelector('.ct-managed-playback-status');if(!line)return;
    if(line.textContent!==text)line.textContent=text;line.hidden=!text;line.title=text;
  }
  function render(){
    const stage=root(),snapshot=state();if(!active||!stage||!snapshot)return;
    style();stage.dataset.managedShow='true';
    const entry=snapshot.current,select=selector=>stage.querySelector(selector);
    select('.ct-song-title').textContent=entry?.title||show?.name||'Your show is ready';
    select('.ct-artist').textContent=entry?.artist||'Load a song, then press Play';
    if(select('.ct-desc').textContent)select('.ct-desc').textContent='';
    const source={youtube:'YouTube',suno:'Suno'}[entry?.playbackSource||entry?.preferredSource]||'Source';
    const phase={playing:'Playing',starting:'Starting',paused:'Paused',ended:'Finished',loading:'Loading',stopping:'Stopping'}[snapshot.phase]||'Loaded';
    playbackStatus(stage,entry?`${source} · ${snapshot.error||phase}${entry.disclaimer==='yes'?' · Content disclaimer requested':''}`:snapshot.queue.length&&snapshot.nextIndex<0?'All remaining songs are held. Release one in Inbox & show.':'Load next, then press Play.');
    const art=select('.ct-art'),frame=select('.ct-art-frame');
    let artwork=entry?.artworkUrl||'';
    const native=view()?.nativeSong();
    if(!artwork&&entry?.preferredSource==='suno'&&native?.id===entry.sunoId)artwork=view()?.nativeCover(native)?.src||'';
    if(artwork){if(art.getAttribute('src')!==artwork)art.src=artwork;frame.classList.remove('ct-no-art');}
    else{art.removeAttribute('src');frame.classList.add('ct-no-art');}
    const lyricText=readManagedLyrics(snapshot,native);
    if(stage.dataset.managedLyrics!==String(entry?.id)+String(lyricText)){
      stage.dataset.managedLyrics=String(entry?.id)+String(lyricText);view()?.writeLyrics(lyricText||'',entry?.preferredSource==='youtube'?'YouTube source · Play fills the Theatre window. Use Artwork view to restore the layout.':entry?'Lyrics appear when Suno loads this song.':'Choose a song from your show controls.');
    }
    select('.ct-up-next-label').textContent=snapshot.autoplay?'UP NEXT · AP AUTOPLAY':'UP NEXT · LOAD MANUALLY';
    select('.ct-up-next-title').textContent=snapshot.queue[snapshot.nextIndex]?.title||(snapshot.queue.some(CatnapManagedPlayer.isHeld)?'No unheld songs remain':'End of show queue');
    select('.ct-prev').setAttribute('aria-label','Load previous song');select('.ct-prev').title='Load previous · does not play';
    select('.ct-next').setAttribute('aria-label','Load next song');select('.ct-next').title='Load next · does not play';
    select('.ct-progress').disabled=entry?.preferredSource==='youtube';
    renderQueue(stage,snapshot);warning(snapshot.warning);videoControls(stage,snapshot);
  }
  function displayError(error){playbackStatus(root(),String(error?.message||error));}
  async function enable(next){
    if(active)await disable();
    show=next;observedSignature='';queueSignature='';revision=0;timing={elapsed:0,duration:0};
    await guard({action:'enable',generation:0});
    view()?.cancelNativeLyrics?.();active=true;view()?.open(true);
    adapter=CatnapManagedMedia.create({document,window,guard,getContainer:()=>root()?.querySelector('.ct-art-frame'),
      onEnded:token=>{void coordinator?.ended(token).catch(displayError);},onError:(token,message)=>{void coordinator?.failed(token,message).catch(displayError);},
      onPlaying:token=>coordinator?.observedPlaying(token),onPaused:token=>coordinator?.observedPaused(token),onAutoplayBlocked:(token,message)=>coordinator?.autoplayBlocked(token,message),
      onProgress:value=>{if(value.generation===state()?.generation)timing=value;},onViewChange:()=>render()});
    coordinator=CatnapManagedPlayer.create({adapter,onState:emit,onWarning:warning,warningSeconds:next.warningSeconds});
    await coordinator.setQueue(next.entries,{showId:next.id,mode:next.mode,autoplay:next.autoplay});render();return {enabled:true};
  }
  async function disable(){
    if(coordinator)await coordinator.dispose();
    else await guard({action:'disable',generation:0});
    active=false;coordinator=null;adapter=null;show=null;timing={elapsed:0,duration:0};
    view()?.cancelNativeLyrics?.();
    const stage=root();if(stage){delete stage.dataset.managedShow;delete stage.dataset.managedLyrics;playbackStatus(stage,'');stage.querySelector('.ct-managed-lineup')?.remove();stage.querySelector('.ct-managed-warning')?.remove();stage.querySelector('.ct-managed-video-controls')?.remove();stage.classList.remove('ct-managed-window-video');stage.querySelector('.ct-progress').disabled=false;}
    return {enabled:false};
  }
  async function update(next){
    if(!active||!coordinator)return {enabled:false};if(next.id!==show.id)return enable(next);
    show=next;coordinator.appendQueue(next.entries);coordinator.setWarningSeconds(next.warningSeconds);coordinator.setAutoplay(next.mode==='ap'&&next.autoplay);render();return {updated:true};
  }
  async function command(action,args={}){
    if(action==='status')return {enabled:active,showId:show?.id||null,bindingId:show?.bindingId||null,playback:state(),guard:active?await guard({action:'status'}):null,stageOpen:!!root()};
    if(!active||!coordinator)throw Error('Enable the managed show in Inbox & show controls first.');
    if(action==='reload-lyrics'){reloadLyrics();return {playback:state(),lyricsReloaded:true};}
    if(action==='toggle'&&state().phase==='starting'){const playback=await coordinator.pause();render();return {playback};}
    const wasClosed=!root();
    if(['load','next','previous','play','toggle'].includes(action))view()?.open(true);
    if(['play','toggle'].includes(action)){
      if(state().index<0){
        if(!state().queue.length)throw Error('The show queue is empty. Refresh the selected inbox before pressing Play.');
        // Local host holds are deliberate exceptions to the inbox order.
        // Load the first playable entry, without allowing a held one to play.
        await coordinator.loadNext();
      }else if(wasClosed||coordinator.needsRestage){coordinator.needsRestage=false;await coordinator.load(state().index);}
      if(!['ready','paused','playing','ended'].includes(state().phase))throw Error(state().error||'The first show entry is held. Resolve it or choose a source deliberately.');
    }
    if(action==='play'&&state().phase==='playing')return {playback:state()};
    let result;
    if(action==='load')result=await coordinator.load(args.index);
    else if(action==='next')result=await coordinator.loadNext();
    else if(action==='previous')result=await coordinator.loadPrevious();
    else if(action==='play')result=await coordinator.play();
    else if(action==='toggle')result=await (['playing','starting'].includes(state().phase)?coordinator.pause():coordinator.play());
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
    adapter?.setWindowView?.(false);
    const closingCoordinator=coordinator,index=state().index,token=state().generation;void closingCoordinator.pause().then(()=>{
      if(index>=0&&coordinator===closingCoordinator&&state().generation===token)closingCoordinator.needsRestage=true;
    }).catch(displayError);
  }
  function songId(url){try{const value=new URL(url,location.href);return ['suno.com','www.suno.com'].includes(value.hostname)?/^\/song\/([a-f0-9-]{36})\/?$/i.exec(value.pathname)?.[1]?.toLowerCase()||null:null;}catch{return null;}}
  function rowSong(button){
    let parent=button.closest('[role="group"]')||button.parentElement;
    for(let depth=0;parent&&depth<12;parent=parent.parentElement,depth++){
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
      const button=target.closest('button,[role="button"]');if(!button)return false;
      const label=(button.getAttribute('aria-label')||button.title||'').trim();
      const exact={'Playbar: Play button':'play','Playbar: Pause button':'pause','Playbar: Next Song button':'next','Playbar: Previous Song button':'previous'};
      action=exact[label]||null;
      if(!action&&/^play playlist$/i.test(label)){action='play';index=0;}
      else if(!action&&/^(?:play|pause)(?:\s|$)/i.test(label)&&!/playlist/i.test(label)){
        const id=rowSong(button);if(!id)return false;
        if(/^play/i.test(label)&&globalThis.CatnapManagedMedia?.findNativePlay(document,id)!==button)return false;
        const matches=state().queue.map((entry,at)=>({entry,at})).filter(value=>value.entry.sunoId===id);
        const current=matches.find(value=>value.at===state().index),chosen=current||(matches.length===1?matches[0]:null);
        if(!chosen)error=matches.length?'This song has multiple show submissions. Choose the intended entry in the show controls.':'This song is outside the active show queue. Choose a show entry or return to ordinary Suno.';
        else if(/^pause/i.test(label)){if(chosen.at!==state().index)error='Choose the playing show entry before pausing it.';else action='pause';}
        else{action='play';index=chosen.at;}
      }
    }else if(event.type==='keydown'){
      if(event.ctrlKey||event.altKey||event.metaKey||target.closest('input,textarea,select,[contenteditable="true"]'))return false;
      if(target.closest('button,[role="button"]')&&!/Playbar:/.test(target.closest('button,[role="button"]').getAttribute('aria-label')||''))return false;
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
  // Window capture sees Esc before content.js's document-level close shortcut.
  window.addEventListener('keydown',restoreVideoOnEscape,true);
  window.addEventListener('click',routeNativeControl,true);window.addEventListener('keydown',routeNativeControl,true);
  globalThis.CatnapManagedShow={SCRIPT_VERSION,get active(){return active;},snapshot:state,command,render,reloadLyrics,progress,seek,metadata,closed:closedTheatre,routeNativeControl};
  setInterval(()=>{
    const stage=root();if(!stage)return;
    if(active){if(coordinator?.needsRestage){coordinator.needsRestage=false;const index=state().index;void coordinator.load(index).catch(displayError);}render();}
  },400);
})();
