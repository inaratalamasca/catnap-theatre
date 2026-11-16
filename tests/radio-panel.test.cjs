/* Radio panel checks, version 0.7.0. No real relay or capture. */
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
async function fixture(radioOnly=false){
  const html=fs.readFileSync(path.join(__dirname,'../extension/broadcast.html'),'utf8');
  const dom=new JSDOM(html,{url:'https://extension.example/broadcast.html',runScripts:'outside-only'}),w=dom.window;
  const local={hideTheatreButton:true},sent=[],writes=[],permissions=[],handlers={};let state='idle',message='',pendingPermission;
  w.CatnapPackage={radioOnly};w.CatnapBroadcast=require('../extension/broadcast-core.js');
  w.chrome={runtime:{getManifest:()=>({version:'0.7.0'}),sendMessage:async m=>{
      sent.push(m);if(handlers[m.action])return handlers[m.action](m);
      if(m.action==='start'){state='connecting';message='Establishing audio';}if(m.action==='stop'){state='idle';message='Stopped';}
      return {state,message:message||(state==='live'?'Live':'Ready'),sourceSelected:true,sourceLabel:'AIU player',sourceTitle:'Party'};
    }},
    permissions:{request:async value=>{permissions.push(value);if(pendingPermission){const current=pendingPermission;pendingPermission=null;return current;}return true;}},storage:{local:{get:async()=>local,set:async value=>{writes.push(value);Object.assign(local,value);}},session:{get:async()=>({}),set:async value=>writes.push(value)}}};
  w.setInterval=f=>{w.poll=f;return 1;};
  w.eval(fs.readFileSync(path.join(__dirname,'../extension/broadcast-panel.js'),'utf8'));
  await new Promise(r=>setImmediate(r));
  return {dom,w,sent,writes,permissions,setState:(value,text='')=>{state=value;message=text;},setHandler:(action,fn)=>{handlers[action]=fn;},holdPermission:()=>{let resolve;pendingPermission=new Promise(r=>{resolve=r;});return resolve;},flush:()=>new Promise(r=>setImmediate(r))};
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
