'use strict';
/* Muted native preparation regressions, version 0.6.5.
 * Synthetic media methods and a deterministic clock; never contacts Suno.
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const Native=require('../extension/managed-native-guard.js');
const FIRST='11111111-1111-4111-8111-111111111111',NEXT='22222222-2222-4222-8222-222222222222';
const source=id=>'https://cdn.example/'+id+'.mp3';
function fixture(t){
  const dom=new JSDOM('<a aria-label="Playbar: Title for Fixture" href="https://suno.com/song/'+FIRST+'">Fixture</a><audio src="'+source(FIRST)+'"></audio><video src="https://cdn.example/video.mp4"></video>',{url:'https://suno.com/playlist/fixture',runScripts:'outside-only'});
  const win=dom.window,doc=win.document,audio=doc.querySelector('audio'),video=doc.querySelector('video'),calls=[],pending=[],playing=new WeakMap(),readiness=new WeakMap(),timers=new Map();let now=1000,sequence=0,defer=false;
  win.Date.now=()=>now;win.setTimeout=(fn,ms)=>{const id=++sequence;timers.set(id,{fn,at:now+ms});return id;};win.clearTimeout=id=>timers.delete(id);
  const proto=win.HTMLMediaElement.prototype;
  Object.defineProperty(proto,'paused',{configurable:true,get(){return !playing.get(this);}});
  Object.defineProperty(proto,'readyState',{configurable:true,get(){return readiness.get(this)||0;}});
  Object.defineProperty(proto,'duration',{configurable:true,get(){return 180;}});
  Object.defineProperty(proto,'currentSrc',{configurable:true,get(){return this.src||this.querySelector('source')?.src||'';}});
  proto.pause=function(){playing.set(this,false);calls.push({method:'pause',el:this,source:this.src,muted:this.muted});};
  proto.load=function(){readiness.set(this,0);this.dispatchEvent(new win.Event('loadstart'));};
  proto.play=function(){
    const el=this;playing.set(el,true);calls.push({method:'play',el,source:el.src,muted:el.muted});
    el.dispatchEvent(new win.Event('play',{bubbles:true}));
    if(defer)return new Promise((resolve,reject)=>pending.push({el,resolve:()=>{readiness.set(el,4);el.dispatchEvent(new win.Event('playing',{bubbles:true}));resolve();},reject}));
    readiness.set(el,4);el.dispatchEvent(new win.Event('playing',{bubbles:true}));return Promise.resolve();
  };
  const guard=Native.install(win);
  t.after(()=>{guard.dispose();dom.window.close();});
  const advance=ms=>{now+=ms;for(const [id,timer]of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}};
  return {win,doc,audio,video,calls,pending,timers,guard,advance,setDeferred:value=>{defer=value;},title:id=>{doc.querySelector('a').href='https://suno.com/song/'+id;},ready:(el,value)=>readiness.set(el,value)};
}

test('explicit preparation lets an await-play React loader finish quietly before separate final Play',async t=>{
  const f=fixture(t);await f.guard.command({action:'enable',generation:1});f.setDeferred(true);
  const preparing=await f.guard.command({action:'prepare',generation:1,songId:NEXT});
  assert.equal(preparing.preparing,true);assert.equal(preparing.prepareSongId,NEXT);assert.equal(preparing.permitted,false);
  let reactPlayEvents=0,reactPlayingEvents=0;
  f.doc.addEventListener('play',()=>reactPlayEvents++);f.doc.addEventListener('playing',()=>reactPlayingEvents++);
  const load=(async()=>{f.audio.src=source(NEXT);await f.audio.play();f.title(NEXT);})();
  assert.equal(f.pending.length,1);assert.equal(f.audio.muted,true);assert.equal(f.guard.status().permitted,false);
  f.pending.shift().resolve();await load;
  const loaded=f.guard.status();assert.equal(loaded.nativeAudio.readyState,4);assert.equal(loaded.nativeAudio.songId,NEXT);
  assert.equal(reactPlayEvents,1);assert.equal(reactPlayingEvents,1);
  assert.equal(f.audio.paused,true);assert.equal(f.audio.muted,true);assert.equal(loaded.permitted,false);
  assert.equal(f.calls.filter(call=>call.method==='play').every(call=>call.muted),true);
  f.setDeferred(false);await f.guard.command({action:'play',generation:1,songId:NEXT,sourceKey:source(NEXT),restart:true});
  assert.equal(f.guard.status().preparing,false);assert.equal(f.guard.status().permitted,true);assert.equal(f.audio.muted,false);
  assert.equal(f.calls.filter(call=>call.method==='play'&&!call.muted).length,1);
});

test('new and current audio stay muted during source changes and preparation never permits video',async t=>{
  const f=fixture(t);await f.guard.command({action:'enable',generation:1});await f.guard.command({action:'prepare',generation:1,songId:NEXT});
  f.audio.src=source(NEXT);f.audio.muted=false;f.audio.loop=true;await f.audio.play();
  assert.equal(f.audio.muted,true);assert.equal(f.audio.loop,false);assert.equal(f.audio.paused,true);
  const fresh=new f.win.Audio('https://cdn.example/preload.mp3');fresh.muted=false;await fresh.play();
  assert.equal(fresh.muted,true);assert.equal(fresh.paused,true);
  const created=f.doc.createElement('audio');created.src='https://cdn.example/another.mp3';created.muted=false;await created.play();
  assert.equal(created.muted,true);assert.equal(f.guard.status().permitted,false);
  await assert.rejects(f.video.play(),/Managed show/);
  assert.equal(f.calls.some(call=>call.method==='play'&&call.el===f.video),false);
  assert.equal(f.calls.filter(call=>call.method==='play').every(call=>call.muted),true);
});

test('preparation is exactly eight seconds and timeout or pause holds late native completion',async t=>{
  const f=fixture(t);await f.guard.command({action:'enable',generation:1});f.setDeferred(true);
  await f.guard.command({action:'prepare',generation:1,songId:NEXT});f.audio.src=source(NEXT);
  const first=f.audio.play();f.advance(7999);assert.equal(f.guard.status().preparing,true);
  f.advance(1);assert.equal(f.guard.status().preparing,false);assert.equal(f.audio.paused,true);assert.equal(f.audio.muted,true);
  f.pending.shift().resolve();await first;assert.equal(f.guard.status().permitted,false);assert.equal(f.audio.paused,true);
  await assert.rejects(f.audio.play(),/Managed show/);
  await f.guard.command({action:'prepare',generation:1,songId:NEXT});const second=f.audio.play();
  await f.guard.command({action:'pause',generation:1});f.pending.shift().resolve();await second;
  assert.equal(f.guard.status().preparing,false);assert.equal(f.audio.muted,true);assert.equal(f.audio.paused,true);
});

test('block, disable and a new generation cancel preparation; stale preparation cannot reopen it',async t=>{
  const f=fixture(t);await f.guard.command({action:'enable',generation:1});
  await f.guard.command({action:'prepare',generation:1,songId:NEXT});await f.guard.command({action:'block',generation:1});
  assert.equal(f.guard.status().preparing,false);await assert.rejects(f.audio.play(),/Managed show/);
  await f.guard.command({action:'prepare',generation:1,songId:NEXT});await f.guard.command({action:'block',generation:2});
  assert.equal(f.guard.status().preparing,false);await assert.rejects(f.guard.command({action:'prepare',generation:1,songId:NEXT}),/stale/);
  await f.guard.command({action:'prepare',generation:2,songId:NEXT});await f.guard.command({action:'disable',generation:2});
  assert.equal(f.guard.status().preparing,false);assert.equal(f.guard.status().enabled,false);assert.equal(f.timers.size,0);
});

test('wrong final song/source and native ended handling keep preparation inaudible',async t=>{
  const f=fixture(t);await f.guard.command({action:'enable',generation:1});await f.guard.command({action:'prepare',generation:1,songId:NEXT});
  f.audio.src=source(NEXT);f.title(NEXT);await f.audio.play();
  await assert.rejects(f.guard.command({action:'play',generation:1,songId:NEXT,sourceKey:source(FIRST)}),/prepared audio source/);
  assert.equal(f.guard.status().permitted,false);assert.equal(f.audio.muted,true);
  await f.guard.command({action:'prepare',generation:1,songId:NEXT});f.title(FIRST);
  await assert.rejects(f.guard.command({action:'play',generation:1,songId:FIRST,sourceKey:source(NEXT)}),/not loaded/);
  await f.guard.command({action:'prepare',generation:1,songId:NEXT});
  let advanced=0;f.doc.addEventListener('ended',()=>advanced++,true);f.audio.dispatchEvent(new f.win.Event('ended',{bubbles:true}));
  assert.equal(advanced,0);assert.equal(f.guard.status().preparing,false);assert.equal(f.guard.status().permitted,false);
});

test('late preparation completion does not pause ordinary playback after managed mode is disabled',async t=>{
  const f=fixture(t);await f.guard.command({action:'enable',generation:1});f.setDeferred(true);
  await f.guard.command({action:'prepare',generation:1,songId:FIRST});const old=f.audio.play();
  await f.guard.command({action:'disable',generation:1});f.setDeferred(false);
  await f.audio.play();assert.equal(f.audio.muted,false);assert.equal(f.audio.paused,false);
  const pauses=f.calls.filter(call=>call.method==='pause'&&call.el===f.audio).length;
  f.pending.shift().resolve();await old;
  assert.equal(f.audio.muted,false);assert.equal(f.audio.paused,false);
  assert.equal(f.calls.filter(call=>call.method==='pause'&&call.el===f.audio).length,pauses);
});

test('old muted preparation promise and timer cannot pause a replacement same-generation preparation',async t=>{
  const f=fixture(t);await f.guard.command({action:'enable',generation:1});f.setDeferred(true);
  await f.guard.command({action:'prepare',generation:1,songId:FIRST});const old=f.audio.play(),oldTimer=[...f.timers.values()][0].fn;
  await f.guard.command({action:'pause',generation:1});await f.guard.command({action:'prepare',generation:1,songId:NEXT});
  f.audio.src=source(NEXT);const replacement=f.audio.play();
  const pauses=f.calls.filter(call=>call.method==='pause'&&call.el===f.audio).length;
  f.pending.shift().resolve();await old;oldTimer();
  assert.equal(f.guard.status().preparing,true);assert.equal(f.guard.status().prepareSongId,NEXT);
  assert.equal(f.calls.filter(call=>call.method==='pause'&&call.el===f.audio).length,pauses);assert.equal(f.audio.paused,false);assert.equal(f.audio.muted,true);
  f.pending.shift().resolve();await replacement;assert.equal(f.audio.paused,true);assert.equal(f.guard.status().permitted,false);
});

test('old audible Play settlement cannot revoke a newer same-generation exact lease',async t=>{
  const f=fixture(t);await f.guard.command({action:'enable',generation:1});f.setDeferred(true);
  const old=f.guard.command({action:'play',generation:1,songId:FIRST,sourceKey:source(FIRST)});
  await f.guard.command({action:'pause',generation:1});f.audio.src=source(NEXT);f.title(NEXT);
  const replacement=f.guard.command({action:'play',generation:1,songId:NEXT,sourceKey:source(NEXT)});
  const pauses=f.calls.filter(call=>call.method==='pause'&&call.el===f.audio).length;
  f.pending.shift().resolve();await assert.rejects(old,/replaced/);
  assert.equal(f.guard.status().permitted,true);assert.equal(f.guard.status().songId,NEXT);
  assert.equal(f.calls.filter(call=>call.method==='pause'&&call.el===f.audio).length,pauses);assert.equal(f.audio.muted,false);
  f.pending.shift().resolve();await replacement;assert.equal(f.guard.status().permitted,true);
});

test('a known different UUID audio filename cannot gain a lease merely because the playbar title changed',async t=>{
  const f=fixture(t);await f.guard.command({action:'enable',generation:1});await f.guard.command({action:'prepare',generation:1,songId:NEXT});
  f.audio.src=source(FIRST);f.title(NEXT);await f.audio.play();
  await assert.rejects(f.guard.command({action:'play',generation:1,songId:NEXT,sourceKey:source(FIRST)}),/different song/);
  assert.equal(f.guard.status().permitted,false);assert.equal(f.audio.muted,true);
  assert.equal(f.calls.filter(call=>call.method==='play'&&!call.muted).length,0);
});
