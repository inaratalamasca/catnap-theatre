/* Catnap broadcast toolbar panel, version 0.3.0. Endpoint persistent; token session-only. */
'use strict';
const buildVersion = document.querySelector('#build-version');
if (buildVersion) buildVersion.textContent = 'DEV ' + chrome.runtime.getManifest().version;
const endpoint = document.querySelector('#endpoint'), token = document.querySelector('#token');
const statusLine = document.querySelector('#status'), start = document.querySelector('#start'), stop = document.querySelector('#stop');
let busy = false, panelError = '';
document.querySelector('#show-controls')?.addEventListener('click',async()=>{try{const result=await chrome.runtime.sendMessage({target:'catnap-show-worker',action:'open'});if(!result?.ok)throw Error(result?.error||'Show controls unavailable.');}catch(error){show({error:error.message});}});
async function command(action, extra = {}) { return chrome.runtime.sendMessage({target:'broadcast-worker',action,...extra}); }
function show(value) {
  if (!value) return;
  if (value.error) panelError=value.error;
  if (value.state && !['idle','error'].includes(value.state)) panelError='';
  statusLine.textContent = panelError || value.message || value.state;
  document.querySelector('#level').value = value.level || 0;
  const active = value.state && !['idle','error'].includes(value.state);
  start.disabled = busy || active; stop.disabled = !busy && !active;
}
(async () => { const settings = await chrome.storage.local.get('broadcastEndpoint'); endpoint.value=settings.broadcastEndpoint || CatnapBroadcast.DEFAULT_ENDPOINT; token.value=(await chrome.storage.session.get('broadcastToken')).broadcastToken || ''; show(await command('status')); })().catch(error => show({error:error.message}));
start.addEventListener('click', async () => {
  // Optional relay host permission is requested only by this explicit user gesture.
  try {
    panelError='';
    const url = CatnapBroadcast.endpoint(endpoint.value), origin = CatnapBroadcast.permissionOrigin(url);
    const permitted = await chrome.permissions.request({origins:[origin]});
    if (!permitted) throw Error('Relay access was not granted.');
    busy = true; show({state:'starting',message:'Starting music broadcast…'});
    await chrome.storage.local.set({broadcastEndpoint:url});
    await chrome.storage.session.set({broadcastToken:token.value.trim()});
    show(await command('start',{endpoint:url}));
  } catch (error) { show({error:error.message}); }
  finally { busy=false; show(await command('status')); }
});
stop.addEventListener('click', async () => { panelError='';busy=true; try { show(await command('stop')); } catch(error) { show({error:error.message}); } finally {busy=false;show(await command('status'));} });
setInterval(() => { if (!busy) command('status').then(show).catch(()=>{}); },1000);
