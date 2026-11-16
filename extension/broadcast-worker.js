/* Catnap broadcast service worker, version 0.7.0.
 * Only the packaged control window can start capture. Source pages receive status only.
 */
'use strict';
const SCRIPT_VERSION = '0.7.0';
importScripts('package-mode.js','broadcast-core.js','broadcast-source.js','broadcast-metadata-core.js','visualizer.js');
if(!globalThis.CatnapPackage?.radioOnly)importScripts('presentation-control-worker.js','inbox-core.js','suno-mcp.js','show-worker.js');
const PANEL = chrome.runtime.getURL('broadcast.html');
const OFFSCREEN = chrome.runtime.getURL('broadcast-offscreen.html');
let creating, commandGeneration = 0;
// Metadata is kept separate from the audio peer. Content scripts receive only
// public text; the publisher key remains in extension session storage/worker.
const METADATA_SESSION = 'broadcastMetadataSession';
let metadataOperations = Promise.resolve();
let lastVisualizerForward=0;
function metadataTask(operation) {
  const result = metadataOperations.then(operation);
  metadataOperations = result.catch(() => {});
  return result;
}
async function metadataState() {
  return (await chrome.storage.session.get(METADATA_SESSION))[METADATA_SESSION] || null;
}
async function readerControl(sourceTabId, action) {
  try { await chrome.tabs.sendMessage(sourceTabId,{target:'broadcast-metadata-reader',action},{frameId:0}); } catch (_) { /* A navigating source will announce ready after reload. */ }
}
async function postMetadata(binding, metadata) {
  // Reuse only the already-authorized WHIP origin; never accept an upload URL
  // or credentials from a content script or public page.
  const endpoint = CatnapBroadcast.endpoint(binding.endpoint);
  if (!await chrome.permissions.contains({origins:[CatnapBroadcast.permissionOrigin(endpoint)]})) return;
  const {broadcastToken = ''} = await chrome.storage.session.get('broadcastToken');
  if (!broadcastToken || /[\r\n]/.test(broadcastToken)) return;
  const body=CatnapBroadcastMetadata.serialize(metadata);
  if(!body)throw Error('Metadata update exceeds the public payload limit.');
  const response = await fetch(CatnapBroadcastMetadata.endpoint(endpoint),{
    method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+broadcastToken},
    body,credentials:'omit',redirect:'error',signal:AbortSignal.timeout(4000)
  });
  if (!response.ok) throw Error('Metadata update rejected.');
}
async function bindMetadata(sourceTabId, endpoint) {
  await metadataTask(async () => {
    const previous = await metadataState();
    if (previous) await readerControl(previous.sourceTabId,'stop');
    await chrome.storage.session.set({[METADATA_SESSION]:{sourceTabId,endpoint,live:false}});
  });
}
async function clearMetadata() {
  await metadataTask(async () => {
    const binding = await metadataState();
    await chrome.storage.session.remove(METADATA_SESSION);
    if (!binding) return;
    await readerControl(binding.sourceTabId,'stop');
    try { await postMetadata(binding,CatnapBroadcastMetadata.clear()); } catch (_) { /* Public server expiry also clears stale data. */ }
  });
}
function metadataStatus(state) {
  if (state === 'idle' || state === 'error') return clearMetadata();
  if (state !== 'live') return Promise.resolve();
  return metadataTask(async () => {
    const binding = await metadataState();
    if (!binding || binding.live) return;
    binding.live = true;
    await chrome.storage.session.set({[METADATA_SESSION]:binding});
    // AIU has no verified metadata adapter. Clear old song details rather than
    // guessing from an unrelated title; audio publishing is independent.
    const tab=await chrome.tabs.get(binding.sourceTabId).catch(()=>null);
    if(CatnapBroadcastSource.kind(tab?.url)==='suno')await readerControl(binding.sourceTabId,'start');
    else try{await postMetadata(binding,CatnapBroadcastMetadata.clear());}catch(_){}
  });
}
async function receiveMetadata(message, sender) {
  return metadataTask(async () => {
    const binding = await metadataState();
    if (!binding?.live || !CatnapBroadcastMetadata.sourceAllowed(sender,chrome.runtime.id,binding.sourceTabId)) return {ok:false};
    if (message.action === 'ready') { await readerControl(binding.sourceTabId,'start'); return {ok:true}; }
    if (message.action !== 'update') return {ok:false};
    const metadata = message.metadata?.version===1&&message.metadata.active===false?CatnapBroadcastMetadata.clear():CatnapBroadcastMetadata.sanitize(message.metadata);
    if (!metadata) return {ok:false};
    try { await postMetadata(binding,metadata); return {ok:true}; } catch (_) { return {ok:false}; }
  });
}
// A real extension window survives relay-permission prompts; action popups do not.
async function openPanel(tab){
    if(Number.isInteger(tab?.id)&&CatnapBroadcastSource.allowed(tab.url))await chrome.storage.session.set({broadcastSourceTabId:tab.id});
    else await chrome.storage.session.remove('broadcastSourceTabId');
    const {broadcastWindowId} = await chrome.storage.session.get('broadcastWindowId');
    if (broadcastWindowId) { try { await chrome.windows.update(broadcastWindowId,{focused:true}); return; } catch (_) {} }
    const window = await chrome.windows.create({url:PANEL,type:'popup',width:420,height:740});
    await chrome.storage.session.set({broadcastWindowId:window.id});
}
chrome.action.onClicked.addListener(tab => {
  openPanel(tab).catch(() => { void chrome.action.setBadgeText({text:'ERR'}); });
});
async function offscreenExists() {
  return (await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT'],documentUrls:[OFFSCREEN]})).length > 0;
}
async function ensureOffscreen() {
  if (await offscreenExists()) return;
  if (!creating) creating = chrome.offscreen.createDocument({url:'broadcast-offscreen.html',reasons:['USER_MEDIA'],justification:'Publish explicitly selected Suno or AIU player tab audio; preserve local listening.'}).finally(() => { creating = null; });
  await creating;
}
async function publisherStatus(){
  if(await offscreenExists())return await chrome.runtime.sendMessage({target:'broadcast-offscreen',action:'status'})||{state:'idle'};
  return {state:'idle',message:'Ready. Music only; Discord voices stay separate.'};
}
async function publicRadioStatus(tabId,state){
  const binding=await metadataState();
  const prefs=await chrome.storage.local.get('hideTheatreButton');
  if(!state)state=(await publisherStatus()).state;
  const states=['idle','starting','connecting','reconnecting','live','error'];
  return {ok:true,state:states.includes(state)?state:'idle',source:binding?.sourceTabId===tabId,
    hideTheatreButton:prefs.hideTheatreButton===true,radioOnly:globalThis.CatnapPackage?.radioOnly===true};
}
async function notifySource(tabId,state){
  if(!Number.isInteger(tabId))return;
  try{await chrome.tabs.sendMessage(tabId,{...await publicRadioStatus(tabId,state),target:'catnap-radio-state'},{frameId:0});}catch(_){}
}
// tabCapture can survive page navigation. Do not keep publishing a Discord,
// login or unrelated page after the selected music tab changes origin/path.
// A Radio-only package deliberately has no broad tabs permission: a revoked
// activeTab grant may hide the URL, and unknown URLs are held in the same way.
async function checkCapturedSource(tabId){
  const generation=commandGeneration;
  const binding=await metadataState();
  if(generation!==commandGeneration||binding?.sourceTabId!==tabId)return;
  const tab=await chrome.tabs.get(tabId).catch(()=>null);
  if(generation!==commandGeneration)return;
  if(CatnapBroadcastSource.allowed(tab?.url))return;
  const stopping=++commandGeneration,exists=await offscreenExists();
  if(stopping!==commandGeneration)return;
  if(exists)await chrome.runtime.sendMessage({target:'broadcast-offscreen',action:'stop'});
  if(stopping!==commandGeneration)return;
  await clearMetadata();
  await notifySource(tabId,'idle');
}
chrome.tabs.onUpdated?.addListener((tabId,change)=>{
  if(change.url||['loading','complete'].includes(change.status))void checkCapturedSource(tabId).catch(()=>{});
});
chrome.tabs.onRemoved?.addListener(tabId=>{void checkCapturedSource(tabId).catch(()=>{});});
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if(message?.target==='catnap-radio-ui'){
    if(!CatnapBroadcastSource.senderAllowed(sender,chrome.runtime.id))return;
    (async()=>{
      if(message.action==='open')await openPanel({...sender.tab,url:sender.url});
      else if(message.action!=='status')throw Error('Unknown radio display request.');
      return publicRadioStatus(sender.tab.id);
    })().then(reply,()=>reply({ok:false,state:'idle',source:false}));
    return true;
  }
  if(message.target==='broadcast-visualizer'){
    // Spectrum is a small local-only projection from the monitor we already
    // have. Only the actual captured source can receive it; toolbar selection
    // and arbitrary Suno pages cannot redirect or forge these updates.
    if(sender.id!==chrome.runtime.id||sender.url!==OFFSCREEN)return;
    const bands=CatnapVisualizer.sanitizeBands(message.bands),stamp=Date.now();
    if(!bands||stamp-lastVisualizerForward<100)return;lastVisualizerForward=stamp;
    void metadataState().then(binding=>{
      if(binding?.live)return chrome.tabs.sendMessage(binding.sourceTabId,{target:'catnap-visualizer-levels',bands,live:true},{frameId:0});
    }).catch(()=>{});
    return;
  }
  if (message.target === 'broadcast-status' && sender.id === chrome.runtime.id && sender.url === OFFSCREEN) {
    const text=message.state==='live'?'LIVE':message.state==='idle'?'':message.state==='error'?'ERR':'…';
    void chrome.action.setBadgeText({text}); void chrome.action.setBadgeBackgroundColor({color:message.state==='error'?'#a12448':'#245b52'});
    // Read the old binding before idle/error clears it, so its display resets.
    void metadataState().then(async binding=>{
      await metadataStatus(message.state);
      await notifySource(binding?.sourceTabId,message.state);
    }).catch(()=>{}); return;
  }
  if (message.target === 'broadcast-metadata') {
    receiveMetadata(message,sender).then(reply,()=>reply({ok:false})); return true;
  }
  if (message.target !== 'broadcast-worker' || sender.id !== chrome.runtime.id || sender.url !== PANEL) return;
  (async () => {
    if (message.action === 'start') {
      const generation = ++commandGeneration;
      const current = () => { if (generation !== commandGeneration) throw Error('Broadcast start cancelled.'); };
      const endpoint = CatnapBroadcast.endpoint(message.endpoint);
      if (!await chrome.permissions.contains({origins:[CatnapBroadcast.permissionOrigin(endpoint)]})) throw Error('Grant access to this relay first.');
      current();
      const {broadcastSourceTabId} = await chrome.storage.session.get('broadcastSourceTabId'); current();
      const tab = Number.isInteger(broadcastSourceTabId) ? await chrome.tabs.get(broadcastSourceTabId) : null; current();
      if (!tab || !CatnapBroadcastSource.allowed(tab.url)) throw Error('Click the Catnap toolbar icon on the Suno or AIU player tab you want to broadcast.');
      await ensureOffscreen(); current();
      const status = await chrome.runtime.sendMessage({target:'broadcast-offscreen',action:'status'}); current();
      if (status && !['idle','error'].includes(status.state)) throw Error('A music broadcast is already active.');
      let streamId;
      try{streamId=await chrome.tabCapture.getMediaStreamId({targetTabId:tab.id});}
      catch(_){throw Error('Click the Catnap toolbar icon on the source tab, then start again. Chrome requires that click before capturing its audio.');}
      current();
      const {broadcastToken = ''} = await chrome.storage.session.get('broadcastToken'); current();
      // Pin the actual captured tab. Opening the toolbar from another Suno tab
      // may change panel selection, but must never change this active binding.
      await bindMetadata(tab.id,endpoint); current();
      try {
        const latest=await chrome.tabs.get(tab.id);current();
        if(!CatnapBroadcastSource.allowed(latest?.url))throw Error('The source tab changed. Select a Suno or AIU player tab from the toolbar again.');
        const result = await chrome.runtime.sendMessage({target:'broadcast-offscreen',action:'start',streamId,endpoint,token:broadcastToken});
        if (!result || result.error || ['idle','error'].includes(result.state)) await clearMetadata();
        return result;
      } catch (error) { await clearMetadata(); throw error; }
    }
    if (message.action === 'stop') {
      ++commandGeneration;
      let result = {state:'idle',message:'Stopped.'};
      if (await offscreenExists()) result = await chrome.runtime.sendMessage({target:'broadcast-offscreen',action:'stop'});
      await clearMetadata();
      return result;
    }
    if (message.action === 'status') {
      const result=await publisherStatus(),binding=await metadataState();
      const selected=(await chrome.storage.session.get('broadcastSourceTabId')).broadcastSourceTabId;
      const id=binding?.sourceTabId??selected;
      const tab=Number.isInteger(id)?await chrome.tabs.get(id).catch(()=>null):null;
      return {...result,sourceLabel:CatnapBroadcastSource.label(tab?.url),sourceTitle:CatnapBroadcastMetadata.text(tab?.title||'',160),sourceSelected:CatnapBroadcastSource.allowed(tab?.url),
        radioOnly:globalThis.CatnapPackage?.radioOnly===true};
    }
    throw Error('Unknown broadcast control.');
  })().then(result => reply(result), error => reply({error:error.message || 'Broadcast control failed.'}));
  return true;
});
