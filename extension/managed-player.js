/* Catnap managed show coordinator, version 0.6.0.
 * Change summary: independently staged mixed-source entries, manual LP endings,
 * opt-in AP autoplay, timed uploader flags and generation-bound playback events.
 * This module performs no network, DOM or account operation itself. Its adapter
 * MUST enforce an inaudible stage/stop boundary before native media is selected.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CatnapManagedPlayer=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SCRIPT_VERSION='0.6.0';
  const clean=value=>typeof value==='string'?value.trim():'';
  const identity=entry=>clean(entry?.entryId)||clean(entry?.id);
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
      this.clock={now:clock.now||Date.now,setTimeout:clock.setTimeout||setTimeout,clearTimeout:clock.clearTimeout||clearTimeout};
      this.queue=[];this.showId='';this.mode='lp';this.autoplay=false;this.index=-1;this.phase='idle';this.generation=0;this.occurrenceId='';this.error='';this.warning=null;this.warningTimer=null;this.warningSeconds=warningDuration(warningSeconds);this.disposed=false;this.started=0;this.playAttempt=0;this.needsStage=true;this.playPreviousPhase='ready';
    }
    snapshot(){return {version:SCRIPT_VERSION,showId:this.showId,mode:this.mode,autoplay:this.autoplay,index:this.index,current:this.queue[this.index]||null,queue:this.queue.slice(),phase:this.phase,generation:this.generation,occurrenceId:this.occurrenceId,error:this.error,warning:this.warning?{...this.warning}:null,warningSeconds:this.warningSeconds};}
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
      this.clearWarning();this.queue=entries.map(entry=>({...entry}));this.showId=clean(showId);this.mode=mode;this.autoplay=mode==='ap'&&autoplay===true;this.index=-1;this.phase='idle';this.error='';this.occurrenceId='';this.needsStage=true;return this.emit();
    }
    appendQueue(entries){
      this.ensure();if(!Array.isArray(entries))throw Error('New entries must be a list.');
      const known=new Map(this.queue.map((entry,index)=>[identity(entry),index]));
      for(const entry of entries){const id=identity(entry);if(!id)throw Error('A submission needs a show entry ID.');if(!known.has(id)){if(this.queue.length>=1000)throw Error('The show queue limit was reached.');known.set(id,this.queue.length);this.queue.push({...entry});}else{
        const index=known.get(id),previous=this.queue[index],updated={...previous,...entry};
        // Updating an inbox note/flag must never retarget the prepared/playing
        // source. The host can deliberately reload to apply a source edit.
        if(index===this.index&&this.phase!=='idle')for(const key of ['id','entryId','source','playbackSource','preferredSource','sunoUrl','sunoId','sunoShortCode','youtubeUrl','youtubeId','sources','url','state']){if(Object.hasOwn(previous,key))updated[key]=previous[key];else delete updated[key];}
        this.queue[index]=updated;
      }}
      return this.emit();
    }
    async load(index){
      this.ensure();if(!Number.isInteger(index)||index<0||index>=this.queue.length)throw Error('Choose a song in the show queue.');
      const generation=++this.generation;this.phase='loading';this.error='';this.occurrenceId='';this.needsStage=true;this.clearWarning();this.emit();
      try{
        // Hard stop before staging. Merely waiting for native Pause after a
        // native Next click can leak the next song and is not an adapter contract.
        await this.adapter.stopAll({generation});if(generation!==this.generation)return this.snapshot();
        this.index=index;const entry=this.queue[index];playback(entry);this.showWarning(entry);this.emit();
        await this.adapter.stage(entry,{generation});if(generation!==this.generation)return this.snapshot();
        this.needsStage=false;this.phase='ready';return this.emit();
      }catch(error){if(generation!==this.generation)return this.snapshot();this.phase='error';this.error=String(error?.message||error);return this.emit();}
    }
    async loadNext(){return this.load(this.index+1);}
    async loadPrevious(){return this.load(this.index-1);}
    async play(){
      this.ensure();if(!['ready','paused','ended'].includes(this.phase))throw Error('Load a playable song before pressing Play.');
      const generation=this.generation,attempt=++this.playAttempt,entry=this.queue[this.index],previousPhase=this.phase;if(!entry)throw Error('No song is loaded.');
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
    async pause(){this.ensure();const generation=this.generation;++this.playAttempt;if(this.adapter.pause)await this.adapter.pause(this.queue[this.index]||null,{generation});else await this.adapter.stopAll({generation});if(generation===this.generation&&this.index>=0)this.phase='paused';return this.emit();}
    async ended(token){
      this.ensure();if(token!==this.generation||!['playing','starting'].includes(this.phase))return this.snapshot();
      const generation=this.generation;this.phase='ending';this.emit();await this.adapter.stopAll({generation});
      if(generation!==this.generation)return this.snapshot();this.needsStage=true;this.phase='ended';this.emit();
      if(this.autoplay&&this.mode==='ap'&&this.index+1<this.queue.length){await this.loadNext();if(this.phase==='ready')return this.play();}
      return this.snapshot();
    }
    async failed(token,message){if(token!==this.generation||this.disposed)return this.snapshot();const generation=++this.generation;await this.adapter.stopAll({generation});if(generation!==this.generation)return this.snapshot();this.needsStage=true;this.phase='error';this.error=String(message||'The selected source could not play. Choose another source or skip it deliberately.');return this.emit();}
    async stop(){this.ensure();const generation=++this.generation;await this.adapter.stopAll({generation});if(generation!==this.generation)return this.snapshot();this.needsStage=true;this.clearWarning();this.phase=this.index>=0?'ready':'idle';this.error='';this.occurrenceId='';return this.emit();}
    async dispose(){if(this.disposed)return;await this.stop();this.disposed=true;if(this.adapter.dispose)await this.adapter.dispose();}
  }
  return {SCRIPT_VERSION,Coordinator,create:options=>new Coordinator(options),playback,flagged,identity};
});
