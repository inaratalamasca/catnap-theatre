'use strict';
/* Managed show integration tests, version 0.6.0.
 * All accounts, tabs, provider data and MCP operations are synthetic mocks.
 * Tests never load browser profiles, contact services or write real playlists.
 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const Core = require('../extension/inbox-core.js');
const STATE_KEY = 'catnap-managed-show-v1';
const SONG = '11111111-2222-4333-8444-555555555555';
const SECOND = '66666666-7777-4888-8999-aaaaaaaaaaaa';
const PLAYLIST = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const NEXT_PLAYLIST = '12345678-1234-4234-8234-123456789abc';
const song = id => 'https://suno.com/song/' + id;
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const baseState = () => ({version:1,id:'fixture-show',mode:'lp',showName:'Fixture show',inboxId:'fixture-inbox',inboxName:'Fixture LP',
  uploaderTabId:8,playerTabId:null,playerLease:'fixture-lease',playlistId:'',entries:[],autoplay:false,warningSeconds:10,watch:{enabled:false,until:0},playback:null,lastRead:null,lastPlaylistSync:null,error:''});
const row = (id, values = {}) => ({id,status:'pending',deleted:false,submission_type:'LP',submitted_at:'2026-11-15 10:00:00',
  title:'Fixture '+id,artist:'Fixture artist',uploader_name:'fixture-uploader',uploader_id:'fixture-id',message:'PRIVATE-UPLOADER-NOTE',
  disclaimer_needed:'yes',suno_url:song(SONG),...values});
const entry = (id = 'one', values = {}) => ({...Core.normalizeRows([row(id)],{inboxId:'fixture-inbox',mode:'lp'}).entries[0],...values});

function fixture(options = {}) {
  const local = {[STATE_KEY]:clone({...baseState(),...options.state})}, session = {};
  if(options.managed===true)local[STATE_KEY].playlistOwnership={showId:local[STATE_KEY].id,playlistId:local[STATE_KEY].playlistId,managedIds:local[STATE_KEY].entries.map(entry=>entry.sunoId).filter(Boolean),verifiedOrder:[]};
  const calls = {messages:[],scripts:[],native:[],fetch:[],mcp:[],alarms:[],windows:[],permissions:[]};
  const tabMap = new Map([
    [7,{id:7,url:'https://suno.com/playlist/'+PLAYLIST,title:'Synthetic Suno playlist'}],
    [8,{id:8,url:'https://uploader.aiu.fm/',title:'Synthetic AIU Uploader'}],
    [9,{id:9,url:'https://discord.com/channels/fixture/fixture',title:'Untouched Discord'}],
    [10,{id:10,url:'https://suno.com.evil.invalid/',title:'Unrelated site'}]
  ]);
  let listener, startup, alarm;
  let pageEnabled=Number.isInteger(options.state?.playerTabId),pageShow=options.state?.id||'fixture-show',pageLease=options.state?.playerLease||'fixture-lease';
  const url = name => 'chrome-extension://fixture-extension/' + name;
  function storage(memory) {
    return {get:async keys=>{
      if(typeof keys==='string') return {[keys]:clone(memory[keys])};
      if(Array.isArray(keys)) return Object.fromEntries(keys.map(key=>[key,clone(memory[key])]));
      return clone(memory);
    },set:async values=>{for(const [key,value] of Object.entries(values))memory[key]=clone(value);},remove:async keys=>{for(const key of Array.isArray(keys)?keys:[keys])delete memory[key];}};
  }
  const chrome = {
    runtime:{id:'fixture-extension',getURL:url,onMessage:{addListener:fn=>{listener=fn;}},onStartup:{addListener:fn=>{startup=fn;}}},
    storage:{local:storage(local),session:storage(session)},
    tabs:{query:async()=>[...tabMap.values()].map(clone),get:async id=>{if(!tabMap.has(id))throw Error('No such fixture tab');return clone(tabMap.get(id));},sendMessage:async(tabId,message,target)=>{
      calls.messages.push(clone({tabId,message,target}));
      if(message.target==='catnap-inbox') {
        if(options.inboxError)return {ok:false,error:options.inboxError,uncertain:options.inboxUncertain===true};
        if(message.action==='check-decline')return {ok:true,data:{inboxId:message.inboxId,submissionId:message.submissionId,status:options.declineStatus||'unknown'}};
        if(message.action==='decline'){if(options.onDecline)return options.onDecline({message,local});return {ok:true,data:{declined:true,inboxId:message.inboxId,submissionId:message.submissionId}};}
        if(message.action==='discover')return {ok:true,data:{inboxes:{lp:[{id:'fixture-inbox',name:'Fixture LP',mode:'lp'}],ap:[{id:'fixture-inbox',name:'Fixture AP',mode:'ap'}]}}};
        if(message.action==='check-decline')return {ok:true,data:{inboxId:message.inboxId,submissionId:message.submissionId,status:options.declineStatus||'unknown'}};
        if(message.action==='decline'){if(options.onDecline)return options.onDecline({message,local});if(options.declineError)return {ok:false,error:options.declineError,uncertain:options.declineUncertain===true};return {ok:true,data:{declined:true,inboxId:message.inboxId,submissionId:message.submissionId}};}
        if(message.action==='read')return {ok:true,data:options.inboxData?clone(options.inboxData):{inbox:{id:'fixture-inbox',name:'Fixture '+message.mode.toUpperCase(),mode:message.mode},summary:{pending:(options.rows||[]).length},rows:clone(options.rows||[])}};
      }
      if(message.target==='catnap-show-tab') {
        if(message.action==='enable') {
          if(options.rejectEnable)throw Error('Synthetic managed player could not start');
          const response=Object.hasOwn(options,'enableResponse')?options.enableResponse:{enabled:true};
          if(response?.enabled){pageEnabled=true;pageShow=message.show.id;pageLease=message.show.bindingId;}return response;
        }
        if(message.action==='status')return (typeof options.healthResponse==='function'?options.healthResponse():options.healthResponse)||{enabled:pageEnabled,showId:pageEnabled?pageShow:null,bindingId:pageEnabled?pageLease:null,guard:pageEnabled?{ready:true,enabled:true,integrity:true}:null,playback:{phase:'ready'},stageOpen:true};
        if(message.action==='disable'){if(options.rejectDisable)throw Error('Old content context lost');pageEnabled=false;return {enabled:false};}
        return options.onPlayerCommand?options.onPlayerCommand(message):options.playerResponse || {ok:true};
      }
      throw Error('Unexpected tab message');
    }},
    scripting:{executeScript:async script=>{
      calls.scripts.push(script);
      if(script.func) {
        const result=await vm.runInNewContext('('+script.func.toString()+')(...args)',{args:script.args||[],document:{querySelectorAll:()=>[]},URL,CatnapManagedNative:{status:()=>({enabled:false}),command:command=>{calls.native.push(clone(command));return {ok:true};}}});
        return [{result}];
      }
      return [{result:{ok:true}}];
    }},
    permissions:{contains:async spec=>{calls.permissions.push(clone(spec));return options.permission!==false;}},
    alarms:{create:async(name,spec)=>{calls.alarms.push({action:'create',name,...spec});},clear:async name=>{calls.alarms.push({action:'clear',name});return true;},onAlarm:{addListener:fn=>{alarm=fn;}}},
    windows:{create:async spec=>{calls.windows.push(clone(spec));return {id:100};},update:async()=>({id:100})}
  };
  const CatnapSuno = {
    status:async()=>({connected:options.sunoAuthorized!==false}),connect:async()=>({connected:true}),disconnect:async()=>({connected:false}),listPlaylists:async()=>[],
    readPlaylist:async id=>{calls.mcp.push({operation:'read',id});return clone(options.playlistRows||[]);},
    reconcileOrderedPlaylist:async(id,ids,bindings)=>{calls.mcp.push({operation:'ordered',id,ids:[...ids],bindings});if(options.onOrderedReconcile)return options.onOrderedReconcile({id,ids,bindings,local});if(options.onReconcile)return options.onReconcile({id,ids,bindings,local});assert.equal(await bindings.isCurrent(),true);return {confirmed:ids.length,added:ids.length,removed:0,missing:[],failures:[],actualOrder:[...ids],orderVerified:true};},
    createPlaylist:async(name,visibility)=>{calls.mcp.push({operation:'create',name,visibility});return {id:PLAYLIST,name,visibility};},
    reconcilePlaylist:async(id,ids,bindings)=>{
      calls.mcp.push({operation:'reconcile',id,ids:[...ids],bindings});
      if(options.onReconcile)return options.onReconcile({id,ids,bindings,local});
      assert.equal(await bindings.isCurrent(),true);
      return {confirmed:ids.length,addedConfirmed:ids.length,missing:[],failures:[]};
    }
  };
  const sandbox = {CatnapPackage:{inboxOnly:options.inboxOnly===true},CatnapShowCoordination:options.coordination,chrome,CatnapSuno,CatnapInboxCore:Core,crypto,URL,AbortSignal,TextEncoder,Date,
    fetch:async(target,spec)=>{calls.fetch.push({target,spec});return {ok:true,url:target,headers:{get:()=> 'text/html'},text:async()=>'<html><head></head></html>'};}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../extension/show-worker.js'),'utf8'),sandbox);
  const host = {id:'fixture-extension',url:url('show.html')};
  const player = {id:'fixture-extension',url:'https://suno.com/playlist/'+PLAYLIST,tab:{id:7},frameId:0};
  const send = (message,sender=host)=>new Promise(resolve=>{if(listener(message,sender,value=>resolve(clone(value)))!==true)resolve(undefined);});
  const control = (action,parameters={},sender=host)=>send({target:'catnap-show-worker',action,...parameters},sender);
  return {calls,local,session,tabMap,url,host,player,send,control,reload:()=>{pageEnabled=false;},state:()=>clone(local[STATE_KEY]),startup:async()=>{startup();await tick();},alarm:async()=>{alarm({name:'catnap-inbox-watch'});await tick();}};
}

test('private host controls reject unrelated senders while own extension popup/tab is accepted', async () => {
  const f=fixture();
  for(const sender of [
    {id:'another-extension',url:f.url('show.html')},
    {id:'fixture-extension',url:'https://suno.com/playlist/'+PLAYLIST,tab:{id:7}},
    {id:'fixture-extension',url:f.url('show.html')+'?untrusted=1'},
    {id:'fixture-extension',url:'https://unrelated.invalid/show.html'}
  ])assert.equal((await f.control('status',{},sender)).ok,false);
  assert.equal((await f.control('status',{}, {...f.host,tab:{id:100}})).ok,true);
  assert.equal(f.calls.mcp.length,0);
  assert.equal(f.calls.messages.length,0);
});

test('readiness status uses local authorization, origin permission and tab facts without provider probes',async()=>{
  const f=fixture({permission:false,sunoAuthorized:false});
  const response=await f.control('status');assert.equal(response.ok,true);
  assert.deepEqual(response.data.readiness,{sunoAuthorized:false,uploaderPermission:false,uploaderTabOpen:true,inboxSelected:true,inboxAccessChecked:false,inboxCheckedAt:null,pendingRead:false,playlistSelected:false,playlistVerified:false});
  assert.deepEqual(f.calls.permissions,[{origins:['https://uploader.aiu.fm/*']}]);
  assert.equal(f.calls.mcp.length,0);assert.equal(f.calls.fetch.length,0);assert.equal(f.calls.scripts.length,0);assert.equal(f.calls.messages.length,0);
  const before=f.calls.permissions.length;
  assert.equal((await f.control('status',{}, {...f.host,id:'untrusted'})).ok,false);assert.equal(f.calls.permissions.length,before);
});

test('discovery and Pending read establish distinct readiness evidence for the chosen tab and inbox',async()=>{
  const f=fixture({rows:[row('one')]});
  assert.equal((await f.control('status')).data.readiness.inboxAccessChecked,false,'an open tab does not prove sign-in or access');
  await f.control('discover');let r=(await f.control('status')).data.readiness;
  assert.equal(r.inboxAccessChecked,true);assert.equal(r.pendingRead,false);assert.ok(Number.isFinite(r.inboxCheckedAt));
  await f.control('import');r=(await f.control('status')).data.readiness;
  assert.equal(r.pendingRead,true);assert.equal(f.state().lastRead.context.inboxId,'fixture-inbox');assert.equal(f.state().lastRead.context.uploaderTabId,8);
  assert.equal(Object.values(r).every(value=>typeof value==='boolean'||typeof value==='number'||value===null),true,'readiness exports only facts, not account payloads or notes');
  f.tabMap.set(8,{id:8,url:'https://uploader.aiu.fm.evil.invalid/',title:'Wrong origin'});
  r=(await f.control('status')).data.readiness;assert.equal(r.uploaderTabOpen,false);assert.equal(r.inboxAccessChecked,false);assert.equal(r.pendingRead,false);
});

test('a failed latest discovery or read invalidates ready access while preserving successful counters',async()=>{
  for(const action of ['discover','import']){
    const options={rows:[row('saved')]},f=fixture(options);await f.control('import');
    const prior=f.state().lastRead;assert.equal((await f.control('status')).data.readiness.pendingRead,true);
    options.inboxError='Fixture session no longer has inbox access';
    assert.equal((await f.control(action)).ok,false);
    const r=(await f.control('status')).data.readiness;assert.equal(r.inboxAccessChecked,false);assert.equal(r.pendingRead,false);
    assert.deepEqual(f.state().lastRead,prior);assert.match(f.state().inboxAccessError,/no longer has inbox access/);
  }
});

test('browser startup requires a new inbox access check but keeps historical submission counts',async()=>{
  const f=fixture({rows:[row('saved')]});await f.control('import');const lastRead=f.state().lastRead;
  assert.equal((await f.control('status')).data.readiness.inboxAccessChecked,true);
  await f.startup();assert.equal((await f.control('status')).data.readiness.inboxAccessChecked,false);
  assert.deepEqual(f.state().lastRead,lastRead);assert.equal(f.calls.mcp.length,0);
});

test('changing a target clears current read or playlist evidence, while legacy snapshots never imply readiness',async()=>{
  const context={uploaderTabId:8,inboxId:'fixture-inbox',mode:'lp'};
  const evidence={playlistId:PLAYLIST,inboxAccess:{kind:'read',...context,at:1},lastRead:{at:1,pending:0,held:0,context},lastPlaylistSync:{orderVerified:true,at:1,confirmed:0,missing:[],failures:[],context:{...context,playlistId:PLAYLIST,sunoIds:[]}}};
  for(const settings of [{uploaderTabId:18},{inboxId:'other-inbox'},{mode:'ap'},{playlistId:NEXT_PLAYLIST}]){
    const f=fixture({managed:true,state:evidence});f.tabMap.set(18,{id:18,url:'https://uploader.aiu.fm/',title:'Other uploader'});
    assert.equal((await f.control('status')).data.readiness.playlistVerified,true);
    assert.equal((await f.control('configure',{settings})).ok,true);
    const r=(await f.control('status')).data.readiness;assert.equal(r.playlistVerified,false);
    if(!settings.playlistId)assert.equal(r.pendingRead,false);
  }
  const legacy=fixture({managed:true,state:{playlistId:PLAYLIST,lastRead:{at:1,pending:1,held:0},lastPlaylistSync:{orderVerified:true,at:1,confirmed:1,missing:[],failures:[]}}});
  const r=(await legacy.control('status')).data.readiness;assert.equal(r.pendingRead,false);assert.equal(r.playlistVerified,false);
});

test('new inbox songs invalidate playlist verification until the explicit sync verifies the current source IDs',async()=>{
  const context={uploaderTabId:8,inboxId:'fixture-inbox',mode:'lp'};
  const f=fixture({managed:true,state:{playlistId:PLAYLIST,entries:[entry('one')],lastPlaylistSync:{orderVerified:true,at:1,confirmed:1,missing:[],failures:[],context:{...context,playlistId:PLAYLIST,sunoIds:[SONG]}}},rows:[row('one'),row('two',{suno_url:song(SECOND)})]});
  assert.equal((await f.control('status')).data.readiness.playlistVerified,true);
  await f.control('import');let r=(await f.control('status')).data.readiness;assert.equal(r.pendingRead,true);assert.equal(r.playlistVerified,false);assert.equal(f.calls.mcp.length,0);
  await f.control('sync-playlist');r=(await f.control('status')).data.readiness;assert.equal(r.playlistVerified,true);
  assert.equal(f.calls.mcp.length,1);assert.deepEqual(f.state().lastPlaylistSync.context.sunoIds,[SONG,SECOND]);
});

test('an unresolved new Suno link cannot retain a green playlist result while sync is held',async()=>{
  const context={uploaderTabId:8,inboxId:'fixture-inbox',mode:'lp'};
  const f=fixture({managed:true,state:{playlistId:PLAYLIST,entries:[entry('one'),entry('unresolved',{sunoId:null,sunoUrl:'https://suno.com/s/fixture-short'})],lastPlaylistSync:{orderVerified:true,at:1,confirmed:1,missing:[],failures:[],context:{...context,playlistId:PLAYLIST,sunoIds:[SONG]}}}});
  assert.equal((await f.control('status')).data.readiness.playlistVerified,false);
  const sync=await f.control('sync-playlist');assert.equal(sync.ok,false);assert.match(sync.error,/short links could not be resolved/);assert.equal(f.calls.mcp.length,0);
});

test('uploader reads inject their core/adapter into only the selected authorized origin and include show mode', async () => {
  const f=fixture({state:{mode:'ap'}});
  assert.equal((await f.control('discover')).ok,true);
  const injection=f.calls.scripts[0];
  assert.deepEqual(clone(injection.target),{tabId:8,frameIds:[0]});
  assert.deepEqual([...injection.files],['inbox-core.js','inbox-reader.js']);
  const request=f.calls.messages[0];
  assert.equal(request.tabId,8);assert.equal(request.message.target,'catnap-inbox');
  assert.equal(request.message.mode,'ap');assert.equal(request.target.frameId,0);
  assert.deepEqual(f.calls.permissions[0],{origins:['https://uploader.aiu.fm/*']});
  assert.equal(f.calls.fetch.length,0);
  const denied=fixture({permission:false});
  assert.equal((await denied.control('discover')).ok,false);assert.equal(denied.calls.scripts.length,0);
  const wrongOrigin=fixture();wrongOrigin.tabMap.set(8,{id:8,url:'https://uploader.aiu.fm.evil.invalid/'});
  assert.equal((await wrongOrigin.control('discover')).ok,false);assert.equal(wrongOrigin.calls.scripts.length,0);
});

test('discovered inbox choices and their selected label persist in private local show state',async()=>{
  const f=fixture();
  assert.equal((await f.control('discover')).ok,true);
  assert.deepEqual(f.state().inboxes,{lp:[{id:'fixture-inbox',name:'Fixture LP',mode:'lp'}],ap:[{id:'fixture-inbox',name:'Fixture AP',mode:'ap'}]});
  assert.equal(f.state().inboxName,'Fixture LP');
  const status=await f.control('status');assert.equal(status.data.state.inboxId,'fixture-inbox');
  assert.equal(status.data.state.inboxes.lp[0].name,'Fixture LP');
  assert.equal((await f.control('new-show')).ok,true);
  assert.equal(f.state().inboxId,'','a new show still requires an explicit inbox choice');
  assert.equal(f.state().inboxes.lp[0].name,'Fixture LP');
  assert.equal(f.calls.mcp.length,0);assert.equal(f.calls.messages.some(call=>call.message.target==='catnap-show-tab'),false);
});

test('local inbox and playlist choices do not require a live Theatre or overwrite queue and playback',async()=>{
  const prior=entry('retained'),playback={phase:'ready',current:{id:prior.id},generation:3};
  const f=fixture({state:{playerTabId:7,entries:[prior],playback},playerResponse:{error:'Fixture stale player'}});
  for(const settings of [{uploaderTabId:8},{inboxId:'fixture-inbox'},{playlistId:PLAYLIST}]){
    const response=await f.control('configure',{settings});assert.equal(response.ok,true);
  }
  assert.equal(f.state().playlistId,PLAYLIST);assert.equal(f.state().entries[0].id,prior.id);assert.deepEqual(f.state().playback,playback);
  assert.equal(f.calls.messages.length,0,'local-only selections never publish a player update');
  const playerSetting=await f.control('configure',{settings:{warningSeconds:12}});
  assert.equal(playerSetting.ok,false);assert.match(playerSetting.error,/stale player/);
  assert.equal(f.calls.messages.at(-1).message.action,'update','player-facing settings still request their guarded update');
});

test('changing empty-show party type clears an incompatible inbox and LP still forces manual playback',async()=>{
  const f=fixture({state:{mode:'ap',autoplay:true,inboxId:'fixture-ap',inboxName:'Prior AP'}});
  assert.equal((await f.control('configure',{settings:{mode:'lp'}})).ok,true);
  assert.equal(f.state().inboxId,'');assert.equal(f.state().inboxName,'');assert.equal(f.state().autoplay,false);
  assert.equal((await f.control('import')).ok,false);assert.equal(f.calls.messages.length,0);
  assert.equal((await f.control('configure',{settings:{inboxId:'fixture-inbox'}})).ok,true);
  assert.equal((await f.control('configure',{settings:{inboxId:''}})).ok,true);
  assert.equal(f.state().inboxId,'');
  assert.equal((await f.control('configure',{settings:{inboxId:42}})).ok,false);
});

test('inbox import retains FIFO/YouTube-only entries and never writes a playlist or starts playback', async () => {
  const f=fixture({managed:true,state:{playlistId:PLAYLIST,playerTabId:7},rows:[
    row('late',{submitted_at:'2026-11-15 12:00:00',suno_url:'',youtube_url:'https://youtu.be/AbCdEfGhI12'}),
    row('early',{submitted_at:'2026-11-15 10:00:00'})
  ]});
  const result=await f.control('import');assert.equal(result.ok,true);
  assert.deepEqual(result.data.entries.map(item=>item.submissionId),['early','late']);
  assert.equal(result.data.entries[1].preferredSource,'youtube');assert.equal(result.data.entries[1].sunoId,null);
  assert.equal(result.data.entries[0].note,'PRIVATE-UPLOADER-NOTE');
  assert.equal(f.calls.mcp.length,0);
  const playerMessages=f.calls.messages.filter(call=>call.message.target==='catnap-show-tab');
  assert.equal(playerMessages.length,1);assert.equal(playerMessages[0].message.action,'update');
  assert.equal(JSON.stringify(playerMessages).includes('PRIVATE-UPLOADER-NOTE'),false);
  assert.equal(JSON.stringify(playerMessages).includes('fixture-uploader'),false);
  assert.equal(playerMessages[0].message.show.entries[0].disclaimer,'yes');
});

test('a successful inbox read remains saved when its stale Theatre rejects the queue handoff',async()=>{
  const f=fixture({managed:true,state:{playlistId:PLAYLIST,playerTabId:7},rows:[row('saved')],playerResponse:{error:'Fixture player has reloaded'}});
  const result=await f.control('import');assert.equal(result.ok,true);
  assert.equal(result.data.entries.length,1);assert.equal(f.state().entries[0].submissionId,'saved');
  assert.match(result.data.error,/Inbox read and running order saved.*did not receive.*reloaded/);
  assert.equal(f.state().lastRead.pending,1);assert.equal(f.calls.mcp.length,0);
  assert.deepEqual(f.calls.messages.filter(call=>call.message.target==='catnap-show-tab').map(call=>call.message.action),['update']);
  assert.equal(f.calls.scripts.some(script=>script.files?.includes('managed-native-guard.js')),false,'import cannot bind or start the stale player');
});

test('verified playlist sync stays saved when only its Theatre handoff fails and never retries the write',async()=>{
  const f=fixture({managed:true,state:{playlistId:PLAYLIST,playerTabId:7,entries:[entry()]},playerResponse:{error:'Fixture stale Theatre'}});
  const result=await f.control('sync-playlist');assert.equal(result.ok,true);
  assert.equal(result.data.confirmed,1);assert.equal(result.data.missing.length,0);
  assert.match(result.data.playerUpdateWarning,/playlist result saved.*did not receive.*stale Theatre/);
  assert.equal(f.state().lastPlaylistSync.confirmed,1);assert.match(f.state().error,/result saved/);
  assert.equal(f.calls.mcp.filter(call=>call.operation==='ordered').length,1);
  assert.deepEqual(f.calls.messages.filter(call=>call.message.target==='catnap-show-tab').map(call=>call.message.action),['status','update']);
  const failure=fixture({managed:true,state:{playlistId:PLAYLIST,entries:[entry()]},onReconcile:()=>{throw Error('Fixture MCP write failed');}});
  const rejected=await failure.control('sync-playlist');assert.equal(rejected.ok,false);assert.match(rejected.error,/MCP write failed/);
  assert.equal(failure.state().lastPlaylistSync,null);assert.equal(failure.calls.mcp.length,1);
});

test('refresh preserves played state and ordering while appending newly arrived submissions', async () => {
  const current=entry('existing',{state:'playing',playbackId:'existing-occurrence'});
  const f=fixture({state:{entries:[current]},rows:[
    row('new',{submitted_at:'2026-11-15 11:00:00'}),
    row('existing',{submitted_at:'2026-11-15 10:00:00',message:'Updated private note'})
  ]});
  assert.equal((await f.control('import')).ok,true);
  const entries=f.state().entries;
  assert.deepEqual(entries.map(item=>item.submissionId),['existing','new']);
  assert.equal(entries[0].state,'playing');assert.equal(entries[0].playbackId,'existing-occurrence');
  assert.equal(entries[0].note,'Updated private note');assert.equal(f.calls.mcp.length,0);
});

test('returned inbox/show binding must match before importing any rows', async () => {
  const f=fixture({inboxData:{inbox:{id:'another-inbox',name:'Wrong inbox',mode:'lp'},rows:[row('wrong')],summary:{pending:1}}});
  const result=await f.control('import');assert.equal(result.ok,false);assert.match(result.error,/does not match/);
  assert.equal(f.state().entries.length,0);assert.equal(f.calls.mcp.length,0);
});

test('LP never accepts autoplay and AP autoplay can be explicitly enabled then disabled', async () => {
  const f=fixture();
  const rejected=await f.control('configure',{settings:{autoplay:true}});
  assert.equal(rejected.ok,false);assert.match(rejected.error,/LP uses manual/);assert.equal(f.state().autoplay,false);
  assert.equal((await f.control('configure',{settings:{mode:'ap',autoplay:true}})).ok,true);
  assert.equal(f.state().autoplay,true);
  assert.equal((await f.control('configure',{settings:{autoplay:false}})).ok,true);assert.equal(f.state().autoplay,false);
  assert.equal((await f.control('configure',{settings:{mode:'lp'}})).ok,true);assert.equal(f.state().autoplay,false);
  assert.equal((await f.control('watch',{enabled:true})).ok,false);
  assert.equal(f.calls.alarms.some(call=>call.action==='create'),false);
});

test('only the bound top-level Suno player can report playback or invoke native commands', async () => {
  const f=fixture({state:{playerTabId:7,entries:[entry()]}});
  const observed={target:'catnap-show-observed',showId:'fixture-show',bindingId:'fixture-lease',revision:1,playback:{phase:'playing',index:0,generation:1,occurrenceId:'fixture-occurrence',source:'suno',current:{id:'fixture-inbox:one',note:'FORGED-NOTE'}}};
  const native={target:'managed-native',showId:'fixture-show',bindingId:'fixture-lease',action:'play'};
  for(const sender of [{...f.player,tab:{id:8}},{...f.player,frameId:1},{...f.player,id:'foreign'},{...f.player,url:'https://suno.com.evil.invalid/'}]) {
    assert.equal((await f.send(observed,sender)).ok,false);
    assert.equal((await f.send(native,sender)).ok,false);
    assert.equal((await f.send({...native,action:'prepare',generation:1,songId:SONG},sender)).ok,false);
  }
  assert.equal(f.calls.scripts.length,0);assert.equal(f.state().playback,null);
  assert.equal((await f.send({...observed,showId:'wrong-show'},f.player)).ok,false);
  assert.equal((await f.send(observed,f.player)).ok,true);
  assert.equal(f.state().playback.current.id,'fixture-inbox:one');
  assert.equal(JSON.stringify(f.state().playback).includes('FORGED-NOTE'),false);
  assert.equal((await f.send({...native,generation:1,songId:SONG,sourceKey:'fixture-media-source',restart:true},f.player)).ok,true);
  assert.equal(f.calls.scripts[0].target.tabId,7);assert.equal(f.calls.scripts[0].world,'MAIN');
  assert.equal(f.calls.scripts[0].args[0].sourceKey,'fixture-media-source');
  assert.equal(f.calls.scripts[0].args[0].restart,true);
  assert.equal((await f.send({...native,action:'prepare',generation:1,songId:SONG},f.player)).ok,true);
  assert.equal(f.calls.scripts[1].args[0].action,'prepare');
  assert.equal(f.calls.scripts[1].args[0].songId,SONG);
  assert.equal(f.calls.scripts[1].args[0].generation,1);
});

test('player binding targets only an open Suno tab and public player updates exclude host-only data', async () => {
  const f=fixture({state:{entries:[entry()],playerTabId:null}});
  assert.equal((await f.control('bind-player',{tabId:10})).ok,false);
  assert.equal(f.state().playerTabId,null);
  assert.equal((await f.control('bind-player',{tabId:7})).ok,true);
  assert.equal(f.state().playerTabId,7);
  const message=f.calls.messages.find(call=>call.message.action==='enable');
  assert.equal(message.tabId,7);assert.equal(message.target.frameId,0);
  assert.equal(message.message.show.entries[0].title,'Fixture one');
  assert.equal('note' in message.message.show.entries[0],false);
  assert.equal('uploaderId' in message.message.show.entries[0],false);
  assert.equal('uploaderName' in message.message.show.entries[0],false);
  f.tabMap.set(7,{id:7,url:'https://unrelated.invalid/'});
  assert.equal((await f.control('play')).ok,false);
  assert.equal(f.calls.messages.some(call=>call.tabId===9),false);
});

test('missing or rejected managed-player startup rolls back its binding and disables the native guard',async()=>{
  for(const failure of [{enableResponse:undefined},{enableResponse:{enabled:false,error:'Synthetic player rejection'}},{rejectEnable:true}]) {
    const f=fixture({...failure,state:{entries:[entry()]}});
    const result=await f.control('bind-player',{tabId:7});
    assert.equal(result.ok,false);
    assert.equal(f.state().playerTabId,null);assert.equal(f.state().playerLease,null);assert.equal(f.state().playback,null);
    assert.equal(f.calls.messages.some(call=>call.tabId===7&&call.message.target==='catnap-show-tab'&&call.message.action==='disable'),true);
    assert.equal(f.calls.native.some(command=>command.action==='disable'),true);
    assert.equal(f.calls.mcp.length,0);
  }
});

test('manual announcement uses actual active source and uploader credit without notes unless explicitly requested', async () => {
  const paired=entry('one',{youtubeUrl:'https://www.youtube.com/watch?v=AbCdEfGhI12',youtubeId:'AbCdEfGhI12',preferredSource:'youtube',uploaderName:'@everyone-example'});
  const f=fixture({state:{playerTabId:7,entries:[paired]}});
  assert.equal((await f.control('announcement')).ok,false);
  const observed={target:'catnap-show-observed',showId:'fixture-show',bindingId:'fixture-lease',revision:1,playback:{phase:'playing',index:0,generation:1,occurrenceId:'actual-source-occurrence',source:'suno',current:{id:paired.id}}};
  assert.equal((await f.send(observed,f.player)).ok,true);
  const announcement=await f.control('announcement');assert.equal(announcement.ok,true);
  assert.match(announcement.data.text,/Now playing:/);
  assert.match(announcement.data.text,/Submitted by: ＠everyone-example/);
  assert.equal(announcement.data.text.includes(song(SONG)),true);
  assert.equal(announcement.data.text.includes(paired.youtubeUrl),false);
  assert.equal(announcement.data.context.source,'suno');
  assert.equal('uploaderNote' in announcement.data.context,false);
  assert.equal(JSON.stringify(announcement).includes('PRIVATE-UPLOADER-NOTE'),false);
  assert.equal((await f.control('announcement',{includeNotes:true})).data.context.uploaderNote,'PRIVATE-UPLOADER-NOTE');
  assert.equal(f.calls.messages.some(call=>call.tabId===9),false);
});

test('copied uploader credit uses inbox Discord ID or one ASCII @ without mass mentions',async()=>{
  const cases=[
    {uploaderName:'fixture-uploader',uploaderId:'123456789012345678',expected:'<@123456789012345678>'},
    {uploaderName:'fixture-uploader',uploaderId:'fixture-id',expected:'@fixture-uploader'},
    {uploaderName:'@fixture-uploader',uploaderId:'',expected:'@fixture-uploader'},
    {uploaderName:'＠fixture-uploader',uploaderId:'',expected:'@fixture-uploader'},
    {uploaderName:'@everyone',uploaderId:'',expected:'＠everyone'},
    {uploaderName:'here',uploaderId:'',expected:'＠here'},
    {uploaderName:'',uploaderId:'',expected:'Unavailable'},
    {uploaderName:'fixture-uploader',uploaderId:'<@&123456789012345678>',expected:'@fixture-uploader'}
  ];
  for(const values of cases){
    const current=entry('one',{...values,title:'Song @everyone'});
    const f=fixture({state:{playerTabId:7,entries:[current]}});
    await f.send({target:'catnap-show-observed',showId:'fixture-show',bindingId:'fixture-lease',revision:1,playback:{phase:'playing',index:0,generation:1,occurrenceId:'fixture-occurrence',source:'suno',current:{id:current.id}}},f.player);
    const result=await f.control('announcement');assert.equal(result.ok,true);
    assert.equal(result.data.text.split('\n')[1],'Submitted by: '+values.expected);
    assert.match(result.data.text,/Song ＠everyone/);
    assert.equal(result.data.text.includes('@everyone'),false);
    assert.equal(f.calls.messages.some(call=>call.tabId===9),false);
  }
});

test('late playback observations cannot roll back current credit, source or phase',async()=>{
  const first=entry('first',{title:'First song',uploaderName:'first-uploader'});
  const second=entry('second',{title:'Second video',uploaderName:'second-uploader',sunoUrl:song(SECOND),sunoId:SECOND,
    youtubeUrl:'https://www.youtube.com/watch?v=AbCdEfGhI12',youtubeId:'AbCdEfGhI12',preferredSource:'youtube'});
  const f=fixture({state:{playerTabId:7,entries:[first,second]}});
  const newest={target:'catnap-show-observed',showId:'fixture-show',bindingId:'fixture-lease',revision:10,
    playback:{phase:'playing',index:1,generation:4,occurrenceId:'second-occurrence',source:'youtube',current:{id:second.id}}};
  assert.equal((await f.send(newest,f.player)).ok,true);
  // A delayed older load can arrive after a later load despite having a newer
  // delivery revision. Both the generation and revision protect the snapshot.
  const oldLoad={...newest,revision:11,playback:{phase:'playing',index:0,generation:3,occurrenceId:'first-occurrence',source:'suno',current:{id:first.id}}};
  assert.equal((await f.send(oldLoad,f.player)).ok,false);
  const oldPhase={...newest,revision:9,playback:{...newest.playback,phase:'ready',occurrenceId:''}};
  assert.equal((await f.send(oldPhase,f.player)).ok,false);
  assert.equal((await f.send(newest,f.player)).ok,false);
  assert.equal((await f.send({...newest,bindingId:'expired-lease',revision:100},f.player)).ok,false);
  const text=(await f.control('announcement')).data;
  assert.match(text.text,/Now playing: Second video/);assert.match(text.text,/second-uploader/);
  assert.equal(text.context.url,second.youtubeUrl);assert.equal(text.context.occurrenceId,'second-occurrence');
  assert.equal(f.state().playback.phase,'playing');assert.equal(f.state().playback.revision,10);
  const nextPhase={...newest,revision:12,playback:{...newest.playback,phase:'paused'}};
  assert.equal((await f.send(nextPhase,f.player)).ok,true);assert.equal(f.state().playback.phase,'paused');
});

test('rebinding the same player revokes the previous lease for observations and native commands',async()=>{
  const queued=entry();
  const f=fixture({state:{playerTabId:7,entries:[queued]}});
  const oldObservation={target:'catnap-show-observed',showId:'fixture-show',bindingId:'fixture-lease',revision:1,
    playback:{phase:'playing',index:0,generation:1,occurrenceId:'previous-binding',source:'suno',current:{id:queued.id}}};
  assert.equal((await f.send(oldObservation,f.player)).ok,true);
  assert.equal((await f.control('bind-player',{tabId:7})).ok,true);
  const nextLease=f.state().playerLease;
  assert.notEqual(nextLease,'fixture-lease');assert.equal(f.state().playback,null);
  assert.equal((await f.send({...oldObservation,revision:100},f.player)).ok,false);
  const scriptsBefore=f.calls.scripts.length;
  assert.equal((await f.send({target:'managed-native',action:'play',showId:'fixture-show',bindingId:'fixture-lease',generation:100,songId:SONG},f.player)).ok,false);
  assert.equal(f.calls.scripts.length,scriptsBefore);
  const observed={...oldObservation,bindingId:nextLease,playback:{...oldObservation.playback,phase:'ready',occurrenceId:''}};
  assert.equal((await f.send(observed,f.player)).ok,true);
  assert.equal(f.state().playback.phase,'ready');assert.equal(f.state().playback.revision,1);
});

test('playlist writes require explicit sync, exclude held/external-only items and deduplicate Suno IDs', async () => {
  const f=fixture({managed:true,state:{playlistId:PLAYLIST,entries:[
    entry('valid'),entry('duplicate'),entry('held',{sunoId:SECOND,sunoUrl:song(SECOND),state:'held',holdReason:'Wrong show'}),
    entry('youtube',{sunoId:null,sunoUrl:null,youtubeUrl:'https://www.youtube.com/watch?v=AbCdEfGhI12',youtubeId:'AbCdEfGhI12',preferredSource:'youtube'})
  ]}});
  assert.equal(f.calls.mcp.length,0);
  const result=await f.control('sync-playlist');assert.equal(result.ok,true);
  assert.equal(f.calls.mcp.length,1);assert.equal(f.calls.mcp[0].id,PLAYLIST);
  assert.deepEqual(f.calls.mcp[0].ids,[SONG]);assert.equal(f.state().lastPlaylistSync.confirmed,1);
  f.local[STATE_KEY].playlistId=NEXT_PLAYLIST;
  assert.equal(await f.calls.mcp[0].bindings.isCurrent(),false);
  const missing=fixture({state:{entries:[entry()]}});
  assert.equal((await missing.control('sync-playlist')).ok,false);assert.equal(missing.calls.mcp.length,0);
  const unresolved=fixture({managed:true,state:{playlistId:PLAYLIST,entries:[entry('short',{sunoId:null,sunoUrl:'https://suno.com/s/FixtureShare'})]}});
  assert.equal((await unresolved.control('sync-playlist')).ok,false);assert.equal(unresolved.calls.mcp.length,0);
});

test('watching is bounded and explicitly stopped on browser startup without reconnecting or writing playlists', async () => {
  const f=fixture({state:{mode:'ap',playlistId:PLAYLIST,playerTabId:7,watch:{enabled:true,until:Date.now()+3600000},playback:{phase:'playing'}}});
  await f.startup();
  assert.equal(f.state().watch.enabled,false);assert.equal(f.state().playerTabId,null);assert.equal(f.state().playback,null);
  assert.equal(f.calls.mcp.length,0);assert.equal(f.calls.messages.length,0);
  assert.equal(f.calls.alarms.some(call=>call.action==='create'),false);
  assert.equal(f.calls.alarms.some(call=>call.action==='clear'),true);
  const expired=fixture({state:{mode:'ap',watch:{enabled:true,until:Date.now()-1000},playlistId:PLAYLIST}});
  await expired.alarm();
  assert.equal(expired.state().watch.enabled,false);assert.equal(expired.calls.mcp.length,0);assert.equal(expired.calls.messages.length,0);
});


test('status verifies the live page lease and does not claim manual coverage after reload',async()=>{
  const f=fixture({state:{playerTabId:7,entries:[entry()],playback:{phase:'paused'}}});
  assert.equal((await f.control('status')).data.playbackHealth.linked,true);
  f.reload();const result=await f.control('status');
  assert.equal(result.data.playbackHealth.linked,false);assert.match(result.data.playbackHealth.reason,/reloaded|changed/);
  assert.equal(f.calls.native.length,0,'status must not stop or rebind media');
});

test('explicit Load reconnects a reloaded page with a fresh lease and never sends Play',async()=>{
  const f=fixture({state:{playerTabId:7,entries:[entry()]}});f.reload();
  const result=await f.control('load',{tabId:7,index:0});assert.equal(result.ok,true);
  assert.notEqual(f.state().playerLease,'fixture-lease');
  const messages=f.calls.messages.filter(x=>x.message.target==='catnap-show-tab').map(x=>x.message.action);
  assert.equal(messages.includes('enable'),true);assert.equal(messages.at(-1),'load');assert.equal(messages.includes('play'),false);
});

test('explicit Play binds a fresh show, while import and configuration never bind or start audio',async()=>{
  const f=fixture({state:{entries:[entry()]}});
  assert.equal((await f.control('configure',{settings:{warningSeconds:12}})).ok,true);
  assert.equal(f.calls.messages.some(x=>x.message.action==='enable'),false);
  assert.equal((await f.control('play',{tabId:7})).ok,true);
  const actions=f.calls.messages.filter(x=>x.message.target==='catnap-show-tab').map(x=>x.message.action);
  assert.equal(actions.includes('enable'),true);assert.equal(actions.at(-1),'play');
});

test('unverified native wrapper integrity rejects activation and rolls back the stale binding',async()=>{
  const f=fixture({healthResponse:{enabled:true,showId:'fixture-show',bindingId:'wrong',guard:{ready:true,enabled:true,integrity:false}}});
  assert.equal((await f.control('bind-player',{tabId:7})).ok,false);
  assert.equal(f.state().playerTabId,null);assert.equal(f.state().playback,null);
});

test('advanced operation coordination covers writes and playback without wrapping native callbacks',async()=>{
  const actions=[];const f=fixture({coordination:{runExclusive:async(action,fn)=>{actions.push(action);return fn();}}});
  assert.equal((await f.control('configure',{settings:{showName:'Coordinated fixture'}})).ok,true);
  assert.equal((await f.control('status')).ok,true);
  assert.deepEqual(actions,['configure']);
  const denied=fixture({coordination:{runExclusive:async()=>{throw Error('Legacy writer still owns this show');}}});
  const result=await denied.control('create-playlist',{name:'Fixture playlist'});assert.equal(result.ok,false);assert.equal(denied.calls.mcp.length,0);
});

test('lyrics reload requires a healthy existing binding and preserves playback and advanced ownership',async()=>{
  const actions=[];const f=fixture({state:{playerTabId:7,entries:[entry()]},coordination:{runExclusive:async(action,fn)=>{actions.push(action);return fn();}}});
  assert.equal((await f.control('reload-lyrics')).ok,true);
  assert.deepEqual(actions,['reload-lyrics']);
  assert.equal(f.calls.messages.filter(call=>call.message.action==='reload-lyrics').length,1);
  assert.equal(f.calls.messages.some(call=>['enable','play','pause','next'].includes(call.message.action)),false);
  const stale=fixture({state:{entries:[entry()]}});assert.equal((await stale.control('reload-lyrics')).ok,false);
  assert.equal(stale.calls.messages.length,0);
  const legacy=fixture({state:{playerTabId:7},coordination:{runExclusive:async()=>{throw Error('Legacy owns this show');}}});
  assert.equal((await legacy.control('reload-lyrics')).ok,false);assert.equal(legacy.calls.messages.length,0);
});

test('host Pause interrupts an awaited Play while retaining advanced ownership checks',async()=>{
  let finishPlay;const coordinated=[];
  const f=fixture({state:{playerTabId:7,entries:[entry()]},coordination:{runExclusive:async(action,fn)=>{coordinated.push(action);return fn();}},onPlayerCommand:message=>message.action==='play'?new Promise(resolve=>{finishPlay=resolve;}):{ok:true}});
  const starting=f.control('play');
  for(let n=0;n<10&&!finishPlay;n++)await tick();
  assert.equal(typeof finishPlay,'function');
  const pausing=f.control('pause');await tick();await tick();
  const pauseSent=f.calls.messages.some(call=>call.message.action==='pause');
  finishPlay({ok:true});await starting;
  assert.equal((await pausing).ok,true);
  assert.equal(pauseSent,true,'Pause must not queue behind native readiness');
  assert.deepEqual(coordinated,['play','pause']);
  const denied=fixture({state:{playerTabId:7},coordination:{runExclusive:async()=>{throw Error('Legacy owns playback');}}});
  assert.equal((await denied.control('pause')).ok,false);
  assert.equal(denied.calls.messages.some(call=>call.message.action==='pause'),false);
});


test('Theatre Play reconnects its own persisted show after reload and rejects unrelated source tabs',async()=>{
  const f=fixture({state:{playerTabId:7,playlistId:PLAYLIST,entries:[entry()]}});f.reload();
  const result=await f.send({target:'catnap-show-intent',action:'toggle'},f.player);
  assert.equal(result.ok,true);assert.equal(result.handled,true);
  const actions=f.calls.messages.filter(x=>x.message.target==='catnap-show-tab').map(x=>x.message.action);
  assert.equal(actions.includes('enable'),true);assert.equal(actions.at(-1),'toggle');
  const foreign=await f.send({target:'catnap-show-intent',action:'toggle'},{...f.player,id:'other'});assert.equal(foreign.ok,false);
  const wrong=fixture({state:{playerTabId:99,playlistId:PLAYLIST,entries:[entry()]}});
  const untouched=await wrong.send({target:'catnap-show-intent',action:'toggle'},wrong.player);
  assert.equal(untouched.handled,false);assert.equal(wrong.calls.scripts.length,0);
});

test('Theatre request can start its matching destination playlist but cannot bind an unrelated playlist',async()=>{
  const f=fixture({managed:true,state:{playlistId:PLAYLIST,entries:[entry()]}});
  assert.equal((await f.send({target:'catnap-show-intent',action:'toggle'},f.player)).handled,true);
  const other=fixture({state:{playlistId:NEXT_PLAYLIST,entries:[entry()]}});
  assert.equal((await other.send({target:'catnap-show-intent',action:'toggle'},other.player)).handled,false);
  assert.equal(other.calls.scripts.length,0);
});


test('explicit return to ordinary playback clears a missing tab and safely disables an invalidated page',async()=>{
  const gone=fixture({state:{playerTabId:7}});gone.tabMap.delete(7);
  assert.equal((await gone.control('unbind-player')).ok,true);assert.equal(gone.state().playerTabId,null);
  const reloaded=fixture({state:{playerTabId:7},rejectDisable:true});
  assert.equal((await reloaded.control('unbind-player')).ok,true);assert.equal(reloaded.state().playerTabId,null);
  assert.equal(reloaded.calls.native.some(x=>x.action==='disable'),true);
});

test('local move and Hold survive inbox refresh, append new arrivals and never write or restart playback',async()=>{
  const entries=[entry('one'),entry('two',{sunoId:SECOND,sunoUrl:song(SECOND)}),entry('three')];
  const f=fixture({state:{entries,playerTabId:7,playback:{phase:'playing',current:{id:entries[0].id},generation:4,revision:1}},rows:[row('new'),row('three'),row('two',{suno_url:song(SECOND)}),row('one')]});
  assert.equal((await f.control('queue-move',{entryId:entries[2].id,beforeEntryId:entries[1].id})).ok,true);
  assert.equal((await f.control('queue-hold',{entryId:entries[1].id,held:true})).ok,true);
  await f.control('import');
  assert.deepEqual(f.state().entries.map(e=>e.submissionId),['one','three','new','two']);
  assert.equal(f.state().entries.find(e=>e.id===entries[1].id).hostHeld,true);
  assert.equal(f.state().playback.current.id,entries[0].id);assert.equal(f.state().playback.generation,4);
  assert.equal(f.calls.mcp.length,0);assert.equal(f.calls.native.length,0);
  assert.equal(f.calls.messages.filter(x=>x.message.target==='catnap-show-tab').every(x=>['status','update'].includes(x.message.action)),true);
});

test('queue edits protect the actual loaded identity even before its latest observation is saved',async()=>{
  const entries=[entry('one'),entry('two'),entry('three')];
  const f=fixture({state:{entries,playerTabId:7,playback:{phase:'ended',current:{id:entries[0].id},generation:1}},
    healthResponse:{enabled:true,showId:'fixture-show',bindingId:'fixture-lease',guard:{ready:true,enabled:true,integrity:true},playback:{phase:'playing',current:{id:entries[1].id}},stageOpen:true}});
  assert.equal((await f.control('queue-hold',{entryId:entries[1].id,held:true})).ok,false);
  assert.equal((await f.control('queue-move',{entryId:entries[2].id,beforeEntryId:entries[1].id})).ok,false);
  assert.equal((await f.control('queue-move',{entryId:entries[0].id,beforeEntryId:null})).ok,false);
  assert.equal(f.state().entries.some(e=>e.hostHeld),false);assert.equal(f.calls.mcp.length,0);
});

test('repeat policy and explicit releases persist and invalidate native order verification until synced',async()=>{
  const THIRD='12345678-1234-4234-8234-111111111111';
  const rows=[row('other2',{uploader_id:'other'}),row('other1',{uploader_id:'other'}),row('part3',{suno_url:song(THIRD)}),row('part2',{suno_url:song(SECOND)}),row('part1')];
  const f=fixture({managed:true,state:{playlistId:PLAYLIST},rows});await f.control('import');
  await f.control('configure',{settings:{repeatUploaderHold:true}});
  for(const id of ['part2','part3'])assert.equal((await f.control('queue-hold',{entryId:'fixture-inbox:'+id,held:false})).ok,true);
  await f.control('import');await f.control('sync-playlist');
  const parts=['part1','part2','part3'].map(id=>f.state().entries.find(e=>e.submissionId===id));assert.deepEqual(parts.map(e=>e.effectiveHeld),[false,false,false]);
  assert.equal(f.state().entries.find(e=>e.submissionId==='other2').effectiveHeld,true);
  assert.equal((await f.control('status')).data.readiness.playlistVerified,true);
  const writes=f.calls.mcp.length;
  await f.control('queue-move',{entryId:parts[2].id,beforeEntryId:parts[0].id});
  assert.equal((await f.control('status')).data.readiness.playlistVerified,false,'local ordering invalidates the native order snapshot');
  assert.equal(f.state().playlistDirty,true);
  assert.equal(f.calls.mcp.length,writes);
  await f.control('sync-playlist');assert.deepEqual(f.calls.mcp.at(-1).ids,[THIRD,SONG,SECOND]);
});

test('source-invalid Release and Inbox-only local-order controls are rejected without remote mutations',async()=>{
  const bad=entry('bad',{state:'held',holdReason:'No usable source',preferredSource:null,sunoUrl:null,sunoId:null});
  const f=fixture({state:{entries:[bad]}});
  assert.equal((await f.control('queue-hold',{entryId:bad.id,held:false})).ok,false);assert.equal(f.state().entries[0].state,'held');
  const creator=fixture({inboxOnly:true,state:{entries:[entry('one'),entry('two')]}});
  for(const [action,extra] of [['queue-move',{entryId:'fixture-inbox:two',beforeEntryId:'fixture-inbox:one'}],['queue-hold',{entryId:'fixture-inbox:one',held:true}],['configure',{settings:{repeatUploaderHold:true}}]])assert.equal((await creator.control(action,extra)).ok,false);
  assert.equal(creator.calls.messages.length,0);assert.equal(creator.calls.mcp.length,0);
  const foreign=await f.control('queue-hold',{entryId:bad.id,held:true},{...f.host,id:'other'});assert.equal(foreign.ok,false);
});

test('stable-entry Load resolves latest order and held stale selections cannot bind or interrupt a player',async()=>{
  const entries=[entry('one'),entry('two'),entry('three')],f=fixture({state:{entries}});
  await f.control('queue-move',{entryId:entries[2].id,beforeEntryId:entries[0].id});
  assert.equal((await f.control('load',{tabId:7,entryId:entries[1].id,index:0})).ok,true);
  const load=f.calls.messages.find(x=>x.message.action==='load');assert.equal(load.message.index,2,'stable ID wins over stale UI index');
  const held=fixture({state:{entries:[entry('one',{hostHeld:true})]}});
  assert.equal((await held.control('load',{tabId:7,entryId:'fixture-inbox:one'})).ok,false);
  assert.equal(held.calls.scripts.length,0);assert.equal(held.calls.messages.length,0);
});

test('trusted completion history persists after a newer AP observation and is never reset by refreshed inbox rows',async()=>{
  const entries=[entry('one'),entry('two'),entry('three')];
  const f=fixture({state:{entries,repeatUploaderHold:true,playerTabId:7},rows:[row('three'),row('two'),row('one')]});
  const later={target:'catnap-show-observed',showId:'fixture-show',bindingId:'fixture-lease',revision:7,
    playback:{phase:'playing',generation:3,current:{id:entries[2].id},source:'suno',completedEntryIds:[entries[0].id,entries[1].id,'unknown']}};
  assert.equal((await f.send(later,f.player)).ok,true);
  assert.equal((await f.send({...later,revision:6,playback:{phase:'ended',generation:2,current:{id:entries[1].id},source:'suno'}},f.player)).ok,false);
  await f.control('import');
  assert.equal(f.state().entries.slice(0,2).every(e=>Number.isFinite(e.playedAt)),true);
  assert.equal(f.state().entries.some(e=>e.effectiveHeld),false);
  assert.equal(f.state().playback.current.id,entries[2].id);
  assert.equal((await f.control('queue-move',{entryId:entries[0].id,beforeEntryId:null})).ok,false);
  const update=f.calls.messages.filter(x=>x.message.action==='update').at(-1).message;
  assert.equal(JSON.stringify(update).includes('PRIVATE-UPLOADER-NOTE'),false);assert.equal(JSON.stringify(update).includes('fixture-uploader'),false);
  assert.equal(Object.hasOwn(update.show.entries[0],'intakeOrder'),false);assert.equal(Object.hasOwn(update.show.entries[0],'uploaderId'),false);
});
test('local queue edits keep advanced ownership protection and retain saved changes if only Theatre handoff fails',async()=>{
  const entries=[entry('one'),entry('two')],actions=[];
  const f=fixture({state:{entries,playerTabId:7},coordination:{runExclusive:async(action,fn)=>{actions.push(action);return fn();}},onPlayerCommand:message=>message.action==='update'?{error:'Synthetic player context lost'}:{ok:true}});
  const result=await f.control('queue-hold',{entryId:entries[1].id,held:true});
  assert.equal(result.ok,true);assert.equal(f.state().entries[1].hostHeld,true);assert.match(f.state().error,/Local running order saved/);
  assert.deepEqual(actions,['queue-hold']);assert.equal(f.calls.mcp.length,0);
  const denied=fixture({state:{entries},coordination:{runExclusive:async()=>{throw Error('Another writer owns this show');}}});
  assert.equal((await denied.control('queue-move',{entryId:entries[1].id,beforeEntryId:entries[0].id})).ok,false);
  assert.deepEqual(denied.state().entries.map(e=>e.id),entries.map(e=>e.id));assert.equal(denied.calls.messages.length,0);
});

test('managed destinations require explicit safe ownership and Catnap-created destinations are owned automatically',async()=>{
  const f=fixture({state:{playlistId:PLAYLIST,entries:[entry()]},playlistRows:[{id:SONG}]});
  const before=await f.control('sync-playlist');assert.equal(before.ok,false);assert.match(before.error,/Manage this playlist/);assert.equal(f.calls.mcp.length,0);
  assert.equal((await f.control('claim-playlist')).ok,true);assert.deepEqual(f.state().playlistOwnership,{showId:'fixture-show',playlistId:PLAYLIST,managedIds:[SONG],verifiedOrder:[SONG]});
  assert.equal((await f.control('sync-playlist')).ok,true);assert.equal(f.calls.mcp.at(-1).operation,'ordered');
  await f.control('configure',{settings:{playlistId:NEXT_PLAYLIST}});assert.equal(f.state().playlistOwnership,null);
  const created=fixture();assert.equal((await created.control('create-playlist',{name:'Synthetic LP'})).ok,true);
  assert.deepEqual(created.state().playlistOwnership,{showId:'fixture-show',playlistId:PLAYLIST,managedIds:[],verifiedOrder:[]});
  const foreign=fixture({state:{playlistId:PLAYLIST,entries:[entry()]},playlistRows:[{id:SECOND}]});
  const rejected=await foreign.control('claim-playlist');assert.equal(rejected.ok,false);assert.match(rejected.error,/outside this show/);assert.equal(foreign.state().playlistOwnership,undefined);
  assert.deepEqual(foreign.calls.mcp.map(call=>call.operation),['read']);
});

test('Inbox-only keeps append-only FIFO without native removal or management controls',async()=>{
  const f=fixture({inboxOnly:true,state:{playlistId:PLAYLIST,entries:[entry('one'),entry('two',{sunoId:SECOND,sunoUrl:song(SECOND),hostHeld:true})]}});
  assert.equal((await f.control('sync-playlist')).ok,true);assert.equal(f.calls.mcp[0].operation,'reconcile');assert.deepEqual(f.calls.mcp[0].ids,[SONG,SECOND]);
  for(const action of ['claim-playlist','decline-entry'])assert.equal((await f.control(action,{entryId:'fixture-inbox:one'})).ok,false);
  assert.equal(f.calls.messages.length,0);
});

test('native projection follows actual completion order, ready order and excludes held, declined and external-only entries',async()=>{
  const THIRD='12345678-1234-4234-8234-111111111111',FOURTH='12345678-1234-4234-8234-222222222222';
  const entries=[entry('original-first',{playedAt:2,playedOrder:2}),entry('played-first',{sunoId:SECOND,sunoUrl:song(SECOND),playedAt:1,playedOrder:1}),entry('ready',{sunoId:THIRD,sunoUrl:song(THIRD)}),entry('host-held',{sunoId:FOURTH,sunoUrl:song(FOURTH),hostHeld:true}),entry('declined',{sunoId:FOURTH,state:'declined'}),entry('external',{sunoId:null,sunoUrl:null,preferredSource:'youtube',youtubeUrl:'https://www.youtube.com/watch?v=AbCdEfGhI12',youtubeId:'AbCdEfGhI12'})];
  const f=fixture({managed:true,state:{playlistId:PLAYLIST,entries}});assert.equal((await f.control('sync-playlist')).ok,true);
  assert.deepEqual(f.calls.mcp[0].ids,[SECOND,SONG,THIRD]);assert.equal(f.state().playlistDirty,false);
  await f.control('queue-hold',{entryId:'fixture-inbox:ready',held:true});assert.equal(f.state().playlistDirty,true);
  await f.control('sync-playlist');assert.deepEqual(f.calls.mcp.at(-1).ids,[SECOND,SONG]);assert.equal(f.state().lastPlaylistSync.orderVerified,true);
});

test('reconciliation rechecks live loaded identities before removal and permits a genuinely ended gap',async()=>{
  const entries=[entry('one'),entry('two',{sunoId:SECOND,sunoUrl:song(SECOND)})];
  const options={managed:true,state:{playlistId:PLAYLIST,entries,playerTabId:7,playback:{phase:'playing',current:{id:entries[0].id}}},
    healthResponse:{enabled:true,showId:'fixture-show',bindingId:'fixture-lease',guard:{ready:true,enabled:true,integrity:true},playback:{phase:'playing',current:{id:entries[1].id}}},
    onOrderedReconcile:async({bindings,ids})=>{
      assert.deepEqual([...bindings.protectedIds].sort(),[SONG,SECOND].sort());
      assert.equal(await bindings.beforeMutation({kind:'remove',ids:[SECOND]}),false);
      options.healthResponse.playback={phase:'ended',current:{id:entries[1].id}};
      assert.equal(await bindings.beforeMutation({kind:'remove',ids:[SECOND]}),true);
      return {confirmed:ids.length,missing:[],failures:[],orderVerified:true,actualOrder:ids};
    }};
  const f=fixture(options);assert.equal((await f.control('sync-playlist')).ok,true);assert.equal(f.calls.native.length,0);
});

test('confirmed decline makes one fixed bridge request, keeps current audio intact and removes the target from the managed projection',async()=>{
  const entries=[entry('one'),entry('two',{sunoId:SECOND,sunoUrl:song(SECOND)})];
  const f=fixture({managed:true,state:{playlistId:PLAYLIST,entries,playerTabId:7,playback:{phase:'playing',current:{id:entries[0].id}}}});
  assert.equal((await f.control('decline-entry',{entryId:entries[1].id})).ok,true);
  const request=f.calls.messages.filter(call=>call.message.target==='catnap-inbox');assert.equal(request.length,1);assert.deepEqual(request[0].message,{target:'catnap-inbox',action:'decline',inboxId:'fixture-inbox',mode:'lp',submissionId:'two'});
  assert.equal(f.state().entries.find(e=>e.id===entries[1].id).state,'declined');assert.equal(f.state().playback.current.id,entries[0].id);
  assert.equal(f.calls.messages.some(call=>['pause','stop','play','load'].includes(call.message.action)),false);assert.equal(f.calls.native.length,0);
  await tick();await tick();await f.control('sync-playlist');assert.deepEqual(f.calls.mcp.at(-1).ids,[SONG]);
  assert.equal((await f.control('decline-entry',{entryId:entries[0].id})).ok,false);assert.equal(f.calls.messages.filter(call=>call.message.target==='catnap-inbox').length,1);
});

test('uncertain decline is visible, held and never retried by refresh or polling',async()=>{
  const f=fixture({state:{entries:[entry()]},onDecline:()=>({ok:false,error:'Check uploader before manual retry.',uncertain:true})});
  const result=await f.control('decline-entry',{entryId:'fixture-inbox:one'});assert.equal(result.ok,false);assert.equal(result.uncertain,true);
  assert.equal(f.state().entries[0].hostHeld,true);assert.equal(f.state().entries[0].declineUncertain,true);assert.match(f.state().error,/Check uploader/);
  await f.control('import');await f.alarm();assert.equal(f.calls.messages.filter(call=>call.message.action==='decline').length,1);
});

test('a decline readback with a mismatched identity stays held and cannot be recorded as confirmed',async()=>{
  const f=fixture({state:{entries:[entry()]},onDecline:()=>({ok:true,data:{declined:true,inboxId:'other-inbox',submissionId:'one'}})});
  const result=await f.control('decline-entry',{entryId:'fixture-inbox:one'});assert.equal(result.ok,false);assert.equal(result.uncertain,true);
  assert.notEqual(f.state().entries[0].state,'declined');assert.equal(f.state().entries[0].hostHeld,true);
});

test('completion immediately releases and syncs one next uploader submission at the ready tail without delaying playback controls',async()=>{
  const entries=[entry('one',{uploaderId:'first'}),entry('other',{sunoId:SECOND,sunoUrl:song(SECOND),uploaderId:'other'}),entry('repeat',{sunoId:'12345678-1234-4234-8234-111111111111',sunoUrl:song('12345678-1234-4234-8234-111111111111'),uploaderId:'first'})];
  let release,started;const pending=new Promise(resolve=>{release=resolve;}),begun=new Promise(resolve=>{started=resolve;});
  const f=fixture({managed:true,state:{playlistId:PLAYLIST,entries,playerTabId:7,repeatUploaderHold:true},onOrderedReconcile:async({ids,bindings})=>{started();await pending;assert.equal(await bindings.isCurrent(),true);return {confirmed:ids.length,missing:[],failures:[],actualOrder:ids,orderVerified:true};}});
  const observed={target:'catnap-show-observed',showId:'fixture-show',bindingId:'fixture-lease',revision:1,playback:{phase:'ended',generation:1,current:{id:entries[0].id},source:'suno',completedEntryIds:[entries[0].id]}};
  assert.equal((await f.send(observed,f.player)).ok,true);await begun;
  const repeated=f.state().entries.find(e=>e.id===entries[2].id);assert.equal(repeated.effectiveHeld,false);assert.equal(repeated.repeatReleasedFor,entries[0].id);assert.equal(f.state().playlistSyncPending,true);
  assert.equal((await f.control('play')).ok,true,'Play completes while automatic provider work is waiting');
  assert.equal(f.calls.mcp.length,1);assert.deepEqual(f.calls.mcp[0].ids,entries.map(entry=>entry.sunoId));
  release();await tick();await tick();assert.equal(f.state().lastPlaylistSync.orderVerified,true);assert.equal(f.state().playlistSyncPending,false);
  assert.equal((await f.send({...observed,revision:2},f.player)).ok,true);await tick();assert.equal(f.calls.mcp.length,1,'repeated completion observation cannot duplicate native writes');
});

test('automatic sync stops a stale target and cannot overwrite a newer queue or destination result',async()=>{
  const entries=[entry('one'),entry('two',{sunoId:SECOND,sunoUrl:song(SECOND),uploaderId:'other'})];
  let release,started;const wait=new Promise(resolve=>{release=resolve;}),begun=new Promise(resolve=>{started=resolve;});
  const f=fixture({managed:true,state:{playlistId:PLAYLIST,entries,playerTabId:7},onOrderedReconcile:async({bindings})=>{started();await wait;assert.equal(await bindings.isCurrent(),false);throw Error('The show or destination changed.');}});
  await f.send({target:'catnap-show-observed',showId:'fixture-show',bindingId:'fixture-lease',revision:1,playback:{phase:'ended',generation:1,current:{id:entries[0].id},source:'suno',completedEntryIds:[entries[0].id]}},f.player);await begun;
  assert.equal((await f.control('configure',{settings:{playlistId:NEXT_PLAYLIST}})).ok,true);release();await tick();await tick();
  assert.equal(f.state().playlistId,NEXT_PLAYLIST);assert.equal(f.state().lastPlaylistSync,null);assert.equal(f.state().playlistOwnership,null);assert.equal(f.state().playlistSyncPending,false);
});

test('read-only decline recovery resolves exact Pending or Declined membership and never posts a second decline',async()=>{
  for(const status of ['pending','declined','unknown']){
    const f=fixture({declineStatus:status,state:{entries:[entry('one',{hostHeld:true,declineUncertain:true})]}});
    const result=await f.control('check-decline-entry',{entryId:'fixture-inbox:one'});assert.equal(result.ok,true);
    const saved=f.state().entries[0];assert.equal(saved.hostHeld,true);
    assert.equal(saved.declineUncertain,status==='unknown');assert.equal(saved.state==='declined',status==='declined');
    assert.deepEqual(f.calls.messages.filter(call=>call.message.target==='catnap-inbox').map(call=>call.message.action),['check-decline']);
    assert.equal(f.calls.mcp.length,0);
    if(status==='pending')assert.equal((await f.control('queue-hold',{entryId:saved.id,held:false})).ok,true);
    if(status==='unknown'){
      assert.equal((await f.control('queue-hold',{entryId:saved.id,held:false})).ok,false);
      assert.equal((await f.control('decline-entry',{entryId:saved.id})).ok,false);
      assert.equal(f.calls.messages.some(call=>call.message.action==='decline'),false);
    }
  }
  const creator=fixture({inboxOnly:true,state:{entries:[entry('one',{hostHeld:true,declineUncertain:true})]}});
  assert.equal((await creator.control('check-decline-entry',{entryId:'fixture-inbox:one'})).ok,false);assert.equal(creator.calls.messages.length,0);
});

test('AP polling and LP explicit sync reflect queue moves while held submissions remain outside native playlist',async()=>{
  const entries=[entry('one'),entry('two',{sunoId:SECOND,sunoUrl:song(SECOND)}),entry('held',{sunoId:'12345678-1234-4234-8234-111111111111',hostHeld:true})];
  const f=fixture({managed:true,state:{mode:'ap',playlistId:PLAYLIST,entries,watch:{enabled:true,until:Date.now()+3600000}},rows:[row('held',{submission_type:'AP'}),row('two',{submission_type:'AP',suno_url:song(SECOND)}),row('one',{submission_type:'AP'})]});
  await f.control('queue-move',{entryId:entries[1].id,beforeEntryId:entries[0].id});assert.equal(f.calls.mcp.length,0);
  await f.alarm();await tick();assert.deepEqual(f.calls.mcp.at(-1).ids,[SECOND,SONG]);assert.equal(f.state().lastPlaylistSync.orderVerified,true);
  assert.equal(f.state().entries.find(entry=>entry.submissionId==='held').hostHeld,true);
});

test('crossing held and ready groups is rejected before claiming an ineffective move was saved',async()=>{
  const f=fixture({state:{entries:[entry('ready'),entry('held',{hostHeld:true})]}});
  for(const [entryId,beforeEntryId] of [['fixture-inbox:held','fixture-inbox:ready'],['fixture-inbox:ready','fixture-inbox:held']]){
    const moved=await f.control('queue-move',{entryId,beforeEntryId});assert.equal(moved.ok,false);assert.match(moved.error,/Release a held entry/);
  }
  assert.deepEqual(f.state().entries.map(entry=>entry.submissionId),['ready','held']);assert.equal(f.calls.messages.length,0);assert.equal(f.calls.mcp.length,0);
});

test('selecting third then second keeps saved order and verified playlist clean through observations and inbox refresh',async()=>{
  const third='12345678-1234-4234-8234-111111111111';
  const entries=[entry('one',{uploaderId:'first'}),entry('two',{uploaderId:'second',sunoId:SECOND,sunoUrl:song(SECOND)}),entry('three',{uploaderId:'third',sunoId:third,sunoUrl:song(third)})];
  const sunoIds=entries.map(entry=>entry.sunoId),originalIds=entries.map(entry=>entry.id);
  const f=fixture({managed:true,state:{entries,playlistId:PLAYLIST,playerTabId:7,lastPlaylistSync:{context:{sunoIds},orderVerified:true}},
    rows:[row('three',{uploader_id:'third',suno_url:song(third)}),row('two',{uploader_id:'second',suno_url:song(SECOND)}),row('one',{uploader_id:'first'})]});
  for(const [revision,index] of [[1,2],[2,1]]){
    assert.equal((await f.control('load',{tabId:7,entryId:entries[index].id,index:0})).ok,true);
    const load=f.calls.messages.filter(call=>call.message.action==='load').at(-1).message;
    assert.equal(load.entryId,entries[index].id);assert.equal(load.index,index);
    assert.equal((await f.send({target:'catnap-show-observed',showId:'fixture-show',bindingId:'fixture-lease',revision,
      playback:{phase:'ready',generation:revision,current:{id:entries[index].id},source:'suno',completedEntryIds:[]}},f.player)).ok,true);
    assert.deepEqual(f.state().entries.map(entry=>entry.id),originalIds);
    assert.equal(f.state().playback.current.id,entries[index].id);assert.equal(f.state().playback.index,index);
    assert.equal(f.state().playlistDirty,false,'selection does not dirty an already verified playlist');
    await f.control('import');
    assert.deepEqual(f.state().entries.map(entry=>entry.id),originalIds);assert.equal(f.state().playlistDirty,false);
  }
  await tick();assert.equal(f.calls.mcp.length,0,'Load and observations do not request playlist writes');
});
