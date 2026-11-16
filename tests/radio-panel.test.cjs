/* Radio panel checks, version 0.7.0. No real relay or capture. */
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
async function fixture(radioOnly=false,options={}){
  const html=fs.readFileSync(path.join(__dirname,'../extension/broadcast.html'),'utf8');
  const dom=new JSDOM(html,{url:'https://extension.example/broadcast.html',runScripts:'outside-only'}),w=dom.window;
  const local=options.local||{hideTheatreButton:true},session=options.session||{},sent=[],writes=[],removals=[],permissions=[],handlers={};let state=options.state||'idle',message='',pendingPermission;
  w.CatnapPackage={radioOnly};w.CatnapBroadcast=require('../extension/broadcast-core.js');
  w.chrome={runtime:{getManifest:()=>({version:'0.7.0'}),sendMessage:async m=>{
      sent.push(m);if(handlers[m.action])return handlers[m.action](m);
      if(m.action==='start'){state='connecting';message='Establishing audio';}if(m.action==='stop'){state='idle';message='Stopped';}
      return {state,message:message||(state==='live'?'Live':'Ready'),sourceSelected:true,sourceLabel:'AIU player',sourceTitle:'Party'};
    }},
    permissions:{request:async value=>{permissions.push(value);if(pendingPermission){const current=pendingPermission;pendingPermission=null;return current;}return options.grant!==false;}},storage:{local:{get:async()=>({...local}),set:async value=>{writes.push(value);Object.assign(local,value);},remove:async keys=>{for(const key of Array.isArray(keys)?keys:[keys]){removals.push(key);delete local[key];}}},session:{get:async()=>({...session}),set:async value=>{writes.push(value);Object.assign(session,value);}}}};
  w.setInterval=f=>{w.poll=f;return 1;};
  w.eval(fs.readFileSync(path.join(__dirname,'../extension/broadcast-panel.js'),'utf8'));
  await new Promise(r=>setImmediate(r));
  return {dom,w,local,session,sent,writes,removals,permissions,setState:(value,text='')=>{state=value;message=text;},setHandler:(action,fn)=>{handlers[action]=fn;},holdPermission:()=>{let resolve;pendingPermission=new Promise(r=>{resolve=r;});return resolve;},flush:()=>new Promise(r=>setImmediate(r))};
}
test('panel retains hide preference, identifies source and keeps Radio-only independent of show controls',async()=>{
  for(const radioOnly of [false,true]){
    const f=await fixture(radioOnly),d=f.w.document;
    assert.equal(d.getElementById('show-controls').hidden,radioOnly);assert.equal(d.getElementById('theatre-preference').hidden,radioOnly);
    assert.equal(d.getElementById('hide-theatre').checked,true);assert.match(d.getElementById('source').textContent,/AIU player.*Party/);
    assert.equal(f.sent.every(m=>m.action==='status'),true,'opening panel never starts capture');
    d.getElementById('hide-theatre').checked=false;d.getElementById('hide-theatre').dispatchEvent(new f.w.Event('change'));await f.flush();
    assert.equal(f.writes.at(-1).hideTheatreButton,false);
    f.setState('live');f.w.poll();await f.flush();assert.equal(d.getElementById('status').dataset.state,'live');assert.equal(d.getElementById('start').disabled,true);
    f.setState('error');f.w.poll();await f.flush();assert.equal(d.getElementById('status').dataset.state,'error');assert.equal(d.getElementById('start').disabled,false);
    f.dom.window.close();
  }
});

test('Start locks before the relay permission promise and repeated pending clicks produce one start',async t=>{
  const f=await fixture(true);t.after(()=>f.dom.window.close());const d=f.w.document,grant=f.holdPermission();
  d.getElementById('start').click();d.getElementById('start').click();
  assert.equal(f.permissions.length,1);assert.equal(d.getElementById('start').disabled,true);assert.equal(d.getElementById('stop').disabled,false);
  grant(true);await f.flush();await f.flush();
  assert.equal(f.sent.filter(m=>m.action==='start').length,1);assert.equal(d.getElementById('on-air').dataset.live,'false');
});

test('Stop cancels a pending permission grant before it can save a token or start publishing',async t=>{
  const f=await fixture(true);t.after(()=>f.dom.window.close());const d=f.w.document,grant=f.holdPermission();
  d.getElementById('token').value='synthetic-private-value';d.getElementById('start').click();d.getElementById('stop').click();
  await f.flush();grant(true);await f.flush();await f.flush();
  assert.equal(f.sent.filter(m=>m.action==='stop').length,1);assert.equal(f.sent.some(m=>m.action==='start'),false);
  assert.equal(f.writes.some(value=>Object.hasOwn(value,'broadcastToken')),false);assert.equal(d.getElementById('start').disabled,false);
  assert.equal(d.getElementById('on-air').dataset.live,'false');
});
const BUSY='Another host is broadcasting. Wait for them to stop, then try again.';
async function busyPanel(options={}){
 const f=await fixture(true,options);
 f.setHandler('start',message=>{const state=message.takeover===true?'connecting':'error',text=message.takeover===true?'Taking over':BUSY;f.setState(state,text);return {state,message:text};});
 const d=f.w.document;d.getElementById('token').value='private-takeover-fixture';d.getElementById('start').click();await settle(f);
 return f;
}
test('busy Catnap stream offers a separate confirmed takeover and never takes over automatically',async t=>{
 const f=await busyPanel();t.after(()=>f.dom.window.close());const d=f.w.document,confirmations=[];
 assert.equal(f.sent.filter(m=>m.action==='start').length,1);assert.equal(f.sent.find(m=>m.action==='start').takeover,false);
 assert.equal(d.getElementById('takeover').hidden,false);assert.equal(d.getElementById('on-air').dataset.live,'false');
 f.w.confirm=text=>{confirmations.push(text);return false;};d.getElementById('takeover').click();await settle(f);
 assert.match(confirmations[0],/one-hour cooldown/);assert.equal(f.sent.filter(m=>m.action==='start').length,1);
 f.w.confirm=()=>true;d.getElementById('takeover').click();d.getElementById('takeover').click();await settle(f);
 assert.equal(f.sent.filter(m=>m.action==='start').length,2);assert.equal(f.sent.filter(m=>m.action==='start').at(-1).takeover,true);
 assert.equal(d.getElementById('takeover').hidden,true);assert.equal(JSON.stringify(f.sent).includes('private-takeover-fixture'),false);assert.equal(d.body.textContent.includes('private-takeover-fixture'),false);
});
test('Takeover is bound to busy endpoint/token and is unavailable for custom relays or rejected keys',async t=>{
 const f=await busyPanel();t.after(()=>f.dom.window.close());const d=f.w.document;
 d.getElementById('token').value='new-token';d.getElementById('token').dispatchEvent(new f.w.Event('input'));
 assert.equal(d.getElementById('takeover').hidden,true);
 const changed=await busyPanel();t.after(()=>changed.dom.window.close());let confirmations=0;changed.w.confirm=()=>{confirmations++;return true;};
 changed.w.document.getElementById('endpoint').value='https://other.example/live/whip';
 changed.w.document.getElementById('takeover').click();await settle(changed);
 assert.equal(confirmations,0,'an endpoint change cannot prompt for takeover on a custom relay');
 assert.equal(changed.sent.filter(m=>m.action==='start').length,1,'programmatic relay changes cannot reuse the busy context');
 const other=await busyPanel({local:{broadcastEndpoint:'https://other.example/live/whip'}});t.after(()=>other.dom.window.close());
 assert.equal(other.w.document.getElementById('takeover').hidden,true);
 const bad=await fixture(true);t.after(()=>bad.dom.window.close());bad.setState('error','Relay rejected the publish token.');bad.w.poll();await settle(bad);
 assert.equal(bad.w.document.getElementById('takeover').hidden,true);
});
test('Stop cancels a confirmed takeover awaiting relay permission without sending the takeover command',async t=>{
 const f=await busyPanel();t.after(()=>f.dom.window.close());const d=f.w.document,grant=f.holdPermission();f.w.confirm=()=>true;
 d.getElementById('takeover').click();d.getElementById('stop').click();await settle(f);grant(true);await settle(f);
 assert.equal(f.sent.some(m=>m.action==='start'&&m.takeover===true),false);
 assert.equal(d.getElementById('start').disabled,false);assert.equal(d.getElementById('on-air').dataset.live,'false');
});

test('token presence is distinct from validity and never lights On Air before a live publisher status',async t=>{
  const f=await fixture(true);t.after(()=>f.dom.window.close());const d=f.w.document,token=d.getElementById('token');
  assert.equal(token.dataset.tokenState,'missing');assert.match(d.getElementById('token-status').textContent,/No token entered/);
  token.value='synthetic-private-value';token.dispatchEvent(new f.w.Event('input'));
  assert.equal(token.dataset.tokenState,'entered');assert.match(d.getElementById('token-status').textContent,/Token entered · not validated/);
  assert.equal(d.getElementById('on-air').dataset.live,'false');
  for(const state of ['starting','connecting','live','reconnecting','error']){
    f.setState(state);f.w.poll();await f.flush();assert.equal(d.getElementById('on-air').dataset.live,String(state==='live'));
  }
  assert.equal(d.body.textContent.includes('synthetic-private-value'),false);assert.equal(JSON.stringify(f.sent).includes('synthetic-private-value'),false);
});

test('malformed token is red with a fixed message and cannot request permission or publish',async t=>{
  const f=await fixture(true);t.after(()=>f.dom.window.close());const d=f.w.document,token=d.getElementById('token');
  token.value='synthetic\u0001private';token.dispatchEvent(new f.w.Event('input'));d.getElementById('start').click();await f.flush();
  assert.equal(token.dataset.tokenState,'malformed');assert.match(d.getElementById('token-status').textContent,/Malformed token/);
  assert.match(d.getElementById('status').textContent,/token is malformed/);assert.equal(f.permissions.length,0);assert.equal(f.sent.some(m=>m.action==='start'),false);
  assert.equal(d.body.textContent.includes('synthetic'),false);
});

test('relay-rejected token remains red until changed, with no key echoed into status or commands',async t=>{
  const f=await fixture(true);t.after(()=>f.dom.window.close());const d=f.w.document,token=d.getElementById('token');
  f.setHandler('start',()=>{f.setState('error','Relay rejected the publish token.');return {state:'error',message:'Relay rejected the publish token.'};});
  token.value='synthetic-rejected-key';token.dispatchEvent(new f.w.Event('input'));d.getElementById('start').click();await f.flush();await f.flush();
  assert.equal(token.dataset.tokenState,'rejected');assert.match(d.getElementById('token-status').textContent,/rejected by relay/);
  assert.match(d.getElementById('status').textContent,/Relay rejected/);assert.equal(d.getElementById('on-air').dataset.live,'false');
  assert.equal(JSON.stringify(f.sent).includes('synthetic-rejected-key'),false);assert.equal(d.body.textContent.includes('synthetic-rejected-key'),false);
  token.value='synthetic-replacement';token.dispatchEvent(new f.w.Event('input'));assert.equal(token.dataset.tokenState,'entered');
});

test('empty token still supports an explicitly chosen anonymous relay without claiming token validation',async t=>{
  const f=await fixture(true);t.after(()=>f.dom.window.close());const d=f.w.document;
  d.getElementById('start').click();await f.flush();await f.flush();
  assert.equal(f.sent.filter(m=>m.action==='start').length,1);assert.equal(d.getElementById('token').dataset.tokenState,'missing');
  assert.equal(d.getElementById('on-air').dataset.live,'false');f.setState('live');f.w.poll();await f.flush();assert.equal(d.getElementById('on-air').dataset.live,'true');
});

test('late cancelled Start response and stale polling cannot overwrite a replacement broadcast',async t=>{
  const f=await fixture(true);t.after(()=>f.dom.window.close());const d=f.w.document;let finishFirst,count=0;
  f.setHandler('start',()=>++count===1?new Promise(resolve=>{finishFirst=resolve;}):{state:'live',message:'Live replacement'});
  d.getElementById('start').click();await f.flush();assert.equal(typeof finishFirst,'function');
  d.getElementById('stop').click();await f.flush();d.getElementById('start').click();await f.flush();
  f.setState('live');f.w.poll();await f.flush();finishFirst({error:'Broadcast start cancelled.'});await f.flush();
  assert.equal(d.getElementById('on-air').dataset.live,'true');assert.equal(d.getElementById('start').disabled,true);assert.doesNotMatch(d.getElementById('status').textContent,/cancelled/);
  let finishPoll;const send=f.w.chrome.runtime.sendMessage;f.w.chrome.runtime.sendMessage=async message=>{
    if(message.action==='status'&&!finishPoll)return new Promise(resolve=>{finishPoll=()=>resolve({state:'idle',message:'Old idle reply'});});return send(message);
  };
  f.w.poll();await f.flush();d.getElementById('stop').click();await f.flush();d.getElementById('start').click();await f.flush();f.setState('live');f.w.poll();await f.flush();finishPoll();await f.flush();
  assert.equal(d.getElementById('on-air').dataset.live,'true');assert.equal(d.getElementById('start').disabled,true);
});

test('version eyebrow has the shared format and a separate Radio product prefix',async t=>{
  for(const radioOnly of [false,true]){
    const f=await fixture(radioOnly);t.after(()=>f.dom.window.close());
    assert.equal(f.w.document.getElementById('build-version').textContent,`CATNAP ${radioOnly?'RADIO':'THEATRE'} · DEVELOPMENT 0.7.0`);
    assert.equal(f.w.document.querySelector('h1 small'),null);
  }
});

test('an unreadable publisher status cannot retain a green On Air indicator or permit another Start',async t=>{
  const f=await fixture(true);t.after(()=>f.dom.window.close());const d=f.w.document;
  f.setState('live');f.w.poll();await f.flush();assert.equal(d.getElementById('on-air').dataset.live,'true');
  f.setHandler('status',()=>{throw Error('Publisher status unavailable');});f.w.poll();await f.flush();
  assert.equal(d.getElementById('on-air').dataset.live,'false');assert.match(d.getElementById('on-air-label').textContent,/Status unavailable/);
  assert.equal(d.getElementById('start').disabled,true);assert.equal(d.getElementById('stop').disabled,false);
});

const RELAY='https://listen.catnapradio.com/live/whip',ORIGIN='https://listen.catnapradio.com';
const OTHER='https://another-relay.example/live/whip',KEY='fixture-private-token';
const saved=(origin=ORIGIN,value=KEY)=>({broadcastEndpoint:RELAY,broadcastRememberToken:true,broadcastSavedToken:{origin,token:value}});
function enter(f,value,event='change'){const input=f.w.document.getElementById('token');input.value=value;input.dispatchEvent(new f.w.Event('input'));if(event==='change')input.dispatchEvent(new f.w.Event('change'));}
async function settle(f){await f.flush();await f.flush();}

test('default-on remembering saves only explicit Start after permission and restores after a fresh browser session',async t=>{
 const first=await fixture(true);t.after(()=>first.dom.window.close());const d=first.w.document;
 assert.equal(d.getElementById('remember-token').checked,true);assert.equal(first.writes.length,0,'clean initialization does not save a preference or key');
 d.getElementById('token').value=KEY;d.getElementById('start').click();await settle(first);
 assert.equal(first.local.broadcastSavedToken.token,KEY);assert.equal(first.local.broadcastSavedToken.origin,ORIGIN);assert.equal(first.local.broadcastRememberToken,true);
 assert.equal(first.session.broadcastTokenOrigin,ORIGIN);assert.equal(first.session.broadcastTokenEndpoint,RELAY);
 const next=await fixture(true,{local:first.local,session:{}});t.after(()=>next.dom.window.close());
 assert.equal(next.w.document.getElementById('token').value,KEY);assert.equal(next.w.document.getElementById('remember-token').checked,true);assert.equal(next.writes.length,0);
 assert.equal(next.sent.every(message=>message.action==='status'),true,'restoring never starts capture');
 assert.equal(JSON.stringify(first.sent).includes(KEY),false);assert.equal(next.w.document.body.textContent.includes(KEY),false);
});

test('explicit input change can remember locally, while denied permission cannot save or start',async t=>{
 const edit=await fixture(true);t.after(()=>edit.dom.window.close());enter(edit,KEY);await settle(edit);
 assert.equal(edit.local.broadcastSavedToken.token,KEY);assert.equal(edit.permissions.length,0);assert.equal(edit.sent.every(message=>message.action==='status'),true);assert.equal(edit.session.broadcastToken,undefined);
 const denied=await fixture(true,{grant:false});t.after(()=>denied.dom.window.close());denied.w.document.getElementById('token').value=KEY;denied.w.document.getElementById('start').click();await settle(denied);
 assert.equal(denied.local.broadcastSavedToken,undefined);assert.equal(denied.local.broadcastRememberToken,undefined);assert.equal(denied.session.broadcastToken,undefined);assert.equal(denied.sent.some(message=>message.action==='start'),false);
});

test('session-only opt-out and Forget remove durable credentials without touching an active stream',async t=>{
 const session={broadcastToken:KEY,broadcastTokenOrigin:ORIGIN,broadcastTokenEndpoint:RELAY,broadcastMetadataSession:{endpoint:RELAY,sourceTabId:7,live:true}};
 const f=await fixture(true,{local:saved(),session,state:'live'});t.after(()=>f.dom.window.close());const d=f.w.document,keep=d.getElementById('remember-token');
 keep.checked=false;keep.dispatchEvent(new f.w.Event('change'));await settle(f);
 assert.equal(f.local.broadcastSavedToken,undefined);assert.equal(f.local.broadcastRememberToken,false);assert.equal(session.broadcastToken,KEY);assert.equal(d.getElementById('on-air').dataset.live,'true');
 enter(f,'fixture-session-only');await settle(f);assert.equal(f.local.broadcastSavedToken,undefined,'input changes do not persist when opted out');assert.equal(session.broadcastToken,KEY);
 keep.checked=true;keep.dispatchEvent(new f.w.Event('change'));await settle(f);assert.equal(f.local.broadcastSavedToken.token,'fixture-session-only');
 d.getElementById('forget-token').click();await settle(f);
 assert.equal(f.local.broadcastSavedToken,undefined);assert.equal(f.local.broadcastRememberToken,undefined);assert.equal(keep.checked,false);assert.equal(d.getElementById('token').value,'');assert.equal(session.broadcastToken,KEY);assert.equal(d.getElementById('on-air').dataset.live,'true');
 assert.equal(f.sent.every(message=>message.action==='status'),true,'preference/Forget never stops, restarts or captures');
});

test('stored origin equality is exact, allows another path on the same relay and fails closed otherwise',async t=>{
 const same=await fixture(true,{local:{...saved(),broadcastEndpoint:ORIGIN+'/alternate/whip'}});t.after(()=>same.dom.window.close());assert.equal(same.w.document.getElementById('token').value,KEY);
 for(const origin of ['https://listen.catnapradio.com.evil.example','http://listen.catnapradio.com',ORIGIN+':8443',ORIGIN+'/path','not an origin',undefined]){
  const f=await fixture(true,{local:saved(origin===undefined?null:origin)});t.after(()=>f.dom.window.close());assert.equal(f.w.document.getElementById('token').value,'');
 }
 const other=await fixture(true,{local:{...saved(),broadcastEndpoint:OTHER}});t.after(()=>other.dom.window.close());assert.equal(other.w.document.getElementById('token').value,'');
 const malformed=await fixture(true,{local:saved(ORIGIN,'fixture\u0001bad')});t.after(()=>malformed.dom.window.close());assert.equal(malformed.w.document.getElementById('token').value,'');
});

test('changing relay origin clears a restored key and a programmatic change cannot send it elsewhere',async t=>{
 const f=await fixture(true,{local:saved()});t.after(()=>f.dom.window.close());const d=f.w.document,address=d.getElementById('endpoint');
 address.value=ORIGIN+'/different/whip';address.dispatchEvent(new f.w.Event('input'));assert.equal(d.getElementById('token').value,KEY);
 address.value=OTHER;address.dispatchEvent(new f.w.Event('input'));assert.equal(d.getElementById('token').value,'');assert.equal(f.session.broadcastToken,undefined);
 const bypass=await fixture(true,{local:saved()});t.after(()=>bypass.dom.window.close());bypass.w.document.getElementById('endpoint').value=OTHER;bypass.w.document.getElementById('start').click();await settle(bypass);
 assert.equal(bypass.permissions.length,0);assert.equal(bypass.sent.some(message=>message.action==='start'),false);assert.equal(bypass.w.document.getElementById('token').value,'');assert.match(bypass.w.document.getElementById('status').textContent,/relay changed/);
});

test('a bound active session uses its own relay, with no silent durable migration and no unbound-key guessing',async t=>{
 const session={broadcastToken:KEY,broadcastMetadataSession:{endpoint:RELAY,sourceTabId:9,live:true}};
 const active=await fixture(true,{local:{broadcastEndpoint:OTHER},session,state:'live'});t.after(()=>active.dom.window.close());
 assert.equal(active.w.document.getElementById('endpoint').value,RELAY);assert.equal(active.w.document.getElementById('token').value,KEY);assert.equal(active.local.broadcastSavedToken,undefined);assert.equal(active.writes.length,0);
 const unknown=await fixture(true,{local:{broadcastEndpoint:RELAY},session:{broadcastToken:KEY}});t.after(()=>unknown.dom.window.close());assert.equal(unknown.w.document.getElementById('token').value,'');assert.equal(unknown.writes.length,0);
 const conflict=await fixture(true,{local:{broadcastEndpoint:RELAY},session:{broadcastToken:KEY,broadcastTokenOrigin:ORIGIN,broadcastTokenEndpoint:OTHER,broadcastMetadataSession:{endpoint:RELAY}}});t.after(()=>conflict.dom.window.close());assert.equal(conflict.w.document.getElementById('token').value,'');
});

test('editing settings during a pending relay grant cancels the stale Start before any credential write',async t=>{
 const f=await fixture(true);t.after(()=>f.dom.window.close());const d=f.w.document,grant=f.holdPermission();
 d.getElementById('token').value=KEY;d.getElementById('start').click();d.getElementById('endpoint').value=OTHER;d.getElementById('endpoint').dispatchEvent(new f.w.Event('input'));grant(true);await settle(f);
 assert.equal(f.sent.some(message=>message.action==='start'),false);assert.equal(f.local.broadcastSavedToken,undefined);assert.equal(f.session.broadcastToken,undefined);assert.equal(d.getElementById('start').disabled,false);assert.match(d.getElementById('status').textContent,/settings changed/);
});

test('a later opt-out and Forget win over a credential save already in flight',async t=>{
 const f=await fixture(true);t.after(()=>f.dom.window.close());let release;
 const original=f.w.chrome.storage.local.set;f.w.chrome.storage.local.set=async value=>{if(value.broadcastSavedToken)await new Promise(resolve=>{release=resolve;});return original(value);};
 enter(f,KEY);await f.flush();assert.equal(typeof release,'function');
 const keep=f.w.document.getElementById('remember-token');keep.checked=false;keep.dispatchEvent(new f.w.Event('change'));f.w.document.getElementById('forget-token').click();release();await settle(f);
 assert.equal(f.local.broadcastSavedToken,undefined);assert.equal(f.local.broadcastRememberToken,undefined);assert.equal(f.session.broadcastToken,undefined);
 assert.equal(f.sent.every(message=>message.action==='status'),true);
});

test('credential storage failure never echoes storage payloads into status or worker commands',async t=>{
 const f=await fixture(true);t.after(()=>f.dom.window.close());f.w.chrome.storage.local.set=async()=>{throw Error('Storage failed for '+KEY);};
 const d=f.w.document;d.getElementById('token').value=KEY;d.getElementById('start').click();await settle(f);
 assert.match(d.getElementById('status').textContent,/Could not store Radio credentials/);assert.equal(d.body.textContent.includes(KEY),false);assert.equal(JSON.stringify(f.sent).includes(KEY),false);assert.equal(f.sent.some(message=>message.action==='start'),false);
});
