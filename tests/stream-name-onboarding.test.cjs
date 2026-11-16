/* Stream-name onboarding checks, version 0.7.0.
 * Synthetic Theatre roots and profile settings only. No service or playback.
 */
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const extension=path.resolve(__dirname,'../extension'),SETTINGS='catnap-theatre-settings-v1',SEEN='catnap-stream-name-prompt-v1';
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const settle=async()=>{await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));};
async function fixture({stored={},open=false,readError=false,writeError=false,holdSettings=false}={}){
  const dom=new JSDOM('<!doctype html><title>Fictional stream</title><main>Native page</main>',{url:'https://suno.com/playlist/11111111-1111-4111-8111-111111111111',runScripts:'outside-only'});
  const w=dom.window,values=clone(stored),writes=[],messages=[],ticks=[];let reply={opened:true},releaseSettings,plays=0;
  const makeRoot=()=>{const root=w.document.createElement('div');root.id='catnap-theater-root';root.innerHTML='<header class="ct-header"><div class="ct-brand"><svg></svg><span class="ct-brand-main"></span></div></header><main class="ct-main"><div class="ct-lyrics-content"></div></main>';w.document.body.append(root);return root;};
  if(open)makeRoot();
  w.setInterval=fn=>{ticks.push(fn);return ticks.length;};
  w.HTMLMediaElement.prototype.play=function(){plays++;throw Error('Onboarding must not play media');};
  w.chrome={runtime:{getURL:file=>'chrome-extension://fixture/'+file,sendMessage:async message=>{messages.push(clone(message));return typeof reply==='function'?reply():reply;}},storage:{local:{get:async key=>{
    if(readError===true||readError===key)throw Error('Fixture storage read unavailable');
    if(holdSettings&&key===SETTINGS)await new Promise(resolve=>{releaseSettings=resolve;});
    return {[key]:clone(values[key])};
  },set:async data=>{writes.push(clone(data));if(writeError)throw Error('Fixture storage write unavailable');Object.assign(values,clone(data));}}}};
  for(const file of ['helpers.js','standalone.js'])w.eval(fs.readFileSync(path.join(extension,file),'utf8'));
  await settle();
  return {dom,w,values,writes,messages,plays:()=>plays,root:()=>w.document.getElementById('catnap-theater-root'),prompt:()=>w.document.querySelector('.ct-stream-name-prompt'),setReply:value=>{reply=value;},release:async()=>{releaseSettings?.();await settle();},tick:async()=>{ticks.forEach(fn=>fn());await settle();},open:async()=>{makeRoot();ticks.forEach(fn=>fn());await settle();},close:()=>w.document.getElementById('catnap-theater-root')?.remove()};
}

test('a fresh profile prompts only when Theatre opens, without a modal, focus change or automatic control window',async t=>{
  const f=await fixture();t.after(()=>f.dom.window.close());
  assert.equal(f.prompt(),null);assert.equal(f.messages.length,0);assert.equal(f.writes.length,0);
  await f.open();assert.match(f.prompt().textContent,/Name your stream.*Catnap Radio.*Host name/s);
  assert.equal(f.prompt().getAttribute('role'),'region');assert.equal(f.prompt().hasAttribute('aria-modal'),false);
  assert.equal(f.w.document.activeElement,f.w.document.body);assert.equal(f.messages.length,0);assert.equal(f.plays(),0);
  assert.equal(f.root().querySelectorAll('.ct-popout-controls').length,1);
});

test('Use Catnap Radio records the choice without rewriting preferences, and reopening does not prompt again',async t=>{
  const f=await fixture({open:true});t.after(()=>f.dom.window.close());
  assert.ok(f.prompt());f.prompt().querySelector('.ct-stream-name-keep').click();await settle();
  assert.equal(f.prompt(),null);assert.equal(f.values[SEEN],true);assert.equal(f.values[SETTINGS],undefined);
  f.close();await f.tick();await f.open();assert.equal(f.prompt(),null);assert.equal(f.messages.length,0);
  assert.equal(f.root().querySelector('.ct-brand-main').textContent,'Catnap Radio');
});

test('existing custom and default settings both suppress clean-install onboarding without changing the saved name',async t=>{
  for(const brand of ['Fictional Evening','Catnap Radio']){
    const prefs={schemaVersion:1,layout:'duet',fontSize:21,stripTags:false,background:'#090b14',brand};
    const f=await fixture({stored:{[SETTINGS]:prefs},open:true});t.after(()=>f.dom.window.close());
    assert.equal(f.prompt(),null);assert.equal(f.root().querySelector('.ct-brand-main').textContent,brand);
    assert.deepEqual(f.values[SETTINGS],prefs);assert.equal(f.values[SEEN],true);
    assert.equal(f.messages.length,0);assert.equal(f.writes.some(value=>Object.hasOwn(value,SETTINGS)),false);
  }
  const seen=await fixture({stored:{[SEEN]:true},open:true});t.after(()=>seen.dom.window.close());assert.equal(seen.prompt(),null);
});

test('Open Presentation is source-bound, marks seen only after success, and cannot duplicate during a root reopen',async t=>{
  const f=await fixture({open:true});t.after(()=>f.dom.window.close());let resolveOpen;
  f.setReply(()=>new Promise(resolve=>{resolveOpen=resolve;}));
  f.prompt().querySelector('.ct-stream-name-open').click();f.prompt().querySelector('.ct-stream-name-open').click();
  assert.deepEqual(f.messages,[{target:'presentation-worker',action:'open'}]);assert.equal(f.values[SEEN],undefined);
  f.close();await f.tick();await f.open();assert.equal(f.w.document.querySelectorAll('.ct-stream-name-prompt').length,1);
  assert.equal(f.prompt().querySelector('.ct-stream-name-open').disabled,true);
  resolveOpen({opened:true});await settle();assert.equal(f.values[SEEN],true);assert.equal(f.prompt(),null);assert.equal(f.plays(),0);
});

test('an unsuccessful Presentation open keeps the optional prompt available for a deliberate retry',async t=>{
  const f=await fixture({open:true});t.after(()=>f.dom.window.close());f.setReply({error:'Fixture controls unavailable'});
  f.prompt().querySelector('.ct-stream-name-open').click();await settle();
  assert.equal(f.values[SEEN],undefined);assert.match(f.prompt().querySelector('[role=status]').textContent,/could not open/);
  assert.equal(f.prompt().querySelector('.ct-stream-name-open').disabled,false);
  f.setReply({opened:true});f.prompt().querySelector('.ct-stream-name-open').click();await settle();assert.equal(f.values[SEEN],true);assert.equal(f.prompt(),null);
});

test('saving a custom name through the shared Presentation adapter dismisses onboarding permanently',async t=>{
  const f=await fixture({open:true});t.after(()=>f.dom.window.close());
  await f.w.CatnapPresentationSettings.save({...f.w.CatnapPresentationSettings.read(),brand:'My fictional stream'});await settle();
  assert.equal(f.prompt(),null);assert.equal(f.values[SEEN],true);assert.equal(f.values[SETTINGS].brand,'My fictional stream');
  f.close();await f.tick();await f.open();assert.equal(f.prompt(),null);assert.equal(f.root().querySelector('.ct-brand-main').textContent,'My fictional stream');
  assert.equal(f.messages.length,0);assert.equal(f.plays(),0);
});

test('pending profile reads cannot produce duplicate or premature default-name prompts',async t=>{
  const f=await fixture({open:true,holdSettings:true});t.after(()=>f.dom.window.close());
  for(let i=0;i<3;i++)await f.tick();assert.equal(f.prompt(),null);
  await f.release();for(let i=0;i<3;i++)await f.tick();
  assert.equal(f.w.document.querySelectorAll('.ct-stream-name-prompt').length,1);
  assert.equal(f.root().querySelectorAll('.ct-popout-controls').length,1);
});

test('storage failure cannot block Theatre or force onboarding on an unknown existing profile',async t=>{
  const unknown=await fixture({open:true,readError:true});t.after(()=>unknown.dom.window.close());
  assert.equal(unknown.prompt(),null);assert.ok(unknown.root().querySelector('.ct-popout-controls'));assert.equal(unknown.messages.length,0);
  const prefs={schemaVersion:1,brand:'Existing fictional host'},partial=await fixture({open:true,readError:SEEN,stored:{[SETTINGS]:prefs}});t.after(()=>partial.dom.window.close());
  assert.equal(partial.prompt(),null);assert.equal(partial.root().querySelector('.ct-brand-main').textContent,'Existing fictional host');assert.deepEqual(partial.values[SETTINGS],prefs);
  const f=await fixture({open:true,writeError:true});t.after(()=>f.dom.window.close());
  f.prompt().querySelector('.ct-stream-name-keep').click();await settle();assert.equal(f.prompt(),null);
  f.close();await f.tick();await f.open();assert.equal(f.prompt(),null,'a failed persistence write cannot nag again in this page');
});
