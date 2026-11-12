'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const extension=path.resolve(__dirname,'../extension');

async function fixture(){
  const id='11111111-1111-4111-8111-111111111111';
  const dom=new JSDOM(`<!doctype html><title>Fixture source</title><main><a href="/song/${id}">Fixture song</a></main><a aria-label="Playbar: Title for Fixture song" href="/song/${id}">Fixture song</a><button aria-label="Playbar: Pause button">Pause</button>`,{url:`https://suno.com/playlist/${id}`,runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,ticks=[],stored={},listeners=[];let nativeClicks=0;
  w.setInterval=fn=>{ticks.push(fn);return ticks.length;};w.setTimeout=()=>0;
  w.chrome={runtime:{id:'test',getURL:file=>'chrome-extension://test/'+file,onMessage:{addListener:fn=>listeners.push(fn)},sendMessage:async()=>({opened:true})},storage:{local:{get:async key=>({[key]:stored[key]}),set:async value=>Object.assign(stored,value)}}};
  w.URL.createObjectURL=()=> 'blob:fixture';w.URL.revokeObjectURL=()=>{};
  w.HTMLMediaElement.prototype.load=function(){};w.HTMLMediaElement.prototype.play=async function(){};w.HTMLMediaElement.prototype.pause=function(){};
  w.document.querySelector('[aria-label="Playbar: Pause button"]').onclick=()=>nativeClicks++;
  for(const file of ['helpers.js','content.js','lyric-scroll.js','visual-media.js','standalone.js','presentation-tab-controller.js'])w.eval(fs.readFileSync(path.join(extension,file),'utf8'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));w.document.getElementById('catnap-theater-launch').click();
  await new Promise(resolve=>setImmediate(resolve));ticks.forEach(fn=>fn());
  const send=message=>new Promise(resolve=>listeners[0]({target:'presentation-tab',...message},{id:'test'},resolve));
  return {w,dom,stored,send,root:w.document.getElementById('catnap-theater-root'),nativeClicks:()=>nativeClicks};
}

test('popout adapter and inline UI share the same validated settings and storage',async()=>{
  const {dom,w,root,stored,send,nativeClicks}=await fixture();
  const initial=await send({action:'state'});
  const saved=await send({action:'set-settings',settings:{...initial.settings,layout:'lineup',fontSize:29,brand:'Popout host'}});
  assert.equal(saved.settings.layout,'lineup');assert.equal(root.dataset.layout,'lineup');
  assert.equal(root.querySelector('[name=brand]').value,'Popout host');assert.equal(root.style.getPropertyValue('--ct-lyric-size'),'29px');
  root.querySelector('.ct-font-down').click();
  assert.equal((await send({action:'state'})).settings.fontSize,27);
  assert.equal(stored['catnap-theatre-settings-v1'].fontSize,27);assert.equal(nativeClicks(),0);
  dom.window.close();
});

test('presentation allowlist reuses banners and lyric controls while excluding playback',async()=>{
  const {dom,root,send,nativeClicks}=await fixture();
  await send({action:'field',name:'expiry',value:'0'});
  const shown=await send({action:'preset',index:0});
  assert.match(root.querySelector('.ct-visual-banner').textContent,/TRIGGER WARNING/);
  assert.match(shown.visualStatus,/Overlay showing/);
  await send({action:'field',name:'autoScroll',value:false});
  assert.equal(root.querySelector('.ct-lyrics-auto').getAttribute('aria-pressed'),'false');
  await send({action:'button',name:'clearOverlay'});assert.equal(root.querySelector('.ct-visual-banner').hidden,true);
  assert.match((await send({action:'button',name:'play'})).error,/Unknown/);
  assert.match((await send({action:'field',name:'placement',value:'anywhere'})).error,/Invalid/);
  assert.equal(nativeClicks(),0);dom.window.close();
});

test('presentation worker reuses a window per source and never changes broadcast binding',async()=>{
  const stored={broadcastSourceTabId:77},created=[],forwarded=[],listeners=[],removed=[];
  const windows=new Map();let counter=0;
  const chrome={runtime:{id:'test',getURL:file=>'chrome-extension://test/'+file,onMessage:{addListener:fn=>listeners.push(fn)}},
    storage:{session:{get:async key=>({[key]:structuredClone(stored[key])}),set:async value=>Object.assign(stored,structuredClone(value))}},
    windows:{onRemoved:{addListener:fn=>removed.push(fn)},create:async value=>{const window={id:++counter,...value};created.push(window);windows.set(window.id,window);return window;},update:async id=>{if(!windows.has(id))throw Error('Closed');return windows.get(id);}},
    tabs:{get:async id=>({id,url:'https://suno.com/playlist/fixture'}),sendMessage:async(id,message)=>{forwarded.push({id,message});return {open:true};}}};
  vm.runInNewContext(fs.readFileSync(path.join(extension,'presentation-control-worker.js'),'utf8'),{chrome,crypto:{randomUUID:()=>String(counter+1)},console});
  const send=(message,sender)=>new Promise(resolve=>listeners[0]({target:'presentation-worker',...message},{id:'test',...sender},resolve));
  await send({action:'open'},{tab:{id:10},url:'https://suno.com/playlist/a'});
  await send({action:'open'},{tab:{id:10},url:'https://suno.com/playlist/a'});assert.equal(created.length,1);
  await send({action:'open'},{tab:{id:20},url:'https://suno.com/playlist/b'});assert.equal(created.length,2);
  const first=created[0].url,nonce=new URL(first).searchParams.get('control');
  await send({action:'state',control:nonce},{url:first});assert.equal(forwarded[0].id,10);
  const rejected=await send({action:'button',name:'clearOverlay',control:nonce},{url:'https://suno.com/playlist/b',tab:{id:20}});
  assert.match(rejected.error,/Untrusted/);assert.equal(forwarded.length,1);
  assert.equal(stored.broadcastSourceTabId,77);assert.equal(created[0].type,'popup');
});

test('queued popout actions preserve rapid font increments and banner-before-show order',async()=>{
  const html=fs.readFileSync(path.join(extension,'presentation-panel.html'),'utf8');
  const dom=new JSDOM(html,{url:'chrome-extension://test/presentation-panel.html?control=fixture',runScripts:'outside-only'});
  const w=dom.window;let prefs={schemaVersion:1,layout:'duet',fontSize:21,stripTags:false,background:'#090b14',brand:'Fixture'},banner='',shown='';
  const state=()=>({settings:{...prefs},open:true,sourceTitle:'Fixture',visual:{bannerText:banner},autoScroll:true,presets:[],recent:[]});
  w.setInterval=()=>0;
  w.chrome={runtime:{getURL:file=>'chrome-extension://test/'+file,sendMessage:async message=>{
    await new Promise(resolve=>setTimeout(resolve,10));
    if(message.action==='set-settings')prefs={...message.settings};
    if(message.action==='field'&&message.name==='bannerText')banner=message.value;
    if(message.action==='button'&&message.name==='showOverlay')shown=banner;
    return state();
  }}};
  w.eval(fs.readFileSync(path.join(extension,'helpers.js'),'utf8'));w.eval(fs.readFileSync(path.join(extension,'presentation-panel.js'),'utf8'));
  await new Promise(resolve=>setTimeout(resolve,30));
  w.document.getElementById('font-up').click();w.document.getElementById('font-up').click();
  await new Promise(resolve=>setTimeout(resolve,50));assert.equal(prefs.fontSize,25);
  const input=w.document.getElementById('banner-text');input.value='Fresh banner';input.dispatchEvent(new w.Event('change'));
  w.document.getElementById('show-overlay').click();
  await new Promise(resolve=>setTimeout(resolve,50));assert.equal(shown,'Fresh banner');dom.window.close();
});
