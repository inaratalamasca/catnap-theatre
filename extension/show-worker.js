/* Catnap managed show worker, version 0.6.0.
 * Change summary: optional read-only uploader intake, private show queue,
 * explicit player binding, verified MCP playlist writes and bounded AP polling.
 * Tokens stay in the Suno module; uploader notes never enter public metadata.
 */
(() => {
  'use strict';
  const SCRIPT_VERSION = '0.6.4';
  const KEY = 'catnap-managed-show-v1', WINDOW_KEY = 'catnapShowWindow';
  const PAGE = chrome.runtime.getURL('show.html'), ALARM = 'catnap-inbox-watch';
  const SUNO = /^https:\/\/(?:www\.)?suno\.com\//, UPLOADER = 'https://uploader.aiu.fm';
  const text = (value, max = 200) => String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
  let tasks = Promise.resolve(), reading = false;
  const coordinatedActions=new Set(['configure','import','create-playlist','sync-playlist','bind-player','unbind-player','watch','new-show','load','next','previous','play','pause','stop','repeat-warning']);
  const coordinate=(action,fn)=>globalThis.CatnapShowCoordination?.runExclusive?globalThis.CatnapShowCoordination.runExclusive(action,fn):fn();
  const initial = () => ({version:1,id:crypto.randomUUID(),mode:'lp',showName:'',inboxId:'',inboxName:'',uploaderTabId:null,playerTabId:null,playlistId:'',entries:[],autoplay:false,warningSeconds:10,watch:{enabled:false,until:0},playback:null,lastRead:null,lastPlaylistSync:null,error:''});
  const get = async () => (await chrome.storage.local.get(KEY))[KEY] || initial();
  const save = async state => {await chrome.storage.local.set({[KEY]:state}); return state;};
  function serial(fn) {const result=tasks.then(fn);tasks=result.catch(()=>{});return result;}
  function publicEntry(entry) {
    const {id,submissionId,title,artist,disclaimer,sunoUrl,sunoId,youtubeUrl,youtubeId,preferredSource,state,holdReason,artworkUrl,lyrics,durationSeconds}=entry;
    return {id,submissionId,title,artist,disclaimer,sunoUrl,sunoId,youtubeUrl,youtubeId,preferredSource,state,holdReason,artworkUrl,lyrics,durationSeconds};
  }
  function showForPlayer(state) {return {id:state.id,bindingId:state.playerLease,mode:state.mode,name:state.showName,entries:state.entries.map(publicEntry),autoplay:state.autoplay,warningSeconds:state.warningSeconds};}
  async function publishState(state) {
    if(!Number.isInteger(state.playerTabId))return;
    const tab=await chrome.tabs.get(state.playerTabId).catch(()=>null);
    if(!tab||!SUNO.test(tab.url||'')){state.playerTabId=null;state.playback=null;await save(state);return;}
    const response=await chrome.tabs.sendMessage(tab.id,{target:'catnap-show-tab',action:'update',show:showForPlayer(state)},{frameId:0});
    if(response?.error)throw Error(response.error);
  }
  async function tabs() {
    return (await chrome.tabs.query({})).filter(t=>SUNO.test(t.url||'')||(t.url||'').startsWith(UPLOADER+'/'))
      .map(t=>({id:t.id,title:text(t.title),kind:SUNO.test(t.url||'')?'suno':'uploader'}));
  }
  async function uploader(state) {
    const tab=Number.isInteger(state.uploaderTabId)?await chrome.tabs.get(state.uploaderTabId).catch(()=>null):null;
    if(!tab||new URL(tab.url).origin!==UPLOADER)throw Error('Choose an open, signed-in AIU uploader tab.');
    if(!await chrome.permissions.contains({origins:[UPLOADER+'/*']}))throw Error('Enable inbox access first.');
    await chrome.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},files:['inbox-core.js','inbox-reader.js']});
    return tab;
  }
  async function read(state, action) {
    const tab=await uploader(state);
    const response=await chrome.tabs.sendMessage(tab.id,{target:'catnap-inbox',action,inboxId:state.inboxId,mode:state.mode},{frameId:0});
    if(!response?.ok)throw Error(response?.error||'The uploader did not return a valid response.');
    return response.data;
  }
  async function enrich(entry) {
    const copy={...entry};
    if(copy.youtubeId)copy.artworkUrl='https://i.ytimg.com/vi/'+copy.youtubeId+'/hqdefault.jpg';
    if(!copy.sunoUrl)return copy;
    try {
      const response=await fetch(copy.sunoUrl,{credentials:'omit',redirect:'follow',cache:'no-store',signal:AbortSignal.timeout(8000)});
      const parsed=CatnapInboxCore.parseSunoURL(response.url);
      if(parsed?.id){copy.sunoId=parsed.id;copy.sunoUrl=parsed.url||'https://suno.com/song/'+parsed.id;}
      if(!response.ok||!String(response.headers.get('content-type')).includes('text/html'))return copy;
      const html=(await response.text()).slice(0,2500000);
      // Only read an explicit OpenGraph image; never guess a CDN audio/art URL.
      const tags=html.match(/<meta\b[^>]*>/gi)||[];
      for(const tag of tags){
        if(!/\b(?:property|name)\s*=\s*["']og:image["']/i.test(tag))continue;
        const raw=/\bcontent\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.replace(/&amp;/g,'&');
        if(raw){const u=new URL(raw);if(u.protocol==='https:'&&!u.username&&!u.password&&/(^|\.)suno\.(?:ai|com)$/i.test(u.hostname)&&copy.preferredSource!=='youtube')copy.artworkUrl=u.href;}
      }
    }catch(_){/* A missing preview is visible; never start audio to fetch artwork. */}
    return copy;
  }
  async function enrichNew(entries,existing) {
    const known=new Map(existing.map(e=>[e.id,e]));let cursor=0;
    const out=new Array(entries.length);
    await Promise.all(Array.from({length:Math.min(entries.length,4)},async()=>{while(cursor<entries.length){
      const i=cursor++,entry=entries[i],old=known.get(entry.id);
      const reusable=old&&old.sunoUrl===entry.sunoUrl&&old.youtubeUrl===entry.youtubeUrl&&old.artworkUrl&&(!entry.sunoUrl||entry.sunoId);
      out[i]=reusable?{...entry,artworkUrl:old.artworkUrl,durationSeconds:old.durationSeconds}:await enrich(entry);
    }}));
    return out;
  }
  async function importInbox() {
    if(reading)throw Error('Inbox update already running.');
    reading=true;
    try {
      const start=await get();if(!start.inboxId)throw Error('Choose your LP or AP inbox.');
      const data=await read(start,'read');
      if(data.inbox?.id!==start.inboxId||data.inbox?.mode!==start.mode)throw Error('The returned inbox does not match the selected show.');
      const normalized=CatnapInboxCore.normalizeRows(data.rows,{inboxId:start.inboxId,mode:start.mode});
      const entries=await enrichNew(normalized.entries,start.entries);
      const state=await get();
      if(state.id!==start.id||state.inboxId!==start.inboxId)throw Error('The show changed during the inbox read.');
      state.entries=CatnapInboxCore.mergeEntries(state.entries,entries);
      state.inboxName=data.inbox.name;state.lastRead={at:Date.now(),pending:normalized.total,held:normalized.held.length};state.error='';
      await save(state);await publishState(state);return state;
    }finally{reading=false;}
  }
  async function syncPlaylist() {
    const state=await get();if(!state.playlistId)throw Error('Choose or create a destination Suno playlist.');
    const usable=state.entries.filter(e=>e.state!=='held'&&e.preferredSource);
    const unresolved=usable.filter(e=>e.sunoUrl&&!e.sunoId);
    if(unresolved.length)throw Error('Some Suno short links could not be resolved. Refresh the inbox or correct those links before syncing.');
    const ids=[...new Set(usable.map(e=>e.sunoId).filter(Boolean))];
    const result=await CatnapSuno.reconcilePlaylist(state.playlistId,ids,{isCurrent:async()=>{const now=await get();return now.id===state.id&&now.playlistId===state.playlistId;}});
    const latest=await get();if(latest.id!==state.id)throw Error('The show changed during playlist sync.');
    const metadata=new Map((result.clips||[]).map(clip=>[clip.id,clip]));
    latest.entries=latest.entries.map(entry=>{const clip=metadata.get(entry.sunoId);return clip?{...entry,durationSeconds:clip.durationSeconds,artworkUrl:entry.preferredSource==='youtube'?entry.artworkUrl:clip.artworkUrl||entry.artworkUrl}:entry;});
    latest.lastPlaylistSync={at:Date.now(),...result};await save(latest);await publishState(latest);return result;
  }
  async function playerHealth(state) {
    if(!Number.isInteger(state.playerTabId))return {linked:false,reason:'Choose a Suno tab, then Load or Play to connect the show.'};
    try{
      const tab=await chrome.tabs.get(state.playerTabId);
      if(!SUNO.test(tab.url||''))return {linked:false,reason:'The selected tab is no longer a Suno page.'};
      const response=await chrome.tabs.sendMessage(tab.id,{target:'catnap-show-tab',action:'status',showId:state.id,bindingId:state.playerLease},{frameId:0});
      const exact=response?.enabled===true&&response.showId===state.id&&response.bindingId===state.playerLease;
      const guarded=exact&&response.guard?.ready===true&&response.guard.enabled===true&&response.guard.integrity===true;
      return guarded?{linked:true,stageOpen:response.stageOpen===true,phase:response.playback?.phase||'idle'}:{linked:false,reason:'Theatre reloaded or its playback connection changed. Load or Play to reconnect.'};
    }catch(_){return {linked:false,reason:'Theatre is not responding. Load or Play to reconnect; refresh only the intended Suno tab if the extension was changed.'};}
  }
  async function stopBinding(state){
    if(!Number.isInteger(state.playerTabId))return;
    const tab=await chrome.tabs.get(state.playerTabId).catch(()=>null);
    if(!tab||!SUNO.test(tab.url||''))return; // Its prior document/media is gone.
    try{
      const reply=await playerCommand(state,'disable');
      if(reply?.enabled===false)return;
    }catch(_){/* A reloaded/invalidated isolated-world show may be absent. */}
    const results=await chrome.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},world:'MAIN',func:async()=>{
      const gate=globalThis.CatnapManagedNative;if(!gate?.command||!gate?.status)return {disabled:false};
      await gate.command({action:'disable'});
      if(gate.status().enabled!==false)return {disabled:false};
      // These are our own managed iframe elements. Explicitly returning to
      // ordinary playback must not leave an old, disconnected video audible.
      for(const frame of document.querySelectorAll('#catnap-theater-root .ct-managed-youtube')){
        try{const origin=new URL(frame.src).origin;if(origin==='https://www.youtube-nocookie.com')frame.contentWindow?.postMessage(JSON.stringify({event:'command',func:'pauseVideo',args:[]}),origin);}catch(_){}
        frame.remove();
      }
      return {disabled:true};
    }});
    if(results[0]?.result?.disabled!==true)throw Error('The old player could not be stopped safely. Refresh that Suno tab between broadcasts, then return to ordinary playback.');
  }
  async function bindPlayer(state,tabId) {
    const tab=await chrome.tabs.get(Number(tabId));
    if(!SUNO.test(tab.url||''))throw Error('Choose an open Suno tab.');
    await stopBinding(state);
    await chrome.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},world:'MAIN',files:['managed-native-guard.js']});
    state.playerTabId=tab.id;state.playerLease=crypto.randomUUID();state.playback=null;await save(state);
    try{
      const response=await chrome.tabs.sendMessage(tab.id,{target:'catnap-show-tab',action:'enable',show:showForPlayer(state)},{frameId:0});
      if(!response?.enabled)throw Error(response?.error||'The managed Theatre is not loaded in this tab. Refresh the intended Suno tab between broadcasts.');
      const health=await playerHealth(state);
      if(!health.linked)throw Error(health.reason);
      return {state,response};
    }catch(error){
      try{await chrome.tabs.sendMessage(tab.id,{target:'catnap-show-tab',action:'disable'},{frameId:0});}catch(_){}
      await chrome.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},world:'MAIN',func:()=>globalThis.CatnapManagedNative?.command({action:'disable'})}).catch(()=>{});
      state.playerTabId=null;state.playerLease=null;state.playback=null;await save(state);throw error;
    }
  }
  async function ensurePlayer(state,tabId){
    const chosen=Number(tabId)||state.playerTabId;
    if(!Number.isInteger(chosen))throw Error('Choose the Suno / Theatre tab first.');
    const health=chosen===state.playerTabId?await playerHealth(state):{linked:false};
    if(health.linked)return state;
    return (await bindPlayer(state,chosen)).state;
  }
  async function playerCommand(state,action,extra={}) {
    if(!Number.isInteger(state.playerTabId))throw Error('Link this show to your Suno Theatre tab first.');
    const tab=await chrome.tabs.get(state.playerTabId);if(!SUNO.test(tab.url||''))throw Error('The linked Suno tab has changed.');
    const response=await chrome.tabs.sendMessage(tab.id,{target:'catnap-show-tab',action,showId:state.id,...extra},{frameId:0});
    if(response?.error)throw Error(response.error);return response;
  }
  async function open(sourceTabId) {
    if(Number.isInteger(sourceTabId)){
      const tab=await chrome.tabs.get(sourceTabId).catch(()=>null);
      if(tab&&SUNO.test(tab.url||''))await chrome.storage.session.set({catnapShowSuggestedTabId:sourceTabId});
    }
    const record=(await chrome.storage.session.get(WINDOW_KEY))[WINDOW_KEY];
    if(record?.windowId){try{await chrome.windows.update(record.windowId,{focused:true});return {opened:true};}catch(_){}}
    const window=await chrome.windows.create({url:PAGE,type:'popup',width:640,height:920});
    await chrome.storage.session.set({[WINDOW_KEY]:{windowId:window.id}});return {opened:true};
  }
  async function trustedPage(sender) {
    return sender.id===chrome.runtime.id&&sender.url===PAGE;
  }
  async function handle(message,sender) {
    if(message.action==='open'){
      if(sender.id!==chrome.runtime.id)throw Error('Untrusted show control.');
      if(sender.tab&&SUNO.test(sender.url||''))return open(sender.tab.id);
      if(sender.url===chrome.runtime.getURL('broadcast.html'))return open((await chrome.storage.session.get('broadcastSourceTabId')).broadcastSourceTabId);
      if(sender.url?.startsWith(chrome.runtime.getURL('presentation-panel.html')+'?control=')){
        const nonce=new URL(sender.url).searchParams.get('control');
        const binding=(await chrome.storage.session.get('presentationControlWindows')).presentationControlWindows?.[nonce];
        if(binding)return open(binding.tabId);
      }
      throw Error('Open show controls from Theatre or its toolbar controls.');
    }
    if(!await trustedPage(sender))throw Error('Untrusted show controls.');
    if(globalThis.CatnapPackage?.inboxOnly&&['bind-player','unbind-player','load','next','previous','play','pause','stop','repeat-warning','announcement'].includes(message.action))throw Error('The standalone Inbox package creates playlists. Use Catnap Theatre for managed playback.');
    if(message.action==='status'){const state=await get();return {state,playbackHealth:await playerHealth(state),tabs:await tabs(),suno:await CatnapSuno.status(),suggestedTabId:(await chrome.storage.session.get('catnapShowSuggestedTabId')).catnapShowSuggestedTabId,version:SCRIPT_VERSION};}
    if(message.action==='configure'){
      const state=await get(), changes=message.settings||{};
      if(changes.mode!==undefined){if(!['lp','ap'].includes(changes.mode))throw Error('Choose LP or AP.');if(state.entries.length&&changes.mode!==state.mode)throw Error('Start a new show before changing party type.');state.mode=changes.mode;if(state.mode==='lp')state.autoplay=false;}
      if(changes.showName!==undefined)state.showName=text(changes.showName,100);
      if(changes.uploaderTabId!==undefined)state.uploaderTabId=Number(changes.uploaderTabId)||null;
      if(changes.inboxId!==undefined){if(state.entries.length&&changes.inboxId!==state.inboxId)throw Error('Start a new show before switching inboxes.');if(!/^[\w.-]{1,80}$/.test(changes.inboxId)||changes.inboxId.includes('..'))throw Error('Invalid inbox.');state.inboxId=changes.inboxId;}
      if(changes.playlistId!==undefined){if(changes.playlistId&&!/^[a-f0-9-]{36}$/i.test(changes.playlistId))throw Error('Invalid playlist.');state.playlistId=changes.playlistId;}
      if(changes.autoplay!==undefined){if(state.mode==='lp'&&changes.autoplay)throw Error('LP uses manual playback.');state.autoplay=changes.autoplay===true;}
      if(changes.warningSeconds!==undefined){const seconds=Number(changes.warningSeconds);if(!Number.isFinite(seconds)||seconds<2||seconds>120)throw Error('Warning duration must be 2–120 seconds.');state.warningSeconds=seconds;}
      await save(state);await publishState(state);return state;
    }
    if(message.action==='discover')return read(await get(),'discover');
    if(message.action==='import')return importInbox();
    if(message.action==='connect-suno')return CatnapSuno.connect();
    if(message.action==='disconnect-suno')return CatnapSuno.disconnect();
    if(message.action==='playlists')return CatnapSuno.listPlaylists();
    if(message.action==='create-playlist'){
      const playlist=await CatnapSuno.createPlaylist(text(message.name,100),message.visibility==='public'?'public':'private');
      const state=await get();state.playlistId=playlist.id;await save(state);return playlist;
    }
    if(message.action==='sync-playlist')return syncPlaylist();
    if(message.action==='bind-player')return (await bindPlayer(await get(),message.tabId)).response;
    if(message.action==='unbind-player'){
      const state=await get();await stopBinding(state);state.playerTabId=null;state.playerLease=null;state.playback=null;await save(state);return state;
    }
    if(['load','next','previous','play','pause','stop','repeat-warning'].includes(message.action)){
      let state=await get();
      if(['load','next','previous','play'].includes(message.action))state=await ensurePlayer(state,message.tabId);
      else if(!(await playerHealth(state)).linked)throw Error('The show connection is inactive. Load or Play to reconnect first.');
      return playerCommand(state,message.action,{index:Number(message.index)});
    }
    if(message.action==='watch'){
      const state=await get();if(state.mode!=='ap'&&message.enabled)throw Error('Automatic inbox updates are for AP mode. Use Refresh inbox for LP.');
      state.watch={enabled:message.enabled===true,until:message.enabled?Date.now()+12*3600000:0};await save(state);
      if(state.watch.enabled){await chrome.alarms.create(ALARM,{periodInMinutes:2});await importInbox();if(state.playlistId)await syncPlaylist();}else await chrome.alarms.clear(ALARM);
      return get();
    }
    if(message.action==='new-show'){
      const old=await get();await stopBinding(old);await chrome.alarms.clear(ALARM);
      return save({...initial(),uploaderTabId:old.uploaderTabId});
    }
    if(message.action==='announcement'){
      const state=await get();if(!(await playerHealth(state)).linked)throw Error('Reconnect Theatre before copying current-song information.');const current=state.entries.find(e=>e.id===state.playback?.current?.id);
      if(!current)throw Error('Load a show entry in Theatre first.');
      const source=state.playback.source||current.preferredSource;
      const url=source==='youtube'?current.youtubeUrl:current.sunoUrl;
      const safe=value=>text(value,200).replace(/@/g,'＠');
      return {text:`${state.playback.phase==='playing'?'Now playing':'Loaded'}: ${safe(current.title)}${current.artist?' — '+safe(current.artist):''}\nSubmitted by: ${safe(current.uploaderName||'Unavailable')}\n${url||''}`,
        context:{version:1,showId:state.id,entryId:current.id,occurrenceId:state.playback.occurrenceId,phase:state.playback.phase,title:current.title,artist:current.artist,source,url,uploaderName:current.uploaderName,disclaimer:current.disclaimer,...(message.includeNotes===true?{uploaderNote:current.note}:{})}};
    }
    throw Error('Unknown show control.');
  }
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if(message?.target==='catnap-show-intent'){
      serial(async()=>{
        if(sender.id!==chrome.runtime.id||sender.frameId!==0||!Number.isInteger(sender.tab?.id)||!SUNO.test(sender.url||''))throw Error('Untrusted Theatre playback request.');
        if(!['toggle','next','previous'].includes(message.action))throw Error('Unknown Theatre playback request.');
        let state=await get();
        const path=new URL(sender.url).pathname;
        const matchingPlaylist=state.playlistId&&path.replace(/\/$/,'').toLowerCase()==='/playlist/'+state.playlistId.toLowerCase();
        // Never steal a show already bound to another tab just because the
        // same playlist is visible there. Unrelated tabs retain normal Theatre.
        const intended=state.playerTabId===sender.tab.id||(!state.playerTabId&&matchingPlaylist);
        if(!intended||!state.entries.length)return {ok:true,handled:false};
        return coordinate(message.action==='toggle'?'play':message.action,async()=>{
          state=await ensurePlayer(state,sender.tab.id);
          await playerCommand(state,message.action);return {ok:true,handled:true};
        });
      }).then(reply,error=>reply({ok:false,handled:true,error:error.message}));return true;
    }
    if(message?.target==='managed-native'){
      (async()=>{
        const state=await get();if(sender.id!==chrome.runtime.id||sender.tab?.id!==state.playerTabId||sender.frameId!==0||!SUNO.test(sender.url||'')||message.showId!==state.id||message.bindingId!==state.playerLease)throw Error('Unbound managed player.');
        if(!['enable','block','play','pause','disable','status'].includes(message.action))throw Error('Unknown media command.');
        const result=await chrome.scripting.executeScript({target:{tabId:sender.tab.id,frameIds:[0]},world:'MAIN',func:command=>{if(!globalThis.CatnapManagedNative)throw Error('Native playback guard unavailable.');return globalThis.CatnapManagedNative.command(command);},args:[{action:message.action,generation:message.generation,songId:message.songId,sourceKey:message.sourceKey,restart:message.restart}]});
        return {ok:true,data:result[0]?.result};
      })().then(reply,error=>reply({ok:false,error:error.message}));return true;
    }
    if(message?.target==='catnap-show-observed'){
      serial(async()=>{
        const state=await get();if(sender.id!==chrome.runtime.id||sender.tab?.id!==state.playerTabId||sender.frameId!==0||!SUNO.test(sender.url||'')||message.showId!==state.id||message.bindingId!==state.playerLease||!Number.isInteger(message.revision)||message.revision<1)return {ok:false};
        if(state.playback&&(message.revision<=state.playback.revision||Number(message.playback?.generation)<state.playback.generation))return {ok:false};
        const p=message.playback||{},current=state.entries.find(e=>e.id===p.current?.id);
        const source=p.source||p.current?.playbackSource||p.current?.preferredSource;
        const validSource=current&&((source==='suno'&&current.sunoUrl)||(source==='youtube'&&current.youtubeUrl))?source:null;
        state.playback={phase:text(p.phase,30),index:p.index,generation:p.generation,revision:message.revision,occurrenceId:text(p.occurrenceId,100),autoplay:p.autoplay===true,error:text(p.error,300),source:validSource,current:current?{id:current.id}:null};await save(state);return {ok:true};
      }).then(reply,error=>reply({error:error.message}));return true;
    }
    if(message?.target!=='catnap-show-worker')return;
    const run=()=>handle(message,sender);
    const controlled=async()=>await trustedPage(sender)&&coordinatedActions.has(message.action)?coordinate(message.action,run):run();
    (message.action==='status'?run():serial(controlled)).then(data=>reply({ok:true,data}),error=>reply({ok:false,error:error.message||'Show control failed.'}));return true;
  });
  chrome.alarms.onAlarm.addListener(alarm=>{
    if(alarm.name!==ALARM)return;
    void serial(()=>coordinate('watch-tick',async()=>{
      const state=await get();if(!state.watch.enabled||state.mode!=='ap'||Date.now()>=state.watch.until){state.watch={enabled:false,until:0};await save(state);await chrome.alarms.clear(ALARM);return;}
      try{await importInbox();if(state.playlistId)await syncPlaylist();}catch(error){const latest=await get();latest.error=text(error.message,300);latest.watch={enabled:false,until:0};await save(latest);await chrome.alarms.clear(ALARM);}
    })).catch(async error=>{const state=await get();state.watch={enabled:false,until:0};state.error=text(error.message,300);await save(state);await chrome.alarms.clear(ALARM);});
  });
  chrome.runtime.onStartup.addListener(()=>{void serial(async()=>{await chrome.alarms.clear(ALARM);const state=await get();state.watch={enabled:false,until:0};state.playerTabId=null;state.playback=null;await save(state);});});
  globalThis.CatnapShowWorker={version:SCRIPT_VERSION,open};
})();
