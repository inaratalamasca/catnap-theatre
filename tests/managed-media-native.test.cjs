'use strict';
// Catnap 0.6.6: observed Suno element roles, using fictional local media only.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const Media=require('../extension/managed-media.js');
const Native=require('../extension/managed-native-guard.js');
const song='11111111-1111-4111-8111-111111111111';
const entry={id:'fixture:active',preferredSource:'suno',sunoUrl:'https://suno.com/song/'+song};
const markup='<audio id="silent-audio" src="https://cdn.example/silent.mp3"></audio><audio id="active-audio-play" src="blob:https://suno.com/fictional-music"></audio>';
function fixture(html=markup){return new JSDOM('<a aria-label="Playbar: Title for Fixture" href="'+entry.sunoUrl+'">Fixture</a>'+html+'<div id="catnap-theater-root"></div>',{url:'https://suno.com/playlist/'+song});}

test('source-bearing active blob audio is preferred to the native silent CDN helper regardless of document order',()=>{
 const dom=fixture(),doc=dom.window.document;try{
  const active=doc.getElementById('active-audio-play'),silent=doc.getElementById('silent-audio');assert.equal(Media.findNativeAudio(doc),active);silent.before(active);assert.equal(Media.findNativeAudio(doc),active);
  const other=doc.createElement('audio');other.src='https://cdn.example/unknown.mp3';doc.body.append(other);assert.equal(Media.findNativeAudio(doc),active);
 }finally{dom.window.close();}
});

test('duplicate active IDs and a known active player without a source stay held',()=>{
 const dom=fixture(),doc=dom.window.document;try{
  const active=doc.getElementById('active-audio-play'),duplicate=active.cloneNode();doc.body.append(duplicate);assert.equal(Media.findNativeAudio(doc),null);duplicate.remove();
  active.removeAttribute('src');const unknown=doc.createElement('audio');unknown.src='https://cdn.example/unknown.mp3';doc.body.append(unknown);assert.equal(Media.findNativeAudio(doc),null);
 }finally{dom.window.close();}
});

test('generic fallback excludes silent and Theatre media and requires exactly one unknown source',()=>{
 const dom=fixture('<audio id="silent-audio" src="https://cdn.example/silent.mp3"></audio>'),doc=dom.window.document;try{
  assert.equal(Media.findNativeAudio(doc),null);const unknown=doc.createElement('audio');unknown.src='https://cdn.example/unknown.mp3';doc.body.append(unknown);assert.equal(Media.findNativeAudio(doc),unknown);
  const staged=doc.createElement('audio');staged.src='https://cdn.example/staged.mp3';doc.getElementById('catnap-theater-root').append(staged);assert.equal(Media.findNativeAudio(doc),unknown);
  const second=doc.createElement('audio');second.src='https://cdn.example/another.mp3';doc.body.append(second);assert.equal(Media.findNativeAudio(doc),null);
 }finally{dom.window.close();}
});

test('adapter DOM fallback passes the active blob source to final Play, never the silent helper',async()=>{
 const dom=fixture(),win=dom.window,doc=win.document,actions=[];for(const audio of doc.querySelectorAll('audio'))Object.defineProperty(audio,'readyState',{get:()=>4});
 const adapter=Media.create({window:win,document:doc,guard:async message=>{actions.push(message);return {ready:true,enabled:message.action!=='disable',permitted:message.action==='play'};}});
 try{
  await adapter.stopAll({generation:1});await adapter.stage(entry,{generation:1});await adapter.play(entry,{generation:1});
  const play=actions.find(action=>action.action==='play');assert.equal(play.sourceKey,doc.getElementById('active-audio-play').src);assert.notEqual(play.sourceKey,doc.getElementById('silent-audio').src);assert.equal(actions.some(action=>action.action==='prepare'),false);
 }finally{await adapter.dispose();win.close();}
});

test('actual guard plus adapter keeps the silent helper held while granting only the active blob song',async()=>{
 const dom=fixture(),win=dom.window,doc=win.document,calls=[],active=doc.getElementById('active-audio-play'),silent=doc.getElementById('silent-audio');
 for(const audio of doc.querySelectorAll('audio'))Object.defineProperty(audio,'readyState',{get:()=>4});
 win.HTMLMediaElement.prototype.pause=function(){};win.HTMLMediaElement.prototype.load=function(){};win.HTMLMediaElement.prototype.play=function(){calls.push({element:this,muted:this.muted});return Promise.resolve();};
 const guard=Native.install(win),adapter=Media.create({window:win,document:doc,guard:message=>guard.command(message)});
 try{
  await adapter.stopAll({generation:1});await adapter.stage(entry,{generation:1});assert.equal(guard.status().nativeAudio.sourceKey,active.src);await adapter.play(entry,{generation:1});
  assert.equal(guard.status().permitted,true);assert.deepEqual(calls,[{element:active,muted:false}]);assert.equal(silent.muted,true);assert.equal(active.muted,false);
  active.dispatchEvent(new win.Event('ended'));assert.equal(guard.status().permitted,false);assert.equal(active.muted,true);assert.equal(silent.muted,true);
 }finally{await adapter.dispose();guard.dispose();win.close();}
});

test('cold native row preparation selects its active blob audio even while the silent helper is ready',async()=>{
 const dom=fixture(),win=dom.window,doc=win.document,calls=[],active=doc.getElementById('active-audio-play'),silent=doc.getElementById('silent-audio'),title=doc.querySelector('[aria-label^="Playbar: Title for "]');let ready=0;
 title.href='https://suno.com/song/22222222-2222-4222-8222-222222222222';Object.defineProperty(active,'readyState',{get:()=>ready});Object.defineProperty(silent,'readyState',{get:()=>4});Object.defineProperty(silent,'duration',{get:()=>0});
 win.HTMLMediaElement.prototype.pause=function(){};win.HTMLMediaElement.prototype.load=function(){};win.HTMLMediaElement.prototype.play=function(){calls.push({element:this,muted:this.muted});if(this===active)ready=4;return Promise.resolve();};
 const row=doc.createElement('div');row.setAttribute('role','group');row.innerHTML='<a href="'+entry.sunoUrl+'">Fixture</a><div role="button" aria-label="Play Fixture">Play</div>';doc.body.prepend(row);
 row.querySelector('[role="button"]').onclick=()=>{active.src='blob:https://suno.com/fictional-selected';void active.play().then(()=>{title.href=entry.sunoUrl;});};
 const guard=Native.install(win),adapter=Media.create({window:win,document:doc,guard:message=>guard.command(message)});
 try{
  await adapter.stopAll({generation:1});await adapter.stage(entry,{generation:1});assert.equal(calls.length,0);await adapter.play(entry,{generation:1});
  assert.deepEqual(calls.map(call=>[call.element===active,call.muted]),[[true,true],[true,false]]);assert.equal(guard.status().permitted,true);assert.equal(silent.muted,true);
 }finally{await adapter.dispose();guard.dispose();win.close();}
});
