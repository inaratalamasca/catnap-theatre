/* Catnap isolated audio visualizer rehearsal, version 0.5.0.
 * Change summary: actual Chromium srcObject audio/silence, owned-clone lifecycle,
 * source switches, native PCM continuity and real existing-monitor FFT proof.
 * All requests use local synthetic fixtures; no user profile, microphone, tab
 * capture, relay, publishing key or production stream is opened. The worker
 * spectrum forwarding is simulated here; its trust/binding is unit-tested.
 * Run with CATNAP_PLAYWRIGHT_MODULE and optional CATNAP_QA_DIR/CATNAP_CHROME.
 */
import fs from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const SCRIPT_VERSION='0.5.0';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=process.env.CATNAP_QA_DIR||os.tmpdir();
await fs.mkdir(OUT,{recursive:true});
const {chromium}=await import(process.env.CATNAP_PLAYWRIGHT_MODULE?pathToFileURL(process.env.CATNAP_PLAYWRIGHT_MODULE).href:'playwright');
const rate=48000,seconds=16,samples=rate*seconds,pcm=Buffer.alloc(samples*4);
for(let i=0;i<samples;i++){
  const t=i/rate,quiet=t>=3&&t<6;
  const value=quiet?0:[110,220,440,880,1760,3520].reduce((sum,f,j)=>sum+Math.sin(2*Math.PI*f*t)*(.023+j*.004)*(0.7+0.3*Math.sin(t*(j+1)*1.4)),0);
  pcm.writeInt16LE(Math.round(value*32767),i*4);pcm.writeInt16LE(Math.round(value*.87*32767),i*4+2);
}
const wav=Buffer.alloc(44+pcm.length);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*4,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(pcm.length,40);pcm.copy(wav,44);
const id='11111111-1111-4111-8111-111111111111';
const html=`<!doctype html><html><head><meta charset="UTF-8"><title>Catnap visualizer rehearsal</title><style>body{background:#111;color:white;font:16px sans-serif}audio{display:block}#source-controls{padding:10px}main{padding:20px}</style></head><body>
<div id="source-controls"><button id="music">Play synthetic music</button><audio id="native" loop src="/${id}.wav"></audio></div>
<main><h1>Visualizer rehearsal</h1><a href="/song/${id}">Visualizer rehearsal</a><img alt="Image for Visualizer rehearsal" src="/art.svg" width="200"></main>
<section><div style="white-space:pre-line">[Verse 1]
The city settles into blue,
A quiet spark between the rooms.
We let the evening carry through,
And find our rhythm in the moon.

[Chorus]
Turn the lights down, let it glow,
Small constellations moving slow.
A little warmth beneath the sound,
A place for every voice we found.

[Verse 2]
The rain keeps time against the glass,
Another song, another chance.

[Outro]
The night still has a room for you,
A place to let the music through.</div><button aria-label="Copy lyrics to clipboard">Copy lyrics</button></section>
<a href="/song/${id}" aria-label="Playbar: Title for Visualizer rehearsal">Visualizer rehearsal</a><a aria-label="Playbar: Artist for Catnap" href="/@fixture">Catnap</a><button aria-label="Playbar: Pause button">Pause</button>
<script>
window.test={playCalls:0,pauseCalls:0,captureCalls:0,cloneCalls:0,getUserMediaCalls:0,mediaElementSources:0,destinationConnections:0,originalTracks:[],messages:[],capturedStreams:[]};
const nativePlay=HTMLMediaElement.prototype.play,nativePause=HTMLMediaElement.prototype.pause,nativeCapture=HTMLMediaElement.prototype.captureStream;
HTMLMediaElement.prototype.play=function(){if(this.id==='native')test.playCalls++;return nativePlay.call(this)};
HTMLMediaElement.prototype.pause=function(){if(this.id==='native')test.pauseCalls++;return nativePause.call(this)};
HTMLMediaElement.prototype.captureStream=function(){if(this.id==='native')test.captureCalls++;const stream=nativeCapture.call(this);test.capturedStreams.push(stream);return stream};
const cloneTrack=MediaStreamTrack.prototype.clone;MediaStreamTrack.prototype.clone=function(){test.cloneCalls++;return cloneTrack.call(this)};
AudioContext.prototype.createMediaElementSource=function(){test.mediaElementSources++;throw Error('Native audio rerouting is forbidden');};
const connect=AudioNode.prototype.connect;AudioNode.prototype.connect=function(target,...rest){if(target instanceof AudioDestinationNode)test.destinationConnections++;return connect.call(this,target,...rest)};
navigator.mediaDevices.getUserMedia=async()=>{test.getUserMediaCalls++;throw Error('No new capture permitted')};
const listeners=[],stored={};window.chrome={runtime:{id:'test',getURL:file=>location.origin+'/extension/'+file,onMessage:{addListener:f=>listeners.push(f),removeListener:f=>{}},sendMessage:async m=>{test.messages.push(m);return {opened:true}}},storage:{local:{get:async key=>({[key]:stored[key]}),set:async value=>Object.assign(stored,value)}}};
window.test.listeners=listeners;document.getElementById('music').onclick=()=>document.getElementById('native').play();
</script>
<script src="/extension/helpers.js"></script><script src="/extension/content.js"></script><script src="/extension/lyric-scroll.js"></script><script src="/extension/visual-media.js"></script><script src="/extension/standalone.js"></script><script src="/extension/visualizer.js"></script><script src="/extension/presentation-tab-controller.js"></script>
</body></html>`;
const art=`<svg xmlns="http://www.w3.org/2000/svg" width="700" height="700"><defs><linearGradient id="g"><stop stop-color="#563769"/><stop offset="1" stop-color="#194a4b"/></linearGradient></defs><rect width="700" height="700" fill="url(#g)"/><circle cx="350" cy="280" r="130" fill="#a17fc4" opacity=".4"/><text x="350" y="520" text-anchor="middle" fill="#dfd5ed" font-family="sans-serif" font-size="38">CATNAP REHEARSAL</text></svg>`;
const browser=await chromium.launch({executablePath:process.env.CATNAP_CHROME||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1600,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='suno.com'&&url.pathname.startsWith('/extension/')){const name=url.pathname.slice('/extension/'.length);try{return route.fulfill({contentType:name.endsWith('.js')?'application/javascript':'image/png',body:await fs.readFile(ROOT+'/extension/'+name)})}catch{return route.fulfill({status:404,body:''})}}
  if(url.hostname==='suno.com'&&url.pathname.endsWith('.wav')){const requested=route.request().headers().range;const m=/bytes=(\d+)-(\d*)/.exec(requested||'');if(m){const start=Number(m[1]),end=m[2]?Math.min(Number(m[2]),wav.length-1):wav.length-1;return route.fulfill({status:206,contentType:'audio/wav',headers:{'Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${wav.length}`},body:wav.subarray(start,end+1)})}return route.fulfill({contentType:'audio/wav',headers:{'Accept-Ranges':'bytes'},body:wav})}
  if(url.hostname==='suno.com'&&url.pathname==='/art.svg')return route.fulfill({contentType:'image/svg+xml',body:art});
  if(url.hostname==='suno.com'&&url.pathname.startsWith('/playlist/'))return route.fulfill({contentType:'text/html',body:html});
  return route.fulfill({contentType:'application/json',body:'[]'});
 });
 await page.goto('https://suno.com/playlist/'+id);
 await page.locator('#music').click();
 await page.evaluate(async()=>{
   window.generators=[];
   window.input=async(freq=220)=>{const c=new AudioContext(),d=c.createMediaStreamDestination(),gain=c.createGain();gain.gain.value=.15;
     for(const [i,f] of [freq,freq*2,freq*4,freq*8,freq*16].entries()){const o=c.createOscillator(),g=c.createGain();o.frequency.value=f;g.gain.value=.17+i*.02;o.connect(g);g.connect(gain);o.start();}
     gain.connect(d);await c.resume();const item={c,d,gain};generators.push(item);test.originalTracks.push(d.stream.getAudioTracks()[0]);return item;};
   const generated=await input();window.primary=generated;const a=document.getElementById('native');a.srcObject=generated.d.stream;await a.play();
   window.makeProbe=async borrowed=>{const c=new AudioContext(),stream=new MediaStream([borrowed.getAudioTracks()[0].clone()]),analyser=c.createAnalyser(),node=c.createMediaStreamSource(stream);node.connect(analyser);await c.resume();window.outputProbe={c,stream,analyser,node};};
   window.outputRms=()=>{const values=new Float32Array(outputProbe.analyser.fftSize);outputProbe.analyser.getFloatTimeDomainData(values);return Math.sqrt(values.reduce((sum,v)=>sum+v*v,0)/values.length)};
   window.stopProbe=async()=>{outputProbe.node.disconnect();outputProbe.stream.getTracks().forEach(t=>t.stop());await outputProbe.c.close();};
 });
 await page.locator('#catnap-theater-launch').click();
 await page.waitForFunction(()=>window.CatnapVisualizer.status().state==='reacting',{timeout:5000});
 const initial=await page.evaluate(()=>({viz:CatnapVisualizer.status(),time:document.getElementById('native').currentTime,test:{...test,listeners:undefined},opacity:getComputedStyle(document.querySelector('.ct-audio-visualizer')).opacity,canvasZ:getComputedStyle(document.querySelector('.ct-audio-visualizer')).zIndex,mainZ:getComputedStyle(document.querySelector('.ct-main')).zIndex}));
 assert.equal(initial.viz.source,'native');assert.equal(initial.test.getUserMediaCalls,0);assert.equal(initial.test.mediaElementSources,0);assert.equal(initial.test.destinationConnections,0);assert.equal(initial.test.pauseCalls,0);assert.equal(initial.opacity,'0.2');assert.ok(Number(initial.mainZ)>Number(initial.canvasZ));
 await page.evaluate(()=>primary.gain.gain.setValueAtTime(0,primary.c.currentTime));
 await page.waitForTimeout(1500);
 const silence=await page.evaluate(()=>({viz:CatnapVisualizer.status(),time:document.getElementById('native').currentTime}));assert.ok(silence.viz.energy<.005,JSON.stringify(silence));
 await page.evaluate(()=>primary.gain.gain.setValueAtTime(.15,primary.c.currentTime));
 await page.waitForFunction(()=>CatnapVisualizer.status().state==='reacting');
 await page.waitForTimeout(500);await page.screenshot({path:OUT+'/Visualizer-0.5.0-Native.png',fullPage:true});
 await page.evaluate(async()=>{const prefs=CatnapPresentationSettings.read();await CatnapPresentationSettings.save({...prefs,visualizerEnabled:false});CatnapVisualizer.refreshSettings();});
 const disabled=await page.evaluate(()=>({state:CatnapVisualizer.status(),paused:document.getElementById('native').paused,time:document.getElementById('native').currentTime,volume:document.getElementById('native').volume,muted:document.getElementById('native').muted}));assert.equal(disabled.state.state,'disabled');assert.equal(disabled.paused,false);assert.equal(disabled.muted,false);assert.equal(disabled.volume,1);
 await page.evaluate(()=>makeProbe(document.getElementById('native').srcObject));
 await page.waitForTimeout(350);const afterDisable=await page.evaluate(()=>({time:document.getElementById('native').currentTime,rms:outputRms()}));assert.ok(afterDisable.time>disabled.time+.2);assert.ok(afterDisable.rms>.005,JSON.stringify(afterDisable));
 await page.evaluate(async()=>{await stopProbe();await CatnapPresentationSettings.save({...CatnapPresentationSettings.read(),visualizerEnabled:true});CatnapVisualizer.refreshSettings();});
 await page.waitForFunction(()=>CatnapVisualizer.status().state==='reacting');
 await page.evaluate(()=>makeProbe(document.getElementById('native').srcObject));await page.waitForTimeout(100);const afterEnable=await page.evaluate(()=>({rms:outputRms(),viz:CatnapVisualizer.status()}));assert.ok(afterEnable.rms>.005,JSON.stringify(afterEnable));await page.evaluate(()=>stopProbe());
 const sourceSwitch=await page.evaluate(async()=>{
   const a=document.getElementById('native');window.switchInput=async f=>{const generated=await input(f);a.srcObject=generated.d.stream;await a.play();};
   await switchInput(440);return {time:a.currentTime,inputs:test.originalTracks.map(t=>({id:t.id,state:t.readyState}))};
 });
 await page.waitForFunction(()=>CatnapVisualizer.status().state==='reacting');await page.waitForTimeout(1600);
 const beforeSwitch=await page.evaluate(()=>test.cloneCalls);
 await page.evaluate(()=>switchInput(1760));
 await page.waitForFunction(n=>test.cloneCalls>n,beforeSwitch);await page.waitForFunction(()=>CatnapVisualizer.status().state==='reacting');
 const beforeReplacement=await page.evaluate(()=>test.cloneCalls);
 await page.evaluate(async()=>{const replacement=await input(330),a=document.getElementById('native'),stream=a.srcObject;stream.getAudioTracks().forEach(t=>stream.removeTrack(t));stream.addTrack(replacement.d.stream.getAudioTracks()[0]);await a.play();});
 await page.waitForFunction(n=>test.cloneCalls>n,beforeReplacement);await page.waitForFunction(()=>CatnapVisualizer.status().state==='reacting');
 await page.evaluate(async()=>{await CatnapPresentationSettings.save({...CatnapPresentationSettings.read(),visualizerEnabled:false});CatnapVisualizer.refreshSettings();});
 await page.evaluate(()=>makeProbe(document.getElementById('native').srcObject));await page.waitForTimeout(100);
 const final=await page.evaluate(()=>({rms:outputRms(),paused:document.getElementById('native').paused,inputTracks:test.originalTracks.map(t=>t.readyState),test:{...test,listeners:undefined,originalTracks:undefined},viz:CatnapVisualizer.status()}));
 assert.ok(final.inputTracks.every(s=>s==='live'),JSON.stringify(final));assert.ok(final.rms>.005);assert.equal(final.paused,false);assert.equal(final.test.pauseCalls,0);assert.equal(final.test.getUserMediaCalls,0);assert.equal(final.test.mediaElementSources,0);assert.equal(final.test.destinationConnections,0);assert.equal(final.test.captureCalls,0);
 await page.evaluate(async()=>{
   await stopProbe();const a=document.getElementById('native');a.srcObject=null;await a.play();
   await CatnapPresentationSettings.save({...CatnapPresentationSettings.read(),visualizerEnabled:true});CatnapVisualizer.refreshSettings();
   window.CatnapBroadcast={Publisher:class{constructor(options){window.monitorOptions=options;}}};
   chrome.runtime.sendMessage=async m=>{test.messages.push(m);if(m.target==='broadcast-visualizer')test.listeners.forEach(f=>f({target:'catnap-visualizer-levels',bands:m.bands,live:true},{id:'test',url:chrome.runtime.getURL('broadcast-worker.js')}));return {ok:true};};
 });
 const urlQuiet=await page.evaluate(()=>CatnapVisualizer.status());assert.equal(urlQuiet.source,'none');assert.match(urlQuiet.reason,/HQ broadcasting/);
 await page.addScriptTag({url:'https://suno.com/extension/broadcast-offscreen.js'});
 await page.evaluate(async()=>{monitorOptions.onStatus({state:'live'});window.monitor=await monitorOptions.monitor(generators.at(-1).d.stream);});
 await page.waitForFunction(()=>CatnapVisualizer.status().source==='broadcast'&&CatnapVisualizer.status().state==='reacting');
 const broadcastActive=await page.evaluate(()=>({viz:CatnapVisualizer.status(),destinations:test.destinationConnections,messages:test.messages.filter(m=>m.target==='broadcast-visualizer').length}));assert.equal(broadcastActive.destinations,1);
 await page.evaluate(()=>{const g=generators.at(-1);g.gain.gain.setValueAtTime(0,g.c.currentTime);});await page.waitForTimeout(1800);
 const broadcastSilence=await page.evaluate(()=>CatnapVisualizer.status());assert.ok(broadcastSilence.energy<.005,JSON.stringify(broadcastSilence));
 await page.evaluate(()=>{const g=generators.at(-1);g.gain.gain.setValueAtTime(.15,g.c.currentTime);});await page.waitForFunction(()=>CatnapVisualizer.status().state==='reacting');
 await page.evaluate(()=>monitor.close());await page.waitForTimeout(3000);
 const broadcastStopped=await page.evaluate(()=>({viz:CatnapVisualizer.status(),inputs:test.originalTracks.map(t=>t.readyState),captures:test.captureCalls,getUserMedia:test.getUserMediaCalls,destinations:test.destinationConnections}));assert.equal(broadcastStopped.viz.source,'none');assert.equal(broadcastStopped.viz.state,'quiet');assert.ok(broadcastStopped.viz.energy<.005);assert.ok(broadcastStopped.inputs.every(s=>s==='live'));assert.equal(broadcastStopped.captures,0);assert.equal(broadcastStopped.getUserMedia,0);assert.equal(broadcastStopped.destinations,1);
 assert.deepEqual(errors,[]);
 const result={version:SCRIPT_VERSION,initial,silence,disabled,afterDisable,afterEnable,sourceSwitch,final,urlQuiet,broadcastActive,broadcastSilence,broadcastStopped,errors};await fs.writeFile(OUT+'/Visualizer-0.5.0-Native-Verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close()}
