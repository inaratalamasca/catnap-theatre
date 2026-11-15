/* Catnap Suno playlist client, SCRIPT_VERSION 0.6.0.
 * Change: independent OAuth/PKCE, session-only authorization and verified MCP
 * playlist reconciliation. The native companion is only a bounded transport.
 */
(function (root, factory) {
  const library = factory();
  if (typeof module === 'object' && module.exports) module.exports = library;
  else { root.CatnapSunoMcp = library; root.CatnapSuno = library.createClient(); }
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const VERSION = '0.6.0', HOST = 'com.catnap.suno_mcp';
  const RESOURCE = 'https://api.suno.com/mcp';
  const ISSUER = 'https://studio-api-prod.suno.com/api/v2/external/oauth/';
  // Profile access is required by Suno's playlist tools in addition to library
  // access (verified provider insufficient_scope response, November 15, 2026).
  // This schema is independent of the native wire protocol/version below.
  const SCOPE_VERSION = 2;
  const REQUESTED_SCOPES = ['api:v0','library:read','library:write','profile:read','offline_access'];
  const REQUIRED_API_SCOPES = REQUESTED_SCOPES.filter(scope=>scope!=='offline_access');
  const SCOPE = REQUESTED_SCOPES.join(' ');
  const AUTH_KEY = 'catnapSunoAuthorization', CLIENT_KEY = 'catnapSunoRegistration';
  const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  const TOOL_NAMES = ['playlists-list', 'playlists-list-clips', 'playlists-create', 'playlists-add-clips'];
  function clipMetadata(value) {
    const id = String(value?.id || value?.clip_id || '').toLowerCase();
    if (!UUID.test(id)) return null;
    const text = input => typeof input === 'string' ? input.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,200) : '';
    let artworkUrl = null;
    try {
      const art = new URL(value.image_large_url || value.image_url || value.artworkUrl || '');
      if (art.protocol === 'https:' && ['cdn1.suno.ai','cdn2.suno.ai','cdn.suno.ai'].includes(art.hostname) && !art.username && !art.password && /\.(?:png|jpe?g|webp|gif|avif)$/i.test(art.pathname)) {
        art.search = ''; art.hash = ''; if (art.href.length <= 2048) artworkUrl = art.href;
      }
    } catch (_) { /* Unknown artwork remains unavailable. */ }
    const duration = value.duration_seconds ?? value.duration ?? value.metadata?.duration;
    return {id,url:'https://suno.com/song/'+id,title:text(value.title || value.name),
      artist:text(value.display_name || value.artist || value.creator?.display_name || value.creator?.handle || value.handle),artworkUrl,
      durationSeconds:typeof duration === 'number' && Number.isFinite(duration) && duration > 0 && duration <= 86400 ? duration : null};
  }
  function ids(values) {
    if (!Array.isArray(values) || values.length > 2000) throw Error('Choose at most 2000 Suno songs.');
    const out = [], seen = new Set();
    for (const value of values) {
      if (typeof value !== 'string' || !UUID.test(value)) throw Error('A Suno song identifier is invalid.');
      const id = value.toLowerCase(); if (!seen.has(id)) { seen.add(id); out.push(id); }
    }
    return out;
  }
  function decodeRpc(response, requestId) {
    if (!response || response.ok !== true) {
      const status = Number(response?.status);
      if (status === 401) throw Error('Suno authorization expired. Reconnect Suno.');
      if (status === 403) throw Error('Suno denied MCP access for this account.');
      if (status === 429) throw Error('Suno rate limit reached. Retry later.');
      if (response?.error === 'network_failure') throw Error('The Suno companion could not reach the MCP service. Check the host network and retry.');
      throw Error(response?.error === 'companion_unavailable' ? 'Install the Catnap Suno companion first.' : 'The Suno companion could not complete the request.');
    }
    const body = String(response.body || '');
    if (body.length > 900000) throw Error('Suno returned too much data.');
    if (requestId === undefined) return null;
    const candidates = [];
    if (String(response.contentType).includes('text/event-stream')) {
      for (const event of body.split(/\r?\n\r?\n/)) {
        const payload = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (payload) { try { candidates.push(JSON.parse(payload)); } catch (_) { /* Ignore non-JSON SSE frames. */ } }
      }
    } else { try { candidates.push(JSON.parse(body)); } catch (_) { throw Error('Suno returned invalid JSON.'); } }
    const frame = candidates.find(item => item?.jsonrpc === '2.0' && item.id === requestId);
    if (!frame || frame.error || !Object.hasOwn(frame, 'result')) throw Error('Suno did not confirm this MCP operation.');
    return frame.result;
  }
  function providerToolError(result) {
    let insufficient=false;const missing=new Set();
    function inspect(value,depth=0) {
      if(depth>4||value===null||value===undefined)return;
      if(typeof value==='string'){
        if(/insufficient_scope|missing.{0,30}scope|scope.{0,30}(?:required|missing)/i.test(value))insufficient=true;
        // Only known public scope labels can enter the user-facing error. Raw
        // provider strings, identifiers, URLs and credentials are never echoed.
        if(/scope/i.test(value))for(const scope of REQUESTED_SCOPES)if(value.includes(scope))missing.add(scope);
        return;
      }
      if(typeof value!=='object'||Array.isArray(value))return;
      for(const key of ['error','code','message','error_description','detail','data','structuredContent'])if(Object.hasOwn(value,key))inspect(value[key],depth+1);
      for(const key of ['required_scopes','missing_scopes','requiredScopes','missingScopes'])if(Object.hasOwn(value,key)){
        const scopes=Array.isArray(value[key])?value[key]:typeof value[key]==='string'?value[key].split(/\s+/):[];
        for(const scope of scopes)if(REQUESTED_SCOPES.includes(scope)){missing.add(scope);insufficient=true;}
      }
      if(Array.isArray(value.content))for(const item of value.content.slice(0,4))if(item?.type==='text'&&typeof item.text==='string'){
        try{inspect(JSON.parse(item.text),depth+1);}catch(_){inspect(item.text.slice(0,4000),depth+1);}
      }
    }
    inspect(result);
    return Error(insufficient?'Suno playlist access is missing '+([...missing].sort().join(', ')||'required permissions')+'. Choose Connect Suno again and approve the requested access.':'Suno rejected this playlist operation.');
  }
  function toolData(result) {
    if (!result || result.isError) throw providerToolError(result);
    if (result.structuredContent && typeof result.structuredContent === 'object') {
      if(result.structuredContent.error)throw providerToolError(result.structuredContent);
      return result.structuredContent;
    }
    const chunk = result.content?.find(item => item.type === 'text' && typeof item.text === 'string');
    let data; try { data = JSON.parse(chunk?.text || ''); } catch (_) { throw Error('Suno returned an unsupported tool response.'); }
    if (!data || typeof data !== 'object' || data.error) throw providerToolError(data);
    return data;
  }
  function createClient(options = {}) {
    const browser = options.chrome || globalThis.chrome;
    const network = options.fetch || globalThis.fetch;
    const cryptoApi = options.crypto || globalThis.crypto;
    const clock = options.now || (() => Date.now());
    const transport = options.transport || (async message => {
      try { return await browser.runtime.sendNativeMessage(HOST, message); }
      catch (_) { return {ok:false, error:'companion_unavailable'}; }
    });
    let writeActive = false;
    function available() { if (!browser?.storage?.session || !browser?.identity) throw Error('Suno connection requires the extension control panel.'); }
    async function readAuth() { available(); return (await browser.storage.session.get(AUTH_KEY))[AUTH_KEY]; }
    const bytes64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const nonce = length => bytes64(cryptoApi.getRandomValues(new Uint8Array(length)));
    async function jsonFetch(url, init, stage) {
      let response;
      try { response = await network(url, {...init, redirect:'error', credentials:'omit', signal:AbortSignal.timeout(15000)}); }
      catch (error) {
        if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw Error(stage + ' timed out or was interrupted. Check the network and retry.');
        throw Error(stage + ' could not reach Suno from this browser. Enable inbox & Suno access first; if access is already enabled, check browser network blocking.');
      }
      if (!response.ok) throw Error(stage + ' failed (HTTP ' + response.status + ').');
      let data;try { data = await response.json(); } catch (_) { throw Error(stage + ' returned an unreadable response.'); }
      if (!data || typeof data !== 'object') throw Error(stage + ' returned invalid authorization data.');
      return data;
    }
    function clientCompatible(value,redirectUri) {
      return value?.scopeVersion===SCOPE_VERSION&&value.redirectUri===redirectUri&&typeof value.clientId==='string'&&value.clientId.length>0&&value.clientId.length<=1000&&
        Array.isArray(value.requestedScopes)&&value.requestedScopes.join(' ')===SCOPE;
    }
    function authorizationCompatible(auth) {
      if(auth?.scopeVersion!==SCOPE_VERSION||typeof auth.clientId!=='string'||!auth.clientId||!Array.isArray(auth.requestedScopes)||auth.requestedScopes.join(' ')!==SCOPE)return false;
      // OAuth may omit scope when the complete requested scope was granted.
      // When it is returned explicitly, use the provider's actual granted list.
      const effective=Array.isArray(auth.grantedScopes)?auth.grantedScopes:auth.requestedScopes;
      return REQUIRED_API_SCOPES.every(scope=>effective.includes(scope));
    }
    async function registration({allowCreate=false}={}) {
      available();
      const redirectUri = browser.identity.getRedirectURL('suno');
      const existing = (await browser.storage.local.get(CLIENT_KEY))[CLIENT_KEY];
      if (clientCompatible(existing,redirectUri)) return existing;
      // Client/scope migration is interactive only. A refresh token must never
      // be sent to a newly registered client behind the user's back.
      if(!allowCreate)throw Error('Reconnect Suno to approve the current playlist permissions.');
      const body = {client_name:'Catnap Theatre Inbox', redirect_uris:[redirectUri], response_types:['code'],
        grant_types:['authorization_code','refresh_token'], token_endpoint_auth_method:'none', scope:SCOPE};
      const result = await jsonFetch(ISSUER + 'register/', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)}, 'Suno client registration');
      if (typeof result.client_id !== 'string' || !result.client_id || result.client_id.length > 1000) throw Error('Suno did not register this extension.');
      const client = {clientId:result.client_id,redirectUri,scopeVersion:SCOPE_VERSION,requestedScopes:REQUESTED_SCOPES.slice()};
      await browser.storage.local.set({[CLIENT_KEY]:client}); return client;
    }
    async function exchange(fields, previousRefresh) {
      const result = await jsonFetch(ISSUER + 'token/', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({...fields, resource:RESOURCE})}, fields.grant_type==='refresh_token'?'Suno token refresh':'Suno token exchange');
      if (typeof result.access_token !== 'string' || !result.access_token || /[\r\n]/.test(result.access_token)) throw Error('Suno returned no usable access token.');
      const scopeReturned=typeof result.scope==='string'||Array.isArray(result.scope);
      const rawGranted=Array.isArray(result.scope)?result.scope:typeof result.scope==='string'?result.scope.split(/\s+/):[];
      const grantedScopes=scopeReturned?[...new Set(rawGranted.filter(scope=>REQUESTED_SCOPES.includes(scope)))]:null;
      if(grantedScopes&&REQUIRED_API_SCOPES.some(scope=>!grantedScopes.includes(scope)))throw Error('Suno did not grant all required playlist permissions. Choose Connect Suno again and approve profile and library access.');
      const auth = {accessToken:result.access_token, refreshToken:result.refresh_token || previousRefresh || '',
        expiresAt:clock() + (Math.max(1, Number(result.expires_in) || 3600) * 1000),clientId:fields.client_id,
        scopeVersion:SCOPE_VERSION,requestedScopes:REQUESTED_SCOPES.slice(),grantedScopes};
      await browser.storage.session.set({[AUTH_KEY]:auth}); return auth;
    }
    async function connect() {
      available();
      const ready = await transport({operation:'health'});
      if (!ready?.ok || !ready.ready) throw Error('Install the Catnap Suno companion before connecting Suno.');
      // In particular, canceling a scope upgrade must not retain a legacy
      // token while the cached registration now names a different client.
      await browser.storage.session.remove(AUTH_KEY);
      const client = await registration({allowCreate:true}), verifier = nonce(48), state = nonce(24);
      const digest = await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
      const target = new URL(ISSUER + 'authorize/');
      Object.entries({client_id:client.clientId,redirect_uri:client.redirectUri,response_type:'code',scope:SCOPE,
        resource:RESOURCE,code_challenge:bytes64(new Uint8Array(digest)),code_challenge_method:'S256',state}).forEach(([key,value])=>target.searchParams.set(key,value));
      const returned = await browser.identity.launchWebAuthFlow({url:target.href, interactive:true});
      let callback; try { callback = new URL(returned); } catch (_) { throw Error('Suno sign-in was not completed.'); }
      const expected = new URL(client.redirectUri);
      if (callback.origin !== expected.origin || callback.pathname !== expected.pathname || callback.hash || callback.searchParams.get('state') !== state) throw Error('Suno returned an unexpected sign-in callback.');
      const code = callback.searchParams.get('code');
      if (!code || callback.searchParams.has('error')) throw Error('Suno authorization was declined.');
      await exchange({grant_type:'authorization_code',client_id:client.clientId,redirect_uri:client.redirectUri,code,code_verifier:verifier});
      return status();
    }
    async function status() {
      const auth = await readAuth();
      const compatible=authorizationCompatible(auth);
      return {connected:Boolean(compatible&&auth?.accessToken&&(auth.expiresAt>clock()+45000||auth.refreshToken)),expiresAt:compatible?auth.expiresAt:null,reconnectRequired:Boolean(auth&&!compatible)};
    }
    async function disconnect() { available(); await browser.storage.session.remove(AUTH_KEY); return {connected:false, expiresAt:null}; }
    async function accessToken() {
      const auth = await readAuth();
      if (!auth?.accessToken) throw Error('Connect Suno first.');
      if(!authorizationCompatible(auth))throw Error('Reconnect Suno to approve profile:read and library access for playlist operations.');
      if (auth.expiresAt > clock() + 45000) return auth.accessToken;
      if (!auth.refreshToken) throw Error('Suno authorization expired. Reconnect Suno.');
      try {
        const client = await registration();
        if(client.clientId!==auth.clientId)throw Error('Reconnect Suno; the authorization belongs to a different client.');
        return (await exchange({grant_type:'refresh_token',client_id:client.clientId,refresh_token:auth.refreshToken}, auth.refreshToken)).accessToken;
      } catch (_) { await disconnect(); throw Error('Suno authorization expired. Reconnect Suno.'); }
    }
    async function connection() {
      const token = await accessToken(); let sessionId = '', serial = 0;
      async function rpc(method, params, notification = false) {
        const request = {jsonrpc:'2.0',method,params}; if (!notification) request.id = ++serial;
        const response = await transport({operation:'rpc',token,sessionId,request});
        if (typeof response?.sessionId === 'string') sessionId = response.sessionId;
        return decodeRpc(response, request.id);
      }
      await rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'catnap-theatre-inbox',version:VERSION}});
      await rpc('notifications/initialized',{},true);
      const tools = await rpc('tools/list',{}), offered = new Set((tools?.tools || []).map(tool=>tool.name));
      return {call:async (name,args) => {
        if (!TOOL_NAMES.includes(name) || !offered.has(name)) throw Error('Suno MCP does not offer ' + name + '.');
        return toolData(await rpc('tools/call',{name,arguments:args}));
      }};
    }
    async function pages(link, name, args = {}) {
      const results = [], cursors = new Set(); let cursor = '';
      for (let count = 0; count < 80; count++) {
        const data = await link.call(name,{...args,limit:50,...(cursor?{cursor}:{})});
        const rows = data[name === 'playlists-list' ? 'playlists' : 'clips'] || data.items;
        if (!Array.isArray(rows)) throw Error('Suno returned an unsupported playlist page.');
        results.push(...rows); if (results.length > 4000) throw Error('This playlist exceeds the synchronization limit.');
        if (!data.next_cursor) return results;
        if (typeof data.next_cursor !== 'string' || cursors.has(data.next_cursor)) throw Error('Suno returned an invalid playlist cursor.');
        cursor = data.next_cursor; cursors.add(cursor);
      }
      throw Error('Suno pagination did not finish.');
    }
    async function listPlaylists() { return pages(await connection(),'playlists-list'); }
    async function readPlaylist(playlistId) {
      if (!UUID.test(String(playlistId))) throw Error('Choose a valid Suno playlist.');
      return (await pages(await connection(),'playlists-list-clips',{id:playlistId})).map(clipMetadata).filter(Boolean);
    }
    async function createPlaylist(name, visibility = 'private') {
      if (typeof name !== 'string' || !name.trim() || name.length > 100 || /[\r\n]/.test(name)) throw Error('Enter a playlist name of 1–100 characters.');
      if (!['private','public'].includes(visibility)) throw Error('Choose private or public visibility.');
      const result = await (await connection()).call('playlists-create',{name:name.trim(),visibility});
      if (!UUID.test(String(result.id))) throw Error('Suno did not confirm the created playlist.');
      return {id:result.id,name:result.name || name.trim(),visibility:result.visibility || visibility};
    }
    async function reconcilePlaylist(playlistId, songIds, {isCurrent = async()=>true} = {}) {
      if (writeActive) throw Error('A playlist sync is already running.');
      if (!UUID.test(String(playlistId))) throw Error('Choose a valid Suno playlist.');
      const desired = ids(songIds); writeActive = true;
      try {
        const link = await connection();
        const readRows = async()=>pages(link,'playlists-list-clips',{id:playlistId});
        const membership = rows=>new Set(rows.map(row=>String(row.id || row.clip_id || '').toLowerCase()).filter(id=>UUID.test(id)));
        const beforeRows = await readRows(), before = membership(beforeRows), missing = desired.filter(id=>!before.has(id)), failures = [];
        for (let offset = 0; offset < missing.length; offset += 25) {
          if (!await isCurrent()) throw Error('The show or destination playlist changed. Sync stopped.');
          const batch = missing.slice(offset,offset+25);
          try {
            const result = await link.call('playlists-add-clips',{id:playlistId,clip_ids:batch});
            if (!Array.isArray(result.added) && !Array.isArray(result.failed)) throw Error('Suno did not report the batch result.');
            for (const item of result.failed || []) failures.push({id:String(item.id || item.clip_id || ''),reason:'Suno rejected this song.'});
          } catch (error) {
            if (/authorization|denied|rate limit|Reconnect/i.test(error.message)) throw error;
            batch.forEach(id=>failures.push({id,reason:'Write uncertain; checked by playlist readback.'}));
          }
        }
        if (!await isCurrent()) throw Error('The show or destination playlist changed. Sync stopped.');
        const afterRows = missing.length ? await readRows() : beforeRows, after = membership(afterRows);
        return {requested:desired.length,alreadyPresent:desired.filter(id=>before.has(id)).length,
          added:desired.filter(id=>after.has(id)&&!before.has(id)).length,confirmed:desired.filter(id=>after.has(id)).length,
          missing:desired.filter(id=>!after.has(id)),failures:failures.filter(item=>!after.has(item.id)),clips:afterRows.map(clipMetadata).filter(Boolean)};
      } finally { writeActive = false; }
    }
    return {connect,disconnect,status,listPlaylists,readPlaylist,createPlaylist,reconcilePlaylist};
  }
  return {VERSION,HOST,TOOL_NAMES,SCOPE_VERSION,REQUESTED_SCOPES,createClient,decodeRpc,toolData,providerToolError,ids,clipMetadata};
});
