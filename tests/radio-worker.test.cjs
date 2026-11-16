/* Radio integration checks, version 0.7.0.
 * Synthetic tabs/relay only: never captures or contacts a real source.
 */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const S=require('../extension/broadcast-source.js');
const B=require('../extension/broadcast-core.js');
const M=require('../extension/broadcast-metadata-core.js');
function fixture({radioOnly=false}={}){
  const session={broadcastToken:'private-test-value'},local={},messages=[],requests=[],captures=[],imports=[];
  const offscreenCommands=[];
  const tabs=new Map([[1,{id:1,url:'https://suno.com/create',title:'Create | Suno'}],[2,{id:2,url:'https://party.aiu.fm/party',title:'AIU party'}],[3,{id:3,url:'https://discord.com/channels/test'}]]);
  let handler,clicked,updated,removed,contexts=false,publisher={state:'idle'};
  const area=data=>({get:async key=>({[key]:data[key]}),set:async value=>Object.assign(data,value),remove:async key=>{delete data[key];}});
  const chrome={runtime:{id:'ours',getURL:p=>'chrome-extension://ours/'+p,getContexts:async()=>contexts?[{}]:[],onMessage:{addListener:f=>{handler=f;}},sendMessage:async m=>{
    if(m.action==='start'){publisher={state:'connecting'};return publisher;}if(m.action==='stop'){publisher={state:'idle'};return publisher;}return publisher;
  }},storage:{session:area(session),local:area(local)},action:{onClicked:{addListener:f=>{clicked=f;}},setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},
  windows:{create:async()=>({id:12}),update:async()=>({id:12})},permissions:{contains:async()=>true},
  offscreen:{createDocument:async()=>{contexts=true;}},tabs:{onUpdated:{addListener:f=>{updated=f;}},onRemoved:{addListener:f=>{removed=f;}},get:async id=>tabs.get(id),sendMessage:async(id,message)=>{messages.push({id,message});return {ok:true};}},tabCapture:{getMediaStreamId:async({targetTabId})=>{captures.push(targetTabId);return 'opaque';}}};
  chrome.runtime.sendMessage=async m=>{offscreenCommands.push(m);if(m.action==='status')return publisher;if(m.action==='stop'){publisher={state:'idle'};return publisher;}return {state:'connecting'};};
  const sandbox={chrome,URL,AbortSignal,CatnapPackage:{radioOnly},CatnapBroadcast:B,CatnapBroadcastSource:S,CatnapBroadcastMetadata:M,importScripts:(...files)=>imports.push(...files),fetch:async(url,options)=>{requests.push({url,...options});return {ok:true};}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../extension/broadcast-worker.js'),'utf8'),sandbox);
  const flush=()=>new Promise(r=>setImmediate(r));
  const send=(m,sender)=>new Promise(resolve=>{if(handler(m,sender,resolve)!==true)resolve();});
  const source=id=>({id:'ours',tab:tabs.get(id),frameId:0,url:tabs.get(id)?.url});
  return {session,local,messages,requests,captures,imports,tabs,chrome,send,source,flush,offscreenCommands,updated:(...args)=>updated(...args),removed:(...args)=>removed(...args),
    panel:{id:'ours',url:chrome.runtime.getURL('broadcast.html')},offscreen:{id:'ours',url:chrome.runtime.getURL('broadcast-offscreen.html')},
    async click(id){clicked(tabs.get(id));await flush();},state(value){contexts=true;publisher={state:value};}};
}
test('source policy accepts any Suno path and exact AIU party origin, rejecting login, lookalikes and credentials',()=>{
  for(const url of ['https://suno.com/','https://www.suno.com/create?wid=1','https://party.aiu.fm/party','https://party.aiu.fm/party/room'])assert.equal(S.allowed(url),true,url);
  for(const url of ['http://suno.com/','https://suno.com:444/','https://suno.com.evil.example/','https://user:pass@suno.com/','https://party.aiu.fm/','https://party.aiu.fm/partyish','https://party.aiu.fm/party/login?redirectTo=/party','https://party.aiu.fm/party/auth/callback','chrome://extensions/'])assert.equal(S.allowed(url),false,url);
});
test('Radio-only worker skips all Inbox, helper and presentation imports',()=>{
  const f=fixture({radioOnly:true});assert.ok(f.imports.includes('broadcast-source.js'));
  for(const file of ['show-worker.js','suno-mcp.js','inbox-core.js','presentation-control-worker.js'])assert.equal(f.imports.includes(file),false,file);
  assert.equal(fixture().imports.includes('show-worker.js'),true);
});
test('AIU and any Suno page can be selected; unrelated toolbar clicks clear stale selection without capture',async()=>{
  const f=fixture();await f.click(2);assert.equal(f.session.broadcastSourceTabId,2);assert.equal(f.captures.length,0);
  let status=await f.send({target:'broadcast-worker',action:'status'},f.panel);assert.equal(status.sourceLabel,'AIU player');
  await f.click(3);assert.equal(f.session.broadcastSourceTabId,undefined);
  const rejected=await f.send({target:'broadcast-worker',action:'start',endpoint:B.DEFAULT_ENDPOINT},f.panel);assert.match(rejected.error,/toolbar/);assert.equal(f.captures.length,0);
  await f.click(1);await f.send({target:'broadcast-worker',action:'start',endpoint:B.DEFAULT_ENDPOINT},f.panel);assert.deepEqual(f.captures,[1]);
});
test('AIU live flag belongs only to the captured source and never includes credentials or relay details',async()=>{
  const f=fixture({radioOnly:true});await f.click(2);await f.send({target:'broadcast-worker',action:'start',endpoint:B.DEFAULT_ENDPOINT},f.panel);
  f.state('connecting');let snapshot=await f.send({target:'catnap-radio-ui',action:'status'},f.source(2));assert.equal(snapshot.state,'connecting');assert.equal(snapshot.source,true);
  f.state('live');await f.send({target:'broadcast-status',state:'live'},f.offscreen);await f.flush();
  snapshot=await f.send({target:'catnap-radio-ui',action:'status'},f.source(2));assert.equal(snapshot.state,'live');assert.equal(snapshot.source,true);assert.equal(snapshot.radioOnly,true);
  assert.equal((await f.send({target:'catnap-radio-ui',action:'status'},f.source(1))).source,false);
  await f.click(1);assert.equal(f.session.broadcastMetadataSession.sourceTabId,2,'toolbar selection cannot retarget a live capture');
  assert.equal((await f.send({target:'broadcast-worker',action:'status'},f.panel)).sourceLabel,'AIU player');
  const projection=JSON.stringify([snapshot,...f.messages]);assert.equal(projection.includes('private-test-value'),false);assert.equal(projection.includes('/live/whip'),false);
  assert.ok(f.requests.some(r=>JSON.parse(r.body).active===false),'AIU clears old public song metadata');
  assert.equal(f.messages.some(m=>m.message.target==='broadcast-metadata-reader'&&m.message.action==='start'),false,'no invented AIU metadata reader');
  f.state('idle');await f.send({target:'broadcast-status',state:'idle'},f.offscreen);await f.flush();
  assert.equal((await f.send({target:'catnap-radio-ui',action:'status'},f.source(2))).source,false);
});
test('page display messages can open controls but cannot capture, stop or forge publishing status',async()=>{
  const f=fixture();
  for(const sender of [{...f.source(1),id:'other'},{...f.source(1),frameId:1},{...f.source(1),url:'https://evil.example/'}])assert.equal(await f.send({target:'catnap-radio-ui',action:'open'},sender),undefined);
  await f.send({target:'catnap-radio-ui',action:'open'},f.source(1));assert.equal(f.session.broadcastSourceTabId,1);assert.equal(f.captures.length,0);
  assert.equal((await f.send({target:'catnap-radio-ui',action:'start'},f.source(1))).ok,false);
  assert.equal(await f.send({target:'broadcast-worker',action:'start',endpoint:B.DEFAULT_ENDPOINT},f.source(1)),undefined);
  assert.equal(f.captures.length,0);
  f.local.hideTheatreButton=true;const status=await f.send({target:'catnap-radio-ui',action:'status'},f.source(1));assert.equal(status.hideTheatreButton,true);assert.equal(status.state,'idle');
});
test('a bound source navigation stops publishing outside the source allowlist, including a revoked URL grant',async()=>{
  for(const destination of ['https://discord.com/channels/test','https://party.aiu.fm/party/login',undefined]){
    const f=fixture();await f.click(2);await f.send({target:'broadcast-worker',action:'start',endpoint:B.DEFAULT_ENDPOINT},f.panel);f.state('live');
    f.updated(3,{status:'loading'});await f.flush();assert.equal(f.offscreenCommands.some(m=>m.action==='stop'),false,'unrelated navigation cannot stop the source');
    f.tabs.set(2,{id:2,url:'https://party.aiu.fm/party/room'});f.updated(2,{status:'complete'});await f.flush();assert.equal(f.offscreenCommands.some(m=>m.action==='stop'),false,'allowed party navigation retains capture');
    f.tabs.set(2,{id:2,url:destination});f.updated(2,{status:'complete'});await f.flush();
    assert.equal(f.offscreenCommands.some(m=>m.action==='stop'),true);assert.equal(f.session.broadcastMetadataSession,undefined);
  }
});
test('a source change during Start is held before offscreen publishing begins',async()=>{
  const f=fixture();await f.click(1);
  f.chrome.tabCapture.getMediaStreamId=async()=>{f.tabs.set(1,{id:1,url:'https://discord.com/'});return 'opaque';};
  const result=await f.send({target:'broadcast-worker',action:'start',endpoint:B.DEFAULT_ENDPOINT},f.panel);
  assert.match(result.error,/source tab changed/);assert.equal(f.offscreenCommands.some(m=>m.action==='start'),false);assert.equal(f.session.broadcastMetadataSession,undefined);
});
test('a delayed navigation check for the old source cannot stop its replacement',async()=>{
  const f=fixture();await f.click(1);await f.send({target:'broadcast-worker',action:'start',endpoint:B.DEFAULT_ENDPOINT},f.panel);f.state('live');
  const get=f.chrome.tabs.get;let resolveRead;
  f.chrome.tabs.get=id=>id===1?new Promise(resolve=>{resolveRead=resolve;}):get(id);
  f.updated(1,{status:'loading'});await f.flush();assert.equal(typeof resolveRead,'function');
  await f.send({target:'broadcast-worker',action:'stop'},f.panel);await f.click(2);await f.send({target:'broadcast-worker',action:'start',endpoint:B.DEFAULT_ENDPOINT},f.panel);f.state('live');
  const stopCount=f.offscreenCommands.filter(m=>m.action==='stop').length;
  resolveRead({id:1,url:'https://discord.com/'});await f.flush();
  assert.equal(f.offscreenCommands.filter(m=>m.action==='stop').length,stopCount);assert.equal(f.session.broadcastMetadataSession.sourceTabId,2);
});
