/* Catnap managed show coordinator, version 0.8.2.
 * Change summary: independently staged mixed-source entries, manual LP endings,
 * opt-in AP autoplay, fair ready-tail rotation and bound completion history.
 * Load and genuine completion preserve visible positions and separate history.
 * This module performs no network, DOM or account operation itself. Its adapter
 * MUST enforce an inaudible stage/stop boundary before native media is selected.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CatnapManagedPlayer=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SCRIPT_VERSION='0.8.2';
  const clean=value=>typeof value==='string'?value.trim():'';
  const identity=entry=>clean(entry?.entryId)||clean(entry?.id);
  const wasPlayed=entry=>typeof entry?.playedAt==='number'&&Number.isFinite(entry.playedAt)&&entry.playedAt>=0;
  const isHeld=entry=>entry?.state==='held'||entry?.state==='declined'||entry?.hostHeld===true||entry?.effectiveHeld===true;
  const sequence=(entry,field)=>Number.isInteger(entry?.[field])&&entry[field]>0?entry[field]:null;
  function completed(queue,ids,now){
    const out=queue.map(entry=>({...entry})),known=new Map(out.map(entry=>[identity(entry),entry]));let order=out.reduce((max,entry)=>Math.max(max,sequence(entry,'playedOrder')||0),0);
    for(const entry of out.filter(wasPlayed).filter(entry=>!sequence(entry,'playedOrder')).sort((a,b)=>a.playedAt-b.playedAt))entry.playedOrder=++order;
    for(const id of ids){const entry=known.get(id);if(entry&&!wasPlayed(entry)&&entry.state!=='declined'){entry.playedAt=now;entry.playedOrder=++order;}}
    return out;
  }
  function localHolds(queue,{protectedId=null}={}){
    const out=completed(queue,[],0),known=new Map(out.map(entry=>[identity(entry),entry]));
    let release=out.reduce((max,entry)=>Math.max(max,sequence(entry,'releaseOrder')||0),0);const newlyReleased=[];
    for(const entry of out){
      const previous=entry.repeatPredecessorId?known.get(entry.repeatPredecessorId):null;
      const repeat=!!entry.repeatPredecessorId&&entry.repeatHoldOverride!==true&&!wasPlayed(entry)&&!wasPlayed(previous)&&identity(entry)!==protectedId;
      const reason=entry.state==='declined'?'Declined in uploader.':entry.state==='held'?(entry.holdReason||'This submission has no usable source.'):entry.hostHeld===true?'Held by host.':repeat?'Waiting for this uploader’s previous submission to finish.':'';
      entry.effectiveHeld=!!reason;entry.effectiveHoldReason=reason;
      if(previous&&wasPlayed(previous)&&!wasPlayed(entry)&&!entry.effectiveHeld&&entry.repeatHoldOverride!==true&&identity(entry)!==protectedId&&entry.repeatReleasedFor!==identity(previous))newlyReleased.push(entry);
    }
    newlyReleased.sort((a,b)=>(sequence(known.get(a.repeatPredecessorId),'playedOrder')||0)-(sequence(known.get(b.repeatPredecessorId),'playedOrder')||0));
    for(const entry of newlyReleased){entry.repeatReleasedFor=entry.repeatPredecessorId;entry.releaseOrder=++release;}
    const released=new Set(newlyReleased.map(identity));
    // Completion is history, not a visible move. Preserve completed rows
    // among existing ready entries while releasing only the next repeat at
    // the ready tail. Native playlist history is projected separately.
    return [...out.filter(entry=>wasPlayed(entry)||(!entry.effectiveHeld&&!released.has(identity(entry)))),...newlyReleased,
      ...out.filter(entry=>!wasPlayed(entry)&&entry.effectiveHeld)];
  }
  function playback(entry){
    const provider=clean(entry?.playbackSource||entry?.preferredSource||entry?.source).toLowerCase();
    const source=provider==='youtube'?'youtube':provider==='suno'?'suno':null;
    const url=source==='youtube'?(entry.youtubeUrl||entry.sources?.youtube?.url||entry.sources?.youtube||entry.url):(entry?.sunoUrl||entry?.sources?.suno?.url||entry?.sources?.suno||entry?.url);
    if(!source||typeof url!=='string')throw Error('This show entry has no supported playback source.');
    let parsed;try{parsed=new URL(url);}catch{throw Error('This show entry has an invalid playback URL.');}
    if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw Error('Playback links must use HTTPS without embedded credentials.');
    if(source==='suno'&&!['suno.com','www.suno.com'].includes(parsed.hostname))throw Error('This is not a Suno playback link.');
    if(source==='youtube'&&!['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtube-nocookie.com'].includes(parsed.hostname))throw Error('This is not a YouTube playback link.');
    return {provider:source,url:parsed.href};
  }
  function flagged(entry){
    const value=entry?.disclaimerNeeded??entry?.disclaimer??entry?.disclaimer_needed;
    return value===true||value===1||typeof value==='string'&&['yes','true','1'].includes(value.trim().toLowerCase());
  }
  const warningDuration=value=>Math.min(120,Math.max(2,Number(value)||10));
  class Coordinator{
    constructor({adapter,onState=()=>{},onWarning=()=>{},clock={},warningSeconds=10}={}){
      if(!adapter||typeof adapter.stopAll!=='function'||typeof adapter.stage!=='function'||typeof adapter.play!=='function')throw Error('A guarded media adapter is required.');
      this.adapter=adapter;this.onState=onState;this.onWarning=onWarning;
      // Window timers require their owning Window as receiver in real Chrome;
      // storing an unbound function then calling clock.setTimeout() is illegal.
      const timerHost=globalThis;
      this.clock={now:clock.now?clock.now.bind(clock):Date.now,setTimeout:clock.setTimeout?clock.setTimeout.bind(clock):timerHost.setTimeout.bind(timerHost),clearTimeout:clock.clearTimeout?clock.clearTimeout.bind(clock):timerHost.clearTimeout.bind(timerHost)};
      this.queue=[];this.showId='';this.mode='lp';this.autoplay=false;this.index=-1;this.phase='idle';this.generation=0;this.occurrenceId='';this.error='';this.warning=null;this.warningTimer=null;this.warningSeconds=warningDuration(warningSeconds);this.disposed=false;this.started=0;this.playAttempt=0;this.needsStage=true;this.playPreviousPhase='ready';
    }
    firstPlayableIndex(){return this.queue.findIndex(entry=>!isHeld(entry)&&!wasPlayed(entry));}
    nextIndex(direction=1){if(this.index<0)return direction===1?this.firstPlayableIndex():-1;for(let index=this.index+direction;index>=0&&index<this.queue.length;index+=direction)if(!isHeld(this.queue[index])&&(direction<0||!wasPlayed(this.queue[index])))return index;return -1;}
    snapshot(){return {version:SCRIPT_VERSION,showId:this.showId,mode:this.mode,autoplay:this.autoplay,index:this.index,nextIndex:this.nextIndex(),current:this.queue[this.index]||null,queue:this.queue.slice(),phase:this.phase,generation:this.generation,occurrenceId:this.occurrenceId,error:this.error,warning:this.warning?{...this.warning}:null,warningSeconds:this.warningSeconds};}
    emit(){const state=this.snapshot();this.onState(state);return state;}
    ensure(){if(this.disposed)throw Error('This show coordinator has closed.');}
    clearWarning(){if(this.warningTimer!==null)this.clock.clearTimeout(this.warningTimer);this.warningTimer=null;this.warning=null;this.onWarning(null);}
    showWarning(entry){
      this.clearWarning();if(!flagged(entry))return;
      const token=this.generation;
      this.warning={entryId:identity(entry),text:'Content warning: the uploader requested a disclaimer for this song.',expiresAt:this.clock.now()+this.warningSeconds*1000};this.onWarning({...this.warning});
      this.warningTimer=this.clock.setTimeout(()=>{if(token!==this.generation||this.disposed)return;this.clearWarning();this.emit();},this.warningSeconds*1000);
    }
    setWarningSeconds(value){this.ensure();this.warningSeconds=warningDuration(value);return this.emit();}
    repeatWarning(){this.ensure();const entry=this.queue[this.index];if(entry)this.showWarning(entry);return this.emit();}
    setAutoplay(value){this.ensure();if(value&&this.mode!=='ap')throw Error('LP shows use manual playback. Autoplay is available for AP shows.');this.autoplay=value===true;return this.emit();}
    async setQueue(entries,{showId='',mode='lp',autoplay=false}={}){
      this.ensure();if(!['lp','ap'].includes(mode))throw Error('Choose LP or AP.');
      if(!Array.isArray(entries)||entries.length>1000)throw Error('The show queue is invalid or too large.');
      const seen=new Set();for(const entry of entries){const id=identity(entry);if(!id||seen.has(id))throw Error('Each submission needs its own unique show entry ID.');seen.add(id);}
      const generation=++this.generation;this.phase='stopping';this.emit();
      await this.adapter.stopAll({generation});if(generation!==this.generation)return this.snapshot();
      this.clearWarning();this.queue=localHolds(entries.map(entry=>({...entry})));this.showId=clean(showId);this.mode=mode;this.autoplay=mode==='ap'&&autoplay===true;this.index=-1;this.phase='idle';this.error='';this.occurrenceId='';this.needsStage=true;return this.emit();
    }
    appendQueue(entries){
      this.ensure();if(!Array.isArray(entries))throw Error('New entries must be a list.');
      const known=new Map(this.queue.map(entry=>[identity(entry),entry])),incoming=new Map(entries.map(entry=>[identity(entry),entry])),seen=new Set(),next=[],currentId=identity(this.queue[this.index]);
      const awaitingCompletion=this.queue.some(entry=>wasPlayed(entry)&&(!wasPlayed(incoming.get(identity(entry)))||!sequence(incoming.get(identity(entry)),'playedOrder')));
      for(const entry of entries){const id=identity(entry);if(!id||seen.has(id))throw Error('Each submission needs its own unique show entry ID.');seen.add(id);const previous=known.get(id),updated={...previous,...entry};if(previous){
        // Updating an inbox note/flag must never retarget the prepared/playing
        // source. The host can deliberately reload to apply a source edit.
        if(id===currentId&&this.phase!=='idle')for(const key of ['id','entryId','source','playbackSource','preferredSource','sunoUrl','sunoId','sunoShortCode','youtubeUrl','youtubeId','sources','url','state','hostHeld','repeatHoldOverride','repeatPredecessorId']){if(Object.hasOwn(previous,key))updated[key]=previous[key];else delete updated[key];}
        // An older worker publication may arrive after local completion. Never
        // erase that completion while waiting for the trusted observation save.
        if(wasPlayed(previous)){updated.playedAt=previous.playedAt;updated.playedOrder=previous.playedOrder;}
        if(awaitingCompletion&&previous.repeatReleasedFor){updated.repeatReleasedFor=previous.repeatReleasedFor;updated.releaseOrder=previous.releaseOrder;}
      }next.push(updated);}
      for(const entry of this.queue)if(!seen.has(identity(entry)))next.push({...entry});
      if(next.length>1000)throw Error('The show queue limit was reached.');
      // A worker update that predates our local completion cannot undo its
      // ready-tail rotation while the completion observation is still in flight.
      if(awaitingCompletion){const rank=new Map(this.queue.map((entry,index)=>[identity(entry),index]));next.sort((a,b)=>(rank.get(identity(a))??1000)-(rank.get(identity(b))??1000));}
      this.queue=localHolds(next,{protectedId:currentId});this.index=currentId?this.queue.findIndex(entry=>identity(entry)===currentId):-1;
      return this.emit();
    }
    async load(index){
      this.ensure();if(!Number.isInteger(index)||index<0||index>=this.queue.length)throw Error('Choose a song in the show queue.');
      if(isHeld(this.queue[index]))throw Error(this.queue[index].effectiveHoldReason||this.queue[index].holdReason||'This show entry is held. Release it before loading.');
      const targetId=identity(this.queue[index]);
      const generation=++this.generation;this.phase='loading';this.error='';this.occurrenceId='';this.needsStage=true;this.clearWarning();this.emit();
      try{
        // Hard stop before staging. Merely waiting for native Pause after a
        // native Next click can leak the next song and is not an adapter contract.
        await this.adapter.stopAll({generation});if(generation!==this.generation)return this.snapshot();
        this.index=this.queue.findIndex(entry=>identity(entry)===targetId);const entry=this.queue[this.index];if(!entry||isHeld(entry))throw Error(entry?.effectiveHoldReason||'The selected show entry is held.');playback(entry);this.showWarning(entry);this.emit();
        await this.adapter.stage(entry,{generation});if(generation!==this.generation)return this.snapshot();
        this.needsStage=false;this.phase='ready';return this.emit();
      }catch(error){if(generation!==this.generation)return this.snapshot();this.phase='error';this.error=String(error?.message||error);return this.emit();}
    }
    async loadNext(){const index=this.nextIndex();if(index<0)throw Error('No unheld song remains after this entry.');return this.load(index);}
    async loadPrevious(){const index=this.nextIndex(-1);if(index<0)throw Error('No unheld song remains before this entry.');return this.load(index);}
    async play(){
      this.ensure();if(!['ready','paused','ended'].includes(this.phase))throw Error('Load a playable song before pressing Play.');
      const generation=this.generation,attempt=++this.playAttempt,entry=this.queue[this.index],previousPhase=this.phase;if(!entry)throw Error('No song is loaded.');if(isHeld(entry))throw Error(entry.effectiveHoldReason||'This show entry is held.');
      this.playPreviousPhase=previousPhase;this.phase='starting';this.error='';this.emit();
      try{
        if(this.needsStage||previousPhase==='ended'){await this.adapter.stage(entry,{generation});if(generation===this.generation&&attempt===this.playAttempt)this.needsStage=false;}if(generation!==this.generation||attempt!==this.playAttempt)return this.snapshot();
        await this.adapter.play(entry,{generation});if(generation!==this.generation||attempt!==this.playAttempt)return this.snapshot();
        if(this.phase!=='playing'){this.phase='playing';if(previousPhase!=='paused'||!this.occurrenceId)this.occurrenceId=this.showId+':'+identity(entry)+':'+(++this.started);}return this.emit();
      }catch(error){if(generation!==this.generation||attempt!==this.playAttempt)return this.snapshot();if(error?.code==='AUTOPLAY_BLOCKED')return this.autoplayBlocked(generation,error.message);await this.adapter.stopAll({generation});if(generation!==this.generation||attempt!==this.playAttempt)return this.snapshot();this.needsStage=true;this.phase='error';this.error=String(error?.message||error);return this.emit();}
    }
    observedPlaying(token){
      if(this.disposed||token!==this.generation||!this.queue[this.index]||playback(this.queue[this.index]).provider!=='youtube'||!['ready','starting','paused','playing'].includes(this.phase))return this.snapshot();
      if(this.phase==='playing')return this.snapshot();const previous=this.phase==='starting'?this.playPreviousPhase:this.phase;
      this.phase='playing';this.error='';this.needsStage=false;if(previous!=='paused'||!this.occurrenceId)this.occurrenceId=this.showId+':'+identity(this.queue[this.index])+':'+(++this.started);return this.emit();
    }
    observedPaused(token){
      if(this.disposed||token!==this.generation||!this.queue[this.index]||playback(this.queue[this.index]).provider!=='youtube'||!['starting','playing'].includes(this.phase))return this.snapshot();
      ++this.playAttempt;this.phase='paused';return this.emit();
    }
    autoplayBlocked(token,message){
      if(this.disposed||token!==this.generation||!this.queue[this.index]||playback(this.queue[this.index]).provider!=='youtube'||!['ready','starting','paused'].includes(this.phase))return this.snapshot();
      ++this.playAttempt;this.phase=this.phase==='paused'?'paused':'ready';this.error=String(message||'YouTube needs a browser gesture. Press Play in the video.');return this.emit();
    }
    async pause(){this.ensure();const generation=this.generation;++this.playAttempt;if(this.adapter.pause)await this.adapter.pause(this.queue[this.index]||null,{generation});else await this.adapter.stopAll({generation});if(generation!==this.generation||this.disposed)return this.snapshot();if(this.index>=0)this.phase='paused';return this.emit();}
    async ended(token){
      this.ensure();if(token!==this.generation||!['playing','starting'].includes(this.phase))return this.snapshot();
      const generation=this.generation;this.phase='ending';this.emit();await this.adapter.stopAll({generation});
      if(generation!==this.generation)return this.snapshot();this.needsStage=true;const finishedId=identity(this.queue[this.index]);this.queue=localHolds(completed(this.queue,[finishedId],this.clock.now()));this.index=this.queue.findIndex(entry=>identity(entry)===finishedId);this.phase='ended';this.emit();
      if(this.autoplay&&this.mode==='ap'&&this.nextIndex()>=0){await this.loadNext();if(this.phase==='ready')return this.play();}
      return this.snapshot();
    }
    async failed(token,message){if(token!==this.generation||this.disposed)return this.snapshot();const generation=++this.generation;await this.adapter.stopAll({generation});if(generation!==this.generation)return this.snapshot();this.needsStage=true;this.phase='error';this.error=String(message||'The selected source could not play. Choose another source or skip it deliberately.');return this.emit();}
    async stop(){this.ensure();const generation=++this.generation;await this.adapter.stopAll({generation});if(generation!==this.generation)return this.snapshot();this.needsStage=true;this.clearWarning();this.phase=this.index>=0?'ready':'idle';this.error='';this.occurrenceId='';return this.emit();}
    async dispose(){if(this.disposed)return;await this.stop();this.disposed=true;if(this.adapter.dispose)await this.adapter.dispose();}
  }
  return {SCRIPT_VERSION,Coordinator,create:options=>new Coordinator(options),playback,flagged,identity,isHeld,wasPlayed};
});
