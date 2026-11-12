/* Catnap broadcast service worker, version 0.3.0.
 * Only the packaged toolbar control window can start capture. Suno content scripts never receive tokens.
 */
'use strict';
importScripts('broadcast-core.js');
const PANEL = chrome.runtime.getURL('broadcast.html');
const OFFSCREEN = chrome.runtime.getURL('broadcast-offscreen.html');
let creating, commandGeneration = 0;
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
    void chrome.action.setBadgeText({text}); void chrome.action.setBadgeBackgroundColor({color:message.state==='error'?'#a12448':'#245b52'}); return;
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
      return chrome.runtime.sendMessage({target:'broadcast-offscreen',action:'start',streamId,endpoint,token:broadcastToken});
    }
    if (message.action === 'stop') {
      ++commandGeneration;
      if (await offscreenExists()) return chrome.runtime.sendMessage({target:'broadcast-offscreen',action:'stop'});
      return {state:'idle',message:'Stopped.'};
    }
    if (message.action === 'status') {
      if (await offscreenExists()) return chrome.runtime.sendMessage({target:'broadcast-offscreen',action:'status'});
      return {state:'idle',message:'Ready. Music only; Discord voices stay separate.'};
    }
    throw Error('Unknown broadcast control.');
  })().then(result => reply(result), error => reply({error:error.message || 'Broadcast control failed.'}));
  return true;
});
