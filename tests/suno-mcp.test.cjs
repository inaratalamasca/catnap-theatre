'use strict';
// Catnap Suno MCP tests, SCRIPT_VERSION 0.6.0. Mocked account/provider data only.
const test = require('node:test');
const assert = require('node:assert/strict');
const {webcrypto} = require('node:crypto');
const {PassThrough} = require('node:stream');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const library = require('../extension/suno-mcp.js');
const makeId = number => '00000000-0000-4000-8000-' + String(number).padStart(12,'0');
const AUTH_KEY = 'catnapSunoAuthorization', CLIENT_KEY = 'catnapSunoRegistration';

function area(seed = {}) {
  const values = structuredClone(seed);
  return {values,async get(key) { return {[key]:values[key]}; },async set(data) {Object.assign(values,structuredClone(data));},async remove(key) {delete values[key];}};
}
function fixture({authorized = true} = {}) {
  const redirectUri='https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/suno';
  const metadata={scopeVersion:2,requestedScopes:['api:v0','library:read','library:write','profile:read','offline_access']};
  const chrome = {storage:{local:area(authorized?{[CLIENT_KEY]:{clientId:'public-client-fixture',redirectUri,...metadata}}:{}),session:area(authorized?{[AUTH_KEY]:{accessToken:'demo-access-only',refreshToken:'demo-refresh-only',expiresAt:200000,clientId:'public-client-fixture',...metadata,grantedScopes:null}}:{})},
    identity:{getRedirectURL:()=> 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/suno',launchWebAuthFlow:async()=>{throw Error('No live login in tests');}}};
  return chrome;
}
function rpcTransport(perform) {
  let serial = 0;
  return async message => {
    if (message.operation === 'health') return {ok:true,ready:true};
    const request = message.request;
    let result;
    if (request.method === 'initialize') result = {protocolVersion:'2025-06-18',capabilities:{tools:{}}};
    else if (request.method === 'notifications/initialized') return {ok:true,status:202,body:''};
    else if (request.method === 'tools/list') result = {tools:library.TOOL_NAMES.map(name=>({name}))};
    else { const data = await perform(request.params.name,request.params.arguments,++serial); if (data?.transportFailure) return {ok:false,status:502}; result = {structuredContent:data}; }
    return {ok:true,sessionId:'fixture-session',contentType:'application/json',body:JSON.stringify({jsonrpc:'2.0',id:request.id,result})};
  };
}
const nativeModule = () => import(pathToFileURL(path.join(__dirname,'../native/catnap-suno-host.mjs')).href);

test('connect checks companion before creating any OAuth client', async()=>{
  let networkCalls = 0;
  const client = library.createClient({chrome:fixture({authorized:false}),crypto:webcrypto,fetch:async()=>{networkCalls++;},transport:async()=>({ok:false})});
  await assert.rejects(client.connect(),/Install the Catnap/);
  assert.equal(networkCalls,0);
});

test('browser registration network errors identify the failing stage without exposing data',async()=>{
  const client=library.createClient({chrome:fixture({authorized:false}),crypto:webcrypto,transport:async()=>({ok:true,ready:true}),fetch:async()=>{throw new TypeError('Failed to fetch');}});
  await assert.rejects(client.connect(),/Suno client registration could not reach Suno from this browser/);
});

test('token exchange network errors remain distinct from registration or companion health',async()=>{
  const chrome=fixture({authorized:false});
  chrome.identity.launchWebAuthFlow=async({url})=>chrome.identity.getRedirectURL()+'?code=demo-code&state='+new URL(url).searchParams.get('state');
  const client=library.createClient({chrome,crypto:webcrypto,transport:async()=>({ok:true,ready:true}),fetch:async url=>{if(url.endsWith('/register/'))return Response.json({client_id:'public-client-fixture'});throw new TypeError('Failed to fetch');}});
  await assert.rejects(client.connect(),/Suno token exchange could not reach Suno from this browser/);
  assert.equal(chrome.storage.session.values[AUTH_KEY],undefined);
});

test('PKCE OAuth validates callback and retains credentials only in session storage', async()=>{
  const chrome = fixture({authorized:false}), requests = [];
  chrome.identity.launchWebAuthFlow = async({url})=>{
    const target = new URL(url);
    assert.equal(target.searchParams.get('code_challenge_method'),'S256');
    assert.equal(target.searchParams.get('resource'),'https://api.suno.com/mcp');
    assert.ok(target.searchParams.get('scope').split(' ').includes('profile:read'));
    assert.ok(target.searchParams.get('code_challenge').length >= 43);
    return chrome.identity.getRedirectURL()+'?code=demo-code&state='+encodeURIComponent(target.searchParams.get('state'));
  };
  const network = async(url,init)=>{
    requests.push({url,init});
    return Response.json(url.endsWith('/register/')?{client_id:'public-client-fixture'}:{access_token:'demo-access-only',refresh_token:'demo-refresh-only',expires_in:3600});
  };
  const client = library.createClient({chrome,crypto:webcrypto,fetch:network,transport:async()=>({ok:true,ready:true}),now:()=>1000});
  const result = await client.connect();
  assert.deepEqual(result,{connected:true,expiresAt:3601000,reconnectRequired:false});
  assert.equal(chrome.storage.local.values[CLIENT_KEY].clientId,'public-client-fixture');
  assert.equal(JSON.stringify(chrome.storage.local.values).includes('demo-access-only'),false);
  assert.equal(chrome.storage.session.values[AUTH_KEY].accessToken,'demo-access-only');
  assert.equal(requests[1].init.body.get('grant_type'),'authorization_code');
  assert.equal(requests[1].init.body.get('code_verifier').length,64);
  assert.ok(JSON.parse(requests[0].init.body).scope.split(' ').includes('profile:read'));
  assert.equal(JSON.stringify(result).includes('demo-access-only'),false);
  await client.disconnect();
  assert.equal((await client.status()).connected,false);
});

test('legacy registration is migrated only by explicit Connect and requests profile read',async()=>{
  const chrome=fixture({authorized:false});let registrations=0;
  chrome.storage.local.values[CLIENT_KEY]={clientId:'legacy-client-fixture',redirectUri:chrome.identity.getRedirectURL()};
  chrome.storage.session.values[AUTH_KEY]={accessToken:'legacy-access-only',refreshToken:'legacy-refresh-only',expiresAt:200000};
  chrome.identity.launchWebAuthFlow=async({url})=>{
    const target=new URL(url);assert.equal(target.searchParams.get('client_id'),'upgraded-client-fixture');
    return chrome.identity.getRedirectURL()+'?code=demo-code&state='+target.searchParams.get('state');
  };
  const client=library.createClient({chrome,crypto:webcrypto,now:()=>1000,transport:async()=>({ok:true,ready:true}),fetch:async(url,init)=>{
    if(url.endsWith('/register/')){registrations++;assert.ok(JSON.parse(init.body).scope.includes('profile:read'));return Response.json({client_id:'upgraded-client-fixture'});}
    return Response.json({access_token:'upgraded-access-only',expires_in:3600});
  }});
  assert.equal((await client.status()).connected,false);assert.equal((await client.status()).reconnectRequired,true);
  await client.connect();assert.equal(registrations,1);
  assert.equal(chrome.storage.local.values[CLIENT_KEY].scopeVersion,2);
  assert.equal(chrome.storage.session.values[AUTH_KEY].clientId,'upgraded-client-fixture');
  assert.equal((await client.status()).connected,true);
});

test('current-scope registration is reused for explicit reconnect',async()=>{
  const chrome=fixture();let registrations=0,exchanges=0;
  chrome.identity.launchWebAuthFlow=async({url})=>chrome.identity.getRedirectURL()+'?code=demo-code&state='+new URL(url).searchParams.get('state');
  const client=library.createClient({chrome,crypto:webcrypto,now:()=>1000,transport:async()=>({ok:true,ready:true}),fetch:async(url)=>{
    if(url.endsWith('/register/'))registrations++;else exchanges++;
    return Response.json({access_token:'reconnected-access-only',expires_in:3600,scope:'api:v0 library:read library:write profile:read'});
  }});
  await client.connect();assert.equal(registrations,0);assert.equal(exchanges,1);assert.equal((await client.status()).connected,true);
  assert.deepEqual(chrome.storage.session.values[AUTH_KEY].grantedScopes,['api:v0','library:read','library:write','profile:read']);
});

test('canceling a registration migration cannot retain the old client refresh token',async()=>{
  const chrome=fixture();
  chrome.storage.local.values[CLIENT_KEY]={clientId:'legacy-client-fixture',redirectUri:chrome.identity.getRedirectURL()};
  chrome.storage.session.values[AUTH_KEY]={accessToken:'legacy-access-only',refreshToken:'legacy-refresh-only',expiresAt:1};
  chrome.identity.launchWebAuthFlow=async()=>{throw Error('Sign-in canceled');};let tokenCalls=0;
  const client=library.createClient({chrome,crypto:webcrypto,transport:async()=>({ok:true,ready:true}),fetch:async(url)=>{
    if(url.endsWith('/token/'))tokenCalls++;return Response.json({client_id:'upgraded-client-fixture'});
  }});
  await assert.rejects(client.connect(),/canceled/);assert.equal(tokenCalls,0);
  assert.equal(chrome.storage.session.values[AUTH_KEY],undefined);
  assert.equal((await client.status()).connected,false);
});

test('expired legacy grants never register or refresh automatically',async()=>{
  const chrome=fixture();let requests=0;
  chrome.storage.local.values[CLIENT_KEY]={clientId:'legacy-client-fixture',redirectUri:chrome.identity.getRedirectURL()};
  chrome.storage.session.values[AUTH_KEY]={accessToken:'legacy-access-only',refreshToken:'legacy-refresh-only',expiresAt:1};
  const client=library.createClient({chrome,now:()=>300000,fetch:async()=>{requests++;throw Error('Must not call OAuth');},transport:async()=>{requests++;throw Error('Must not call MCP');}});
  await assert.rejects(client.listPlaylists(),/Reconnect Suno.*profile:read/);assert.equal(requests,0);
  assert.equal((await client.status()).reconnectRequired,true);
});

test('refresh does not migrate a missing current client registration',async()=>{
  const chrome=fixture();let requests=0;chrome.storage.local.values[CLIENT_KEY]=undefined;
  const client=library.createClient({chrome,now:()=>300000,fetch:async()=>{requests++;throw Error('Must not register');}});
  await assert.rejects(client.listPlaylists(),/Reconnect Suno/);assert.equal(requests,0);assert.equal(chrome.storage.session.values[AUTH_KEY],undefined);
});

test('an explicit token scope omitting profile read is rejected without storing credentials',async()=>{
  const chrome=fixture();chrome.identity.launchWebAuthFlow=async({url})=>chrome.identity.getRedirectURL()+'?code=demo-code&state='+new URL(url).searchParams.get('state');
  const client=library.createClient({chrome,crypto:webcrypto,transport:async()=>({ok:true,ready:true}),fetch:async()=>Response.json({access_token:'limited-access-only',scope:'api:v0 library:read library:write',expires_in:3600})});
  await assert.rejects(client.connect(),/did not grant all required playlist permissions/);assert.equal(chrome.storage.session.values[AUTH_KEY],undefined);
});

test('insufficient-scope tool errors expose reconnect instructions and known scopes only',()=>{
  const secret='never-echo-this-token',privateUrl='https://private.invalid/?token='+secret;
  const result={isError:true,content:[{type:'text',text:JSON.stringify({code:'insufficient_scope',error:'Missing required scope profile:read. '+privateUrl})}]};
  let message='';try{library.toolData(result);}catch(error){message=error.message;}
  assert.match(message,/profile:read/);assert.match(message,/Connect Suno again/);assert.equal(message.includes(secret),false);assert.equal(message.includes(privateUrl),false);
  assert.throws(()=>library.toolData({isError:true,content:[{type:'text',text:'Unknown failure '+secret}]}),error=>!error.message.includes(secret));
});

test('OAuth rejects a different state before token exchange', async()=>{
  const chrome = fixture({authorized:false}); let exchanges = 0;
  chrome.identity.launchWebAuthFlow = async()=>chrome.identity.getRedirectURL()+'?state=wrong&code=demo-code';
  const client = library.createClient({chrome,crypto:webcrypto,transport:async()=>({ok:true,ready:true}),fetch:async(url)=>{if(url.endsWith('/token/'))exchanges++;return Response.json({client_id:'public-client-fixture'});}});
  await assert.rejects(client.connect(),/unexpected sign-in callback/);
  assert.equal(exchanges,0);
  assert.equal(chrome.storage.session.values[AUTH_KEY],undefined);
});

test('reconciliation deduplicates songs and confirms an uncertain write by readback', async()=>{
  const present = new Set([makeId(1)]), writes = [];
  const transport = rpcTransport(async(name,args)=>{
    if(name==='playlists-list-clips')return {items:[...present].map(id=>({id}))};
    assert.equal(name,'playlists-add-clips'); writes.push(args.clip_ids); args.clip_ids.forEach(id=>present.add(id));
    return {transportFailure:true};
  });
  const client = library.createClient({chrome:fixture(),transport,now:()=>1000});
  const result = await client.reconcilePlaylist(makeId(9),[makeId(1),makeId(2),makeId(2)]);
  assert.deepEqual(writes,[[makeId(2)]]);
  const {clips,...summary} = result;
  assert.deepEqual(summary,{requested:2,alreadyPresent:1,added:1,confirmed:2,missing:[],failures:[]});
  assert.deepEqual(clips.map(clip=>clip.id),[makeId(1),makeId(2)]);
});

test('sync never writes after the bound show changes', async()=>{
  let writes = 0;
  const client = library.createClient({chrome:fixture(),now:()=>1000,transport:rpcTransport(async(name)=>{
    if(name==='playlists-add-clips')writes++;
    return {items:[]};
  })});
  await assert.rejects(client.reconcilePlaylist(makeId(9),[makeId(1)],{isCurrent:async()=>false}),/show or destination playlist changed/);
  assert.equal(writes,0);
});

test('playlist paging continues after short pages and retains provider metadata', async()=>{
  const cursors = [];
  const client = library.createClient({chrome:fixture(),now:()=>1000,transport:rpcTransport(async(name,args)=>{
    assert.equal(name,'playlists-list-clips');cursors.push(args.cursor||'');
    return args.cursor?{items:[{id:makeId(2),title:'Fixture',image_url:'https://cdn1.suno.ai/fixture.jpeg?secret=discarded',metadata:{duration:123},audio_url:'https://cdn1.suno.ai/fixture.mp3'}]}:{items:[],next_cursor:'next-page'};
  })});
  const clips = await client.readPlaylist(makeId(9));
  assert.deepEqual(cursors,['','next-page']);assert.equal(clips[0].audio_url,undefined);
  assert.equal(clips[0].artworkUrl,'https://cdn1.suno.ai/fixture.jpeg');assert.equal(clips[0].durationSeconds,123);
});

test('a repeated pagination cursor fails without pretending the list is complete', async()=>{
  const client = library.createClient({chrome:fixture(),now:()=>1000,transport:rpcTransport(async()=>({playlists:[],next_cursor:'repeated'}))});
  await assert.rejects(client.listPlaylists(),/invalid playlist cursor/);
});

test('SSE response selection matches request ID and rejects errors',()=>{
  const body = 'event: message\ndata: '+JSON.stringify({jsonrpc:'2.0',id:5,result:{wrong:true}})+'\n\n'+'data: '+JSON.stringify({jsonrpc:'2.0',id:6,result:{correct:true}})+'\n\n';
  assert.deepEqual(library.decodeRpc({ok:true,contentType:'text/event-stream',body},6),{correct:true});
  assert.throws(()=>library.decodeRpc({ok:true,contentType:'application/json',body:'{"jsonrpc":"2.0","id":6,"error":{}}'},6),/did not confirm/);
});

test('native companion rejects arbitrary tools, malformed arguments and credentials', async()=>{
  const {handleMessage} = await nativeModule();let calls = 0;
  const network = async()=>{calls++;return Response.json({});};
  const base = {operation:'rpc',token:'demo-access-only',request:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'audio-create',arguments:{}}}};
  assert.equal((await handleMessage(base,network)).ok,false);
  base.request.params={name:'playlists-add-clips',arguments:{id:makeId(1),clip_ids:['not-a-uuid']}};
  assert.equal((await handleMessage(base,network)).ok,false);
  base.request.params={name:'playlists-list',arguments:{url:'https://unrelated.invalid/'}};
  assert.equal((await handleMessage(base,network)).ok,false);
  base.token='bad\r\nheader';
  assert.equal((await handleMessage(base,network)).ok,false);assert.equal(calls,0);
});

test('native transport is pinned to Suno, omits Origin, and will not redirect', async()=>{
  const {handleMessage} = await nativeModule();
  const message = {operation:'rpc',token:'demo-access-only',sessionId:'fixture-session',request:{jsonrpc:'2.0',id:1,method:'tools/list',params:{}}};
  const result = await handleMessage(message,async(url,init)=>{
    assert.equal(url,'https://api.suno.com/mcp');assert.equal(init.redirect,'error');assert.equal(init.headers.Origin,undefined);
    assert.equal(init.headers.Authorization,'Bearer demo-access-only');assert.equal(init.headers['Mcp-Session-Id'],'fixture-session');
    return Response.json({jsonrpc:'2.0',id:1,result:{tools:[]}});
  });
  assert.equal(result.ok,true);
  assert.equal((await handleMessage({...message,url:'https://unrelated.invalid/'},async()=>{throw Error('Must not run');})).ok,false);
  const denied = await handleMessage(message,async()=>new Response('private failure detail',{status:401}));
  assert.deepEqual(denied,{ok:false,status:401,error:'provider_rejected'});
});

test('native transport finishes a matching SSE result without waiting for stream closure',async()=>{
  const {handleMessage} = await nativeModule();let canceled=false;
  const response = new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('data: {"jsonrpc":"2.0","id":1,"result":{"tools":[]}}\n\n'));},cancel(){canceled=true;}}),{headers:{'Content-Type':'text/event-stream'}});
  const result=await handleMessage({operation:'rpc',token:'demo-access-only',request:{jsonrpc:'2.0',id:1,method:'tools/list',params:{}}},async()=>response);
  assert.equal(canceled,true);assert.equal(result.ok,true);
  assert.deepEqual(library.decodeRpc(result,1),{tools:[]});
});

test('Linux installer registers only the requested exact extension in isolated test directories',()=>{
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'catnap native test '));
  try {
    const config=path.join(temporary,'config'),data=path.join(temporary,'data'),extensionId='abcdefghijklmnopabcdefghijklmnop';
    const result=spawnSync('bash',[path.join(__dirname,'../native/install-linux.sh'),extensionId,'brave'],{env:{...process.env,XDG_CONFIG_HOME:config,XDG_DATA_HOME:data},encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    const manifest=JSON.parse(fs.readFileSync(path.join(config,'BraveSoftware/Brave-Browser/NativeMessagingHosts/com.catnap.suno_mcp.json'),'utf8'));
    assert.deepEqual(manifest.allowed_origins,['chrome-extension://'+extensionId+'/']);
    assert.equal(fs.existsSync(path.join(config,'google-chrome')),false);
    const body=Buffer.from('{"operation":"health"}'),header=Buffer.alloc(4);header.writeUInt32LE(body.length);
    const probe=spawnSync(manifest.path,[],{input:Buffer.concat([header,body]),timeout:5000});
    assert.equal(probe.status,0,String(probe.stderr));
    const length=probe.stdout.readUInt32LE(0),reply=JSON.parse(probe.stdout.subarray(4,4+length));
    assert.equal(reply.ready,true);assert.equal(reply.version,'0.6.0');
  } finally { fs.rmSync(temporary,{recursive:true,force:true}); }
});

test('Linux registration permits both explicitly supplied IDs and rejects wildcards without changing trust',()=>{
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'catnap native ids '));
  try {
    const config=path.join(temporary,'config'),data=path.join(temporary,'data');
    const first='abcdefghijklmnopabcdefghijklmnop',second='ponmlkjihgfedcbaponmlkjihgfedcba';
    const install=ids=>spawnSync('bash',[path.join(__dirname,'../native/install-linux.sh'),ids,'brave'],{env:{...process.env,XDG_CONFIG_HOME:config,XDG_DATA_HOME:data},encoding:'utf8'});
    const filename=path.join(config,'BraveSoftware/Brave-Browser/NativeMessagingHosts/com.catnap.suno_mcp.json');
    const installed=install(first+', '+second+', '+first);assert.equal(installed.status,0,installed.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(filename,'utf8')).allowed_origins,[first,second].map(id=>'chrome-extension://'+id+'/'));
    const before=fs.readFileSync(filename,'utf8');
    for(const invalid of [first+',*',first+',',','+first,first+',, '+second])assert.notEqual(install(invalid).status,0);
    assert.equal(fs.readFileSync(filename,'utf8'),before);
    const one=install(second);assert.equal(one.status,0,one.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(filename,'utf8')).allowed_origins,['chrome-extension://'+second+'/']);
    const launcher=JSON.parse(fs.readFileSync(filename,'utf8')).path;
    const body=Buffer.from('{"operation":"health"}'),header=Buffer.alloc(4);header.writeUInt32LE(body.length);
    const probe=spawnSync(launcher,[],{input:Buffer.concat([header,body]),timeout:5000});
    assert.equal(probe.status,0,String(probe.stderr));assert.equal(JSON.parse(probe.stdout.subarray(4)).ready,true);
  } finally { fs.rmSync(temporary,{recursive:true,force:true}); }
});

test('native framing handles a split header and payload without exposing extra text', async()=>{
  const {runNativeHost} = await nativeModule(), input = new PassThrough(), output = new PassThrough(), buffers=[];
  output.on('data',value=>buffers.push(value));runNativeHost(input,output);
  const body=Buffer.from(JSON.stringify({operation:'health'})),header=Buffer.alloc(4);header.writeUInt32LE(body.length);
  input.write(header.subarray(0,2));input.write(Buffer.concat([header.subarray(2),body.subarray(0,4)]));input.write(body.subarray(4));
  await new Promise(resolve=>setImmediate(resolve));
  const reply=Buffer.concat(buffers),size=reply.readUInt32LE(0),data=JSON.parse(reply.subarray(4,4+size));
  assert.equal(reply.length,size+4);assert.equal(data.ready,true);input.destroy();output.destroy();
});

test('native host starts when the launcher uses a symlinked script path',()=>{
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'catnap native alias '));
  try {
    const alias=path.join(temporary,'host-alias.mjs');
    // File symlink creation can require Windows developer mode. The observed
    // production failure is macOS /var -> /private/var, so test this Unix path.
    if(process.platform==='win32')return;
    fs.symlinkSync(path.join(__dirname,'../native/catnap-suno-host.mjs'),alias);
    const body=Buffer.from('{"operation":"health"}'),header=Buffer.alloc(4);header.writeUInt32LE(body.length);
    const result=spawnSync(process.execPath,[alias],{input:Buffer.concat([header,body]),timeout:5000});
    assert.equal(result.status,0,String(result.stderr));assert.ok(result.stdout.length>=4,'symlinked native entry point must start');
    assert.equal(JSON.parse(result.stdout.subarray(4)).ready,true);
  } finally { fs.rmSync(temporary,{recursive:true,force:true}); }
});

test('native diagnostic summary keeps only protocol keys, known codes and public scope names',async()=>{
  const {diagnosticSummary}=await nativeModule();
  const token='never-log-this-token-123',privateName='Private person and playlist name';
  const body=JSON.stringify({jsonrpc:'2.0',id:1,result:{isError:true,content:[{type:'text',text:JSON.stringify({error:{code:'insufficient_scope',message:'Missing scope profile:read; Bearer '+token,required_scopes:['profile:read','private:'+privateName]},[privateName]:token})}]}});
  const result=diagnosticSummary({method:'tools/call',params:{name:'playlists-list'},id:1},{status:200,contentType:'application/json',body});
  assert.equal(result.isError,true);assert.deepEqual(result.errorCodes,['insufficient_scope']);assert.deepEqual(result.requiredScopes,['profile:read']);
  assert.ok(result.hints.includes('scope'));assert.equal(JSON.stringify(result).includes(token),false);assert.equal(JSON.stringify(result).includes(privateName),false);
  assert.deepEqual(result.toolJsonKeys,['error']);
});

test('native diagnostics are opt-in, owner-only, no-follow and bounded',async()=>{
  const {recordDiagnostic}=await nativeModule();if(process.platform==='win32')return;
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'catnap diagnostics '));
  try {
    const filename=path.join(temporary,'diagnostics.jsonl'),summary={method:'tools/call',tool:'playlists-list',status:200,isError:true,errorCodes:['insufficient_scope']};
    assert.equal(recordDiagnostic(summary,{enabled:true,filename}),false,'must not create a file implicitly');
    fs.writeFileSync(filename,'',{mode:0o600});
    assert.equal(recordDiagnostic(summary,{enabled:false,filename}),false);assert.equal(fs.readFileSync(filename,'utf8'),'');
    assert.equal(recordDiagnostic(summary,{enabled:true,filename}),true);assert.equal(JSON.parse(fs.readFileSync(filename,'utf8')).tool,'playlists-list');
    fs.chmodSync(filename,0o644);assert.equal(recordDiagnostic(summary,{enabled:true,filename}),false);
    fs.chmodSync(filename,0o600);const alias=path.join(temporary,'alias.jsonl');fs.symlinkSync(filename,alias);assert.equal(recordDiagnostic(summary,{enabled:true,filename:alias}),false);
    fs.writeFileSync(filename,'x'.repeat(65536));assert.equal(recordDiagnostic(summary,{enabled:true,filename}),false);
  } finally {fs.rmSync(temporary,{recursive:true,force:true});}
});

// Exact managed order uses only documented removal + append primitives.
function orderedFixture(initial,{intercept,transport}={}){
  let order=initial.slice();const calls=[],chrome=fixture();
  const native=rpcTransport(async(name,args,index)=>{
    calls.push({name,args:structuredClone(args)});
    if(intercept){const value=await intercept({name,args,index,get order(){return order;},set order(next){order=next;}});if(value!==undefined)return value;}
    if(name==='playlists-list-clips')return {clips:order.map(id=>({id})),next_cursor:null};
    if(name==='playlists-remove-clips'){order=order.filter(id=>!args.clip_ids.includes(id));return {removed:args.clip_ids};}
    if(name==='playlists-add-clips'){order.push(...args.clip_ids);return {added:args.clip_ids,failed:[]};}
    throw Error('Unexpected fixture operation');
  });
  const client=library.createClient({chrome,transport:transport?message=>transport(message,native):native,now:()=>1000});
  return {client,calls,get order(){return order;},set order(next){order=next;}};
}

test('managed order retains the matching prefix and rebuilds only the changed suffix with readbacks',async()=>{
  const [a,b,c,d]=[1,2,3,4].map(makeId),f=orderedFixture([a,b,c]);
  const checkpoints=[];
  const result=await f.client.reconcileOrderedPlaylist(makeId(99),[a,c,b,d],{ownedIds:[a,b,c,d],onCheckpoint:value=>{checkpoints.push(value.actualOrder);}});
  assert.deepEqual(f.order,[a,c,b,d]);assert.equal(result.orderVerified,true);assert.deepEqual(result.actualOrder,[a,c,b,d]);
  assert.deepEqual(f.calls.filter(call=>call.name!=='playlists-list-clips'),[
    {name:'playlists-remove-clips',args:{id:makeId(99),clip_ids:[b,c]}},
    {name:'playlists-add-clips',args:{id:makeId(99),clip_ids:[c,b,d]}}
  ]);
  assert.deepEqual(checkpoints,[[a],[a,c,b,d]]);assert.deepEqual(result.missing,[]);
});

test('managed hold removes an owned upcoming track and foreign tracks fail closed before writes',async()=>{
  const [a,b,c]=[1,2,3].map(makeId),f=orderedFixture([a,b,c]);
  assert.equal((await f.client.reconcileOrderedPlaylist(makeId(99),[a,c],{ownedIds:[a,b,c]})).orderVerified,true);
  assert.deepEqual(f.order,[a,c]);
  const foreign=orderedFixture([a,b,c]);
  await assert.rejects(foreign.client.reconcileOrderedPlaylist(makeId(99),[a],{ownedIds:[a,b]}),/outside the managed show/);
  assert.equal(foreign.calls.some(call=>call.name!=='playlists-list-clips'),false);
  const noOwnership=orderedFixture([a]);
  await assert.rejects(noOwnership.client.reconcileOrderedPlaylist(makeId(99),[a]),/Take management/);
  assert.equal(noOwnership.calls.length,0);
});

test('a protected loaded song defers a destructive suffix rebuild without touching playback or playlist',async()=>{
  const [a,b,c]=[1,2,3].map(makeId),f=orderedFixture([a,b,c]);
  const result=await f.client.reconcileOrderedPlaylist(makeId(99),[a,c,b],{ownedIds:[a,b,c],protectedIds:[c]});
  assert.equal(result.deferred,true);assert.equal(result.orderVerified,false);assert.match(result.reason,/loaded or playing/);
  assert.deepEqual(f.order,[a,b,c]);assert.equal(f.calls.some(call=>call.name!=='playlists-list-clips'),false);
});

test('fresh current-track and show guards prevent every remote mutation after a context change',async()=>{
  const [a,b]=[1,2].map(makeId),f=orderedFixture([a,b]);let checks=0;
  await assert.rejects(f.client.reconcileOrderedPlaylist(makeId(99),[b,a],{ownedIds:[a,b],isCurrent:async()=>false}),/changed/);
  assert.equal(f.calls.some(call=>call.name!=='playlists-list-clips'),false);
  const live=orderedFixture([a,b]);
  await assert.rejects(live.client.reconcileOrderedPlaylist(makeId(99),[b,a],{ownedIds:[a,b],beforeMutation:async()=>{checks++;return false;}}),/current song is protected/);
  assert.equal(checks,1);assert.equal(live.calls.some(call=>call.name!=='playlists-list-clips'),false);
});

test('uncertain removal and append are confirmed by readback and a later retry never duplicates',async()=>{
  const [a,b,c]=[1,2,3].map(makeId);
  const g=orderedFixture([a,b],{intercept:state=>{
    if(state.name==='playlists-remove-clips'){state.order=state.order.filter(id=>!state.args.clip_ids.includes(id));return {transportFailure:true};}
    if(state.name==='playlists-add-clips'){state.order=state.order.concat(state.args.clip_ids);return {transportFailure:true};}
  }});
  const opts={ownedIds:[a,b,c]};
  const first=await g.client.reconcileOrderedPlaylist(makeId(99),[a,c,b],opts);assert.equal(first.orderVerified,true);assert.deepEqual(first.failures,[]);
  const writes=g.calls.filter(call=>call.name!=='playlists-list-clips').length;
  assert.equal((await g.client.reconcileOrderedPlaylist(makeId(99),[a,c,b],opts)).orderVerified,true);
  assert.equal(g.calls.filter(call=>call.name!=='playlists-list-clips').length,writes);assert.deepEqual(g.order,[a,c,b]);
});

test('a provider mismatch stops the remaining rebuild and exposes a retryable verified partial order',async()=>{
  const [a,b,c]=[1,2,3].map(makeId),f=orderedFixture([a,b],{intercept:state=>{
    if(state.name==='playlists-remove-clips')return {removed:[],failed:[b]};
  }});
  const result=await f.client.reconcileOrderedPlaylist(makeId(99),[a,c,b],{ownedIds:[a,b,c]});
  assert.equal(result.orderVerified,false);assert.deepEqual(result.actualOrder,[a,b]);assert.equal(result.failures.length,1);
  assert.equal(f.calls.some(call=>call.name==='playlists-add-clips'),false);
});

test('duplicate native IDs cannot silently remove a protected retained prefix',async()=>{
  const [a,b]=[1,2].map(makeId),f=orderedFixture([a,b,a]);
  const result=await f.client.reconcileOrderedPlaylist(makeId(99),[a,b],{ownedIds:[a,b],protectedIds:[a]});
  assert.equal(result.deferred,true);assert.deepEqual(f.order,[a,b,a]);assert.equal(f.calls.some(call=>call.name==='playlists-remove-clips'),false);
  const g=orderedFixture([a,b,a]);assert.equal((await g.client.reconcileOrderedPlaylist(makeId(99),[a,b],{ownedIds:[a,b]})).orderVerified,true);assert.deepEqual(g.order,[a,b]);
});

test('an older helper keeps append-only capability and reports a specific upgrade before removal',async()=>{
  const [a,b]=[1,2].map(makeId),f=orderedFixture([a,b],{transport:(message,native)=>message.request?.params?.name==='playlists-remove-clips'?{ok:false,error:'unsupported_request'}:native(message)});
  await assert.rejects(f.client.reconcileOrderedPlaylist(makeId(99),[b,a],{ownedIds:[a,b]}),/Update the Catnap Suno companion/);
  assert.deepEqual(f.order,[a,b]);assert.equal(f.calls.some(call=>call.name==='playlists-add-clips'),false);
  assert.equal((await f.client.reconcilePlaylist(makeId(99),[a,b,makeId(3)])).confirmed,3);
});

test('ordered and append-only writers share one mutation lock',async()=>{
  let resolveRead;const waiting=new Promise(resolve=>{resolveRead=resolve;}),a=makeId(1);
  const f=orderedFixture([a],{intercept:async state=>{if(state.name==='playlists-list-clips')await waiting;}});
  const first=f.client.reconcileOrderedPlaylist(makeId(99),[a],{ownedIds:[a]});
  await assert.rejects(f.client.reconcilePlaylist(makeId(99),[a]),/already running/);resolveRead();assert.equal((await first).orderVerified,true);
});

test('native removal accepts only the bounded exact playlist and song argument shape',async()=>{
  const {handleMessage}=await nativeModule();let calls=0;
  const message={operation:'rpc',token:'demo-access-only',request:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'playlists-remove-clips',arguments:{id:makeId(99),clip_ids:[makeId(1)]}}}};
  const network=async(url,init)=>{calls++;const rpc=JSON.parse(init.body);assert.equal(rpc.params.name,'playlists-remove-clips');assert.deepEqual(rpc.params.arguments,message.request.params.arguments);return Response.json({jsonrpc:'2.0',id:1,result:{structuredContent:{removed:[]}}});};
  assert.equal((await handleMessage(message,network)).ok,true);assert.equal(calls,1);
  for(const args of [{id:makeId(99),clip_ids:[]},{id:makeId(99),clip_ids:[makeId(1)],all:true},{id:makeId(99),clip_ids:['wrong']},{id:makeId(99),clip_ids:Array(26).fill(makeId(1))}]){
    assert.equal((await handleMessage({...message,request:{...message.request,params:{...message.request.params,arguments:args}}},network)).ok,false);
  }
  assert.equal(calls,1);
});

test('a concurrent manual playlist edit discovered immediately before a write stops the managed rebuild',async()=>{
  const [a,b,c]=[1,2,3].map(makeId);let reads=0;
  const f=orderedFixture([a,b],{intercept:state=>{
    if(state.name==='playlists-list-clips'&&++reads===2)state.order=[a,c,b];
  }});
  await assert.rejects(f.client.reconcileOrderedPlaylist(makeId(99),[b,a],{ownedIds:[a,b,c]}),/changed before a write/);
  assert.equal(f.calls.some(call=>call.name!=='playlists-list-clips'),false);assert.deepEqual(f.order,[a,c,b]);
});

test('managed rebuilds bound every mutation batch and retain exact readback order across multiple batches',async()=>{
  const original=Array.from({length:53},(_,index)=>makeId(index+1)),desired=original.slice().reverse(),f=orderedFixture(original);
  const result=await f.client.reconcileOrderedPlaylist(makeId(99),desired,{ownedIds:original});assert.equal(result.orderVerified,true);assert.deepEqual(f.order,desired);
  const mutations=f.calls.filter(call=>call.name!=='playlists-list-clips');assert.equal(mutations.length,6);
  assert.equal(mutations.every(call=>call.args.clip_ids.length<=25),true);
  assert.deepEqual(mutations.map(call=>call.name),Array(3).fill('playlists-remove-clips').concat(Array(3).fill('playlists-add-clips')));
});

test('ownership read rejects unidentified provider rows rather than silently ignoring possible unrelated songs',async()=>{
  const chrome=fixture(),client=library.createClient({chrome,now:()=>1000,transport:rpcTransport(async()=>({clips:[{title:'Unidentified private row'}]}))});
  await assert.rejects(client.readPlaylist(makeId(99)),/cannot be safely identified/);
});
