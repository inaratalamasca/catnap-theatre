/* Presentation status/mode regressions, version 0.7.0.
 * Connection truth and mutation errors are verified without playback effects.
 */
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const extension=path.resolve(__dirname,'../extension'),flush=()=>new Promise(resolve=>setImmediate(resolve));
async function panelFixture({pending=false}={}){
 const dom=new JSDOM(fs.readFileSync(path.join(extension,'presentation-panel.html'),'utf8'),{url:'chrome-extension://ours/presentation-panel.html?control=fixture',runScripts:'outside-only'}),w=dom.window;
 w.eval(fs.readFileSync(path.join(extension,'helpers.js'),'utf8'));
 const snapshot={settings:{...w.CatnapTheatre.defaults},connected:true,open:true,playbackMode:'inbox',playbackError:'',sourceTitle:'Synthetic source',visual:{},autoScroll:true,presets:[],recent:[],visualizer:{source:'none',state:'quiet'}};
 const calls=[];let tick,error=null,mutationError=null,release,mutationRelease,holdMutation=false;
 const first=pending?new Promise(resolve=>{release=()=>resolve({...snapshot});}):null;let firstPending=pending;
 w.setInterval=fn=>{tick=fn;return 1;};
 w.chrome={runtime:{getURL:p=>'chrome-extension://ours/'+p,sendMessage:async message=>{
  calls.push(message);if(message.target==='catnap-show-worker')return {ok:true};
  if(message.action==='state'){if(error)throw error;if(firstPending){firstPending=false;return first;}return {...snapshot};}
  if(mutationError)throw mutationError;
  if(holdMutation)return new Promise(resolve=>{mutationRelease=()=>{snapshot.settings={...message.settings};resolve({...snapshot});};});
  if(message.settings)snapshot.settings={...message.settings};return {...snapshot};
 }}};
 w.eval(fs.readFileSync(path.join(extension,'presentation-panel.js'),'utf8'));await flush();
 return {dom,w,snapshot,calls,get status(){return w.document.getElementById('status');},release:()=>release?.(),set error(value){error=value;},set mutationError(value){mutationError=value;},hold(){holdMutation=true;},releaseMutation(){mutationRelease();holdMutation=false;},async refresh(){tick();await flush();},close(){dom.window.close();}};
}

test('top box stays neutral while linking, then uses verified open status and real mode',async()=>{
 const f=await panelFixture({pending:true});try{
  assert.equal(f.status.dataset.state,'neutral');assert.equal(f.status.classList.contains('ready'),false);
  f.release();await flush();assert.equal(f.status.dataset.state,'ready');assert.match(f.status.textContent,/Inbox mode/);
  f.snapshot.playbackMode='suno';await f.refresh();assert.equal(f.status.dataset.state,'ready');assert.match(f.status.textContent,/Suno playlist mode/);
  f.snapshot.open=false;await f.refresh();assert.equal(f.status.dataset.state,'neutral');assert.match(f.status.textContent,/closed/);
  f.snapshot.open=true;f.snapshot.connected=false;await f.refresh();assert.equal(f.status.dataset.state,'neutral');assert.match(f.status.textContent,/Mode unavailable/);
  f.snapshot.connected=true;await f.refresh();assert.equal(f.status.dataset.state,'ready');
  assert.equal(f.calls.every(message=>message.action==='state'),true,'status reads do not start or modify a show');
 }finally{f.close();}
});

test('disconnect errors are red and a verified reconnect returns to green',async()=>{
 const f=await panelFixture();try{
  f.error=new Error('Linked source unavailable');await f.refresh();assert.equal(f.status.dataset.state,'error');assert.match(f.status.textContent,/Mode unavailable/);assert.match(f.status.textContent,/unavailable/);
  f.error=null;await f.refresh();assert.equal(f.status.dataset.state,'ready');assert.match(f.status.textContent,/Inbox mode/);
 }finally{f.close();}
});

test('pending edits are neutral and periodic refresh does not hide actionable mutation errors',async()=>{
 const f=await panelFixture();try{
  f.mutationError=new Error('Requested overlay failed');f.w.document.getElementById('font-up').click();await flush();assert.equal(f.status.dataset.state,'error');assert.match(f.status.textContent,/Requested overlay failed/);
  await f.refresh();assert.equal(f.status.dataset.state,'error');assert.match(f.status.textContent,/Requested overlay failed/);
  f.mutationError=null;f.hold();f.w.document.getElementById('font-up').click();await flush();assert.equal(f.status.dataset.state,'neutral');
  await f.refresh();assert.equal(f.status.dataset.state,'neutral','a pending command cannot go green from polling');
  f.releaseMutation();await flush();assert.equal(f.status.dataset.state,'ready');assert.match(f.status.textContent,/Lyrics size updated/);
 }finally{f.close();}
});

test('managed playback errors stay red across successful settings and recover only when actually cleared',async()=>{
 const f=await panelFixture();try{
  f.snapshot.playbackError='Selected source remains held';await f.refresh();assert.equal(f.status.dataset.state,'error');assert.match(f.status.textContent,/Inbox mode/);assert.match(f.status.textContent,/Selected source remains held/);
  f.w.document.getElementById('font-up').click();await flush();assert.equal(f.status.dataset.state,'error','saving presentation settings cannot clear playback failure');
  f.mutationError=new Error('Overlay failed');f.w.document.getElementById('font-up').click();await flush();await f.refresh();assert.match(f.status.textContent,/Selected source remains held/);assert.match(f.status.textContent,/Overlay failed/);
  f.snapshot.playbackError='';await f.refresh();assert.equal(f.status.dataset.state,'error','cleared playback error does not hide the separate mutation error');assert.match(f.status.textContent,/Overlay failed/);
  f.mutationError=null;f.w.document.getElementById('font-up').click();await flush();assert.equal(f.status.dataset.state,'ready');
  f.snapshot.playbackMode='suno';f.snapshot.playbackError='Stale managed error';await f.refresh();assert.equal(f.status.dataset.state,'ready');assert.doesNotMatch(f.status.textContent,/Stale managed error/);
 }finally{f.close();}
});

test('top Radio and Inbox buttons open control windows without playback actions',async()=>{
 const f=await panelFixture();try{
  const radio=f.w.document.getElementById('radio-controls'),inbox=f.w.document.getElementById('show-controls');
  assert.equal(radio.textContent,'Radio');assert.equal(inbox.textContent,'Inbox');assert.equal(radio.parentElement,inbox.parentElement);
  radio.click();await flush();const sent=f.calls.find(message=>message.action==='open-radio');assert.ok(sent);assert.equal(sent.target,'presentation-worker');assert.equal(sent.control,'fixture');inbox.click();await flush();assert.ok(f.calls.some(message=>message.target==='catnap-show-worker'&&message.action==='open'));
  assert.equal(f.calls.some(message=>['play','start','capture','toggle'].includes(message.action)),false);
 }finally{f.close();}
});

test('presentation adapter reports read-only connection and current managed/native mode',async()=>{
 const dom=new JSDOM('<!doctype html><title>Fixture</title><div id="catnap-theater-root"></div>',{url:'https://suno.com/playlist/11111111-1111-4111-8111-111111111111',runScripts:'outside-only'}),w=dom.window;
 const listeners=[];let mutations=0;
 w.CatnapPresentationSettings={read:()=>({schemaVersion:1}),save:()=>{mutations++;}};w.CatnapManagedShow={active:false,snapshot:()=>({error:'Held at https://private.invalid/song?token=private\n'+('x'.repeat(300))})};
 w.chrome={runtime:{id:'ours',onMessage:{addListener:fn=>listeners.push(fn)}}};
 w.eval(fs.readFileSync(path.join(extension,'presentation-tab-controller.js'),'utf8'));
 const read=()=>new Promise(resolve=>listeners[0]({target:'presentation-tab',action:'state'},{id:'ours'},resolve));
 try{
  let result=await read();assert.equal(result.connected,true);assert.equal(result.open,true);assert.equal(result.playbackMode,'suno');assert.equal(result.playbackError,'');
  w.CatnapManagedShow.active=true;result=await read();assert.equal(result.playbackMode,'inbox');assert.ok(result.playbackError.length<=240);assert.equal(result.playbackError.includes('private'),false);assert.equal(result.playbackError.includes('\n'),false);
  w.document.getElementById('catnap-theater-root').remove();result=await read();assert.equal(result.open,false);assert.equal(result.connected,true);assert.equal(mutations,0);
 }finally{dom.window.close();}
});
