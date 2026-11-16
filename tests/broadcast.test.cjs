'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const B=require('../extension/broadcast-core.js');
const SDP='v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10;useinbandfec=1;stereo=0;usedtx=1\r\n';
const endpoint='https://relay.example/live/whip';
function fixture(overrides={}) {
 const track={stopped:0,stop(){this.stopped++;}};
 const stream={getTracks:()=>[track],getAudioTracks:()=>[track],getVideoTracks:()=>[]};
 const calls=[],statuses=[];let monitorClosed=0;
 const sender={getParameters:()=>({encodings:[{}]}),setParameters:async p=>{sender.params=p;}};
 const pc={connectionState:'new',close(){this.closed=true;},addTrack:()=>sender,getTransceivers:()=>[{setCodecPreferences(c){pc.codecs=c;}}],createOffer:async()=>({sdp:SDP}),setLocalDescription:async d=>{pc.localDescription=d;},setRemoteDescription:async()=>{pc.connectionState='connected';if(pc.onconnectionstatechange)pc.onconnectionstatechange();}};
 const env={capture:async()=>stream,monitor:async()=>({close:async()=>{monitorClosed++;}}),createPeer:()=>pc,audioCodecs:()=>[{mimeType:'audio/opus'},{mimeType:'audio/PCMU'}],gather:async()=>{},fetch:async(url,options)=>{calls.push({url,...options});return {status:201,headers:new Headers({Location:'/live/session/123'}),text:async()=>SDP};},onStatus:s=>statuses.push(s),...overrides};
 return {publisher:new B.Publisher(env),pc,sender,track,stream,calls,statuses,monitorClosed:()=>monitorClosed};
}
test('relay selection prevents URL secrets, insecure public endpoints and unexpected session origin',()=>{
 assert.equal(B.endpoint('http://192.168.1.15:4355/live/whip'),'http://192.168.1.15:4355/live/whip');
 assert.equal(B.permissionOrigin(endpoint),'https://relay.example/*');
 for(const u of ['http://public.example/live/whip','https://user:secret@relay.example/live/whip','https://relay.example/live/whip?token=secret','javascript:evil','https://relay.example/live/whep'])assert.throws(()=>B.endpoint(u));
 assert.equal(B.sessionURL('/live/session/1',endpoint),'https://relay.example/live/session/1');
 assert.throws(()=>B.sessionURL('https://other.example/session/1',endpoint));
});
test('Opus offer explicitly negotiates stereo without duplicate or stale bitrate parameters',()=>{
 const s=B.stereoSDP(SDP);assert.match(s,/stereo=1/);assert.match(s,/sprop-stereo=1/);assert.match(s,/maxaveragebitrate=256000/);assert.match(s,/usedtx=0/);assert.equal(s.includes('stereo=0'),false);assert.equal(s.includes('usedtx=1'),false);assert.throws(()=>B.stereoSDP('v=0'));
});
test('publish is audio-only, authenticated and marks live only once connected; stop releases all resources',async()=>{
 const f=fixture();assert.equal(await f.publisher.start({endpoint,token:'broadcaster:secret',streamId:'opaque'}),true);
 assert.equal(f.publisher.state,'live');assert.equal(f.sender.params.encodings[0].maxBitrate,256000);
 assert.equal(f.calls[0].headers.Authorization,'Bearer broadcaster:secret');assert.equal(f.pc.codecs.length,1);
 await assert.rejects(f.publisher.start({endpoint}),/already/);
 await f.publisher.stop();assert.equal(f.track.stopped,1);assert.equal(f.pc.closed,true);assert.equal(f.monitorClosed(),1);assert.equal(f.calls[1].method,'DELETE');assert.equal(f.calls[1].url,'https://relay.example/live/session/123');assert.equal(f.publisher.state,'idle');
});
test('authentication failure stops capture and local monitor without falsely reporting live',async()=>{
 const f=fixture({fetch:async()=>({status:401})});assert.equal(await f.publisher.start({endpoint,token:'bad'}),false);assert.equal(f.publisher.state,'error');assert.equal(f.track.stopped,1);assert.equal(f.monitorClosed(),1);assert.ok(f.statuses.at(-1).message.includes('token'));assert.equal(f.statuses.some(s=>s.state==='live'),false);
});
test('Catnap preflight distinguishes a busy stream and bad keys without echoing provider content',async()=>{
 for (const [status,message] of [[409,'Another host is broadcasting. Wait for them to stop, then try again.'],[401,'Relay rejected the publish token.'],[403,'Relay rejected the publish token.'],[503,'Relay availability check failed. Try again shortly.']]) {
  const calls=[];const f=fixture({fetch:async(url,options)=>{calls.push({url,...options});return {status,text(){throw Error('Provider text must never be read');}};}});
  assert.equal(await f.publisher.start({endpoint:B.DEFAULT_ENDPOINT,token:'invented-secret'}),false);
  assert.equal(f.statuses.at(-1).message,message);assert.equal(f.publisher.state,'error');
  assert.equal(calls.length,1);assert.equal(calls[0].url,'https://listen.catnapradio.com/hosts/api/publish-check');
  assert.equal(calls[0].headers.Authorization,'Bearer invented-secret');assert.equal(calls[0].body,'{}');
  assert.equal(calls[0].credentials,'omit');assert.equal(calls[0].redirect,'error');
  assert.equal(f.track.stopped,1);assert.equal(f.monitorClosed(),1);assert.equal(f.statuses.some(s=>s.state==='live'),false);
  assert.equal(JSON.stringify(f.statuses).includes('invented-secret'),false);
 }
});
test('Catnap available and legacy preflight responses proceed once; other relays do not use Catnap preflight',async()=>{
 for (const status of [200,404,405]) {
  const calls=[];const f=fixture({fetch:async(url,options)=>{calls.push({url,...options});return url.includes('/hosts/api/')?{status}:{status:201,headers:new Headers({Location:'/live/session/test'}),text:async()=>SDP};}});
  assert.equal(await f.publisher.start({endpoint:B.DEFAULT_ENDPOINT,token:'invented-secret'}),true);
  assert.equal(calls.length,2);assert.equal(calls[1].url,B.DEFAULT_ENDPOINT);assert.equal(calls[1].method,'POST');
  await f.publisher.stop();
 }
 const f=fixture();assert.equal(await f.publisher.start({endpoint}),true);
 assert.deepEqual(f.calls.map(call=>call.url),[endpoint]);await f.publisher.stop();
});
test('Stop during Catnap preflight prevents a late grant from publishing or replacing newer status',async()=>{
 let resolveCheck;const calls=[];
 const f=fixture({fetch:async(url,options)=>{calls.push({url,...options});if(url.includes('/hosts/api/'))return new Promise(resolve=>{resolveCheck=resolve;});return {status:201,headers:new Headers({Location:'/live/session/new'}),text:async()=>SDP};}});
 const old=f.publisher.start({endpoint:B.DEFAULT_ENDPOINT,token:'old-key'});
 while(!resolveCheck)await new Promise(resolve=>setImmediate(resolve));
 await f.publisher.stop();assert.equal(await old,false);
 assert.equal(await f.publisher.start({endpoint,token:'new-key'}),true);
 const replacement=f.publisher.resources;
 resolveCheck({status:200});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.publisher.state,'live');assert.equal(f.publisher.resources,replacement);
 assert.equal(calls.filter(call=>call.url===B.DEFAULT_ENDPOINT).length,0);
 assert.equal(calls.filter(call=>call.url===endpoint&&call.method==='POST').length,1);
 await f.publisher.stop();
});
test('stop during capture also stops a late-resolving captured stream',async()=>{
 let resolve;const f=fixture({capture:()=>new Promise(r=>{resolve=r;})});const starting=f.publisher.start({endpoint});await f.publisher.stop();resolve(f.stream);await starting;await new Promise(r=>setImmediate(r));assert.equal(f.track.stopped,1);assert.equal(f.publisher.state,'idle');assert.equal(f.calls.length,0);
});
test('stop racing with WHIP allocation deletes the late remote session',async()=>{
 let resolvePost;const calls=[];const f=fixture({fetch:async(url,options)=>{calls.push({url,...options});if(options.method==='POST')return new Promise(r=>{resolvePost=r;});return {};}});
 const starting=f.publisher.start({endpoint,token:'broadcaster:secret'});while(!resolvePost)await new Promise(r=>setImmediate(r));await f.publisher.stop();resolvePost({status:201,headers:new Headers({Location:'/live/session/late'}),text:async()=>SDP});await starting;await new Promise(r=>setImmediate(r));assert.equal(calls.at(-1).method,'DELETE');assert.equal(calls.at(-1).headers.Authorization,'Bearer broadcaster:secret');assert.equal(f.publisher.state,'idle');
});
test('late peer-failure cleanup cannot mark a newer live broadcast as failed or allow another Start',async()=>{
 let releaseOld,closed=0;
 const f=fixture({monitor:async()=>({close:()=>++closed===1?new Promise(resolve=>{releaseOld=resolve;}):Promise.resolve()})});
 await f.publisher.start({endpoint});
 f.pc.connectionState='failed';f.pc.onconnectionstatechange();
 assert.equal(typeof releaseOld,'function');
 await f.publisher.stop();assert.equal(f.publisher.state,'idle');
 await f.publisher.start({endpoint});const replacement=f.publisher.resources;
 assert.equal(f.publisher.state,'live');
 releaseOld();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.publisher.state,'live');assert.equal(f.publisher.resources,replacement);
 await assert.rejects(f.publisher.start({endpoint}),/already/);
 await f.publisher.stop();
});
test('late Stop cleanup cannot mark a replacement broadcast idle',async()=>{
 let releaseOld,closed=0;
 const f=fixture({monitor:async()=>({close:()=>++closed===1?new Promise(resolve=>{releaseOld=resolve;}):Promise.resolve()})});
 await f.publisher.start({endpoint});
 const firstStop=f.publisher.stop();assert.equal(typeof releaseOld,'function');
 await f.publisher.stop();assert.equal(f.publisher.state,'idle');
 await f.publisher.start({endpoint});const replacement=f.publisher.resources;
 releaseOld();await firstStop;
 assert.equal(f.publisher.state,'live');assert.equal(f.publisher.resources,replacement);
 await assert.rejects(f.publisher.start({endpoint}),/already/);
 await f.publisher.stop();
});
test('video or missing audio is rejected and released',async()=>{
 const track={stopped:0,stop(){this.stopped++;}};const f=fixture({capture:async()=>({getTracks:()=>[track],getAudioTracks:()=>[],getVideoTracks:()=>[track]})});assert.equal(await f.publisher.start({endpoint}),false);assert.equal(track.stopped,1);assert.equal(f.pc.closed,undefined);
});
test('Chromium tab capture keeps legacy mandatory constraints separate from track processing constraints',async()=>{
 const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');let env,requested,applied;
 const track={applyConstraints:async value=>{applied=value;},stop(){}};
 const stream={getAudioTracks:()=>[track],getTracks:()=>[track]};
 const sandbox={CatnapBroadcast:{Publisher:class{constructor(options){env=options;}}},navigator:{mediaDevices:{getUserMedia:async value=>{requested=value;if(Object.keys(value.audio).some(k=>k!=='mandatory'))throw Error('Malformed legacy capture constraints');return stream;}}},chrome:{runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener(){}}}},setInterval,clearInterval,Float32Array,Math};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../extension/broadcast-offscreen.js'),'utf8'),sandbox);
 assert.equal(await env.capture('opaque-stream-id'),stream);assert.equal(requested.video,false);assert.equal(requested.audio.mandatory.chromeMediaSource,'tab');assert.equal(requested.audio.mandatory.chromeMediaSourceId,'opaque-stream-id');assert.equal(applied.echoCancellation,false);assert.equal(applied.noiseSuppression,false);assert.equal(applied.autoGainControl,false);assert.equal(applied.channelCount.ideal,2);
});
