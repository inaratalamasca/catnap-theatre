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
  let sunoConnected=!legacyGrant,sunoReconnectRequired=legacyGrant,finishPlay;
  const tabs=[{id:11,title:'Uploader',kind:'uploader'},{id:22,title:'Suno',kind:'suno'}];
  const snapshot=()=>({state:structuredClone(state),playbackHealth:{linked,phase:state.playback?.phase,reason:linked?'':'Theatre reloaded. Load or Play to reconnect.'},tabs,suno:{connected:sunoConnected,reconnectRequired:sunoReconnectRequired},version:'0.6.0'});
  w.setInterval=()=>0;
  w.CatnapPackage={inboxOnly};
  w.chrome={permissions:{request:async value=>{permissions.push(value);return permissionGranted;}},runtime:{sendMessage:async message=>{
    messages.push(structuredClone(message));let data;
    switch(message.action) {
      case 'status':data=snapshot();break;
      case 'play':if(holdPlay)await new Promise(resolve=>{finishPlay=resolve;});data={done:true};break;
      case 'connect-suno':if(connectError)return {ok:false,error:connectError};sunoConnected=true;sunoReconnectRequired=false;data={connected:true};break;
      case 'disconnect-suno':sunoConnected=false;sunoReconnectRequired=false;data={connected:false};break;
      case 'configure':Object.assign(state,message.settings);data=structuredClone(state);break;
      case 'discover':data={inboxes:{lp:[{id:'fixture-inbox',name:'Fixture LP'}],ap:[{id:'fixture-inbox',name:'Fixture AP'}]}};break;
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
  return {dom,w,messages,copies,permissions,tabs,releasePlay:()=>finishPlay?.(),setConnected:value=>{sunoConnected=value;},state:()=>state,element:id=>w.document.getElementById(id),async click(id){w.document.getElementById(id).click();await settle();},async change(id,value){const control=w.document.getElementById(id);if(control.type==='checkbox')control.checked=value;else control.value=value;control.dispatchEvent(new w.Event('change',{bubbles:true}));await settle();}};
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
