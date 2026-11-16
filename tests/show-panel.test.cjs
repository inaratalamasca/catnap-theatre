'use strict';
// SCRIPT_VERSION 0.6.0 — exercise host-facing controls with isolated fixture data.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const extension = path.join(__dirname,'../extension');
const tick = () => new Promise(resolve=>setImmediate(resolve));
async function settle() { await tick(); await tick(); }

async function fixture({mode='lp',inboxOnly=false,clipboardDenied=false,permissionGranted=true,connectError='',legacyGrant=false,linked=true,playerInitiallySelected=true,holdPlay=false}={}) {
  const dom = new JSDOM(fs.readFileSync(path.join(extension,'show.html'),'utf8'),{url:'chrome-extension://fixture/show.html',runScripts:'outside-only'});
  const w=dom.window, messages=[],copies=[],permissions=[];
  const first = {id:'fixture-inbox:1',title:'<img src=x onerror=alert(1)> Fixture song',artist:'Fixture artist',uploaderName:'<b>Uploader</b>',note:'<script data-injected>unsafe()</script> A private host note',disclaimer:'yes',preferredSource:'suno',sunoUrl:'https://suno.com/song/00000000-0000-4000-8000-000000000001',state:'pending'};
  const second = {id:'fixture-inbox:2',title:'Second song',artist:'Second artist',uploaderName:'Other uploader',note:'Second private note',disclaimer:'unknown',preferredSource:'youtube',youtubeUrl:'https://www.youtube.com/watch?v=abcdefghijk',state:'pending'};
  let state = {version:1,id:'fixture-show',mode,showName:'Fixture party',inboxId:'fixture-inbox',uploaderTabId:11,playerTabId:playerInitiallySelected?22:null,playlistId:'00000000-0000-4000-8000-000000000009',entries:[first,second],autoplay:false,warningSeconds:10,watch:{enabled:false},playback:{current:{id:first.id},phase:'playing',source:'suno',occurrenceId:'occurrence-1'},lastRead:{at:1,pending:2,held:0},lastPlaylistSync:{confirmed:2,missing:[]},error:''};
  let sunoConnected=!legacyGrant,sunoReconnectRequired=legacyGrant,finishPlay,poll;
  const delayed=new Map(),failures=new Map();
  const tabs=[{id:11,title:'Uploader',kind:'uploader'},{id:22,title:'Suno',kind:'suno'}];
  const snapshot=()=>({state:structuredClone(state),playbackHealth:{linked,phase:state.playback?.phase,reason:linked?'':'Theatre reloaded. Load or Play to reconnect.'},tabs,suno:{connected:sunoConnected,reconnectRequired:sunoReconnectRequired},version:'0.6.0'});
  w.setInterval=fn=>{poll=fn;return 0;};
  w.CatnapPackage={inboxOnly};
  w.chrome={permissions:{request:async value=>{permissions.push(value);return permissionGranted;}},runtime:{sendMessage:async message=>{
    messages.push(structuredClone(message));let data;
    const statusSnapshot=message.action==='status'?snapshot():null;
    const delay=delayed.get(message.action);if(delay){delayed.delete(message.action);await delay;}
    if(failures.has(message.action)){const error=failures.get(message.action);failures.delete(message.action);return {ok:false,error};}
    switch(message.action) {
      case 'status':data=statusSnapshot;break;
      case 'play':if(holdPlay)await new Promise(resolve=>{finishPlay=resolve;});data={done:true};break;
      case 'connect-suno':if(connectError)return {ok:false,error:connectError};sunoConnected=true;sunoReconnectRequired=false;data={connected:true};break;
      case 'disconnect-suno':sunoConnected=false;sunoReconnectRequired=false;data={connected:false};break;
      case 'configure':Object.assign(state,message.settings);data=structuredClone(state);break;
      case 'discover':data={inboxes:{lp:[{id:'fixture-inbox',name:'Fixture LP'},{id:'other-inbox',name:'Other LP'}],ap:[{id:'fixture-inbox',name:'Fixture AP'}]}};state.inboxes=structuredClone(data.inboxes);break;
      case 'import':data=structuredClone(state);break;
      case 'sync-playlist':data={confirmed:state.entries.length,missing:[],playerUpdateWarning:state.error||undefined};break;
      case 'load':state.playback={current:{id:state.entries[message.index].id},phase:'ready',source:state.entries[message.index].preferredSource};data={loaded:true};break;
      case 'watch':state.watch.enabled=message.enabled;data=structuredClone(state);break;
      case 'playlists':data=[{id:state.playlistId,name:'Fixture saved playlist'}];break;
      case 'create-playlist':state.playlistId='00000000-0000-4000-8000-000000000010';data={id:state.playlistId,name:message.name,visibility:message.visibility};break;
      case 'announcement':{
        const entry=state.entries.find(item=>item.id===state.playback.current.id),url=state.playback.source==='youtube'?entry.youtubeUrl:entry.sunoUrl;
        data={text:'Now playing: '+entry.title+'\nSubmitted by: '+entry.uploaderName+'\n'+url,context:{url,uploaderName:entry.uploaderName,...(message.includeNotes?{uploaderNote:entry.note}:{})}};break;
      }
      default:data={done:true};
    }
    return {ok:true,data};
  }}};
  Object.defineProperty(w.navigator,'clipboard',{configurable:true,value:{writeText:async value=>{if(clipboardDenied)throw Error('Clipboard permission denied');copies.push(value);}}});
  w.eval(fs.readFileSync(path.join(extension,'show-panel.js'),'utf8'));await settle();
  return {dom,w,messages,copies,permissions,tabs,releasePlay:()=>finishPlay?.(),setConnected:value=>{sunoConnected=value;},state:()=>state,element:id=>w.document.getElementById(id),
    rejectNext:(action,error)=>failures.set(action,error),
    holdNext(action){let release;delayed.set(action,new Promise(resolve=>{release=resolve;}));return release;},
    async poll(){poll();await settle();},
    async click(id){w.document.getElementById(id).click();await settle();},async change(id,value){const control=w.document.getElementById(id);if(control.type==='checkbox')control.checked=value;else control.value=value;control.dispatchEvent(new w.Event('change',{bubbles:true}));await settle();}};
}

test('LP starts with autoplay off and disabled; AP permits a separate explicit toggle',async t=>{
  const f=await fixture();t.after(()=>f.dom.window.close());
  assert.equal(f.element('autoplay').checked,false);assert.equal(f.element('autoplay').disabled,true);
  await f.change('mode','ap');
  assert.equal(f.element('autoplay').disabled,false);assert.equal(f.element('autoplay').checked,false);
  await f.change('autoplay',true);
  assert.equal(f.state().autoplay,true);
  const configured=f.messages.filter(message=>message.action==='configure');
  assert.deepEqual(configured.map(message=>message.settings),[{mode:'ap'},{autoplay:true}]);
  assert.equal(f.messages.some(message=>message.action==='play'),false);
});

test('host notes and uploader names render as text, with an explicit disclaimer badge',async t=>{
  const f=await fixture();t.after(()=>f.dom.window.close());
  assert.equal(f.element('current-note').textContent,f.state().entries[0].note);
  assert.equal(f.element('current-note').querySelector('script'),null);
  assert.equal(f.element('current-title').querySelector('img'),null);
  assert.ok(f.element('current-credit').textContent.includes('<b>Uploader</b>'));
  assert.equal(f.element('current-credit').querySelector('b'),null);
  assert.equal(f.element('current-warning').dataset.warning,'yes');
  assert.match(f.element('current-warning').textContent,/requested a content disclaimer/);
});

test('queue Load, Load next and Load previous never send Play',async t=>{
  const f=await fixture();t.after(()=>f.dom.window.close());
  f.w.document.querySelectorAll('#queue button')[1].click();await settle();
  assert.deepEqual(f.messages.filter(message=>message.action==='load').map(message=>message.index),[1]);
  assert.equal(f.element('current-title').textContent,'Second song');
  assert.equal(f.element('current-warning').dataset.warning,'unknown');
  await f.click('next');await f.click('previous');
  assert.equal(f.messages.some(message=>message.action==='play'),false);
  assert.match(f.element('status').textContent,/Loaded quietly/);
});

test('copy now playing uses prepared active-source text and does not send chat or notes',async t=>{
  const f=await fixture();t.after(()=>f.dom.window.close());
  f.w.document.querySelectorAll('#queue button')[1].click();await settle();
  await f.click('copy-playing');
  assert.equal(f.copies.length,1);assert.ok(f.copies[0].includes('https://www.youtube.com/watch?v=abcdefghijk'));
  assert.ok(f.copies[0].includes('Submitted by: Other uploader'));
  assert.equal(f.copies[0].includes('Second private note'),false);
  assert.match(f.element('status').textContent,/Copied/);
  assert.deepEqual(f.messages.filter(message=>message.action==='announcement').map(message=>message.includeNotes),[undefined]);
  assert.equal(f.messages.some(message=>/post|discord|send-chat/.test(message.action)),false);
});

test('assistant context includes host-only notes only after explicit checkbox selection',async t=>{
  const f=await fixture();t.after(()=>f.dom.window.close());
  await f.click('copy-context');assert.equal(JSON.parse(f.copies[0]).uploaderNote,undefined);
  f.element('include-notes').checked=true;await f.click('copy-context');
  assert.equal(JSON.parse(f.copies[1]).uploaderNote,f.state().entries[0].note);
  assert.deepEqual(f.messages.filter(message=>message.action==='announcement').map(message=>message.includeNotes),[false,true]);
});

test('denied clipboard access exposes a visible manually selectable fallback',async t=>{
  const f=await fixture({clipboardDenied:true});t.after(()=>f.dom.window.close());
  await f.click('copy-playing');
  assert.equal(f.element('copy-fallback').hidden,false);
  assert.ok(f.element('copy-fallback').value.includes('Submitted by:'));
  assert.equal(f.element('copy-fallback').closest('details').open,true,'fallback must not remain inside collapsed details');
  assert.equal(f.w.document.activeElement,f.element('copy-fallback'));
});

test('Inbox-only flavor hides playback, current-song copying and per-row Load controls',async t=>{
  const f=await fixture({inboxOnly:true});t.after(()=>f.dom.window.close());
  assert.equal(f.element('theatre-playback').hidden,true);assert.equal(f.element('current-card').hidden,true);
  assert.equal([...f.w.document.querySelectorAll('#queue button')].every(button=>button.hidden),true);
  assert.equal(f.w.document.querySelector('h1').textContent,'Inbox → playlist');
  assert.match(f.w.document.title,/playlist creator/);
  assert.equal(f.element('mode').querySelector('[value=lp]').textContent,'Listening party');
  assert.match(f.element('queue-help').textContent,/Suno controls playback/);
});

test('playlist membership result uses numeric confirmed count and stays distinct from playback',async t=>{
  const f=await fixture();t.after(()=>f.dom.window.close());
  assert.match(f.element('playlist-status').textContent,/2 confirmed · 0 missing/);
  await f.click('playlists');
  assert.equal(f.element('playlist').selectedOptions[0].textContent,'Fixture saved playlist');
  f.element('new-playlist-name').value='AP fixture';await f.click('create-playlist');
  const request=f.messages.find(message=>message.action==='create-playlist');
  assert.equal(request.name,'AP fixture');assert.equal(request.visibility,'private');
  assert.equal(f.messages.some(message=>message.action==='play'),false);
});


test('Connect Suno requests only its authorization host and does not attempt login after a denied grant',async t=>{
  const f=await fixture({permissionGranted:false});t.after(()=>f.dom.window.close());
  await f.click('connect-suno');
  assert.deepEqual(JSON.parse(JSON.stringify(f.permissions)),[{origins:['https://studio-api-prod.suno.com/*']}]);
  assert.equal(f.messages.some(message=>message.action==='connect-suno'),false);
  assert.match(f.element('suno-status').textContent,/not granted/);
});

test('authorization error stays beside Connect Suno after background status refresh',async t=>{
  const f=await fixture({connectError:'Suno client registration could not reach Suno.'});t.after(()=>f.dom.window.close());
  await f.click('connect-suno');
  assert.equal(f.messages.filter(message=>message.action==='connect-suno').length,1);
  assert.equal(f.element('suno-status').textContent,'Suno client registration could not reach Suno.');
  assert.equal(f.element('status').textContent,f.element('suno-status').textContent);
  await f.change('show-name','Another fixture name');
  assert.equal(f.element('suno-status').textContent,'Suno client registration could not reach Suno.');
  await f.click('disconnect-suno');assert.match(f.element('suno-status').textContent,/Suno not connected/);
});


test('successful connection status follows later worker authorization loss',async t=>{
  const f=await fixture();t.after(()=>f.dom.window.close());
  await f.click('connect-suno');assert.match(f.element('suno-status').textContent,/Suno connected/);
  f.setConnected(false);await f.change('show-name','Refresh fixture');
  assert.match(f.element('suno-status').textContent,/Suno not connected/);
});


test('an older grant prompts updated consent and clears that prompt after successful Connect',async t=>{
  const f=await fixture({legacyGrant:true});t.after(()=>f.dom.window.close());
  assert.match(f.element('suno-status').textContent,/updated permissions.*Connect Suno/);
  await f.click('connect-suno');
  assert.match(f.element('suno-status').textContent,/Suno connected/);
  assert.doesNotMatch(f.element('suno-status').textContent,/updated permissions/);
});


test('stale page connection does not display saved Manual advance or enable stale song copying',async t=>{
  const f=await fixture({linked:false});t.after(()=>f.dom.window.close());
  assert.match(f.element('playback-status').textContent,/reloaded.*reconnect/);
  assert.doesNotMatch(f.element('playback-status').textContent,/Manual advance/);
  assert.equal(f.element('copy-playing').disabled,true);
  assert.equal(f.element('current-title').textContent,'No song loaded');
  await f.click('play');assert.equal(f.messages.find(m=>m.action==='play').tabId,22);
  f.w.document.querySelector('#queue button').click();await settle();
  assert.equal(f.messages.find(m=>m.action==='load').tabId,22);
});


test('choosing a source tab enables first row Load without an extra binding action',async t=>{
  const f=await fixture({linked:false,playerInitiallySelected:false});t.after(()=>f.dom.window.close());
  assert.equal(f.w.document.querySelector('#queue button').disabled,true);
  await f.change('player-tab','22');
  assert.equal(f.w.document.querySelector('#queue button').disabled,false);
  f.w.document.querySelector('#queue button').click();await settle();
  assert.equal(f.messages.find(m=>m.action==='load').tabId,22);
});

test('an unbound source selection survives tab-title refresh without connecting or playing',async t=>{
  const f=await fixture({linked:false,playerInitiallySelected:false});t.after(()=>f.dom.window.close());
  await f.change('player-tab','22');
  f.tabs.find(tab=>tab.id===22).title='A new native song title | Suno';
  await f.change('show-name','Refresh without playback');
  assert.equal(f.element('player-tab').value,'22');
  assert.equal(f.w.document.querySelector('#queue button').disabled,false);
  assert.equal(f.messages.some(m=>['bind-player','play','load'].includes(m.action)),false);
});

test('a closed chosen source holds instead of silently selecting another Suno tab',async t=>{
  const f=await fixture({linked:false,playerInitiallySelected:false});t.after(()=>f.dom.window.close());
  await f.change('player-tab','22');
  f.tabs.splice(f.tabs.findIndex(tab=>tab.id===22),1,{id:23,title:'Other Suno tab',kind:'suno'});
  await f.change('show-name','Refresh after closed source');
  assert.equal(f.element('player-tab').value,'');
  assert.equal(f.w.document.querySelector('#queue button').disabled,true);
  assert.equal(f.messages.some(m=>['bind-player','play','load'].includes(m.action)),false);
});

test('the host Pause button remains effective while Play is waiting for readiness',async t=>{
  const f=await fixture({holdPlay:true});t.after(()=>f.dom.window.close());
  await f.click('play');assert.equal(f.w.document.body.getAttribute('aria-busy'),'true');
  await f.click('pause');
  assert.equal(f.messages.filter(m=>m.action==='pause').length,1);
  assert.equal(f.w.document.body.getAttribute('aria-busy'),'true','Pause must not unlock other pending actions');
  f.releasePlay();await settle();assert.equal(f.w.document.body.hasAttribute('aria-busy'),false);
});

test('Inbox exposes a dedicated Reload lyrics action without playback and disables it for unlinked or video entries',async t=>{
  const f=await fixture();t.after(()=>f.dom.window.close());
  assert.equal(f.element('reload-lyrics').textContent,'Reload lyrics');assert.equal(f.element('reload-lyrics').disabled,false);
  await f.click('reload-lyrics');assert.equal(f.messages.filter(m=>m.action==='reload-lyrics').length,1);
  assert.equal(f.messages.some(m=>['play','pause','bind-player','next'].includes(m.action)),false);
  f.w.document.querySelectorAll('#queue button')[1].click();await settle();assert.equal(f.element('reload-lyrics').disabled,true);
  const stale=await fixture({linked:false});t.after(()=>stale.dom.window.close());assert.equal(stale.element('reload-lyrics').disabled,true);
});

test('saved inbox selection remains visible before discovery and a saved catalogue restores choices',async t=>{
  const f=await fixture();t.after(()=>f.dom.window.close());
  assert.equal(f.element('inbox').value,'fixture-inbox');
  assert.match(f.element('inbox').selectedOptions[0].textContent,/Selected inbox/);
  f.state().inboxes={lp:[{id:'fixture-inbox',name:'Saved fixture LP'},{id:'other-inbox',name:'Saved other LP'}],ap:[]};
  await f.poll();
  assert.equal(f.element('inbox').selectedOptions[0].textContent,'Saved fixture LP');
  assert.deepEqual([...f.element('inbox').options].map(option=>option.value),['','fixture-inbox','other-inbox']);
  assert.equal(f.messages.some(message=>['discover','import','play','bind-player'].includes(message.action)),false);
});

test('one immediate Read waits for its selected inbox and later input values cannot replace captured choices',async t=>{
  const f=await fixture();t.after(()=>f.dom.window.close());
  await f.click('discover');
  const release=f.holdNext('configure');
  await f.change('inbox','other-inbox');
  await f.click('import');
  assert.equal(f.messages.filter(message=>message.action==='import').length,0);
  assert.equal(f.element('import').disabled,true,'queued read remains visibly pending');
  f.element('inbox').value='fixture-inbox';
  release();await settle();await settle();
  const steps=f.messages.filter(message=>message.action==='import'||message.action==='configure'&&message.settings.inboxId);
  assert.deepEqual(steps.map(message=>message.action),['configure','import']);
  assert.equal(steps[0].settings.inboxId,'other-inbox');
  assert.equal(f.state().inboxId,'other-inbox');assert.equal(f.element('inbox').value,'other-inbox');
  assert.equal(f.element('import').disabled,false);assert.match(f.element('status').textContent,/Inbox read/);
});

test('Connect keeps its permission request inside the click and one Load my playlists waits behind authorization',async t=>{
  const f=await fixture({legacyGrant:true});t.after(()=>f.dom.window.close());
  const release=f.holdNext('configure');await f.change('show-name','Queued setup');
  await f.click('connect-suno');await f.click('playlists');
  assert.equal(f.permissions.length,1,'host permission is requested immediately, not after the pending worker action');
  assert.equal(f.messages.some(message=>message.action==='connect-suno'),false);
  assert.equal(f.element('connect-suno').disabled,true);assert.equal(f.element('playlists').disabled,true);
  release();await settle();await settle();
  assert.deepEqual(f.messages.filter(message=>['connect-suno','playlists'].includes(message.action)).map(message=>message.action),['connect-suno','playlists']);
  assert.equal(f.element('connect-suno').disabled,false);assert.equal(f.element('playlists').disabled,false);
  assert.equal(f.element('playlist').selectedOptions[0].textContent,'Fixture saved playlist');
});

test('repeated pending Create and Sync clicks cause one write each and retain the captured name',async t=>{
  const f=await fixture();t.after(()=>f.dom.window.close());
  const release=f.holdNext('configure');await f.change('show-name','Pending setup');
  f.element('new-playlist-name').value='Captured playlist';await f.click('create-playlist');await f.click('create-playlist');
  f.element('new-playlist-name').value='Later edit';await f.click('sync-playlist');await f.click('sync-playlist');
  assert.equal(f.messages.some(message=>['create-playlist','sync-playlist'].includes(message.action)),false);
  release();await settle();await settle();
  assert.equal(f.messages.filter(message=>message.action==='create-playlist').length,1);
  assert.equal(f.messages.find(message=>message.action==='create-playlist').name,'Captured playlist');
  assert.equal(f.messages.filter(message=>message.action==='sync-playlist').length,1);
  assert.equal(f.element('playlist').value,f.state().playlistId);
  assert.equal(f.element('create-playlist').disabled,false);assert.equal(f.element('sync-playlist').disabled,false);
});

test('a late poll cannot replace the saved show with its older snapshot',async t=>{
  const f=await fixture();t.after(()=>f.dom.window.close());
  const release=f.holdNext('status');await f.poll();
  await f.change('show-name','New saved show');
  assert.equal(f.element('show-name').value,'New saved show');
  release();await settle();assert.equal(f.element('show-name').value,'New saved show');
});

test('saved inbox read with a stale player reports its partial handoff clearly without starting playback',async t=>{
  const f=await fixture();t.after(()=>f.dom.window.close());
  f.state().error='Inbox read and running order saved. Theatre did not receive the update: Fixture connection is stale.';
  await f.click('import');
  assert.match(f.element('status').textContent,/running order saved.*did not receive/);
  assert.match(f.element('inbox-status').textContent,/running order saved.*did not receive/);
  assert.equal(f.w.document.querySelectorAll('#queue li').length,2);
  assert.equal(f.messages.filter(message=>message.action==='import').length,1);
  assert.equal(f.messages.some(message=>['bind-player','play','load'].includes(message.action)),false);
});

test('verified playlist with a stale Theatre shows the saved result instead of asking for another write',async t=>{
  const f=await fixture();t.after(()=>f.dom.window.close());
  f.state().error='Suno playlist verified and saved. Theatre did not receive the update: Fixture stale player.';
  await f.click('sync-playlist');
  assert.match(f.element('status').textContent,/playlist verified and saved.*did not receive/);
  assert.match(f.element('playlist-status').textContent,/2 confirmed · 0 missing/);
  assert.equal(f.messages.filter(message=>message.action==='sync-playlist').length,1);
});

test('busy playback never queues an extra Play and Pause stays available',async t=>{
  const f=await fixture({holdPlay:true});t.after(()=>f.dom.window.close());
  await f.click('play');await f.click('play');
  assert.equal(f.messages.filter(message=>message.action==='play').length,1);
  assert.match(f.element('status').textContent,/Please wait/);
  await f.click('pause');assert.equal(f.messages.filter(message=>message.action==='pause').length,1);
  f.releasePlay();await settle();assert.equal(f.messages.filter(message=>message.action==='play').length,1);
});

test('failed inbox or playlist selection cancels its queued followup instead of using the previous target',async t=>{
  for(const [field,followup] of [['inbox','import'],['playlist','sync-playlist']]){
    const f=await fixture();t.after(()=>f.dom.window.close());
    await f.click('discover');
    const next=field==='inbox'?'other-inbox':'00000000-0000-4000-8000-000000000011';
    if(field==='playlist')f.element(field).append(new f.w.Option('Other destination',next));
    const prior=f.state()[field==='inbox'?'inboxId':'playlistId'];
    f.rejectNext('configure','Fixture selection could not be saved');
    const release=f.holdNext('configure');await f.change(field,next);await f.click(followup);
    release();await settle();await settle();
    assert.equal(f.messages.some(message=>message.action===followup),false);
    assert.equal(f.state()[field==='inbox'?'inboxId':'playlistId'],prior);
    assert.match(f.element('status').textContent,/Previous step failed.*selection could not be saved.*click the next step again/);
    assert.equal(f.element(field).value,prior);
    assert.equal(f.element(followup).disabled,false);
    await f.click(followup);assert.equal(f.messages.filter(message=>message.action===followup).length,1,'a later explicit click is not permanently blocked');
  }
});

test('pending Sync is a single explicit operation and source-tab changes preserve unsaved setup choices',async t=>{
  const f=await fixture();t.after(()=>f.dom.window.close());await f.click('discover');
  const release=f.holdNext('configure');await f.change('inbox','other-inbox');
  await f.change('player-tab','22');assert.equal(f.element('inbox').value,'other-inbox');
  await f.click('sync-playlist');await f.click('sync-playlist');
  assert.equal(f.element('sync-playlist').disabled,true);
  release();await settle();await settle();
  assert.equal(f.messages.filter(message=>message.action==='sync-playlist').length,1);
  assert.equal(f.state().inboxId,'other-inbox');
});
