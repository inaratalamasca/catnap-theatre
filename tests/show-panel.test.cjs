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
  let pendingPermission;
  const first = {id:'fixture-inbox:1',title:'<img src=x onerror=alert(1)> Fixture song',artist:'Fixture artist',uploaderName:'<b>Uploader</b>',note:'<script data-injected>unsafe()</script> A private host note',disclaimer:'yes',preferredSource:'suno',sunoUrl:'https://suno.com/song/00000000-0000-4000-8000-000000000001',state:'pending'};
  const second = {id:'fixture-inbox:2',title:'Second song',artist:'Second artist',uploaderName:'Other uploader',note:'Second private note',disclaimer:'unknown',preferredSource:'youtube',youtubeUrl:'https://www.youtube.com/watch?v=abcdefghijk',state:'pending'};
  let state = {version:1,id:'fixture-show',mode,showName:'Fixture party',inboxId:'fixture-inbox',uploaderTabId:11,playerTabId:playerInitiallySelected?22:null,playlistId:'00000000-0000-4000-8000-000000000009',entries:[first,second],autoplay:false,warningSeconds:10,watch:{enabled:false},playback:{current:{id:first.id},phase:'playing',source:'suno',occurrenceId:'occurrence-1'},lastRead:{at:1,pending:2,held:0},lastPlaylistSync:{confirmed:2,missing:[]},error:''};
  let sunoConnected=!legacyGrant,sunoReconnectRequired=legacyGrant,finishPlay,poll,readinessOverrides={};
  const delayed=new Map(),failures=new Map();
  const tabs=[{id:11,title:'Uploader',kind:'uploader'},{id:22,title:'Suno',kind:'suno'}];
  const snapshot=()=>({state:structuredClone(state),playbackHealth:{linked,phase:state.playback?.phase,reason:linked?'':'Theatre reloaded. Load or Play to reconnect.'},tabs,suno:{connected:sunoConnected,reconnectRequired:sunoReconnectRequired},readiness:{sunoAuthorized:sunoConnected,uploaderPermission:true,uploaderTabOpen:true,inboxSelected:!!state.inboxId,inboxAccessChecked:true,inboxCheckedAt:1,pendingRead:true,playlistSelected:!!state.playlistId,playlistVerified:true,...readinessOverrides},version:'0.6.0'});
  w.setInterval=fn=>{poll=fn;return 0;};
  w.CatnapPackage={inboxOnly};
  w.chrome={permissions:{request:async value=>{permissions.push(value);if(pendingPermission){const request=pendingPermission;pendingPermission=null;return request;}return permissionGranted;}},runtime:{sendMessage:async message=>{
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
      case 'load':{const entry=state.entries.find(item=>item.id===message.entryId);state.playback={current:{id:entry.id},phase:'ready',source:entry.preferredSource};data={loaded:true};break;}
      case 'queue-move':{const from=state.entries.findIndex(item=>item.id===message.entryId),[entry]=state.entries.splice(from,1),to=message.beforeEntryId===null?state.entries.length:state.entries.findIndex(item=>item.id===message.beforeEntryId);state.entries.splice(to,0,entry);data=structuredClone(state);break;}
      case 'queue-hold':{const entry=state.entries.find(item=>item.id===message.entryId);entry.hostHeld=message.held;entry.effectiveHeld=message.held;entry.effectiveHoldReason=message.held?'Held by host.':'';if(!message.held)entry.repeatHoldOverride=true;data=structuredClone(state);break;}
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
    setReadiness:value=>{readinessOverrides=value;},
    rejectNext:(action,error)=>failures.set(action,error),
    holdPermission(){let release;pendingPermission=new Promise(resolve=>{release=resolve;});return release;},
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

test('the verified LP connection has a persistent active Inbox mode and matching active button',async t=>{
  const f=await fixture();t.after(()=>f.dom.window.close());
  assert.equal(f.element('control-mode-title').textContent,'Inbox show controls active');
  assert.equal(f.element('control-mode').dataset.mode,'inbox');
  assert.match(f.element('control-mode-detail').textContent,/LP · manual advance.*stop at the end.*Load.*quietly/);
  assert.match(f.element('bound-player').textContent,/Currently controlled: Suno/);
  assert.equal(f.element('bind-player').getAttribute('aria-pressed'),'true');assert.equal(f.element('bind-player').disabled,true);
  assert.equal(f.element('unbind-player').getAttribute('aria-pressed'),'false');assert.equal(f.element('unbind-player').disabled,false);
  await f.click('playlists');
  assert.equal(f.element('control-mode-title').textContent,'Inbox show controls active','ordinary action status cannot replace the mode card');
  assert.equal(f.messages.some(message=>['bind-player','play'].includes(message.action)),false);
});

test('active AP mode distinguishes manual advance from explicitly enabled autoplay',async t=>{
  const f=await fixture({mode:'ap'});t.after(()=>f.dom.window.close());
  assert.match(f.element('control-mode-detail').textContent,/AP · manual advance/);
  await f.change('autoplay',true);assert.match(f.element('control-mode-detail').textContent,/AP · autoplay on.*starts automatically/);
  assert.equal(f.messages.some(message=>message.action==='play'),false);
});

test('an unbound show displays ordinary Suno mode even after choosing a tab',async t=>{
  const f=await fixture({linked:false,playerInitiallySelected:false});t.after(()=>f.dom.window.close());
  assert.equal(f.element('control-mode-title').textContent,'Suno playlist controls');
  assert.equal(f.element('control-mode').dataset.mode,'suno');assert.equal(f.element('bound-player').hidden,true);
  assert.equal(f.element('unbind-player').getAttribute('aria-pressed'),'true');assert.equal(f.element('unbind-player').disabled,true);
  await f.change('player-tab','22');
  assert.equal(f.element('control-mode-title').textContent,'Suno playlist controls');
  assert.match(f.element('selected-player').textContent,/Selecting a tab does not connect it/);
  assert.equal(f.element('bind-player').disabled,false);
  assert.equal(f.messages.some(message=>['bind-player','play','load'].includes(message.action)),false);
});

test('an unhealthy saved binding warns about uncertain control without claiming ordinary Suno',async t=>{
  const f=await fixture({linked:false});t.after(()=>f.dom.window.close());
  assert.equal(f.element('control-mode-title').textContent,'Inbox show needs reconnecting');
  assert.equal(f.element('control-mode').dataset.mode,'reconnect');
  assert.match(f.element('control-mode-detail').textContent,/reloaded.*uncertain/);
  assert.match(f.element('bound-player').textContent,/Saved connection: Suno.*not verified/);
  assert.equal(f.element('bind-player').getAttribute('aria-pressed'),'false');assert.equal(f.element('bind-player').disabled,false);
  assert.equal(f.element('unbind-player').getAttribute('aria-pressed'),'false');assert.equal(f.element('unbind-player').disabled,false);
});

test('choosing another tab keeps the actual controlled target visible until explicit activation',async t=>{
  const f=await fixture();t.after(()=>f.dom.window.close());
  f.tabs.push({id:23,title:'Other Suno tab',kind:'suno'});await f.poll();await f.change('player-tab','23');
  assert.match(f.element('bound-player').textContent,/Currently controlled: Suno/);
  assert.match(f.element('selected-player').textContent,/Selected tab: Other Suno tab.*has not changed the controlled tab/);
  assert.equal(f.element('bind-player').getAttribute('aria-pressed'),'false');assert.equal(f.element('bind-player').disabled,false);
  assert.equal(f.element('control-mode-title').textContent,'Inbox show controls active');
  assert.equal(f.messages.some(message=>['bind-player','load','play'].includes(message.action)),false);
});

test('inbox summary prominently reports the read snapshot and retains counters separately from an error',async t=>{
  const f=await fixture();t.after(()=>f.dom.window.close());
  f.state().lastRead={at:1794765600000,pending:11,held:0};f.state().error='Fixture read needs attention';await f.poll();
  assert.match(f.element('inbox-status').textContent,/^Inbox Submissions: 11 Pending · 0 held in show · \(.+\)$/);
  assert.equal(f.element('inbox-status').tagName,'P');assert.equal(f.element('inbox-status').getAttribute('role'),'status');
  assert.equal(f.element('inbox-error').hidden,false);assert.equal(f.element('inbox-error').textContent,'Fixture read needs attention');
  f.state().lastRead=null;f.state().error='';await f.poll();
  assert.equal(f.element('inbox-status').textContent,'Inbox Submissions: Not read yet');assert.equal(f.element('inbox-error').hidden,true);
});

test('Inbox-only always explains that Suno controls playback and exposes no managed-mode claim',async t=>{
  const f=await fixture({inboxOnly:true});t.after(()=>f.dom.window.close());
  assert.equal(f.element('control-mode-title').textContent,'Suno playlist controls');
  assert.match(f.element('control-mode-detail').textContent,/extension updates playlists.*Suno controls song playback/);
  assert.equal(f.element('bound-player').hidden,true);assert.equal(f.element('selected-player').hidden,true);
});

test('active integration readiness says Authorized separately from unverified playlist membership',async t=>{
  const f=await fixture();t.after(()=>f.dom.window.close());f.setReadiness({playlistVerified:false});await f.poll();
  assert.equal(f.element('suno-connection-label').textContent,'Authorized');assert.equal(f.element('suno-connection').dataset.state,'ready');
  assert.match(f.element('inbox-connection-label').textContent,/Ready · last access checked/);
  assert.match(f.element('ready-suno-label').textContent,/Authorized · playlist verification is separate/);
  assert.equal(f.element('ready-verification').dataset.state,'missing');assert.match(f.element('ready-verification-label').textContent,/Not verified/);
  assert.equal(f.element('ready-verification').querySelector('.status-dot').getAttribute('aria-hidden'),'true');
  assert.doesNotMatch(f.element('suno-connection-label').textContent,/connected|working/i);
});

test('ordinary Suno mode greys the top integrations without disabling preparation or clearing detailed readiness',async t=>{
  const f=await fixture({linked:false,playerInitiallySelected:false});t.after(()=>f.dom.window.close());
  assert.equal(f.element('suno-connection').dataset.state,'inactive');assert.equal(f.element('inbox-connection').dataset.state,'inactive');
  assert.equal(f.element('suno-connection-label').textContent,'Not in use');assert.equal(f.element('inbox-connection-label').textContent,'Not in use');
  assert.match(f.element('integration-use').textContent,/still prepare/);
  assert.equal(f.element('ready-suno').dataset.state,'ready');assert.equal(f.element('ready-pending').dataset.state,'ready');
  assert.equal(f.element('discover').disabled,false);assert.equal(f.element('import').disabled,false);assert.equal(f.element('connect-suno').disabled,false);
  await f.click('discover');assert.equal(f.messages.filter(message=>message.action==='discover').length,1);
  assert.equal(f.messages.some(message=>['bind-player','play'].includes(message.action)),false);
});

test('Inbox-only keeps service readiness active while explaining that the creator does not control playback',async t=>{
  const f=await fixture({inboxOnly:true,linked:false,playerInitiallySelected:false});t.after(()=>f.dom.window.close());
  assert.equal(f.element('integration-readiness').dataset.inUse,'true');assert.equal(f.element('suno-connection-label').textContent,'Authorized');
  assert.match(f.element('integration-use').textContent,/Playlist creator in use · Suno controls playback/);
  assert.equal(f.element('theatre-playback').hidden,true);
});

test('missing or failed inbox readiness has text labels and never removes the last successful count',async t=>{
  const f=await fixture({linked:false});t.after(()=>f.dom.window.close());
  f.setReadiness({uploaderPermission:false,uploaderTabOpen:false,inboxSelected:false,inboxAccessChecked:false,inboxCheckedAt:null,pendingRead:false,playlistSelected:false,playlistVerified:false});
  f.state().inboxAccessError='Fixture access check failed';await f.poll();
  for(const id of ['ready-uploader-permission','ready-uploader-tab','ready-inbox','ready-inbox-access','ready-pending','ready-playlist','ready-verification','ready-theatre'])assert.equal(f.element(id).dataset.state,'missing',id);
  assert.match(f.element('ready-inbox-access-label').textContent,/Not checked/);assert.match(f.element('ready-uploader-permission-label').textContent,/Not enabled/);
  assert.equal(f.element('inbox-connection').dataset.state,'missing');assert.match(f.element('inbox-connection-label').textContent,/Not ready/);
  assert.match(f.element('inbox-status').textContent,/2 Pending · 0 held/);assert.equal(f.element('inbox-error').textContent,'Fixture access check failed');
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
  f.w.document.querySelectorAll('#queue button[data-action=load]')[1].click();await settle();
  assert.deepEqual(f.messages.filter(message=>message.action==='load').map(message=>message.entryId),['fixture-inbox:2']);
  assert.equal(f.element('current-title').textContent,'Second song');
  assert.equal(f.element('current-warning').dataset.warning,'unknown');
  await f.click('next');await f.click('previous');
  assert.equal(f.messages.some(message=>message.action==='play'),false);
  assert.match(f.element('status').textContent,/Loaded\. Press Play/);
});

test('copy now playing uses prepared active-source text and does not send chat or notes',async t=>{
  const f=await fixture();t.after(()=>f.dom.window.close());
  f.w.document.querySelectorAll('#queue button[data-action=load]')[1].click();await settle();
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
  await f.click('disconnect-suno');assert.match(f.element('suno-status').textContent,/Suno not authorized/);
});


test('successful connection status follows later worker authorization loss',async t=>{
  const f=await fixture();t.after(()=>f.dom.window.close());
  await f.click('connect-suno');assert.match(f.element('suno-status').textContent,/Suno authorized/);
  f.setConnected(false);await f.change('show-name','Refresh fixture');
  assert.match(f.element('suno-status').textContent,/Suno not authorized/);
});


test('an older grant prompts updated consent and clears that prompt after successful Connect',async t=>{
  const f=await fixture({legacyGrant:true});t.after(()=>f.dom.window.close());
  assert.match(f.element('suno-status').textContent,/updated permissions.*Connect Suno/);
  await f.click('connect-suno');
  assert.match(f.element('suno-status').textContent,/Suno authorized/);
  assert.doesNotMatch(f.element('suno-status').textContent,/updated permissions/);
});


test('stale page connection does not display saved Manual advance or enable stale song copying',async t=>{
  const f=await fixture({linked:false});t.after(()=>f.dom.window.close());
  assert.match(f.element('playback-status').textContent,/reloaded.*reconnect/);
  assert.doesNotMatch(f.element('playback-status').textContent,/Manual advance/);
  assert.equal(f.element('copy-playing').disabled,true);
  assert.equal(f.element('current-title').textContent,'No song loaded');
  await f.click('play');assert.equal(f.messages.find(m=>m.action==='play').tabId,22);
  f.w.document.querySelector('#queue button[data-action=load]').click();await settle();
  assert.equal(f.messages.find(m=>m.action==='load').tabId,22);
});


test('choosing a source tab enables first row Load without an extra binding action',async t=>{
  const f=await fixture({linked:false,playerInitiallySelected:false});t.after(()=>f.dom.window.close());
  assert.equal(f.w.document.querySelector('#queue button[data-action=load]').disabled,true);
  await f.change('player-tab','22');
  assert.equal(f.w.document.querySelector('#queue button[data-action=load]').disabled,false);
  f.w.document.querySelector('#queue button[data-action=load]').click();await settle();
  assert.equal(f.messages.find(m=>m.action==='load').tabId,22);
});

test('an unbound source selection survives tab-title refresh without connecting or playing',async t=>{
  const f=await fixture({linked:false,playerInitiallySelected:false});t.after(()=>f.dom.window.close());
  await f.change('player-tab','22');
  f.tabs.find(tab=>tab.id===22).title='A new native song title | Suno';
  await f.change('show-name','Refresh without playback');
  assert.equal(f.element('player-tab').value,'22');
  assert.equal(f.w.document.querySelector('#queue button[data-action=load]').disabled,false);
  assert.equal(f.messages.some(m=>['bind-player','play','load'].includes(m.action)),false);
});

test('a closed chosen source holds instead of silently selecting another Suno tab',async t=>{
  const f=await fixture({linked:false,playerInitiallySelected:false});t.after(()=>f.dom.window.close());
  await f.change('player-tab','22');
  f.tabs.splice(f.tabs.findIndex(tab=>tab.id===22),1,{id:23,title:'Other Suno tab',kind:'suno'});
  await f.change('show-name','Refresh after closed source');
  assert.equal(f.element('player-tab').value,'');
  assert.equal(f.w.document.querySelector('#queue button[data-action=load]').disabled,true);
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
  f.w.document.querySelectorAll('#queue button[data-action=load]')[1].click();await settle();assert.equal(f.element('reload-lyrics').disabled,true);
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
  assert.match(f.element('inbox-error').textContent,/running order saved.*did not receive/);
  assert.match(f.element('inbox-status').textContent,/Inbox Submissions: 2 Pending · 0 held/);
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

test('an idle Pause finishing cannot unlock queued setup while Connect still awaits permission',async t=>{
  const f=await fixture();t.after(()=>f.dom.window.close());
  const releasePause=f.holdNext('pause');await f.click('pause');
  const grant=f.holdPermission();await f.click('connect-suno');
  releasePause();await settle();
  assert.equal(f.w.document.body.getAttribute('aria-busy'),'true','pending Connect keeps the panel busy after Pause ends');
  await f.click('playlists');
  assert.equal(f.messages.some(message=>message.action==='playlists'),false);
  assert.equal(f.element('playlists').disabled,true);
  grant(true);await settle();await settle();
  assert.deepEqual(f.messages.filter(message=>['pause','connect-suno','playlists'].includes(message.action)).map(message=>message.action),['pause','connect-suno','playlists']);
  assert.equal(f.w.document.body.hasAttribute('aria-busy'),false);
  assert.equal(f.element('playlists').disabled,false);
});

test('host song card displays safe artwork and click copies only its public image URL',async t=>{
 const f=await fixture();t.after(()=>f.dom.window.close());
 f.state().entries[0].artworkUrl='https://cdn1.suno.ai/fixture.jpeg?token=private#fragment';await f.poll();
 assert.equal(f.element('current-artwork').getAttribute('src'),'https://cdn1.suno.ai/fixture.jpeg');assert.equal(f.element('current-artwork').hidden,false);assert.equal(f.element('copy-artwork').disabled,false);
 const count=f.messages.length;await f.click('copy-artwork');assert.equal(f.copies.at(-1),'https://cdn1.suno.ai/fixture.jpeg');assert.equal(f.messages.length,count,'artwork copying does not fetch, change playback or call the helper');assert.match(f.element('status').textContent,/Artwork URL copied/);
 f.element('current-artwork').dispatchEvent(new f.w.Event('error'));await f.poll();assert.equal(f.element('current-artwork').hidden,true);assert.equal(f.element('artwork-placeholder').hidden,false);assert.equal(f.element('copy-artwork').disabled,false,'the safe URL remains copyable when an image fails');
 for(const url of ['https://evil.example/tracker.jpg','javascript:alert(1)','https://user:secret@cdn1.suno.ai/a.jpg','https://cdn1.suno.ai/audio.mp3']){f.state().entries[0].artworkUrl=url;await f.poll();assert.equal(f.element('copy-artwork').disabled,true);assert.equal(f.element('current-artwork').hasAttribute('src'),false);}
 f.state().entries[0].artworkUrl='https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg';await f.poll();assert.equal(f.element('current-artwork').hidden,false);
});
test('artwork copy uses the existing selectable fallback when clipboard access is denied',async t=>{
 const f=await fixture({clipboardDenied:true});t.after(()=>f.dom.window.close());f.state().entries[0].artworkUrl='https://cdn2.suno.ai/fixture.webp';await f.poll();await f.click('copy-artwork');assert.equal(f.element('copy-fallback').hidden,false);assert.equal(f.element('copy-fallback').value,'https://cdn2.suno.ai/fixture.webp');assert.equal(f.element('copy-fallback').closest('details').open,true);
});


const queueRow=(f,id)=>[...f.w.document.querySelectorAll('#queue li')].find(row=>row.dataset.entryId===id);
const rowButton=(f,id,action)=>queueRow(f,id).querySelector(`button[data-action="${action}"]`);
const addQueueEntry=(f,id,extra={})=>{const entry={...f.state().entries[1],id,title:'Upcoming '+id,...extra};f.state().entries.push(entry);return entry;};

test('local reorder uses stable entry identities, preserves current anchor, and never writes a playlist',async t=>{
  const f=await fixture();t.after(()=>f.dom.window.close());
  addQueueEntry(f,'fixture-inbox:3');addQueueEntry(f,'fixture-inbox:4');await f.poll();
  assert.equal(rowButton(f,'fixture-inbox:1','move-up').disabled,true);
  assert.equal(rowButton(f,'fixture-inbox:1','move-down').disabled,true);
  assert.equal(rowButton(f,'fixture-inbox:2','move-up').disabled,true,'cannot cross the loaded song');
  assert.equal(rowButton(f,'fixture-inbox:4','move-down').disabled,true);
  assert.match(rowButton(f,'fixture-inbox:3','move-up').getAttribute('aria-label'),/Move up.*Upcoming/);
  rowButton(f,'fixture-inbox:3','move-up').click();await settle();
  assert.deepEqual(f.messages.filter(m=>m.action==='queue-move').map(({entryId,beforeEntryId})=>({entryId,beforeEntryId})),[{entryId:'fixture-inbox:3',beforeEntryId:'fixture-inbox:2'}]);
  assert.deepEqual(f.state().entries.map(e=>e.id),['fixture-inbox:1','fixture-inbox:3','fixture-inbox:2','fixture-inbox:4']);
  rowButton(f,'fixture-inbox:3','move-down').click();await settle();
  assert.equal(f.messages.filter(m=>m.action==='queue-move').at(-1).beforeEntryId,'fixture-inbox:4');
  rowButton(f,'fixture-inbox:3','move-down').click();await settle();
  assert.equal(f.messages.filter(m=>m.action==='queue-move').at(-1).beforeEntryId,null);
  assert.equal(f.messages.some(m=>['sync-playlist','create-playlist','play','load'].includes(m.action)),false);
  assert.match(f.element('queue-help').textContent,/across inbox reads.*does not reorder the Suno playlist/);
});

test('host Hold and Release are explicit local actions and held rows cannot Load',async t=>{
  const f=await fixture();t.after(()=>f.dom.window.close());
  const hold=rowButton(f,'fixture-inbox:2','hold');assert.equal(hold.textContent,'Hold');
  hold.click();await settle();
  assert.deepEqual(f.messages.filter(m=>m.action==='queue-hold').map(({entryId,held})=>({entryId,held})),[{entryId:'fixture-inbox:2',held:true}]);
  assert.equal(rowButton(f,'fixture-inbox:2','hold').textContent,'Release');
  assert.equal(rowButton(f,'fixture-inbox:2','load').disabled,true);
  assert.equal(queueRow(f,'fixture-inbox:2').querySelector('.queue-state').textContent,'Held');
  assert.match(queueRow(f,'fixture-inbox:2').querySelector('.queue-hold-reason').textContent,/Held by host/);
  assert.match(f.element('queue-count').textContent,/1 held/);
  rowButton(f,'fixture-inbox:2','hold').click();await settle();
  assert.equal(f.messages.filter(m=>m.action==='queue-hold').at(-1).held,false);
  assert.equal(rowButton(f,'fixture-inbox:2','load').disabled,false);
  assert.equal(f.messages.some(m=>['play','load','sync-playlist'].includes(m.action)),false);
});

test('repeat-uploader holds are opt in and a per-song Release clearly overrides an approved multipart sequence',async t=>{
  const f=await fixture();t.after(()=>f.dom.window.close());
  assert.equal(f.element('repeat-uploader-hold').checked,false);
  await f.change('repeat-uploader-hold',true);
  assert.deepEqual(f.messages.filter(m=>m.action==='configure').at(-1).settings,{repeatUploaderHold:true});
  Object.assign(f.state().entries[1],{effectiveHeld:true,effectiveHoldReason:'Waiting for the uploader’s earlier song.',repeatPredecessorId:f.state().entries[0].id});
  await f.poll();
  const release=rowButton(f,'fixture-inbox:2','hold');
  assert.equal(release.textContent,'Release (host override)');assert.equal(release.disabled,false);
  assert.match(release.title,/allow this song before.*earlier submission/);
  assert.equal(rowButton(f,'fixture-inbox:2','load').disabled,true);
  release.click();await settle();
  assert.equal(f.messages.filter(m=>m.action==='queue-hold').at(-1).held,false);
  assert.equal(f.state().entries[1].repeatHoldOverride,true);
  assert.equal(f.state().repeatUploaderHold,true,'global fairness policy stays enabled');
  assert.equal(queueRow(f,'fixture-inbox:2').querySelector('.queue-state').textContent,'Host override');
  assert.equal(f.messages.some(m=>['play','sync-playlist'].includes(m.action)),false);
});

test('invalid sources cannot be released and loaded or played entries cannot be held or moved',async t=>{
  const f=await fixture();t.after(()=>f.dom.window.close());
  const invalid=addQueueEntry(f,'fixture-inbox:bad',{state:'held',preferredSource:null,youtubeUrl:null,sunoUrl:null,holdReason:'No supported playback link.'});
  addQueueEntry(f,'fixture-inbox:played',{playedAt:123,state:'played'});
  await f.poll();
  assert.equal(rowButton(f,invalid.id,'hold').textContent,'Release');
  assert.equal(rowButton(f,invalid.id,'hold').disabled,true);assert.equal(rowButton(f,invalid.id,'load').disabled,true);
  assert.match(rowButton(f,invalid.id,'hold').title,/Fix.*playback source/);
  for(const id of ['fixture-inbox:1','fixture-inbox:played'])for(const action of ['hold','move-up','move-down'])assert.equal(rowButton(f,id,action).disabled,true);
  rowButton(f,invalid.id,'hold').click();rowButton(f,'fixture-inbox:1','hold').click();await settle();
  assert.equal(f.messages.some(m=>['queue-hold','queue-move'].includes(m.action)),false);
});

test('Inbox-only hides local order and hold controls along with playback controls',async t=>{
  const f=await fixture({inboxOnly:true});t.after(()=>f.dom.window.close());
  assert.equal(f.element('queue-policy').hidden,true);
  assert.equal([...f.w.document.querySelectorAll('#queue button')].every(button=>button.hidden),true);
  assert.equal([...f.w.document.querySelectorAll('#queue .queue-actions')].every(controls=>controls.hidden),true);
  assert.match(f.element('queue-help').textContent,/FIFO.*Suno controls playback/);
  assert.equal(f.messages.some(m=>['queue-hold','queue-move'].includes(m.action)),false);
});

test('reordered row Load still addresses the displayed song by identity after a newer queue update',async t=>{
  const f=await fixture();t.after(()=>f.dom.window.close());
  addQueueEntry(f,'fixture-inbox:3');await f.poll();
  const displayed=rowButton(f,'fixture-inbox:2','load');
  [f.state().entries[1],f.state().entries[2]]=[f.state().entries[2],f.state().entries[1]];
  displayed.click();await settle();
  const request=f.messages.filter(m=>m.action==='load').at(-1);
  assert.equal(request.entryId,'fixture-inbox:2');assert.equal('index' in request,false);
  assert.equal(f.state().playback.current.id,'fixture-inbox:2');
});


test('prominent held total follows effective local holds and release without changing inbox read time or readiness',async t=>{
  const f=await fixture();t.after(()=>f.dom.window.close());
  f.state().lastRead={at:1794765600000,pending:11,held:0};
  Object.assign(f.state().entries[1],{hostHeld:true,effectiveHeld:true,effectiveHoldReason:'Held by host.'});
  addQueueEntry(f,'fixture-inbox:repeat',{effectiveHeld:true,effectiveHoldReason:'Waiting for an earlier song.',repeatPredecessorId:'fixture-inbox:1'});
  addQueueEntry(f,'fixture-inbox:invalid',{state:'held',preferredSource:null,sunoUrl:null,youtubeUrl:null,holdReason:'Source needs attention.'});
  f.setReadiness({inboxAccessChecked:false,pendingRead:false});await f.poll();
  const readTime=f.element('inbox-status').textContent.match(/\(.+\)$/)[0];
  assert.match(f.element('inbox-status').textContent,/11 Pending · 3 held in show/);
  assert.match(f.element('queue-count').textContent,/3 held/);
  assert.equal(f.element('inbox-connection').dataset.state,'missing');
  assert.equal(f.element('ready-pending').dataset.state,'missing');
  rowButton(f,'fixture-inbox:2','hold').click();await settle();await f.poll();
  assert.match(f.element('inbox-status').textContent,/11 Pending · 2 held in show/);
  assert.ok(f.element('inbox-status').textContent.endsWith(readTime));
  assert.equal(f.state().lastRead.held,0,'saved provider-read counts stay separate');
  assert.equal(f.element('inbox-connection').dataset.state,'missing','local queue mutation is no evidence of current inbox access');
  assert.equal(f.element('ready-pending').dataset.state,'missing');
});
