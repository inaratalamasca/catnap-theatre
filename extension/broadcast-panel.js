/* Catnap broadcast toolbar panel, version 0.7.0.
 * Shared Suno/AIU controls; source status is worker-owned; remembered tokens are relay-origin bound.
 * Pending grants are cancellable. Token presence never implies validation.
 */
'use strict';
const buildVersion = document.querySelector('#build-version');
if (buildVersion) buildVersion.textContent = (globalThis.CatnapPackage?.radioOnly?'CATNAP RADIO':'CATNAP THEATRE')+' · DEVELOPMENT '+chrome.runtime.getManifest().version;
const endpoint = document.querySelector('#endpoint'), token = document.querySelector('#token');
const rememberToken=document.querySelector('#remember-token'),forgetToken=document.querySelector('#forget-token');
const SAVED_TOKEN='broadcastSavedToken',REMEMBER_TOKEN='broadcastRememberToken';
let tokenOrigin=null,credentialRevision=0,credentialOperations=Promise.resolve();
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
// Local storage is an explicit user choice, not an automatic session migration.
// All writes are ordered so a later opt-out/Forget wins over an in-flight save.
function queueCredential(task){const operation=credentialOperations.then(task);credentialOperations=operation.catch(()=>{});return operation;}
function endpointOrigin(value){try{return new URL(CatnapBroadcast.endpoint(value)).origin;}catch{return null;}}
function comparableOrigin(value){try{const url=new URL(value.trim());return !url.username&&!url.password&&['https:','http:'].includes(url.protocol)?url.origin:null;}catch{return null;}}
function canonicalOrigin(value){return typeof value==='string'&&value===comparableOrigin(value)&&endpointOrigin(value+'/whip')===value?value:null;}
function storedToken(value){return typeof value==='string'&&!malformed(value)?value.trim():'';}
function storageStatus(text){document.querySelector('#token-storage-status').textContent=text||(rememberToken.checked?'Remembering is on for this relay origin. Changes or Start save the token locally.':'Session only. The token is not kept between browser sessions.');}
function clearInputToken(){token.value='';tokenOrigin=null;rejectedToken=null;tokenStatus();}
function checkInputOrigin(origin){
  if(token.value&&tokenOrigin&&tokenOrigin!==origin){clearInputToken();return false;}
  return true;
}
function saveCredential(keep,value,url){
  return queueCredential(async()=>{
    if(!keep){
      const values={[REMEMBER_TOKEN]:false};if(url)values.broadcastEndpoint=CatnapBroadcast.endpoint(url);
      await chrome.storage.local.set(values);await chrome.storage.local.remove(SAVED_TOKEN);return;
    }
    const address=CatnapBroadcast.endpoint(url),origin=new URL(address).origin;
    if(malformed(value))throw Error('Invalid token');
    const values={broadcastEndpoint:address,[REMEMBER_TOKEN]:true};
    if(value.trim())values[SAVED_TOKEN]={origin,token:value.trim()};
    await chrome.storage.local.set(values);if(!value.trim())await chrome.storage.local.remove(SAVED_TOKEN);
  });
}
function explicitSave(){
  if(!rememberToken.checked||!endpointOrigin(endpoint.value)||malformed(token.value))return;
  void saveCredential(true,token.value,endpoint.value).then(()=>storageStatus(),()=>show({error:'Could not remember the token on this browser.'}));
}
token.addEventListener('input',()=>{credentialRevision++;tokenOrigin=token.value?comparableOrigin(endpoint.value):null;if(token.value.trim()!==rejectedToken)rejectedToken=null;tokenStatus();});
token.addEventListener('change',explicitSave);
endpoint.addEventListener('input',()=>{credentialRevision++;checkInputOrigin(comparableOrigin(endpoint.value));});
endpoint.addEventListener('change',()=>{credentialRevision++;checkInputOrigin(comparableOrigin(endpoint.value));});
rememberToken.addEventListener('change',()=>{
  credentialRevision++;checkInputOrigin(comparableOrigin(endpoint.value));storageStatus();
  if(rememberToken.checked)explicitSave();else void saveCredential(false,'',null).catch(()=>show({error:'Could not remove the saved token on this browser.'}));
});
forgetToken.addEventListener('click',()=>{
  credentialRevision++;rememberToken.checked=false;clearInputToken();
  void queueCredential(()=>chrome.storage.local.remove([SAVED_TOKEN,REMEMBER_TOKEN])).then(()=>storageStatus('Saved token forgotten. An active broadcast keeps its current session.'),()=>show({error:'Could not remove the saved token on this browser.'}));
});
function restoreCredential(settings,session){
  rememberToken.checked=settings[REMEMBER_TOKEN]!==false;
  const sessionValue=storedToken(session.broadcastToken),endpoints=[];let invalid=false;
  for(const value of [session.broadcastMetadataSession?.endpoint,session.broadcastTokenEndpoint]){
    if(value===undefined||value===null)continue;
    try{endpoints.push(CatnapBroadcast.endpoint(value));}catch{invalid=true;}
  }
  const origins=endpoints.map(value=>new URL(value).origin);
  if(session.broadcastTokenOrigin!==undefined){const origin=canonicalOrigin(session.broadcastTokenOrigin);if(origin)origins.push(origin);else invalid=true;}
  const distinct=new Set(origins);
  if(sessionValue&&!invalid&&distinct.size===1){
    const origin=origins[0],address=endpoints[0]||(endpointOrigin(endpoint.value)===origin?endpoint.value:null);
    if(address){endpoint.value=address;token.value=sessionValue;tokenOrigin=origin;return;}
  }
  const saved=settings[SAVED_TOKEN],origin=endpointOrigin(endpoint.value);
  if(rememberToken.checked&&saved&&typeof saved==='object'&&canonicalOrigin(saved.origin)===origin&&origin){
    const value=storedToken(saved.token);if(value){token.value=value;tokenOrigin=origin;}
  }
}

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
(async () => { const settings = await chrome.storage.local.get(['broadcastEndpoint','hideTheatreButton',REMEMBER_TOKEN,SAVED_TOKEN]); endpoint.value=settings.broadcastEndpoint || CatnapBroadcast.DEFAULT_ENDPOINT; hideTheatre.checked=settings.hideTheatreButton===true; const session=await chrome.storage.session.get(['broadcastToken','broadcastTokenOrigin','broadcastTokenEndpoint','broadcastMetadataSession']);restoreCredential(settings,session);submittedToken=token.value.trim();tokenStatus();storageStatus();await refreshStatus(); })().catch(()=>show({error:'Could not restore Radio settings.'}));
start.addEventListener('click', async () => {
  if(busy||!['idle','error'].includes(publisherState))return;
  const generation=++commandGeneration,current=()=>generation===commandGeneration;
  ++statusRevision;busy=true;panelError='';show({state:'starting',message:'Waiting for relay access…'});
  // Optional relay host permission is requested only by this explicit user gesture.
  try {
    const url = CatnapBroadcast.endpoint(endpoint.value), origin = CatnapBroadcast.permissionOrigin(url);
    const relayOrigin=new URL(url).origin;
    if(!checkInputOrigin(relayOrigin))throw Error('The relay changed. Enter its token before starting.');
    const rawToken=token.value,publishToken=rawToken.trim(),keep=rememberToken.checked,revision=credentialRevision;
    if(malformed(rawToken))throw Error('Publish token is malformed. Paste the supplied token again.');
    if(publishToken)tokenOrigin=relayOrigin;
    const unchanged=()=>{let address;try{address=CatnapBroadcast.endpoint(endpoint.value);}catch{}return revision===credentialRevision&&address===url&&token.value===rawToken&&rememberToken.checked===keep;};
    const inputsCurrent=()=>{if(!unchanged())throw Error('Broadcast settings changed. Start again.');};
    const permitted = await chrome.permissions.request({origins:[origin]});
    if(!current())return;
    if (!permitted) throw Error('Relay access was not granted.');
    inputsCurrent();
    show({state:'starting',message:'Starting music broadcast…'});
    try{await saveCredential(keep,publishToken,url);}catch{throw Error('Could not store Radio credentials in this browser.');}
    if(!current())return;inputsCurrent();storageStatus();
    try{await chrome.storage.session.set({broadcastToken:publishToken,broadcastTokenOrigin:relayOrigin,broadcastTokenEndpoint:url});}catch{throw Error('Could not store the Radio session credential.');}
    if(!current())return;inputsCurrent();
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
