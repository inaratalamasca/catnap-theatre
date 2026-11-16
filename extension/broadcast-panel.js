/* Catnap broadcast toolbar panel, version 0.7.0.
 * Shared Suno/AIU controls; source status is worker-owned, token session-only.
 * Pending grants are cancellable. Token presence never implies validation.
 */
'use strict';
const buildVersion = document.querySelector('#build-version');
if (buildVersion) buildVersion.textContent = (globalThis.CatnapPackage?.radioOnly?'CATNAP RADIO':'CATNAP THEATRE')+' · DEVELOPMENT '+chrome.runtime.getManifest().version;
const endpoint = document.querySelector('#endpoint'), token = document.querySelector('#token');
const statusLine = document.querySelector('#status'), start = document.querySelector('#start'), stop = document.querySelector('#stop');
let busy=false,stopping=false,panelError='',publisherState='idle',commandGeneration=0,statusRevision=0;
let submittedToken='',rejectedToken=null;
const radioOnly=globalThis.CatnapPackage?.radioOnly===true;
document.querySelector('#show-controls').hidden=radioOnly;
document.querySelector('#theatre-preference').hidden=radioOnly;
const hideTheatre=document.querySelector('#hide-theatre');
hideTheatre.addEventListener('change',()=>{
  chrome.storage.local.set({hideTheatreButton:hideTheatre.checked}).catch(error=>show({error:error.message}));
});
document.querySelector('#show-controls')?.addEventListener('click',async()=>{try{const result=await chrome.runtime.sendMessage({target:'catnap-show-worker',action:'open'});if(!result?.ok)throw Error(result?.error||'Show controls unavailable.');}catch(error){show({error:error.message});}});
async function command(action, extra = {}) { return chrome.runtime.sendMessage({target:'broadcast-worker',action,...extra}); }
const malformed=value=>/[\u0000-\u001f\u007f]|[^\u0000-\u00ff]/.test(value);
function tokenStatus(){
  const raw=token.value,value=raw.trim();
  const state=malformed(raw)?'malformed':!value?'missing':rejectedToken===value?'rejected':'entered';
  const text=state==='malformed'?'Malformed token · paste the supplied token again':state==='missing'?'No token entered':state==='rejected'?'Token rejected by relay · check or replace it':'Token entered · not validated';
  token.dataset.tokenState=state;
  document.querySelector('#token-status').dataset.state=state;
  const label=document.querySelector('#token-status-label');if(label.textContent!==text)label.textContent=text;
}
token.addEventListener('input',()=>{if(token.value.trim()!==rejectedToken)rejectedToken=null;tokenStatus();});
function controls(){
  const active=!['idle','error'].includes(publisherState);
  start.disabled=busy||active;stop.disabled=stopping||(!busy&&!active);
  const live=publisherState==='live',indicator=document.querySelector('#on-air');
  indicator.dataset.live=String(live);
  const label=document.querySelector('#on-air-label'),text=live?'On Air':publisherState==='unknown'?'Status unavailable':'Not live';if(label.textContent!==text)label.textContent=text;
}
function show(value) {
  if (!value) return;
  if(['idle','starting','connecting','reconnecting','live','error','unknown'].includes(value.state))publisherState=value.state;
  const failure=value.error||(value.state==='error'?value.message:'');
  if(failure==='Relay rejected the publish token.'&&token.value.trim()===submittedToken)rejectedToken=submittedToken;
  if(['connecting','live'].includes(value.state)&&token.value.trim()===submittedToken)rejectedToken=null;
  tokenStatus();
  if (value.error) panelError=value.error;
  if (value.state && !value.error && !['idle','error','unknown'].includes(value.state)) panelError='';
  statusLine.textContent = panelError || value.message || value.state;
  statusLine.dataset.state=panelError?'error':value.state||'idle';
  if(typeof value.sourceSelected==='boolean'){
    const source=document.querySelector('#source');
    source.textContent=value.sourceSelected?value.sourceLabel+(value.sourceTitle?' · '+value.sourceTitle:''):'Open Suno or the AIU player and click the Catnap toolbar icon there.';
  }
  document.querySelector('#level').value = value.level || 0;
  controls();
}
async function refreshStatus(){
  const generation=commandGeneration,revision=++statusRevision;
  try{const result=await command('status');if(generation===commandGeneration&&revision===statusRevision&&!busy)show(result);}
  catch(error){if(generation===commandGeneration&&revision===statusRevision&&!busy)show({state:'unknown',error:error.message});}
}
(async () => { const settings = await chrome.storage.local.get(['broadcastEndpoint','hideTheatreButton']); endpoint.value=settings.broadcastEndpoint || CatnapBroadcast.DEFAULT_ENDPOINT; hideTheatre.checked=settings.hideTheatreButton===true; token.value=(await chrome.storage.session.get('broadcastToken')).broadcastToken || '';submittedToken=token.value.trim();tokenStatus();await refreshStatus(); })().catch(error => show({error:error.message}));
start.addEventListener('click', async () => {
  if(busy||!['idle','error'].includes(publisherState))return;
  const generation=++commandGeneration,current=()=>generation===commandGeneration;
  ++statusRevision;busy=true;panelError='';show({state:'starting',message:'Waiting for relay access…'});
  // Optional relay host permission is requested only by this explicit user gesture.
  try {
    const url = CatnapBroadcast.endpoint(endpoint.value), origin = CatnapBroadcast.permissionOrigin(url);
    const rawToken=token.value,publishToken=rawToken.trim();
    if(malformed(rawToken))throw Error('Publish token is malformed. Paste the supplied token again.');
    const permitted = await chrome.permissions.request({origins:[origin]});
    if(!current())return;
    if (!permitted) throw Error('Relay access was not granted.');
    show({state:'starting',message:'Starting music broadcast…'});
    await chrome.storage.local.set({broadcastEndpoint:url});if(!current())return;
    await chrome.storage.session.set({broadcastToken:publishToken});if(!current())return;
    submittedToken=publishToken;
    const result=await command('start',{endpoint:url});if(current())show(result);
  } catch (error) { if(current())show({error:error.message}); }
  finally { if(current()){busy=false;controls();await refreshStatus();} }
});
stop.addEventListener('click',async()=>{
  if(stopping)return;
  const generation=++commandGeneration,current=()=>generation===commandGeneration;
  ++statusRevision;panelError='';busy=true;stopping=true;controls();
  try{const result=await command('stop');if(current())show(result);}
  catch(error){if(current())show({error:error.message});}
  finally{if(current()){stopping=false;busy=false;controls();await refreshStatus();}}
});
setInterval(()=>{if(!busy)void refreshStatus();},1000);
