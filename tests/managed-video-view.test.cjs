// Version 0.7.0: exercise the real managed adapter/coordinator/view together.
// Synthetic YouTube events only; never contact a provider or use browser fullscreen.
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const extension=path.resolve(__dirname,'../extension'),id='11111111-1111-4111-8111-111111111111';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const show=()=>({id:'video-show',mode:'lp',autoplay:false,warningSeconds:10,entries:[
 {id:'video',title:'Video <img src=x onerror=alert(1)>',preferredSource:'youtube',youtubeUrl:'https://www.youtube.com/watch?v=abcdefghijk',disclaimer:'yes'},
 {id:'suno',title:'Next Suno song',preferredSource:'suno',sunoId:id,sunoUrl:'https://suno.com/song/'+id}
]});
async function fixture(){
 const dom=new JSDOM('<!doctype html><main><a aria-label="Playbar: Title for Old song" href="/song/'+id+'">Old song</a></main>',{url:'https://suno.com/playlist/'+id,runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,listeners=[],ticks=[],messages=[],commands=[];let fullscreen=0;
 w.setInterval=fn=>{ticks.push(fn);return ticks.length;};w.clearInterval=()=>{};
 w.chrome={runtime:{id:'test',getURL:file=>'chrome-extension://test/'+file,onMessage:{addListener:fn=>listeners.push(fn)},sendMessage:async message=>{messages.push(message);return message.target==='managed-native'?{ok:true,data:{ready:true,enabled:message.action!=='disable',permitted:message.action==='play'}}:{ok:true};}},storage:{local:{get:async()=>({}),set:async()=>{}}}};
 w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.load=function(){};
 w.Element.prototype.requestFullscreen=()=>{fullscreen++;throw Error('Display fullscreen must never be requested.');};
 for(const name of ['helpers.js','content.js','lyric-scroll.js','visual-media.js','standalone.js','managed-player.js','managed-media.js','managed-show.js'])w.eval(fs.readFileSync(path.join(extension,name),'utf8'));
 w.document.dispatchEvent(new w.Event('DOMContentLoaded'));w.document.getElementById('catnap-theater-launch').click();await flush();ticks.forEach(fn=>fn());
 const send=message=>new Promise(resolve=>{for(const listener of listeners)listener({target:'catnap-show-tab',...message},{id:'test'},resolve);});
 const root=()=>w.document.getElementById('catnap-theater-root');
 root().querySelector('.ct-art-frame').getBoundingClientRect=()=>({left:24,top:88,width:320,height:320});
 root().getBoundingClientRect=()=>({left:0,top:0,width:1280,height:720});
 const frame=()=>root()?.querySelector('iframe.ct-managed-youtube');
 const event=(data,target=frame())=>w.dispatchEvent(new w.MessageEvent('message',{origin:'https://www.youtube-nocookie.com',source:target.contentWindow,data:JSON.stringify(data)}));
 const load=async()=>{await send({action:'enable',show:show()});await send({action:'load',index:0,showId:'video-show'});frame().contentWindow.postMessage=value=>commands.push(JSON.parse(value));};
 const play=async()=>{const pending=send({action:'play',showId:'video-show'});await flush();event({event:'onReady'});await flush();event({event:'onStateChange',info:1});return pending;};
 return {dom,w,send,root,frame,event,load,play,messages,commands,get fullscreen(){return fullscreen;}};
}
test('quiet video Load stays in artwork geometry with one paused iframe and a safe red YouTube icon',async()=>{
 const f=await fixture();try{await f.load();const root=f.root(),frame=f.frame(),stage=root.querySelector('.ct-managed-media-stage');
  assert.equal(root.classList.contains('ct-managed-window-video'),false);assert.match(root.querySelector('.ct-desc').textContent,/Loaded/);assert.equal(root.querySelector('.ct-desc').textContent.includes('Loaded quietly'),false);assert.equal(stage.parentElement,root);assert.equal(stage.style.left,'24px');assert.equal(stage.style.width,'320px');assert.equal(root.querySelectorAll('iframe').length,1);
  assert.equal(new URL(frame.src).searchParams.get('autoplay'),'0');assert.equal(new URL(frame.src).searchParams.get('fs'),'0');assert.equal(frame.allow.includes('fullscreen'),false);assert.equal(f.commands.some(c=>c.func==='playVideo'),false);
  const row=root.querySelector('.ct-managed-lineup button'),icon=row.querySelector('.ct-managed-yt');assert.equal(icon.getAttribute('aria-label'),'YouTube');assert.equal(icon.title,'YouTube source');assert.equal(f.w.getComputedStyle(icon).backgroundColor,'rgb(223, 32, 44)');assert.equal(row.querySelector('img'),null);assert.ok(row.textContent.includes('<img src=x onerror=alert(1)>'));assert.equal(row.textContent.includes(' · YT'),false);
  assert.equal(f.fullscreen,0);
 }finally{f.dom.window.close();}
});
test('Play fills only the Theatre viewport and view toggles preserve the exact iframe/source and command count',async()=>{
 const f=await fixture();try{await f.load();const frame=f.frame(),parent=frame.parentElement,src=frame.src;await f.play();const root=f.root(),stage=root.querySelector('.ct-managed-media-stage');
  assert.equal(root.classList.contains('ct-managed-window-video'),true);assert.equal(f.w.getComputedStyle(stage).position,'fixed');assert.equal(f.w.getComputedStyle(stage).inset,'0');assert.equal(f.w.getComputedStyle(stage).width,'100%');
  assert.equal(root.querySelector('.ct-managed-video-toggle').textContent,'Pause');assert.equal(root.querySelector('.ct-managed-video-close').textContent,'Close Theatre');
  const warning=root.querySelector('.ct-managed-warning');assert.equal(warning.hidden,false);assert.ok(Number(f.w.getComputedStyle(warning).zIndex)>Number(f.w.getComputedStyle(stage).zIndex));
  const toggle=root.querySelector('.ct-managed-video-view'),count=f.commands.length;assert.equal(toggle.textContent,'Artwork view');toggle.click();assert.equal(root.classList.contains('ct-managed-window-video'),false);assert.equal(toggle.textContent,'Window view');
  f.event({event:'infoDelivery',info:{playerState:1}});assert.equal(root.classList.contains('ct-managed-window-video'),false,'ordinary progress cannot undo manual restoration');
  toggle.click();assert.equal(root.classList.contains('ct-managed-window-video'),true);assert.equal(f.frame(),frame);assert.equal(frame.parentElement,parent);assert.equal(frame.src,src);assert.equal(f.commands.length,count);assert.equal(root.querySelectorAll('iframe').length,1);assert.equal(f.fullscreen,0);
 }finally{f.dom.window.close();}
});
test('Escape restores artwork before a second Escape closes Theatre, and close never requests fullscreen',async()=>{
 const f=await fixture();try{await f.load();await f.play();f.w.document.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true}));assert.ok(f.root());assert.equal(f.root().classList.contains('ct-managed-window-video'),false);f.w.document.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true}));await flush();assert.equal(f.root(),null);assert.equal(f.fullscreen,0);}finally{f.dom.window.close();}
});
test('Pause can retain window view; quiet next, native end, errors and managed exit restore it',async()=>{
 const f=await fixture();try{await f.load();await f.play();await f.send({action:'pause',showId:'video-show'});assert.equal(f.root().classList.contains('ct-managed-window-video'),true);await f.send({action:'next',showId:'video-show'});assert.equal(f.root().classList.contains('ct-managed-window-video'),false);assert.equal(f.frame(),null);assert.equal(f.root().querySelector('.ct-managed-video-controls'),null);
  await f.send({action:'load',index:0,showId:'video-show'});f.frame().contentWindow.postMessage=value=>f.commands.push(JSON.parse(value));await f.play();f.event({event:'onStateChange',info:0});await flush();assert.equal(f.root().classList.contains('ct-managed-window-video'),false);assert.equal(f.w.CatnapManagedShow.snapshot().phase,'ended');assert.equal(f.frame(),null);
  await f.send({action:'load',index:0,showId:'video-show'});f.frame().contentWindow.postMessage=()=>{};await f.play();f.event({event:'onError',info:150});await flush();assert.equal(f.root().classList.contains('ct-managed-window-video'),false);assert.equal(f.w.CatnapManagedShow.snapshot().phase,'error');
  await f.send({action:'load',index:0,showId:'video-show'});f.frame().contentWindow.postMessage=()=>{};await f.play();await f.send({action:'disable'});assert.equal(f.root().classList.contains('ct-managed-window-video'),false);assert.equal(f.frame(),null);assert.equal(f.root().querySelector('.ct-managed-video-controls'),null);assert.equal(f.fullscreen,0);
 }finally{f.dom.window.close();}
});
test('direct iframe Play expands once and autoplay rejection restores artwork while retaining the same usable frame',async()=>{
 const f=await fixture();try{await f.load();const frame=f.frame();f.event({event:'onStateChange',info:1});assert.equal(f.root().classList.contains('ct-managed-window-video'),true);f.event({event:'onStateChange',info:2});assert.equal(f.w.CatnapManagedShow.snapshot().phase,'paused');f.root().querySelector('.ct-managed-video-view').click();assert.equal(f.root().classList.contains('ct-managed-window-video'),false);
  const starting=f.send({action:'play',showId:'video-show'});await flush();f.event({event:'onReady'});await flush();f.event({event:'onAutoplayBlocked'});await starting;assert.equal(f.root().classList.contains('ct-managed-window-video'),false);assert.equal(f.frame(),frame);assert.match(f.root().querySelector('.ct-desc').textContent,/Press Play/);assert.equal(f.fullscreen,0);
 }finally{f.dom.window.close();}
});

test('manual Artwork view during pending Play stays restored when playback confirms',async()=>{
 const f=await fixture();try{await f.load();const frame=f.frame(),starting=f.send({action:'play',showId:'video-show'});await flush();assert.equal(f.root().classList.contains('ct-managed-window-video'),true);f.root().querySelector('.ct-managed-video-view').click();assert.equal(f.root().classList.contains('ct-managed-window-video'),false);f.event({event:'onReady'});await flush();f.event({event:'onStateChange',info:1});await starting;assert.equal(f.w.CatnapManagedShow.snapshot().phase,'playing');assert.equal(f.root().classList.contains('ct-managed-window-video'),false);assert.equal(f.frame(),frame);}finally{f.dom.window.close();}
});

test('pending readiness cannot start after Pause or reopen a replaced/closed source on late iframe events',async()=>{
 const f=await fixture();try{await f.load();let old=f.frame(),source=old.contentWindow;const starting=f.send({action:'play',showId:'video-show'});await flush();await f.send({action:'pause',showId:'video-show'});await starting;f.root().querySelector('.ct-managed-video-view').click();f.event({event:'onReady'});await flush();assert.equal(f.commands.some(c=>c.func==='playVideo'),false);assert.equal(f.root().classList.contains('ct-managed-window-video'),false);assert.equal(f.w.CatnapManagedShow.snapshot().phase,'paused');
  await f.send({action:'next',showId:'video-show'});f.w.dispatchEvent(new f.w.MessageEvent('message',{origin:'https://www.youtube-nocookie.com',source,data:JSON.stringify({event:'onStateChange',info:1})}));assert.equal(f.w.CatnapManagedShow.snapshot().current.id,'suno');assert.equal(f.w.CatnapManagedShow.snapshot().phase,'ready');assert.equal(f.frame(),null);
  await f.send({action:'load',index:0,showId:'video-show'});old=f.frame();source=old.contentWindow;const pending=f.send({action:'play',showId:'video-show'});await flush();f.w.CatnapTheatreView.open(false);await flush();await pending;f.w.dispatchEvent(new f.w.MessageEvent('message',{origin:'https://www.youtube-nocookie.com',source,data:JSON.stringify({event:'onStateChange',info:1})}));assert.equal(f.root(),null);assert.equal(f.w.CatnapManagedShow.snapshot().phase,'paused');assert.equal(f.fullscreen,0);
 }finally{f.dom.window.close();}
});
