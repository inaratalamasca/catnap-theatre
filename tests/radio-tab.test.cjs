/* Radio page UI regressions, version 0.7.0.
 * Synthetic pages only: no captures, accounts, real music or relay secrets.
 */
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const Radio=require('../extension/radio-tab.js'),Source=require('../extension/broadcast-source.js');
const extension=path.resolve(__dirname,'../extension');
const ID='11111111-1111-4111-8111-111111111111';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const state=(overrides={})=>({state:'idle',source:false,hideTheatreButton:false,radioOnly:false,...overrides});
async function fixture({url=`https://suno.com/playlist/${ID}`,content=false,worker='broadcast-worker.js',response=state()}={}){
 const dom=new JSDOM('<!doctype html><html><body><main>Fixture music page</main></body></html>',{url,runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,messages=[],listeners=[],ticks=[];let reply=response,plays=0;
 w.setInterval=fn=>{ticks.push(fn);return ticks.length;};w.clearInterval=()=>{};
 w.CatnapBroadcastSource=Source;
 w.chrome={runtime:{id:'ours',getURL:p=>'chrome-extension://ours/'+p,getManifest:()=>({background:{service_worker:worker}}),onMessage:{addListener:fn=>listeners.push(fn),removeListener:fn=>{const i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1);}},sendMessage:async message=>{messages.push(message);if(message.action==='open')return {ok:true};if(reply instanceof Error)throw reply;return {ok:true,...await(typeof reply==='function'?reply():reply)};}}};
 w.HTMLMediaElement.prototype.play=async()=>{plays++;};w.HTMLMediaElement.prototype.pause=()=>{plays++;};
 if(content){for(const file of ['helpers.js','content.js'])w.eval(fs.readFileSync(path.join(extension,file),'utf8'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));}
 const api=Radio.install(w);await flush();await flush();
 return {dom,w,api,messages,ticks,get plays(){return plays;},set response(value){reply=value;},push(value,sender={id:'ours',url:'chrome-extension://ours/'+worker}){for(const receive of listeners.slice())receive({target:'catnap-radio-state',...state(value)},sender);},close(){api?.dispose();dom.window.close();}};
}

test('only the configured same-extension background entry is a trusted push sender',()=>{
 const runtime={id:'ours',getURL:p=>'chrome-extension://ours/'+p,getManifest:()=>({background:{service_worker:'advanced-worker.js'}})};
 assert.equal(Radio.trustedSender(runtime,{id:'ours',url:runtime.getURL('advanced-worker.js')}),true);
 for(const sender of [{id:'other',url:runtime.getURL('advanced-worker.js')},{id:'ours'},{id:'ours',url:runtime.getURL('broadcast-worker.js')},{id:'ours',url:runtime.getURL('advanced-worker.js'),tab:{id:1}},{id:'ours',url:runtime.getURL('advanced-worker.js'),frameId:2},{id:'ours',url:'https://suno.com/'}])assert.equal(Radio.trustedSender(runtime,sender),false);
 assert.equal(Radio.trustedSender({id:'ours',getURL:runtime.getURL},{id:'ours',url:runtime.getURL('broadcast-worker.js')}),true,'a minimal test/runtime mock uses the public worker entry');
});

test('all publisher states preserve safe preferences and only exact true live/source is audible',async()=>{
 const f=await fixture({content:true});try{
  const launch=f.w.document.getElementById('catnap-theater-launch');
  assert.equal(launch.textContent,'Theatre');
  for(const next of ['starting','connecting','reconnecting','error','idle']){f.push({state:next,source:true});assert.equal(launch.textContent,'Theatre');assert.equal(launch.classList.contains('ct-radio-live'),false);}
  f.push({state:'live',source:false});assert.equal(launch.textContent,'Theatre');
  f.push({state:'live',source:true,hideTheatreButton:true});assert.equal(launch.textContent,'On Air');assert.equal(launch.classList.contains('ct-radio-live'),true);assert.equal(launch.style.display,'inline-flex');
  launch.click();await flush();assert.equal(f.messages.at(-1).action,'open');assert.equal(f.w.document.getElementById('catnap-theater-root'),null,'On Air opens controls, never Theatre or capture');
  f.push({state:'idle',hideTheatreButton:true});assert.equal(launch.style.display,'none');
  f.push({state:'idle',hideTheatreButton:false});assert.equal(launch.style.display,'inline-flex');
  assert.equal(f.messages.every(m=>m.target==='catnap-radio-ui'&&['status','open'].includes(m.action)),true);assert.equal(f.plays,0);
 }finally{f.close();}
});

test('untrusted and malformed pushes cannot change live state or display injected fields',async()=>{
 const f=await fixture({content:true});try{
  const launch=f.w.document.getElementById('catnap-theater-launch');
  for(const sender of [{id:'other'},{id:'ours',url:'chrome-extension://ours/radio-panel.html'},{id:'ours',url:'chrome-extension://ours/broadcast-worker.js',tab:{id:7}}])f.push({state:'live',source:true},sender);
  assert.equal(launch.textContent,'Theatre');
  f.push({state:'live',source:'true'});assert.equal(launch.textContent,'Theatre');
  f.push({state:'live',source:true,token:'private-token',endpoint:'https://secret.invalid',payload:'<img onerror=bad>'});assert.equal(launch.textContent,'On Air');
  assert.equal(JSON.stringify(f.api.status()).includes('private-token'),false);assert.equal(f.w.document.documentElement.textContent.includes('private-token'),false);assert.equal(f.w.document.querySelector('[onerror]'),null);
 }finally{f.close();}
});

test('ordinary and managed Theatre roots both mount compact header status after reopen',async()=>{
 const f=await fixture({content:true});try{
  f.w.CatnapTheatreView.open(true);await flush();
  let header=f.w.document.querySelector('#catnap-theater-root .ct-aiu');assert.equal(header.querySelector('.ct-radio-status').textContent,'No Radio');
  f.push({state:'live',source:true});assert.equal(header.querySelector('.ct-radio-status').textContent,'On Air');assert.equal(header.classList.contains('ct-radio-on-air'),true);
  header.querySelector('.ct-radio-status').click();await flush();assert.equal(f.messages.at(-1).action,'open');
  f.w.CatnapManagedShow={active:true,render(){},closed(){},progress(){return null;}};
  f.w.CatnapTheatreView.open(false);f.w.CatnapTheatreView.open(true);await flush();
  header=f.w.document.querySelector('#catnap-theater-root .ct-aiu');assert.equal(header.querySelectorAll('.ct-radio-status').length,1);assert.equal(header.querySelector('.ct-radio-status').textContent,'On Air');
  f.push({state:'reconnecting',source:true});assert.equal(header.querySelector('.ct-radio-status').textContent,'No Radio');assert.equal(header.classList.contains('ct-radio-on-air'),false);assert.equal(f.plays,0);
 }finally{f.close();}
});

test('standalone Radio supports the unchanged Lite header without replacing its launch handler',async()=>{
 const f=await fixture({response:state({radioOnly:true,state:'live',source:true})});try{
  let oldLaunches=0;const old=f.w.document.createElement('button');old.id='catnap-theater-launch';old.onclick=()=>oldLaunches++;f.w.document.body.append(old);
  const root=f.w.document.createElement('div');root.id='catnap-theater-root';root.innerHTML='<header><div class="ct-aiu"><img class="ct-aiu-logo" alt="AIU"></div></header>';f.w.document.body.append(root);await flush();
  const label=root.querySelector('.ct-radio-status');assert.ok(label);assert.equal(label.textContent,'On Air');old.click();assert.equal(oldLaunches,1);assert.equal(f.w.document.getElementById('catnap-theater-launch'),old);
  label.click();await flush();assert.equal(f.messages.at(-1).action,'open');assert.equal(f.w.document.getElementById('catnap-radio-indicator').hidden,true);
  root.remove();await flush();assert.equal(f.w.document.getElementById('catnap-radio-indicator').hidden,false);assert.equal(f.plays,0);
 }finally{f.close();}
});

test('AIU Radio indicator stays out of login/auth pages and returns after SPA navigation',async()=>{
 const f=await fixture({url:'https://party.aiu.fm/party/login',response:state({radioOnly:true})});try{
  assert.equal(f.w.document.getElementById('catnap-radio-indicator'),null);assert.equal(f.messages.length,0);
  f.w.history.replaceState({},'','/party');await f.api.refresh();
  let pill=f.w.document.getElementById('catnap-radio-indicator');assert.ok(pill);assert.equal(pill.dataset.sourceKind,'aiu');assert.equal(pill.textContent,'Radio');
  f.push({state:'connecting',source:true,radioOnly:true});assert.equal(pill.dataset.state,'connecting');assert.equal(pill.textContent,'Radio');
  f.push({state:'live',source:true,radioOnly:true});assert.equal(pill.textContent,'On Air');assert.equal(pill.dataset.state,'live');pill.click();await flush();assert.equal(f.messages.at(-1).action,'open');
  f.w.history.replaceState({},'','/party/auth/callback');await f.api.refresh();assert.equal(f.w.document.getElementById('catnap-radio-indicator'),null);
 }finally{f.close();}
});

test('a stale status reply cannot erase a newer push and a failed fresh poll removes live',async()=>{
 let release;const slow=new Promise(resolve=>{release=resolve;});
 const f=await fixture({response:()=>slow});try{
  f.push({state:'live',source:true,radioOnly:true,hideTheatreButton:true});release(state({radioOnly:true}));await flush();assert.equal(f.w.document.getElementById('catnap-radio-indicator').textContent,'On Air');
  f.response=new Error('Unavailable');await f.api.refresh();assert.equal(f.w.document.getElementById('catnap-radio-indicator').textContent,'Radio');assert.equal(f.api.status().state,'error');assert.equal(f.api.status().hideTheatreButton,true);assert.equal(f.api.status().radioOnly,true);
 }finally{f.close();}
});
