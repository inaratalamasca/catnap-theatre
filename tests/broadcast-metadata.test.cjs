'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const M=require('../extension/broadcast-metadata-core.js');
const R=require('../extension/broadcast-metadata.js');
const B=require('../extension/broadcast-core.js');
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555'];
const song=id=>'https://suno.com/song/'+id;
function domFixture(){return new JSDOM('<!doctype html><h1>Late-night playlist</h1><main>'+ids.map((id,i)=>`<article><a href="${song(id)}">Song ${i+1}</a></article>`).join('')+`</main><a aria-label="Playbar: Title for Song 2" href="${song(ids[1])}">Song 2</a><a aria-label="Playbar: Artist for Artist">Artist</a><button aria-label="Playbar: Toggle shuffle button" aria-pressed="false"></button>`,{url:'https://suno.com/playlist/'+ids[0]});}
test('metadata reads native playbar with Theatre closed and reports visible successors',()=>{
 const dom=domFixture(),d=R.read(dom.window.document,dom.window.location);
 assert.equal(dom.window.document.getElementById('catnap-theater-root'),null);
 assert.equal(d.song.title,'Song 2');assert.equal(d.song.artist,'Artist');assert.equal(d.song.id,ids[1]);
 assert.equal(d.playlist.title,'Late-night playlist');assert.equal(d.playlist.position,2);assert.equal(d.playlist.total,null);assert.equal(d.playlist.orderBasis,'visible-dom');assert.deepEqual(d.playlist.upNext.map(x=>x.id),ids.slice(2));
 assert.equal(d.song.durationSeconds,null);assert.equal(d.song.currentTimeSeconds,null);assert.equal(d.song.playing,null);dom.window.close();
});
test('shuffle and a missing current row do not invent the next playback order',()=>{
 const dom=domFixture(),w=dom.window;w.document.querySelector('button').setAttribute('aria-pressed','true');
 assert.deepEqual(R.read(w.document,w.location).playlist.upNext,[]);
 w.document.querySelector('button').setAttribute('aria-pressed','false');w.document.querySelector('main article:nth-child(2)').remove();
 const d=R.read(w.document,w.location);assert.equal(d.playlist.position,null);assert.deepEqual(d.playlist.upNext,[]);dom.window.close();
});
test('reader ignores overlay copies, rejects non-Suno identities, and does not click controls',()=>{
 const dom=domFixture(),w=dom.window;let clicks=0;w.document.addEventListener('click',()=>clicks++);
 w.document.body.insertAdjacentHTML('afterbegin',`<div id="catnap-theater-root"><a aria-label="Playbar: Title for Wrong" href="${song(ids[0])}">Wrong</a><h1>Wrong playlist</h1><a href="${song(ids[4])}">Wrong next</a></div>`);
 assert.equal(R.read(w.document,w.location).song.title,'Song 2');assert.equal(clicks,0);
 const link=w.document.querySelector('body > a[aria-label^="Playbar: Title"]');link.href='https://evil.example/song/'+ids[1];assert.equal(R.read(w.document,w.location),null);dom.window.close();
});
test('public projection excludes credentials and extra fields, enforces canonical identities and bounded text',()=>{
 const dom=domFixture(),d=R.read(dom.window.document,dom.window.location);d.token='private';d.song.token='private';d.song.artist='a'.repeat(600);d.playlist.upNext.push(d.song);d.playlist.total=999;d.playlist.script='<script>';
 const s=M.sanitize(d);assert.equal(JSON.stringify(s).includes('private'),false);assert.equal(s.song.artist.length,220);assert.equal(s.playlist.total,null);assert.equal(s.playlist.upNext.length,4);assert.equal('script' in s.playlist,false);
 d.song.url='https://evil.example/song/'+d.song.id;assert.equal(M.sanitize(d),null);
 assert.equal(M.sanitize({version:2}),null);dom.window.close();
});
test('metadata authorization requires exact extension, pinned tab, top frame and HTTPS Suno',()=>{
 const good={id:'ours',tab:{id:7},frameId:0,url:'https://suno.com/playlist/'+ids[0]};assert.equal(M.sourceAllowed(good,'ours',7),true);
 for(const change of [{id:'other'},{tab:{id:8}},{frameId:1},{url:'http://suno.com/'},{url:'https://suno.com.evil.example/'}])assert.equal(M.sourceAllowed({...good,...change},'ours',7),false);
});
function workerFixture(){
 const state={broadcastSourceTabId:7,broadcastToken:'broadcaster:private'},calls=[],readers=[];let handler;
 const extensionID='test',url=p=>'chrome-extension://test/'+p;
 const chrome={runtime:{id:extensionID,getURL:url,getContexts:async()=>[{}],onMessage:{addListener:f=>{handler=f;}},sendMessage:async m=>m.action==='status'?{state:'idle'}:{state:'connecting'}},storage:{session:{get:async key=>({[key]:state[key]}),set:async value=>Object.assign(state,value),remove:async key=>{delete state[key];}}},action:{onClicked:{addListener(){}},setBadgeText(){},setBadgeBackgroundColor(){}},permissions:{contains:async()=>true},tabs:{get:async id=>({id,url:'https://suno.com/playlist/'+ids[0]}),sendMessage:async(id,message)=>{readers.push({id,message});return {ok:true};}},tabCapture:{getMediaStreamId:async()=> 'opaque'}};
 const sandbox={chrome,URL,AbortSignal,CatnapBroadcast:B,CatnapBroadcastMetadata:M,importScripts(){},fetch:async(url,options)=>{calls.push({url,...options});return {ok:true};}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../extension/broadcast-worker.js'),'utf8'),sandbox);
 const send=(message,sender)=>new Promise(resolve=>{if(handler(message,sender,resolve)!==true)resolve();});
 return {state,calls,readers,send,url,source:{id:'test',tab:{id:7},frameId:0,url:'https://suno.com/playlist/'+ids[0]}};
}
test('worker pins the actual publishing tab, never passes tokens to content, and clears on Stop',async()=>{
 const f=workerFixture(),panel={id:'test',url:f.url('broadcast.html')};
 await f.send({target:'broadcast-worker',action:'start',endpoint:'https://relay.example/live/whip'},panel);
 await f.send({target:'broadcast-status',state:'live'},{id:'test',url:f.url('broadcast-offscreen.html')});await new Promise(r=>setImmediate(r));
 // Selecting another tab in the toolbar must not redirect active metadata.
 f.state.broadcastSourceTabId=99;
 const dom=domFixture(),metadata=R.read(dom.window.document,dom.window.location);
 assert.equal((await f.send({target:'broadcast-metadata',action:'update',metadata},{...f.source,tab:{id:99}})).ok,false);
 assert.equal(f.calls.length,0);
 assert.equal((await f.send({target:'broadcast-metadata',action:'update',metadata},f.source)).ok,true);
 assert.equal(f.calls[0].url,'https://relay.example/api/now-playing');assert.equal(f.calls[0].headers.Authorization,'Bearer broadcaster:private');assert.equal(f.calls[0].credentials,'omit');assert.equal(JSON.stringify(f.readers).includes('private'),false);
 assert.equal(JSON.parse(f.calls[0].body).song.id,ids[1]);
 await f.send({target:'broadcast-worker',action:'stop'},panel);
 assert.equal(JSON.parse(f.calls.at(-1).body).active,false);assert.equal(f.state.broadcastMetadataSession,undefined);
 assert.equal((await f.send({target:'broadcast-metadata',action:'update',metadata},f.source)).ok,false);
 dom.window.close();
});
test('reader is dormant before activation and heartbeat contains public metadata only',()=>{
 const dom=domFixture(),w=dom.window,messages=[],intervals=[];let handler;
 w.chrome={runtime:{id:'test',onMessage:{addListener:f=>{handler=f;}},sendMessage:async message=>{messages.push(message);return {ok:true};}}};
 w.setInterval=f=>{intervals.push(f);return intervals.length;};w.clearInterval=()=>{};
 R.install(w);assert.equal(intervals.length,0);assert.equal(messages[0].action,'ready');
 handler({target:'broadcast-metadata-reader',action:'start'},{id:'test'},()=>{});assert.equal(intervals.length,1);assert.equal(messages.at(-1).action,'update');intervals[0]();assert.equal(messages.at(-1).metadata.song.artist,'Artist');
 assert.equal(JSON.stringify(messages).includes('broadcastToken'),false);handler({target:'broadcast-metadata-reader',action:'stop'},{id:'test'},()=>{});const count=messages.length;intervals[0]();assert.equal(messages.length,count);dom.window.close();
});
test('native song artwork uses public Suno CDN images without query secrets or arbitrary hosts',()=>{
 const dom=domFixture(),w=dom.window,title=w.document.querySelector('a[aria-label^="Playbar: Title"]');
 title.insertAdjacentHTML('beforeend','<img src="https://cdn1.suno.ai/image_example.jpeg?width=360&amp;token=private#secret" alt="">');
 assert.equal(R.read(w.document,w.location).song.artworkUrl,'https://cdn1.suno.ai/image_example.jpeg');
 title.querySelector('img').src='https://evil.example/image.jpeg';assert.equal(R.read(w.document,w.location).song.artworkUrl,null);
 assert.equal(M.artwork('https://cdn1.suno.ai.evil.example/a.jpeg'),null);assert.equal(M.artwork('https://user:secret@cdn1.suno.ai/a.jpeg'),null);assert.equal(M.artwork('http://cdn1.suno.ai/a.jpeg'),null);assert.equal(M.artwork('https://cdn1.suno.ai/audio.mp3'),null);
 dom.window.close();
});
test('native playbar clocks supply current timing while unknown or unrelated audio remains unknown',()=>{
 const dom=domFixture(),w=dom.window;
 const audio=w.document.createElement('audio');audio.src='https://cdn1.suno.ai/'+ids[4]+'.mp3';Object.defineProperty(audio,'duration',{value:250});audio.currentTime=50;w.document.body.appendChild(audio);
 assert.equal(R.read(w.document,w.location).song.durationSeconds,null);
 w.document.body.insertAdjacentHTML('beforeend','<div class="native-progress"><span>0:30</span><input aria-label="Playback progress" value="12"><span>4:00</span></div><button aria-label="Playbar: Pause button">Pause</button>');
 const d=R.read(w.document,w.location);assert.equal(d.song.durationSeconds,240);assert.equal(d.song.currentTimeSeconds,30);assert.equal(d.song.playing,true);
 const bar=w.document.querySelector('.native-progress');bar.innerHTML='<span>6:00</span><input aria-label="Playback progress"><span>4:00</span>';
 assert.equal(R.read(w.document,w.location).song.durationSeconds,null);dom.window.close();
});
test('upcoming duration uses actual native row values and preserves unknown or conflicting durations',()=>{
 const dom=domFixture(),w=dom.window,rows=w.document.querySelectorAll('article');
 rows[2].insertAdjacentHTML('beforeend','<span>3:42</span>');rows[3].setAttribute('data-duration-seconds','123.5');rows[4].insertAdjacentHTML('beforeend','<span>1:00</span><span>2:00</span>');
 const next=R.read(w.document,w.location).playlist.upNext;assert.deepEqual(next.map(t=>t.durationSeconds),[222,123.5,null]);
 const d=M.sanitize(R.read(w.document,w.location));d.song.currentTimeSeconds=999;d.song.durationSeconds=200;assert.equal(M.sanitize(d).song.currentTimeSeconds,null);
 dom.window.close();
});
test('expanded visible upcoming list is capped at 100 and hidden on shuffle',()=>{
 const dom=domFixture(),w=dom.window,main=w.document.querySelector('main');
 for(let i=6;i<112;i++){const id=i.toString(16).padStart(8,'0')+'-aaaa-4aaa-8aaa-aaaaaaaaaaaa';main.insertAdjacentHTML('beforeend',`<article><a href="${song(id)}">Loaded song ${i}</a><span>2:00</span></article>`);}
 let d=R.read(w.document,w.location);assert.equal(d.playlist.upNext.length,100);assert.equal(d.playlist.total,null);
 d.playlist.upNext.push(d.playlist.upNext[0]);assert.equal(M.sanitize(d).playlist.upNext.length,100);
 w.document.querySelector('button').setAttribute('aria-pressed','true');d=R.read(w.document,w.location);assert.equal(d.playlist.upNext.length,0);
 dom.window.close();
});
test('UTF-8 body cap trims farthest upcoming entries while retaining current song and nearest prefix',()=>{
 const dom=domFixture(),d=R.read(dom.window.document,dom.window.location);
 d.song.title='今'.repeat(220);d.song.artist='猫'.repeat(220);d.song.artworkUrl='https://cdn1.suno.ai/'+('a'.repeat(1900))+'.jpeg';
 d.playlist.upNext=Array.from({length:100},(_,i)=>({id:ids[i%ids.length],url:song(ids[i%ids.length]),title:'曲'.repeat(220),artist:'歌'.repeat(220),durationSeconds:240}));
 const body=M.serialize(d),parsed=JSON.parse(body);assert.ok(Buffer.byteLength(body,'utf8')<=M.MAX_BODY_BYTES);assert.equal(parsed.song.id,d.song.id);assert.equal(parsed.song.title,d.song.title);assert.ok(parsed.playlist.upNext.length>0&&parsed.playlist.upNext.length<100);
 assert.deepEqual(parsed.playlist.upNext.map(t=>t.id),d.playlist.upNext.slice(0,parsed.playlist.upNext.length).map(t=>t.id));assert.equal(d.playlist.upNext.length,100);
 assert.equal(JSON.parse(M.serialize(M.clear())).active,false);assert.equal(M.artwork('https://cdn1.suno.ai/'+('a'.repeat(5000))+'.jpeg'),null);dom.window.close();
});
