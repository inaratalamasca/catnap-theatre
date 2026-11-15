/* Catnap presentation controls, version 0.5.0.
 * Reusable windows stay pinned to their originating Suno tab. This module has
 * no broadcast, navigation, audio-capture or playback commands.
 */
(() => {
  'use strict';
  const PANEL = chrome.runtime.getURL('presentation-panel.html');
  const KEY = 'presentationControlWindows';
  const SUNO = /^https:\/\/(?:www\.)?suno\.com\//;
  const ACTIONS = new Set(['state','set-settings','field','button','preset','file-begin','file-chunk','file-finish','file-cancel']);
  const opening = new Map();
  let mutations = Promise.resolve();
  function mutate(update) {
    const result = mutations.then(async () => {
      const data = (await chrome.storage.session.get(KEY))[KEY] || {};
      await update(data);
      await chrome.storage.session.set({[KEY]:data});
      return data;
    });
    mutations = result.catch(() => {});
    return result;
  }
  async function open(tabId) {
    if (opening.has(tabId)) return opening.get(tabId);
    const pending = (async () => {
      const data = (await chrome.storage.session.get(KEY))[KEY] || {};
      for (const [nonce, binding] of Object.entries(data)) {
        if (binding.tabId !== tabId) continue;
        try { await chrome.windows.update(binding.windowId,{focused:true}); return {opened:true}; }
        catch (_) { await mutate(next => {delete next[nonce];}); }
      }
      const nonce = crypto.randomUUID();
      // Store source binding before the page loads and asks for its first state.
      await mutate(next => {next[nonce]={tabId,windowId:null};});
      try {
        const window = await chrome.windows.create({url:PANEL+'?control='+nonce,type:'popup',width:470,height:880});
        await mutate(next => {if(next[nonce])next[nonce].windowId=window.id;});
        return {opened:true};
      } catch (error) {
        await mutate(next => {delete next[nonce];});
        throw error;
      }
    })().finally(() => opening.delete(tabId));
    opening.set(tabId,pending);
    return pending;
  }
  chrome.windows.onRemoved.addListener(windowId => {
    void mutate(data => {for(const [nonce,binding] of Object.entries(data))if(binding.windowId===windowId)delete data[nonce];});
  });
  chrome.runtime.onMessage.addListener((message,sender,reply) => {
    if (!message || message.target !== 'presentation-worker' || sender.id !== chrome.runtime.id) return;
    (async () => {
      if (message.action === 'open') {
        if (!Number.isInteger(sender.tab?.id) || !SUNO.test(sender.url || '')) throw Error('Open presentation controls from your Suno Theatre.');
        return open(sender.tab.id);
      }
      if (!ACTIONS.has(message.action)) throw Error('Unknown presentation control.');
      const expected = PANEL+'?control='+message.control;
      if (sender.url !== expected || typeof message.control !== 'string') throw Error('Untrusted presentation control window.');
      const binding = (await chrome.storage.session.get(KEY))[KEY]?.[message.control];
      if (!binding || !Number.isInteger(binding.tabId)) throw Error('This control window is no longer linked. Reopen it from Theatre.');
      const tab = await chrome.tabs.get(binding.tabId);
      if (tab.url && !SUNO.test(tab.url)) throw Error('The linked Suno tab has changed. Reopen controls from Theatre.');
      const command = {...message,target:'presentation-tab'};
      delete command.control;
      return chrome.tabs.sendMessage(binding.tabId,command);
    })().then(reply,error => reply({error:error.message || 'Presentation control failed.'}));
    return true;
  });
})();
