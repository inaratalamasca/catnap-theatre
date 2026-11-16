'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const H=require('../extension/helpers.js');
const extension=path.resolve(__dirname,'../extension');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
async function fixture(){
  const dom=new JSDOM(`<!doctype html><html><body><main><article><a href="/song/${A}">First song</a><button aria-label="Play Song">Play</button></article><article><a href="/song/${B}">Second song</a><button aria-label="Play Song">Play</button></article></main><div><a aria-label="Playbar: Title for First song" href="/song/${A}">First song</a><a aria-label="Playbar: Artist for Artist">Artist</a><button aria-label="Playbar: Pause button">Pause</button></div></body></html>`,{url:`https://suno.com/playlist/${A}`,runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,ticks=[];w.setInterval=f=>{ticks.push(f);return ticks.length;};w.setTimeout=()=>0;
  const stored={};w.chrome={runtime:{getURL:p=>'chrome-extension://test/'+p},storage:{local:{get:async key=>({[key]:stored[key]}),set:async value=>Object.assign(stored,value)}}};
  w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
  w.HTMLMediaElement.prototype.load=function(){};w.HTMLMediaElement.prototype.play=async function(){};w.HTMLMediaElement.prototype.pause=function(){};
  for(const filename of ['helpers.js','content.js','lyric-scroll.js','visual-media.js','standalone.js'])w.eval(fs.readFileSync(path.join(extension,filename),'utf8'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  w.document.getElementById('catnap-theater-launch').click();
  await new Promise(resolve=>setImmediate(resolve));for(const tick of ticks)tick();
  return {w,dom,root:w.document.getElementById('catnap-theater-root'),ticks,stored};
}
test('settings accept only a small, bounded schema',()=>{
  const value=H.settings({schemaVersion:1,fontSize:999,layout:'bad',background:'url(https://bad)',brand:'x'.repeat(100),stripTags:'true',script:'evil'});
  assert.equal(value.fontSize,40);assert.equal(value.layout,'duet');assert.equal(value.background,'#090b14');assert.equal(value.brand.length,50);assert.equal(value.stripTags,false);assert.equal('script' in value,false);
  assert.throws(()=>H.settings({schemaVersion:2}));assert.throws(()=>H.settings([]));
});
test('song identity rejects other sites and executable URLs',()=>{
  assert.equal(H.songId(`https://suno.com/song/${A}?x=1`),A);
  assert.equal(H.songId(`https://evil.example/song/${A}`),'');assert.equal(H.songId('javascript:alert(1)'),'');assert.equal(H.songId(`/playlist/${A}`),'');
});
test('optional cue hiding preserves inline brackets and multilingual text',()=>{
  assert.equal(H.isCue('[Verse 1: V2, soft]'),true);assert.equal(H.isCue('夜 [echo] 歌'),false);assert.equal(H.isCue('Leave the light on'),false);
});
test('standalone mounts without backend and settings select layouts/font/cues',async()=>{
  const {w,dom,root,stored}=await fixture();assert.ok(root);assert.equal(root.dataset.layout,'duet');
  const layout=root.querySelector('[name=layout]');layout.value='lineup';layout.dispatchEvent(new w.Event('change'));
  assert.equal(root.dataset.layout,'lineup');assert.equal(root.querySelectorAll('.ct-track').length,2);assert.equal(root.querySelector('.ct-track').getAttribute('aria-current'),'true');
  root.querySelector('.ct-font-up').click();assert.equal(root.style.getPropertyValue('--ct-lyric-size'),'23px');
  const lyrics=root.querySelector('.ct-lyrics-content');lyrics.innerHTML='<div>[Verse 1]</div><div>Stay [with me]</div><div>夜の歌</div>';
  const strip=root.querySelector('[name=stripTags]');strip.checked=true;strip.dispatchEvent(new w.Event('change'));
  assert.equal(lyrics.children[0].hidden,true);assert.equal(lyrics.children[1].hidden,false);assert.equal(lyrics.children[2].hidden,false);
  assert.equal(stored['catnap-theatre-settings-v1'].fontSize,23);dom.window.close();
});
test('visible playlist only delegates to matched native row play control',async()=>{
  const {w,dom,root}=await fixture();let clicks=0;
  const native=w.document.querySelectorAll('article button')[1];native.addEventListener('click',()=>clicks++);
  root.querySelectorAll('.ct-track')[1].click();assert.equal(clicks,1);assert.match(w.location.href,/playlist/);dom.window.close();
});
test('settings keyboard activation does not toggle native playback',async()=>{
  const {w,dom,root}=await fixture();let pauses=0;
  w.document.querySelector('[aria-label="Playbar: Pause button"]').addEventListener('click',()=>pauses++);
  const button=root.querySelector('.ct-font-up');button.dispatchEvent(new w.KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true}));
  assert.equal(pauses,0);dom.window.close();
});
test('standalone removes controller visual bridge and uses contained artwork',()=>{
  const visual=fs.readFileSync(path.join(extension,'visual-media.js'),'utf8');assert.equal(visual.includes('catnap-visual-command'),false);
  const core=fs.readFileSync(path.join(extension,'content.js'),'utf8');assert.match(core,/\.ct-art \{[^}]*object-fit: contain/);
  const m=JSON.parse(fs.readFileSync(path.join(extension,'manifest.json')));assert.deepEqual(m.permissions,['storage','activeTab','tabCapture','offscreen','tabs','alarms','scripting','identity','nativeMessaging']);assert.equal(m.host_permissions,undefined);assert.deepEqual(m.optional_host_permissions,['http://*/*','https://*/*']);
  assert.ok(m.content_scripts.every(script=>script.matches.every(match=>!match.includes('uploader.aiu.fm'))),'uploader access stays optional rather than an always-running reader');
  for(const script of m.content_scripts.filter(script=>script.matches.some(match=>match.includes('party.aiu.fm'))))assert.deepEqual(script.js,['broadcast-source.js','radio-tab.js'],'AIU receives radio display only, not Theatre or managed playback');
  assert.ok(m.content_scripts.filter(script=>script.js.includes('content.js')||script.world==='MAIN').every(script=>script.matches.every(match=>/^https:\/\/(?:www\.)?suno\.com\/\*$/.test(match))),'Theatre and native guard stay restricted to Suno');
  assert.ok(m.content_scripts.some(script=>script.world==='MAIN'&&script.run_at==='document_start'&&script.js.includes('managed-native-guard.js')),'native autoplay gate is installed before the site registers its ended handlers');
});
test('approximate lyric following respects manual correction and pause/disable',async()=>{
  const {w,dom,root,ticks}=await fixture();
  const lyrics=root.querySelector('.ct-lyrics-content');lyrics.innerHTML='<div>First line</div><div>Second line</div>';
  const scroller=root.querySelector('.ct-lyrics-scroller');Object.defineProperty(scroller,'scrollHeight',{value:500});Object.defineProperty(scroller,'clientHeight',{value:100});
  const audio=w.document.createElement('audio');Object.defineProperty(audio,'duration',{value:120});Object.defineProperty(audio,'paused',{value:false,writable:true});Object.defineProperty(audio,'ended',{value:false});audio.currentTime=30;w.document.body.appendChild(audio);
  ticks.forEach(f=>f());assert.equal(scroller.scrollTop,100);
  scroller.scrollTop=200;audio.currentTime=31;ticks.forEach(f=>f());assert.ok(Math.abs(scroller.scrollTop-203.333333)<.001);
  audio.paused=true;audio.currentTime=32;ticks.forEach(f=>f());assert.ok(Math.abs(scroller.scrollTop-203.333333)<.001);
  root.querySelector('.ct-lyrics-auto').click();audio.paused=false;audio.currentTime=33;ticks.forEach(f=>f());assert.ok(Math.abs(scroller.scrollTop-203.333333)<.001);
  dom.window.close();
});

test('Theatre replaces unowned lyric controls even when their numeric version matches',async()=>{
 const f=await fixture();try{
  const old=f.root.querySelector('.ct-lyrics-auto'),oldReload=f.root.querySelector('.ct-lyrics-reload');old.removeAttribute('data-catnap-lyrics-owner');oldReload.removeAttribute('data-catnap-lyrics-owner');delete f.w.catnapLyricScrollVersion;
  f.w.eval(fs.readFileSync(path.join(extension,'lyric-scroll.js'),'utf8'));
  assert.notEqual(f.root.querySelector('.ct-lyrics-auto'),old);assert.notEqual(f.root.querySelector('.ct-lyrics-reload'),oldReload);assert.equal(f.root.getAttribute('data-catnap-lyrics-owner'),'theatre');assert.equal(f.root.querySelector('.ct-lyrics-reload').getAttribute('data-catnap-lyrics-owner'),'theatre');
 }finally{f.dom.window.close();}
});


test('visible Pause never reconnects an inactive show or starts its first entry',async()=>{
  const f=await fixture();try{
    let pauses=0,intents=0;f.w.CatnapManagedShow={active:false};
    f.w.chrome.runtime.sendMessage=async()=>{intents++;return {ok:true,handled:true};};
    f.w.document.querySelector('[aria-label="Playbar: Pause button"]').addEventListener('click',()=>pauses++);
    f.root.querySelector('.ct-toggle').click();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(pauses,1);assert.equal(intents,0);
  }finally{f.dom.window.close();}
});

test('Theatre start asks its worker to recover a saved show before native playlist autoplay',async()=>{
  const f=await fixture();try{
    let nativeStarts=0;const intents=[];f.w.CatnapManagedShow={active:false};
    f.w.document.querySelector('[aria-label="Playbar: Pause button"]').remove();
    const button=f.w.document.createElement('button');button.setAttribute('aria-label','Play playlist');button.onclick=()=>nativeStarts++;f.w.document.body.append(button);
    f.w.chrome.runtime.sendMessage=async message=>{intents.push(message);return {ok:true,handled:true};};
    f.root.querySelector('.ct-toggle').click();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(intents[0].target,'catnap-show-intent');assert.equal(intents[0].action,'toggle');assert.equal(nativeStarts,0);
  }finally{f.dom.window.close();}
});
