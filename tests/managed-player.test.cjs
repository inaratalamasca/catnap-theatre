'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const Player=require('../extension/managed-player.js');
const Native=require('../extension/managed-native-guard.js');
const Media=require('../extension/managed-media.js');
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
const entries=[{id:'inbox:1',title:'First',preferredSource:'suno',sunoUrl:'https://suno.com/song/'+ids[0],disclaimer:'yes'},{id:'inbox:2',title:'Second',preferredSource:'youtube',youtubeUrl:'https://www.youtube.com/watch?v=abcdefghijk',disclaimer:'no'}];
function fixture(extra={}){
 const calls=[],states=[],warnings=[],timers=new Map();let now=1000,sequence=0;
 const adapter={stopAll:async ctx=>calls.push(['stop',ctx.generation]),stage:async(e,ctx)=>calls.push(['stage',e.id,ctx.generation]),play:async(e,ctx)=>calls.push(['play',e.id,ctx.generation]),pause:async(e,ctx)=>calls.push(['pause',e.id,ctx.generation]),...extra};
 const clock={now:()=>now,setTimeout:(fn,ms)=>{const id=++sequence;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)};
 const player=Player.create({adapter,onState:s=>states.push(s),onWarning:w=>warnings.push(w),clock});
 const advance=ms=>{now+=ms;for(const [id,timer]of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}};
 return {player,calls,states,warnings,advance,timers};
}
test('LP always starts manual, load/next stages without playing and completion stays on the ended entry',async()=>{
 const f=fixture();await f.player.setQueue(entries,{mode:'lp',autoplay:true,showId:'show'});assert.equal(f.player.snapshot().autoplay,false);
 await f.player.loadNext();assert.equal(f.player.snapshot().phase,'ready');assert.equal(f.calls.some(x=>x[0]==='play'),false);assert.equal(f.player.snapshot().warning.entryId,'inbox:1');
 await f.player.play();const token=f.player.snapshot().generation;await f.player.ended(token);
 assert.equal(f.player.snapshot().phase,'ended');assert.equal(f.player.snapshot().index,0);assert.equal(f.calls.filter(x=>x[0]==='play').length,1);
 await f.player.loadNext();assert.equal(f.player.snapshot().index,1);assert.equal(f.player.snapshot().phase,'ready');assert.equal(f.calls.filter(x=>x[0]==='play').length,1);assert.equal(f.player.snapshot().warning,null);assert.throws(()=>f.player.setAutoplay(true),/LP/);
});
test('AP autoplay must be selected, advances only once, and stops at queue end',async()=>{
 const f=fixture();await f.player.setQueue(entries,{mode:'ap'});assert.equal(f.player.snapshot().autoplay,false);f.player.setAutoplay(true);await f.player.load(0);await f.player.play();
 const first=f.player.snapshot().generation;const ending=f.player.ended(first);await f.player.ended(first);await ending;
 assert.equal(f.player.snapshot().index,1);assert.equal(f.player.snapshot().phase,'playing');assert.equal(f.calls.filter(x=>x[0]==='play').length,2);
 await f.player.ended(first);assert.equal(f.player.snapshot().phase,'playing');await f.player.ended(f.player.snapshot().generation);assert.equal(f.player.snapshot().phase,'ended');assert.equal(f.player.snapshot().index,1);
});
test('direct YouTube iframe Play/Pause is reflected without an extra play command and ends the AP slot once',async()=>{
 const f=fixture();await f.player.setQueue([entries[1],entries[0]],{mode:'ap',autoplay:true,showId:'direct'});await f.player.load(0);const token=f.player.snapshot().generation;f.player.observedPlaying(token);const occurrence=f.player.snapshot().occurrenceId;assert.equal(f.player.snapshot().phase,'playing');assert.ok(occurrence);assert.equal(f.calls.some(x=>x[0]==='play'),false);f.player.observedPaused(token);assert.equal(f.player.snapshot().phase,'paused');f.player.observedPlaying(token);assert.equal(f.player.snapshot().occurrenceId,occurrence);await f.player.ended(token);assert.equal(f.player.snapshot().index,1);assert.equal(f.player.snapshot().phase,'playing');assert.equal(f.calls.filter(x=>x[0]==='play').length,1);f.player.observedPlaying(token);assert.equal(f.player.snapshot().index,1);
});
test('iframe playing confirmation does not duplicate the occurrence reserved by pending Play',async()=>{
 const f=fixture({play:async(entry,ctx)=>{f.player.observedPlaying(ctx.generation);}});await f.player.setQueue([entries[1]],{showId:'one'});await f.player.load(0);await f.player.play();assert.equal(f.player.snapshot().occurrenceId,'one:inbox:2:1');assert.equal(f.player.started,1);
});
test('YouTube autoplay block keeps staged media ready for direct video Play',async()=>{
 const f=fixture({play:async()=>{const error=Error('Press Play inside the video');error.code='AUTOPLAY_BLOCKED';throw error;}});await f.player.setQueue([entries[1]]);await f.player.load(0);const stops=f.calls.filter(x=>x[0]==='stop').length;await f.player.play();assert.equal(f.player.snapshot().phase,'ready');assert.match(f.player.snapshot().error,/inside/);assert.equal(f.calls.filter(x=>x[0]==='stop').length,stops);f.player.observedPlaying(f.player.snapshot().generation);assert.equal(f.player.snapshot().phase,'playing');assert.equal(f.player.snapshot().error,'');
});
test('turning AP autoplay off while a song plays causes a held ending',async()=>{
 const f=fixture();await f.player.setQueue(entries,{mode:'ap',autoplay:true});await f.player.load(0);await f.player.play();f.player.setAutoplay(false);await f.player.ended(f.player.snapshot().generation);assert.equal(f.player.snapshot().phase,'ended');assert.equal(f.player.snapshot().index,0);
});
test('staged warning clears on its configured timeout, not another entry timer',async()=>{
 const f=fixture();await f.player.setQueue(entries);f.player.setWarningSeconds(3);await f.player.load(0);f.advance(2999);assert.ok(f.player.snapshot().warning);f.advance(1);assert.equal(f.player.snapshot().warning,null);
 await f.player.load(0);f.advance(1000);await f.player.load(1);f.advance(3000);assert.equal(f.player.snapshot().warning,null);assert.equal(f.player.snapshot().index,1);
 assert.equal(Player.flagged({disclaimer:'unknown'}),false);assert.equal(Player.flagged({disclaimer:'no'}),false);
});
test('supplied clock functions retain their owner as receiver',async()=>{
 const clock={now(){assert.equal(this,clock);return 1000;},setTimeout(fn,ms){assert.equal(this,clock);this.pending=fn;return 17;},clearTimeout(id){assert.equal(this,clock);assert.equal(id,17);this.cleared=true;}};
 const player=Player.create({clock,adapter:{stopAll:async()=>{},stage:async()=>{},play:async()=>{}}});await player.setQueue(entries);await player.load(0);assert.equal(player.snapshot().phase,'ready');assert.ok(player.snapshot().warning);await player.load(1);assert.equal(clock.cleared,true);
});
test('default browser timers are bound to Window rather than the coordinator clock wrapper',async()=>{
 const fs=require('node:fs'),path=require('node:path'),dom=new JSDOM('',{url:'https://suno.com/playlist/test',runScripts:'outside-only'}),win=dom.window;let timer;
 win.setTimeout=function(fn,ms){assert.equal(this,win,'setTimeout needs its Window receiver');timer=fn;return 9;};win.clearTimeout=function(id){assert.equal(this,win,'clearTimeout needs its Window receiver');assert.equal(id,9);};win.eval(fs.readFileSync(path.join(__dirname,'../extension/managed-player.js'),'utf8'));
 const player=win.CatnapManagedPlayer.create({adapter:{stopAll:async()=>{},stage:async()=>{},play:async()=>{}}});await player.setQueue(entries);await player.load(0);assert.equal(player.snapshot().phase,'ready');assert.equal(player.snapshot().error,'');assert.equal(typeof timer,'function');timer();assert.equal(player.snapshot().warning,null);dom.window.close();
});
test('failed source holds the current slot and never silently switches YouTube to Suno',async()=>{
 const f=fixture({stage:async entry=>{if(entry.preferredSource==='youtube')throw Error('Embedding unavailable');}});await f.player.setQueue(entries,{mode:'ap',autoplay:true});await f.player.load(1);assert.equal(f.player.snapshot().phase,'error');assert.match(f.player.snapshot().error,/Embedding/);assert.equal(f.calls.some(x=>x[0]==='play'),false);
});
test('late stage/play completion and stale errors cannot override newer host selection',async()=>{
 let finish;const f=fixture({stage:entry=>entry.id==='inbox:1'?new Promise(resolve=>{finish=resolve;}):Promise.resolve()});await f.player.setQueue(entries);const first=f.player.load(0);while(!finish)await new Promise(resolve=>setImmediate(resolve));await f.player.load(1);finish();await first;assert.equal(f.player.snapshot().index,1);assert.equal(f.player.snapshot().phase,'ready');const generation=f.player.snapshot().generation;await f.player.failed(generation-1,'stale');assert.equal(f.player.snapshot().phase,'ready');
});
test('pause/resume keeps one playback occurrence and a replay gets a new occurrence',async()=>{
 const f=fixture();await f.player.setQueue(entries,{showId:'show'});await f.player.load(0);await f.player.play();const first=f.player.snapshot().occurrenceId;await f.player.pause();await f.player.play();assert.equal(f.player.snapshot().occurrenceId,first);await f.player.ended(f.player.snapshot().generation);await f.player.play();assert.notEqual(f.player.snapshot().occurrenceId,first);
});
test('Stop clears media resources and the following Play re-stages the retained entry before playing',async()=>{
 const f=fixture();await f.player.setQueue(entries);await f.player.load(1);await f.player.play();await f.player.stop();assert.equal(f.player.snapshot().phase,'ready');assert.equal(f.player.snapshot().index,1);await f.player.play();assert.deepEqual(f.calls.slice(-2).map(x=>x[0]),['stage','play']);assert.equal(f.player.snapshot().phase,'playing');
});
test('append preserves current generation and separate submission identity for repeated songs',async()=>{
 const f=fixture();await f.player.setQueue([entries[0]]);await f.player.load(0);await f.player.play();const before=f.player.snapshot();f.player.appendQueue([{...entries[0],id:'inbox:another'},entries[0]]);const after=f.player.snapshot();assert.equal(after.queue.length,2);assert.equal(after.generation,before.generation);assert.equal(after.phase,'playing');assert.equal(after.occurrenceId,before.occurrenceId);
});
test('inbox edits update notes/queued entries without changing the locked current source or warning timer',async()=>{
 const f=fixture();await f.player.setQueue(entries);await f.player.load(0);const timerCount=f.timers.size;f.player.appendQueue([{...entries[0],note:'Updated note',disclaimer:'no',preferredSource:'youtube',playbackSource:'youtube',youtubeUrl:entries[1].youtubeUrl},{...entries[1],title:'Updated upcoming title'}]);const state=f.player.snapshot();assert.equal(state.current.note,'Updated note');assert.equal(state.current.disclaimer,'no');assert.equal(state.current.preferredSource,'suno');assert.equal(state.current.playbackSource,undefined);assert.equal(state.queue[1].title,'Updated upcoming title');assert.equal(f.timers.size,timerCount);assert.equal(state.warning.entryId,'inbox:1');f.player.repeatWarning();assert.equal(f.player.snapshot().warning,null);f.player.setWarningSeconds(500);assert.equal(f.player.snapshot().warningSeconds,120);
});
test('pausing while Play is pending cannot be undone by its late completion',async()=>{
 let complete;const f=fixture({play:()=>new Promise(resolve=>{complete=resolve;})});await f.player.setQueue(entries);await f.player.load(0);const starting=f.player.play();while(!complete)await new Promise(resolve=>setImmediate(resolve));await f.player.pause();complete();await starting;assert.equal(f.player.snapshot().phase,'paused');
});
test('unsupported, credential-bearing and foreign source URLs fail closed',()=>{
 for(const entry of [{id:'x',preferredSource:'youtube',youtubeUrl:'https://evil.test/watch?v=abcdefghijk'},{id:'x',preferredSource:'suno',sunoUrl:'https://user:secret@suno.com/song/'+ids[0]},{id:'x',preferredSource:'unknown',url:'https://suno.com/song/'+ids[0]}])assert.throws(()=>Player.playback(entry));
 assert.equal(Media.youtubeId('https://youtu.be/abcdefghijk?t=1'),'abcdefghijk');assert.equal(Media.youtubeId('https://evil.test/abcdefghijk'),null);assert.equal(Media.sunoId(entries[0].sunoUrl),ids[0]);
});
function nativeFixture(){
 const dom=new JSDOM('<a aria-label="Playbar: Title for First" href="https://suno.com/song/'+ids[0]+'">First</a><audio src="https://cdn.example/first.mp3"></audio><div id="catnap-theater-root"><video></video></div>',{url:'https://suno.com/playlist/test'}),win=dom.window,audio=win.document.querySelector('audio'),calls=[];
 const proto=win.HTMLMediaElement.prototype;proto.pause=function(){calls.push(['pause',this.src,this.muted]);};proto.play=function(){calls.push(['play',this.src,this.muted]);return Promise.resolve();};
 const guard=Native.install(win);return {dom,win,audio,calls,guard};
}
test('native guard is inert until enabled; stage blocks native audio and unmute attempts',async()=>{
 const f=nativeFixture();await f.audio.play();assert.equal(f.calls.at(-1)[0],'play');await f.guard.command({action:'block',generation:1});assert.equal(f.audio.muted,true);f.audio.muted=false;assert.equal(f.audio.muted,true);await assert.rejects(f.audio.play(),/Managed/);assert.equal(f.guard.status().permitted,false);f.guard.dispose();f.dom.window.close();
});
test('native permission binds exact song and source, source assignment revokes before next play',async()=>{
 const f=nativeFixture();await f.guard.command({action:'enable',generation:2});await assert.rejects(f.guard.command({action:'play',songId:ids[1],generation:2}),/not loaded/);await f.guard.command({action:'play',songId:ids[0],generation:2,sourceKey:f.audio.src});assert.equal(f.guard.status().permitted,true);assert.equal(f.calls.at(-1)[2],false);
 f.audio.src='https://cdn.example/second.mp3';assert.equal(f.audio.muted,true);assert.equal(f.guard.status().permitted,false);await assert.rejects(f.audio.play(),/Managed/);assert.equal(f.calls.filter(x=>x[0]==='play'&&x[1].includes('second')).length,0);f.guard.dispose();f.dom.window.close();
});
test('manual ended boundary suppresses native auto-next handler before it can select/play another song',async()=>{
 const f=nativeFixture();await f.guard.command({action:'enable',generation:3});await f.guard.command({action:'play',songId:ids[0],generation:3});let nativeAdvanced=0;f.audio.addEventListener('ended',()=>{nativeAdvanced++;f.audio.src='https://cdn.example/second.mp3';void f.audio.play().catch(()=>{});});
 f.audio.dispatchEvent(new f.win.Event('ended'));assert.equal(nativeAdvanced,0);assert.equal(f.audio.muted,true);assert.equal(f.guard.status().permitted,false);assert.equal(f.calls.filter(x=>x[0]==='play').length,1);f.guard.dispose();f.dom.window.close();
});
test('setAttribute source changes and stale native commands cannot reopen the gate',async()=>{
 const f=nativeFixture();await f.guard.command({action:'enable',generation:4});await f.guard.command({action:'play',songId:ids[0],generation:4});f.audio.setAttribute('src','https://cdn.example/second.mp3');assert.equal(f.guard.status().permitted,false);assert.equal(f.audio.muted,true);await assert.rejects(f.guard.command({action:'play',songId:ids[0],generation:3}),/stale/);f.guard.dispose();f.dom.window.close();
});
test('managed native media cannot loop; disabling restores its original loop preference',async()=>{
 const f=nativeFixture();f.audio.loop=true;await f.guard.command({action:'enable',generation:1});assert.equal(f.audio.loop,false);f.audio.loop=true;assert.equal(f.audio.loop,false);f.audio.setAttribute('loop','');assert.equal(f.audio.loop,false);await f.guard.command({action:'play',songId:ids[0],generation:1});assert.equal(f.audio.loop,false);await f.guard.command({action:'disable',generation:1});assert.equal(f.audio.loop,true);await f.guard.command({action:'enable',generation:0});assert.equal(f.audio.loop,false);f.guard.dispose();assert.equal(f.audio.loop,true);f.dom.window.close();
});
test('actual native-row source selection remains guarded until the exact new song can play',async()=>{
 const f=nativeFixture();const row=f.win.document.createElement('div');row.innerHTML='<a href="https://suno.com/song/'+ids[1]+'">Second</a><button aria-label="Play Second">Play</button>';f.win.document.body.prepend(row);Object.defineProperty(f.audio,'currentSrc',{get(){return this.src;}});Object.defineProperty(f.audio,'readyState',{get(){return 4;}});const errors=[];row.querySelector('button').onclick=()=>{f.audio.src='https://cdn.example/second.mp3';f.win.dispatchEvent(new f.win.MessageEvent('message',{source:f.win,origin:f.win.location.origin,data:{channel:Native.CHANNEL,type:'blocked',generation:1,reason:'A queued source transition notice'}}));f.win.document.querySelector('[aria-label^="Playbar: Title for "]').href=entries[0].sunoUrl.replace(ids[0],ids[1]);void f.audio.play().catch(()=>{});};const adapter=Media.create({window:f.win,document:f.win.document,guard:message=>f.guard.command(message),onError:(generation,error)=>errors.push(error)});const entry={...entries[0],id:'new-row',sunoUrl:'https://suno.com/song/'+ids[1]};await adapter.stopAll({generation:1});await adapter.stage(entry,{generation:1});assert.equal(f.calls.filter(x=>x[0]==='play').length,0);await adapter.play(entry,{generation:1});assert.equal(f.guard.status().permitted,true);assert.equal(f.guard.status().songId,ids[1]);assert.equal(f.calls.filter(x=>x[0]==='play'&&x[1].includes('second')).length,1);assert.equal(errors.length,0);await adapter.dispose();f.guard.dispose();f.dom.window.close();
});
test('YouTube is staged without playing; only its bound frame can confirm playback or completion',async()=>{
 const dom=new JSDOM('<div id="catnap-theater-root"><div class="ct-art-frame"></div></div>',{url:'https://suno.com/playlist/test'}),win=dom.window,commands=[],ended=[],errors=[];
 const adapter=Media.create({window:win,document:win.document,guard:async m=>({ready:true,enabled:true,permitted:m.action==='play'}),onEnded:g=>ended.push(g),onError:(g,error)=>errors.push(error)});
 await adapter.stopAll({generation:1});await adapter.stage(entries[1],{generation:1});const frame=win.document.querySelector('iframe');frame.contentWindow.postMessage=value=>commands.push(JSON.parse(value));assert.equal(new URL(frame.src).searchParams.get('autoplay'),'0');assert.equal(commands.some(x=>x.func==='playVideo'),false);
 const message=(event,origin='https://www.youtube-nocookie.com',source=frame.contentWindow)=>win.dispatchEvent(new win.MessageEvent('message',{origin,source,data:JSON.stringify(event)}));
 const playing=adapter.play(entries[1],{generation:1});message({event:'onReady'});await new Promise(resolve=>setImmediate(resolve));assert.equal(commands.some(x=>x.func==='playVideo'),true);message({event:'onStateChange',info:1},'https://evil.test');assert.equal(ended.length,0);message({event:'onStateChange',info:1});await playing;message({event:'onStateChange',info:0});message({event:'onStateChange',info:0});assert.deepEqual(ended,[1]);assert.equal(errors.length,0);await adapter.dispose();dom.window.close();
});
test('YouTube autoplay rejection retains the iframe and observes a later direct user gesture',async()=>{
 const dom=new JSDOM('<div id="catnap-theater-root"><div class="ct-art-frame"></div></div>',{url:'https://suno.com/playlist/test'}),win=dom.window,observed=[],errors=[];
 const adapter=Media.create({window:win,document:win.document,guard:async m=>({ready:true,enabled:true,permitted:m.action==='play'}),onPlaying:g=>observed.push(['playing',g]),onPaused:g=>observed.push(['paused',g]),onAutoplayBlocked:(g,message)=>observed.push(['blocked',g]),onEnded:g=>observed.push(['ended',g]),onError:(g,error)=>errors.push(error)});
 await adapter.stopAll({generation:2});await adapter.stage(entries[1],{generation:2});const frame=win.document.querySelector('iframe');frame.contentWindow.postMessage=()=>{};const message=data=>win.dispatchEvent(new win.MessageEvent('message',{origin:'https://www.youtube-nocookie.com',source:frame.contentWindow,data:JSON.stringify(data)}));
 const playing=adapter.play(entries[1],{generation:2});message({event:'onReady'});await new Promise(resolve=>setImmediate(resolve));const rejected=assert.rejects(playing,error=>error.code==='AUTOPLAY_BLOCKED');message({event:'onAutoplayBlocked'});await rejected;assert.equal(win.document.querySelector('iframe'),frame);assert.equal(errors.length,0);message({event:'onStateChange',info:1});message({event:'onStateChange',info:2});message({event:'onStateChange',info:1});message({event:'onStateChange',info:0});assert.deepEqual(observed,[['blocked',2],['playing',2],['paused',2],['playing',2],['ended',2]]);await adapter.dispose();dom.window.close();
});
