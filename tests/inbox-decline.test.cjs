'use strict';
// Version0.8.0: synthetic first-party Decline contract; no network/provider use.
const test=require('node:test');
const assert=require('node:assert/strict');
const Reader=require('../extension/inbox-reader.js');
const Core=require('../extension/inbox-core.js');
const INBOX='fixture-inbox',ID='submission-1';
const pending={id:ID,status:'pending',deleted:false,submission_type:'LP',title:'Synthetic song',uploader_name:'Synthetic uploader',suno_url:'https://suno.com/song/00000000-0000-4000-8000-000000000001'};
const response=(body,status=200,type='basic')=>({status,type,ok:status>=200&&status<300,text:async()=>typeof body==='string'?body:JSON.stringify(body)});
function fixture({rows=[pending],post=response({ok:true}),declined=[{id:ID,status:'declined'}],pendingResponse,readbackResponse,postHook}={}){
 const calls=[];
 const fetch=async(path,options)=>{
  calls.push({path,options});
  if(path==='/me')return response({id:'synthetic-account',hosts:[{id:INBOX,is_show:true,lp_show_name:'Synthetic LP'}]});
  if(path===`/inboxes/${INBOX}/summary`)return response({pending:rows.length,declined:0});
  if(path===`/inboxes/${INBOX}?status=pending`)return pendingResponse||response(rows);
  if(path===`/uploads/${ID}/decline`){if(postHook)return postHook();if(post instanceof Error)throw post;return post;}
  if(path===`/inboxes/${INBOX}?status=declined`)return readbackResponse||response(declined);
  throw Error('Unexpected synthetic route');
 };
 return{calls,fetch,client:Reader.createClient({origin:Reader.ORIGIN,fetch})};
}
const posts=f=>f.calls.filter(call=>call.options.method==='POST');

test('explicit Decline checks fresh Pending then posts one fixed reason and confirms exact declined readback',async()=>{
 const f=fixture();const result=await f.client.decline(INBOX,'lp',ID);
 assert.deepEqual(result,{declined:true,inboxId:INBOX,submissionId:ID});
 assert.deepEqual(f.calls.map(call=>call.path),['/me',`/inboxes/${INBOX}/summary`,`/inboxes/${INBOX}?status=pending`,`/uploads/${ID}/decline`,`/inboxes/${INBOX}?status=declined`]);
 const write=posts(f)[0];assert.equal(posts(f).length,1);
 assert.equal(write.options.credentials,'same-origin');assert.equal(write.options.redirect,'manual');assert.equal(write.options.cache,'no-store');
 assert.equal(write.options.headers['Content-Type'],'application/json');
 assert.deepEqual(JSON.parse(write.options.body),{reason:'Only one song at a time, please.'});
 assert.equal('Cookie' in write.options.headers,false);assert.equal('Authorization' in write.options.headers,false);
 assert.deepEqual(Object.keys(result).sort(),['declined','inboxId','submissionId']);
});

test('discovery and ordinary Pending reads never decline anything',async()=>{
 const f=fixture();await f.client.discover();await f.client.readInbox(INBOX,'lp');
 assert.equal(posts(f).length,0);assert.equal(f.calls.some(call=>call.path.includes('status=declined')),false);
});

test('invalid inbox/submission identifiers are rejected before any request',async()=>{
 for(const args of [['../inbox','lp',ID],[INBOX,'bad',ID],[INBOX,'lp','../x'],[INBOX,'lp','https://elsewhere/x'],[INBOX,'lp','x?other=1'],[INBOX,'lp',42]]){
  const f=fixture();await assert.rejects(f.client.decline(...args),/valid Pending/);assert.equal(f.calls.length,0);
 }
});

test('catalog visibility alone cannot authorize a write to an unavailable inbox',async()=>{
 const f=fixture({pendingResponse:response({},403)});await assert.rejects(f.client.decline(INBOX,'lp',ID),/Sign in/);assert.equal(posts(f).length,0);
 const other=fixture();await assert.rejects(other.client.decline('unselected-inbox','lp',ID),/not available/);assert.equal(posts(other).length,0);
});

test('missing, duplicate, already processed and deleted submissions are not declined',async()=>{
 for(const rows of [[],[pending,pending],[{...pending,status:'accepted'}],[{...pending,status:'declined'}],[{...pending,deleted:true}],[{...pending,deleted:'yes'}]]){
  const f=fixture({rows});await assert.rejects(f.client.decline(INBOX,'lp',ID),/no longer confirmed Pending/);assert.equal(posts(f).length,0);
 }
});

test('failed, redirected and rate-limited POSTs remain uncertain without copying provider text or retrying',async()=>{
 for(const post of [response('PRIVATE_PROVIDER_DETAIL',401),response('PRIVATE_PROVIDER_DETAIL',403),response('PRIVATE_PROVIDER_DETAIL',429),response('PRIVATE_PROVIDER_DETAIL',500),response('',0,'opaqueredirect'),Error('PRIVATE_PROVIDER_DETAIL')]){
  const f=fixture({post});await assert.rejects(f.client.decline(INBOX,'lp',ID),error=>error.uncertain===true&&/Check the uploader.*no automatic retry/.test(error.message)&&!error.message.includes('PRIVATE_'));
  assert.equal(posts(f).length,1);assert.equal(f.calls.some(call=>call.path.includes('status=declined')),false);
 }
});

test('Pending disappearance or an unrelated/malformed readback never claims Decline success',async()=>{
 for(const declined of [[],[{id:'other',status:'declined'}],[{id:ID,status:'pending'}],[{id:ID,status:'declined'},{id:ID,status:'declined'}],{},Array.from({length:Core.MAX_ROWS+1},()=>({id:'other',status:'declined'}))]){
  const f=fixture({declined});await assert.rejects(f.client.decline(INBOX,'lp',ID),error=>error.uncertain===true&&/not confirmed/.test(error.message));assert.equal(posts(f).length,1);
 }
 for(const readbackResponse of [response('not JSON'),response({},403)]){
  const f=fixture({readbackResponse});await assert.rejects(f.client.decline(INBOX,'lp',ID),error=>error.uncertain===true);assert.equal(posts(f).length,1);
 }
});

test('an in-flight manual Decline cannot send a second POST for the same selected submission',async()=>{
 let release;const f=fixture({postHook:()=>new Promise(resolve=>{release=()=>resolve(response({ok:true}));})});
 const first=f.client.decline(INBOX,'lp',ID);
 while(!release)await new Promise(resolve=>setImmediate(resolve));
 await assert.rejects(f.client.decline(INBOX,'lp',ID),/already in progress/);
 assert.equal(posts(f).length,1);release();assert.equal((await first).declined,true);
});

test('reader bridge keeps extension trust and serializes the uncertain flag without accepting a custom reason',async()=>{
 const f=fixture({post:response('PRIVATE_PROVIDER_DETAIL',500)}),original=global.fetch;
 global.fetch=f.fetch;
 try{
  let listener;const chrome={runtime:{id:'fixture-extension',onMessage:{addListener(fn){listener=fn;}}}};
  Reader.install(chrome,Reader.ORIGIN);
  const message={target:'catnap-inbox',action:'decline',inboxId:INBOX,mode:'lp',submissionId:ID,reason:'IGNORED'};
  assert.equal(listener(message,{id:'untrusted'},()=>assert.fail('untrusted reply')),undefined);assert.equal(f.calls.length,0);
  const reply=await new Promise(resolve=>assert.equal(listener(message,{id:'fixture-extension'},resolve),true));
  assert.equal(reply.ok,false);assert.equal(reply.uncertain,true);assert.ok(!reply.error.includes('PRIVATE_'));
  assert.deepEqual(JSON.parse(posts(f)[0].options.body),{reason:Reader.DECLINE_REASON});
 }finally{global.fetch=original;}
});


test('Check Decline uses authenticated GETs only and distinguishes exact Pending, Declined and unknown evidence',async()=>{
 for(const {rows,declined,status} of [
  {rows:[],declined:[{id:ID,status:'declined'}],status:'declined'},
  {rows:[pending],declined:[],status:'pending'},
  {rows:[],declined:[],status:'unknown'},
  {rows:[pending],declined:[{id:ID,status:'declined'}],status:'unknown'},
  {rows:[{...pending,deleted:true}],declined:[],status:'unknown'},
  {rows:[pending,pending],declined:[],status:'unknown'},
  {rows:[],declined:[{id:ID,status:'declined'},{id:ID,status:'declined'}],status:'unknown'}
 ]){
  const f=fixture({rows,declined});
  assert.deepEqual(await f.client.checkDecline(INBOX,'lp',ID),{inboxId:INBOX,submissionId:ID,status});
  assert.equal(posts(f).length,0);assert.equal(f.calls.every(call=>call.options.method==='GET'),true);
 }
});

test('Check Decline cannot bypass access checks or inspect invalid route identifiers',async()=>{
 const denied=fixture({pendingResponse:response({},403)});await assert.rejects(denied.client.checkDecline(INBOX,'lp',ID),/Sign in/);assert.equal(posts(denied).length,0);
 const invalid=fixture();await assert.rejects(invalid.client.checkDecline(INBOX,'lp','../other'),/valid submission/);assert.equal(invalid.calls.length,0);
 const malformed=fixture({declined:{}});await assert.rejects(malformed.client.checkDecline(INBOX,'lp',ID),/invalid Declined/);assert.equal(posts(malformed).length,0);
});
