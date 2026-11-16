/* Visualizer regression tests, version 0.5.0: real DSP, owned-clone lifecycle,
 * source identity, reduced motion, and pinned worker spectrum authorization.
 * The companion isolated-Chromium rehearsal verifies actual decoded audio.
 */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const V=require('../extension/visualizer.js'),H=require('../extension/helpers.js');

test('spectrum is bounded, silent input is silent, and decay reaches zero',()=>{
 assert.deepEqual(V.spectrum(new Uint8Array(256)),Array(48).fill(0));
 const values=new Uint8Array(256);values[5]=230;const bands=V.spectrum(values);
 assert.equal(bands.length,48);assert.ok(bands.some(x=>x>.1));assert.ok(bands.every(x=>x>=0&&x<=1));
 assert.equal(V.sanitizeBands(bands).length,48);
 for(const input of [[],Array(47).fill(0),Array(48).fill(NaN),Array(48).fill(Infinity),Array(48).fill(-.1),Array(48).fill(1.1)])assert.equal(V.sanitizeBands(input),null);
 let faded=Array(48).fill(1);for(let i=0;i<60;i++)faded=V.smooth(faded,Array(48).fill(0));assert.deepEqual(faded,Array(48).fill(0));
 assert.deepEqual(V.smooth(Array(48).fill(0),Array(48).fill(1),0),Array(48).fill(0));
});
test('old settings gain safe visualizer defaults and imported opacity is bounded',()=>{
 assert.equal(H.settings({schemaVersion:1}).visualizerEnabled,true);assert.equal(H.settings({schemaVersion:1}).visualizerOpacity,.2);
 assert.equal(H.settings({schemaVersion:1,visualizerEnabled:false,visualizerOpacity:-4}).visualizerOpacity,.05);
 assert.equal(H.settings({schemaVersion:1,visualizerOpacity:100}).visualizerOpacity,.4);
 assert.equal(H.settings({schemaVersion:1,visualizerOpacity:NaN}).visualizerOpacity,.2);
});

function lifecycleFixture(){
 const dom=new JSDOM('<!doctype html><audio src="https://suno.com/music.wav"></audio><div id="catnap-theater-root"><header class="ct-header"></header><main class="ct-main"></main><footer class="ct-bottom"></footer></div>',{url:'https://suno.com/'}),w=dom.window,a=w.document.querySelector('audio');
 let clock=2000,tick,raf=0,message,motionListener,settings={visualizerEnabled:true,visualizerOpacity:.2},captureCalls=0,contexts=0;
 const tracks=[],clones=[];function track(name){const t={id:name,readyState:'live',muted:false,stop(){this.readyState='ended';},clone(){const c=track(name+'-clone');clones.push(c);return c;}};tracks.push(t);return t;}
 const original=track('native-input');
 for(const [key,value] of Object.entries({paused:false,ended:false,readyState:4}))Object.defineProperty(a,key,{value,configurable:true});
 a.srcObject={getAudioTracks:()=>[original]};a.captureStream=()=>{captureCalls++;throw Error('Native captureStream must never be invoked');};
 w.MediaStream=class{constructor(input){this.tracks=input;}getTracks(){return this.tracks;}getAudioTracks(){return this.tracks;}};
 w.AudioContext=class{constructor(){contexts++;this.state='running';this.sampleRate=48000;}createAnalyser(){return {frequencyBinCount:256,fftSize:512,disconnect(){},getByteFrequencyData(values){values.fill(180);}};}createMediaStreamSource(){return {connect(){},disconnect(){}};}async resume(){}async close(){this.state='closed';}};
 w.HTMLCanvasElement.prototype.getContext=()=>({clearRect(){},createLinearGradient(){return {addColorStop(){}};},fillRect(){}});
 w.CatnapPresentationSettings={read:()=>settings};w.setInterval=f=>{tick=f;return 1;};w.clearInterval=()=>{};
 w.requestAnimationFrame=()=>++raf;w.cancelAnimationFrame=()=>{};Object.defineProperty(w.performance,'now',{value:()=>clock});
 const motion={matches:false,addEventListener(type,f){motionListener=f;},removeEventListener(){}};w.matchMedia=()=>motion;
 w.chrome={runtime:{id:'ours',getURL:p=>'chrome-extension://ours/'+p,onMessage:{addListener:f=>{message=f;},removeListener(){}}}};
 const api=V.install(w);
 return {dom,w,a,api,original,clones,tracks,track,motion,get captures(){return captureCalls;},get contexts(){return contexts;},tick(){clock+=2000;tick();},prefs(value){settings={...settings,...value};api.refreshSettings();},message(value,sender={id:'ours',url:'chrome-extension://ours/broadcast-worker.js'}){message(value,sender);},reduce(){motion.matches=true;motionListener();},close(){api.dispose();dom.window.close();}};
}
test('analysis owns clones only across enable, srcObject switches and same-object track replacement',()=>{
 const f=lifecycleFixture();try{
  assert.equal(f.captures,0);assert.equal(f.contexts,1);assert.equal(f.clones.length,1);assert.equal(f.original.readyState,'live');
  f.prefs({visualizerEnabled:false});assert.equal(f.clones[0].readyState,'ended');assert.equal(f.original.readyState,'live');assert.equal(f.a.paused,false);assert.equal(f.api.status().state,'disabled');
  f.tick();f.prefs({visualizerEnabled:true});assert.equal(f.captures,0,'native captureStream is never invoked');assert.equal(f.contexts,2);
  const input1=f.track('srcObject-1'),input2=f.track('srcObject-2');let active=input1;const input={getAudioTracks:()=>[active]};f.a.srcObject=input;f.tick();
  assert.equal(f.clones.at(-1).id,'srcObject-1-clone');assert.equal(f.captures,0,'srcObject is never passed to captureStream');
  active=input2;f.tick();assert.equal(f.clones.at(-2).readyState,'ended');assert.equal(input1.readyState,'live');assert.equal(f.clones.at(-1).id,'srcObject-2-clone');
  f.a.srcObject={getAudioTracks:()=>[input1]};f.tick();assert.equal(input2.readyState,'live');assert.equal(f.clones.at(-1).id,'srcObject-1-clone');
  f.w.document.getElementById('catnap-theater-root').remove();f.tick();assert.equal(f.clones.at(-1).readyState,'ended');assert.ok([f.original,input1,input2].every(t=>t.readyState==='live'));assert.equal(f.a.paused,false);assert.equal(f.api.status().state,'closed');
 }finally{f.close();}
});
test('URL-only audio stays quiet without captureStream and source transitions preserve native inputs',()=>{
 const f=lifecycleFixture();try{
  f.a.srcObject=null;f.tick();assert.equal(f.api.status().source,'none');assert.match(f.api.status().reason,/HQ broadcasting/);assert.equal(f.captures,0);assert.equal(f.original.readyState,'live');assert.equal(f.clones[0].readyState,'ended');
  f.prefs({visualizerEnabled:false});f.prefs({visualizerEnabled:true});f.tick();assert.equal(f.captures,0);assert.equal(f.contexts,1);
  f.a.srcObject={getAudioTracks:()=>[f.original]};f.tick();assert.equal(f.api.status().source,'native');assert.equal(f.contexts,2);assert.equal(f.original.readyState,'live');
 }finally{f.close();}
});
test('trusted broadcast bands close native clones, expire safely, and reduced motion disables analysis',()=>{
 const f=lifecycleFixture();try{
  const bands=Array(48).fill(.4),payload={target:'catnap-visualizer-levels',bands,live:true};
  for(const sender of [{id:'other'},{id:'ours',tab:{id:5}},{id:'ours',url:'https://suno.com/'}])f.message(payload,sender);
  assert.equal(f.clones[0].readyState,'live');f.message({...payload,bands:[1]});assert.equal(f.clones[0].readyState,'live');
  f.message(payload);assert.equal(f.clones[0].readyState,'ended');assert.equal(f.original.readyState,'live');assert.equal(f.a.paused,false);assert.equal(f.api.status().source,'broadcast');
  f.tick();assert.equal(f.api.status().source,'native');assert.equal(f.captures,0);
  f.reduce();assert.equal(f.api.status().state,'reduced-motion');assert.equal(f.clones.at(-1).readyState,'ended');assert.equal(f.a.paused,false);
 }finally{f.close();}
});
test('native selection ignores Theatre media and ambiguous simultaneous audio',()=>{
 const f=lifecycleFixture();try{
  const overlay=f.a.cloneNode();for(const [k,v] of Object.entries({paused:false,ended:false,readyState:4}))Object.defineProperty(overlay,k,{value:v});overlay.captureStream=()=>{};
  f.w.document.getElementById('catnap-theater-root').append(overlay);assert.equal(V.nativeAudio(f.w.document),f.a);
  const other=overlay.cloneNode();for(const [k,v] of Object.entries({paused:false,ended:false,readyState:4}))Object.defineProperty(other,k,{value:v});other.captureStream=()=>{};f.w.document.body.append(other);assert.equal(V.nativeAudio(f.w.document),null);
 }finally{f.close();}
});

test('worker accepts only exact offscreen spectra and forwards only to the live pinned source',async()=>{
 let handler,clock=2000;const forwarded=[],state={broadcastSourceTabId:99,broadcastToken:'private',broadcastMetadataSession:{sourceTabId:7,live:true,endpoint:'https://relay.example/live/whip'}};
 const chrome={runtime:{id:'ours',getURL:p=>'chrome-extension://ours/'+p,onMessage:{addListener:f=>{handler=f;}}},storage:{session:{get:async key=>({[key]:state[key]})}},action:{onClicked:{addListener(){}}},tabs:{sendMessage:async(id,payload,options)=>{forwarded.push({id,payload,options});}}};
 const sandbox={chrome,importScripts(){},CatnapBroadcastSource:require('../extension/broadcast-source.js'),CatnapVisualizer:V,Date:{now:()=>clock}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../extension/broadcast-worker.js'),'utf8'),sandbox);
 const send=async(message,sender)=>{handler(message,sender,()=>{});await new Promise(r=>setImmediate(r));};
 const message={target:'broadcast-visualizer',bands:Array(48).fill(.5)},sender={id:'ours',url:'chrome-extension://ours/broadcast-offscreen.html'};
 for(const bad of [{id:'other',url:sender.url},{id:'ours',url:'https://suno.com/'},{id:'ours',url:'chrome-extension://ours/broadcast.html'}])await send(message,bad);
 await send({...message,bands:Array(48).fill(Infinity)},sender);assert.equal(forwarded.length,0);
 await send(message,sender);assert.equal(forwarded.length,1);assert.equal(forwarded[0].id,7);assert.equal(forwarded[0].options.frameId,0);assert.equal(forwarded[0].payload.live,true);assert.equal(JSON.stringify(forwarded).includes('private'),false);
 await send(message,sender);assert.equal(forwarded.length,1,'rate limited');clock+=250;state.broadcastMetadataSession.live=false;await send(message,sender);assert.equal(forwarded.length,1);
});
test('offscreen spectrum reuses its existing monitor without extra capture or output routes',async()=>{
 let configuration,timer,cleared=0,captures=0,closed=0;const sent=[],connections=[];
 const analyser={fftSize:0,frequencyBinCount:256,getFloatTimeDomainData:v=>v.fill(.1),getByteFrequencyData:v=>v.fill(180),disconnect(){}};
 const destination={},source={connect:node=>connections.push(node),disconnect(){}};
 const sandbox={CatnapBroadcast:{Publisher:class{constructor(options){configuration=options;}}},CatnapVisualizer:V,navigator:{mediaDevices:{getUserMedia:async()=>{captures++;}}},AudioContext:class{constructor(){this.sampleRate=48000;this.destination=destination;}createMediaStreamSource(){return source;}createAnalyser(){return analyser;}async resume(){}async close(){closed++;}},setInterval:f=>{timer=f;return 7;},clearInterval:id=>{assert.equal(id,7);cleared++;},chrome:{runtime:{id:'ours',getURL:p=>'chrome-extension://ours/'+p,onMessage:{addListener(){}},sendMessage:async m=>sent.push(m)}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../extension/broadcast-offscreen.js'),'utf8'),sandbox);
 const monitor=await configuration.monitor({});assert.equal(captures,0);assert.deepEqual(connections,[analyser,destination]);
 timer();assert.equal(sent.length,0,'idle spectrum is dormant');configuration.onStatus({state:'live'});timer();const message=sent.find(m=>m.target==='broadcast-visualizer');assert.equal(V.sanitizeBands(message.bands).length,48);
 assert.equal(connections.filter(node=>node===destination).length,1);assert.equal(captures,0);await monitor.close();assert.equal(cleared,1);assert.equal(closed,1);
});
