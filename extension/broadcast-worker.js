/* Catnap broadcast service worker, version 0.4.0.
 * Only the packaged toolbar control window can start capture. Suno content scripts never receive tokens.
 */
'use strict';
importScripts('broadcast-core.js','broadcast-metadata-core.js','presentation-control-worker.js');
const PANEL = chrome.runtime.getURL('broadcast.html');
const OFFSCREEN = chrome.runtime.getURL('broadcast-offscreen.html');
let creating, commandGeneration = 0;
// Metadata is kept separate from the audio peer. Content scripts receive only
// public text; the publisher key remains in extension session storage/worker.
const METADATA_SESSION = 'broadcastMetadataSession';
let metadataOperations = Promise.resolve();
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
    await readerControl(binding.sourceTabId,'start');
  });
}
async function receiveMetadata(message, sender) {
  return metadataTask(async () => {
    const binding = await metadataState();
    if (!binding?.live || !CatnapBroadcastMetadata.sourceAllowed(sender,chrome.runtime.id,binding.sourceTabId)) return {ok:false};
    if (message.action === 'ready') { await readerControl(binding.sourceTabId,'start'); return {ok:true}; }
    if (message.action !== 'update') return {ok:false};
    const metadata = CatnapBroadcastMetadata.sanitize(message.metadata);
    if (!metadata) return {ok:false};
    try { await postMetadata(binding,metadata); return {ok:true}; } catch (_) { return {ok:false}; }
  });
}
// A real extension window survives relay-permission prompts; action popups do not.
chrome.action.onClicked.addListener(tab => {
  (async () => {
    if (tab && /^https:\/\/(?:www\.)?suno\.com\//.test(tab.url || '')) await chrome.storage.session.set({broadcastSourceTabId:tab.id});
    const {broadcastWindowId} = await chrome.storage.session.get('broadcastWindowId');
    if (broadcastWindowId) { try { await chrome.windows.update(broadcastWindowId,{focused:true}); return; } catch (_) {} }
    const window = await chrome.windows.create({url:PANEL,type:'popup',width:420,height:740});
    await chrome.storage.session.set({broadcastWindowId:window.id});
  })().catch(() => { void chrome.action.setBadgeText({text:'ERR'}); });
});
async function offscreenExists() {
  return (await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT'],documentUrls:[OFFSCREEN]})).length > 0;
}
async function ensureOffscreen() {
  if (await offscreenExists()) return;
  if (!creating) creating = chrome.offscreen.createDocument({url:'broadcast-offscreen.html',reasons:['USER_MEDIA'],justification:'Publish explicitly selected Suno tab audio; preserve local listening.'}).finally(() => { creating = null; });
  await creating;
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message.target === 'broadcast-status' && sender.id === chrome.runtime.id && sender.url === OFFSCREEN) {
    const text=message.state==='live'?'LIVE':message.state==='idle'?'':message.state==='error'?'ERR':'…';
    void chrome.action.setBadgeText({text}); void chrome.action.setBadgeBackgroundColor({color:message.state==='error'?'#a12448':'#245b52'});
    void metadataStatus(message.state).catch(()=>{}); return;
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
      if (!tab || !/^https:\/\/(?:www\.)?suno\.com\//.test(tab.url || '')) throw Error('Open this panel from the Suno tab you want to broadcast.');
      await ensureOffscreen(); current();
      const status = await chrome.runtime.sendMessage({target:'broadcast-offscreen',action:'status'}); current();
      if (status && !['idle','error'].includes(status.state)) throw Error('A music broadcast is already active.');
      const streamId = await chrome.tabCapture.getMediaStreamId({targetTabId:tab.id}); current();
      const {broadcastToken = ''} = await chrome.storage.session.get('broadcastToken'); current();
      // Pin the actual captured tab. Opening the toolbar from another Suno tab
      // may change panel selection, but must never change this active binding.
      await bindMetadata(tab.id,endpoint); current();
      try {
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
      if (await offscreenExists()) return chrome.runtime.sendMessage({target:'broadcast-offscreen',action:'status'});
      return {state:'idle',message:'Ready. Music only; Discord voices stay separate.'};
    }
    throw Error('Unknown broadcast control.');
  })().then(result => reply(result), error => reply({error:error.message || 'Broadcast control failed.'}));
  return true;
});
