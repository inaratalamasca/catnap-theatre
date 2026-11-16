'use strict';
// Catnap 0.6.5: fictional native-player contracts, never a provider/account.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const Native=require('../extension/managed-native-guard.js');
const Media=require('../extension/managed-media.js');
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
const entry={id:'fixture:target',preferredSource:'suno',sunoUrl:'https://suno.com/song/'+ids[1]};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({initialId=ids[0],initialSource='https://cdn.example/previous.mp3',initialReady=0,nativePlay}={}){
 const dom=new JSDOM('<main><div role="group"><a href="https://suno.com/song/'+ids[1]+'">Target</a><div role="button" aria-label="Play Target">Play</div></div></main><audio preload="none"></audio><div id="catnap-theater-root"></div>',{url:'https://suno.com/playlist/'+ids[0]}),win=dom.window,doc=win.document,audio=doc.querySelector('audio'),actions=[],plays=[],errors=[];let ready=initialReady,paused=true,clicks=0;
 if(initialId){const anchor=doc.createElement('a');anchor.setAttribute('aria-label','Playbar: Title for Fixture');anchor.href='https://suno.com/song/'+initialId;doc.body.append(anchor);}
 audio.src=initialSource;Object.defineProperty(audio,'currentSrc',{get(){return this.src;}});Object.defineProperty(audio,'readyState',{get(){return ready;}});Object.defineProperty(audio,'paused',{get(){return paused;}});
 win.HTMLMediaElement.prototype.pause=function(){paused=true;};win.HTMLMediaElement.prototype.load=function(){};
 win.HTMLMediaElement.prototype.play=function(){const record={source:this.src,muted:this.muted};plays.push(record);paused=false;ready=2;return nativePlay?nativePlay(record,plays.length):Promise.resolve();};
 const guard=Native.install(win),adapter=Media.create({window:win,document:doc,guard:async message=>{actions.push({...message});return guard.command(message);}});
 const setTitle=()=>{let anchor=doc.querySelector('a[aria-label^="Playbar: Title for "]');if(!anchor){anchor=doc.createElement('a');anchor.setAttribute('aria-label','Playbar: Title for Fixture');doc.body.append(anchor);}anchor.href=entry.sunoUrl;};
 let select=async()=>{audio.src='https://cdn.example/'+ids[1]+'.mp3';await audio.play();setTitle();};
 doc.querySelector('[role="button"]').onclick=()=>{clicks++;void select().catch(error=>errors.push(error));};
 return {dom,win,doc,audio,guard,adapter,actions,plays,errors,setTitle,setSelect:fn=>{select=fn;},clicks:()=>clicks,ready:value=>{ready=value;},cleanup:async()=>{await adapter.dispose();guard.dispose();win.close();}};
}
async function stage(f){await f.adapter.stopAll({generation:1});await f.adapter.stage(entry,{generation:1});}

test('quiet Load does not select or prepare native audio; explicit Play can await muted native startup before title publication',async()=>{
 const f=fixture({initialId:null});try{
  await stage(f);assert.equal(f.clicks(),0);assert.equal(f.plays.length,0);assert.equal(f.actions.some(action=>action.action==='prepare'),false);
  await f.adapter.play(entry,{generation:1});
  assert.equal(f.clicks(),1);assert.equal(f.errors.length,0);assert.deepEqual(f.plays.map(play=>play.muted),[true,false]);assert.equal(f.guard.status().permitted,true);assert.equal(f.guard.status().preparing,false);
  assert.ok(f.actions.findIndex(action=>action.action==='prepare')<f.actions.findIndex(action=>action.action==='play'));
 }finally{await f.cleanup();}
});

test('a currently selected preload-none song is prepared by its exact row instead of waiting forever for readyState',async()=>{
 const f=fixture({initialId:ids[1],initialSource:'https://cdn.example/'+ids[1]+'.mp3'});try{
  f.setSelect(async()=>{await f.audio.play();});await stage(f);await f.adapter.play(entry,{generation:1});
  assert.equal(f.clicks(),1);assert.deepEqual(f.plays.map(play=>play.muted),[true,false]);assert.equal(f.guard.status().permitted,true);
 }finally{await f.cleanup();}
});

test('an already preloaded target can retain its source only when the audio filename independently identifies the exact target',async()=>{
 const f=fixture({initialSource:'https://cdn.example/'+ids[1]+'.mp3',initialReady:4});try{
  f.setSelect(async()=>{await f.audio.play();f.setTitle();});await stage(f);await f.adapter.play(entry,{generation:1});
  assert.equal(f.guard.status().songId,ids[1]);assert.deepEqual(f.plays.map(play=>play.muted),[true,false]);
 }finally{await f.cleanup();}
});

test('unchanged opaque previous audio stays held even when preparation reports target correlation or query text names the target',async t=>{
 const source='https://cdn.example/opaque.mp3?target='+ids[1],f=fixture({initialSource:source,initialReady:4});let clock=0;
 try{
  f.setSelect(async()=>{f.audio.src=source;await f.audio.play();f.setTitle();});await stage(f);
  // Advance only this synthetic deadline quickly; no media/network runs here.
  t.mock.method(Date,'now',()=>clock+=1000);
  await assert.rejects(f.adapter.play(entry,{generation:1}),error=>{
   assert.equal(error.code,'SUNO_PREPARATION_HELD');assert.equal(error.details.targetMatch,true);assert.equal(error.details.mediaPresent,true);assert.equal(error.details.sourceChanged,false);assert.ok(!error.message.includes(ids[1]));assert.ok(!error.message.includes('https://'));return true;
  });
  assert.equal(f.guard.status().permitted,false);assert.equal(f.guard.status().preparing,false);assert.ok(f.plays.every(play=>play.muted));assert.equal(f.actions.some(action=>action.action==='play'),false);
 }finally{t.mock.restoreAll();await f.cleanup();}
});

test('changed audio positively naming a different song cannot be licensed by the requested native title',async t=>{
 const wrongId='33333333-3333-4333-8333-333333333333',f=fixture({initialReady:4});let clock=0;
 try{
  f.setSelect(async()=>{f.audio.src='https://cdn.example/'+wrongId+'.mp3';await f.audio.play();f.setTitle();});await stage(f);t.mock.method(Date,'now',()=>clock+=1000);
  await assert.rejects(f.adapter.play(entry,{generation:1}),error=>{assert.equal(error.code,'SUNO_PREPARATION_HELD');assert.equal(error.details.targetMatch,true);assert.equal(error.details.sourceChanged,true);assert.ok(!error.message.includes(wrongId));return true;});
  assert.equal(f.guard.status().permitted,false);assert.equal(f.actions.some(action=>action.action==='play'),false);assert.ok(f.plays.every(play=>play.muted));
 }finally{t.mock.restoreAll();await f.cleanup();}
});

test('Pause cancels a same-generation pending native start and its late completion does not block a newer explicit Play',async()=>{
 let releaseFirst;const f=fixture({nativePlay:(record,index)=>index===1?new Promise(resolve=>{releaseFirst=resolve;}):Promise.resolve()});
 try{
  await stage(f);const first=f.adapter.play(entry,{generation:1});const rejected=assert.rejects(first,/changed|paused/);while(!releaseFirst)await tick();
  await f.adapter.pause(entry,{generation:1});assert.equal(f.guard.status().permitted,false);assert.equal(f.guard.status().preparing,false);assert.equal(f.audio.muted,true);
  await f.adapter.play(entry,{generation:1});assert.equal(f.guard.status().permitted,true);const playCount=f.plays.length;releaseFirst();await rejected;
  assert.equal(f.guard.status().permitted,true);assert.equal(f.audio.muted,false);assert.equal(f.plays.length,playCount);assert.deepEqual(f.plays.map(play=>play.muted),[true,true,false]);
 }finally{releaseFirst?.();await f.cleanup();}
});

test('Load of another entry cancels muted preparation and prevents an old start from authorizing the replacement',async()=>{
 let releaseFirst;const f=fixture({nativePlay:()=>new Promise(resolve=>{releaseFirst=resolve;})});
 try{
  await stage(f);const playing=f.adapter.play(entry,{generation:1}),rejected=assert.rejects(playing,/changed|paused/);while(!releaseFirst)await tick();
  const next={...entry,id:'fixture:next'};await f.adapter.stopAll({generation:2});await f.adapter.stage(next,{generation:2});releaseFirst();await rejected;
  assert.equal(f.guard.status().permitted,false);assert.equal(f.guard.status().preparing,false);assert.equal(f.actions.some(action=>action.action==='play'),false);assert.ok(f.plays.every(play=>play.muted));
 }finally{releaseFirst?.();await f.cleanup();}
});
