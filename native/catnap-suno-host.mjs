#!/usr/bin/env node
/** Catnap native Suno transport, SCRIPT_VERSION 0.6.0.
 * Restricted stdio client: no listening server, disk credentials or dynamic URL.
 * Change summary: five explicit playlist MCP tools and optional owner-only
 * sanitized incident categories. Wire version stays compatible with 0.6.0.
 */
import {fileURLToPath} from 'node:url';
import {resolve,dirname,join} from 'node:path';
import {realpathSync,constants,openSync,fstatSync,writeSync,closeSync} from 'node:fs';

export const SCRIPT_VERSION = '0.6.0';
const ENDPOINT = 'https://api.suno.com/mcp';
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const MAX_FRAME = 1024 * 1024, MAX_BODY = 700000;
// 0.8 preview adds an explicitly scoped removal primitive. The wire protocol
// remains 0.6.0 so existing read/append-only clients remain compatible.
const TOOLS = new Set(['playlists-list','playlists-list-clips','playlists-create','playlists-add-clips','playlists-remove-clips']);
const DIAGNOSTIC_FILE=join(dirname(fileURLToPath(import.meta.url)),'catnap-suno-diagnostics.jsonl');
const ERROR_CODES=new Set(['insufficient_scope','invalid_scope','invalid_token','expired_token','token_expired','user_principal_required','beta_access_required','mcp_access_denied','permission_denied','access_denied','not_authorized','unauthorized','forbidden','library_access_required','account_not_eligible','server_error','internal_error','rate_limited','rate_limit_exceeded','not_found','invalid_arguments','invalid_params','unsupported_tool','tool_not_found','tool_execution_error','tool_error','authentication_required','authentication_error','validation_error','invalid_request']);
const PUBLIC_SCOPES=new Set(['api:v0','credits:spend','download','library:read','library:search','library:write','offline_access','profile:read','profile:write','create:read','create:search','create:generate','create:upload','create:playback','catalog:read','catalog:sync','catalog:link','studio:write','telemetry:write']);
const SHAPE_KEYS=new Set(['jsonrpc','id','result','error','content','structuredContent','isError','code','type','message','error_description','required_scopes','missing_scopes','status','status_code','error_code','data','detail','details']);

/** Extract only public protocol labels and whitelisted failure categories.
 * Never return free text, URLs, identifiers, token strings or user data.
 */
export function diagnosticSummary(request,response) {
  const summary={version:SCRIPT_VERSION,method:request.method,status:Number(response.status)||0,
    tool:request.method==='tools/call'&&TOOLS.has(request.params?.name)?request.params.name:null,
    envelopeKeys:[],resultKeys:[],toolJsonKeys:[],isError:false,errorCodes:[],requiredScopes:[],hints:[]};
  const codes=new Set(),scopes=new Set(),hints=new Set();
  const shape=value=>value&&typeof value==='object'&&!Array.isArray(value)?Object.keys(value).filter(key=>SHAPE_KEYS.has(key)).sort():[];
  function inspect(value,depth=0) {
    if(depth>4||value===null||value===undefined)return;
    if(typeof value==='string') {
      if(ERROR_CODES.has(value.toLowerCase()))codes.add(value.toLowerCase());
      // Strings are examined in memory for known public categories only; the
      // string itself is never retained in a diagnostic record.
      if(/scope/i.test(value))hints.add('scope');
      if(/principal|api.?key|user.?account/i.test(value))hints.add('principal');
      if(/beta|eligib|approved|not.enabled/i.test(value))hints.add('eligibility');
      if(/permission|denied|forbidden|not.authori/i.test(value))hints.add('permission');
      if(/invalid.token|expired.token|token.expir/i.test(value))hints.add('token');
      if(/validation|invalid.argument|invalid.param|schema/i.test(value))hints.add('validation');
      if(/attributeerror|typeerror|valueerror|keyerror|operationalerror|integrityerror|exception/i.test(value))hints.add('provider_exception');
      if(/rate.limit/i.test(value))hints.add('rate_limit');
      if(/scope/i.test(value))for(const candidate of value.match(/[a-z_]+:[a-z_]+|offline_access|download/g)||[])if(PUBLIC_SCOPES.has(candidate))scopes.add(candidate);
      return;
    }
    if(typeof value!=='object'||Array.isArray(value))return;
    for(const key of ['code','type','error_code','error','message','error_description','detail','details'])if(Object.hasOwn(value,key))inspect(value[key],depth+1);
    for(const key of ['required_scopes','missing_scopes'])if(Array.isArray(value[key]))for(const scope of value[key])if(PUBLIC_SCOPES.has(scope))scopes.add(scope);
    if(value.data&&typeof value.data==='object')inspect(value.data,depth+1);
    if(value.structuredContent&&typeof value.structuredContent==='object')inspect(value.structuredContent,depth+1);
    if(value.isError===true)summary.isError=true;
    if(Array.isArray(value.content))for(const item of value.content.slice(0,4))if(item?.type==='text'&&typeof item.text==='string'){
      try{const parsed=JSON.parse(item.text);summary.toolJsonKeys=shape(parsed);inspect(parsed,depth+1);}catch(_){inspect(item.text.slice(0,5000),depth+1);}
    }
  }
  try {
    let frame;
    if(String(response.contentType).includes('text/event-stream')) {
      for(const event of String(response.body||'').split(/\r?\n\r?\n/)){
        try{const parsed=JSON.parse(event.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n'));if(parsed?.id===request.id){frame=parsed;break;}}catch(_){}
      }
    } else frame=JSON.parse(response.body||'');
    summary.envelopeKeys=shape(frame);summary.resultKeys=shape(frame?.result);inspect(frame?.error);inspect(frame?.result);
  } catch (_) { hints.add('unreadable_response'); }
  summary.errorCodes=[...codes].sort();summary.requiredScopes=[...scopes].sort();summary.hints=[...hints].sort();
  return summary;
}

/** Optional incident diagnostics, disabled by default. The user must create the
 * sibling file with 0600 permissions; no file is created and no path is accepted
 * through a native message. Tests may inject an isolated path explicitly.
 */
export function recordDiagnostic(summary,{enabled=process.env.CATNAP_SUNO_DIAGNOSTICS==='1',filename=DIAGNOSTIC_FILE}={}) {
  if(!enabled||typeof process.getuid!=='function')return false;
  let descriptor;
  try {
    descriptor=openSync(filename,constants.O_WRONLY|constants.O_APPEND|(constants.O_NOFOLLOW||0));
    const file=fstatSync(descriptor);
    if(!file.isFile()||file.uid!==process.getuid()||(file.mode&0o777)!==0o600)return false;
    const line=JSON.stringify({at:new Date().toISOString(),...summary})+'\n';
    if(Buffer.byteLength(line)>4000||file.size+Buffer.byteLength(line)>65536)return false;
    writeSync(descriptor,line);return true;
  } catch (_) { return false; }
  finally {if(descriptor!==undefined)try{closeSync(descriptor);}catch(_){} }
}

function validArguments(name, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return false;
  const allowed = name === 'playlists-list' ? ['limit','cursor'] : name === 'playlists-list-clips' ? ['id','limit','cursor'] : name === 'playlists-create' ? ['name','visibility'] : ['id','clip_ids'];
  if (Object.keys(args).some(key=>!allowed.includes(key))) return false;
  if ('limit' in args && (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 100)) return false;
  if ('cursor' in args && (typeof args.cursor !== 'string' || args.cursor.length > 2000)) return false;
  if (['playlists-list-clips','playlists-add-clips','playlists-remove-clips'].includes(name) && !UUID.test(String(args.id))) return false;
  if (['playlists-add-clips','playlists-remove-clips'].includes(name) && (!Array.isArray(args.clip_ids) || args.clip_ids.length < 1 || args.clip_ids.length > 25 || args.clip_ids.some(id=>typeof id !== 'string' || !UUID.test(id)))) return false;
  if (name === 'playlists-create' && (typeof args.name !== 'string' || !args.name.trim() || args.name.length > 100 || /[\r\n]/.test(args.name) || !['private','public'].includes(args.visibility))) return false;
  return true;
}

export function allowedRequest(request) {
  if (!request || request.jsonrpc !== '2.0' || !['initialize','notifications/initialized','tools/list','tools/call'].includes(request.method)) return false;
  if (Object.keys(request).some(key=>!['jsonrpc','id','method','params'].includes(key))) return false;
  if (request.id !== undefined && (!Number.isSafeInteger(request.id) || request.id < 1)) return false;
  const emptyObject = value=>value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0;
  if (request.method === 'notifications/initialized') return request.id === undefined && emptyObject(request.params);
  if (request.id === undefined) return false;
  if (request.method === 'tools/call') return TOOLS.has(request.params?.name) && Object.keys(request.params).every(key=>['name','arguments'].includes(key)) && validArguments(request.params.name,request.params.arguments);
  if (request.method === 'initialize') return request.params?.protocolVersion === '2025-06-18' && request.params?.clientInfo?.name === 'catnap-theatre-inbox' &&
    Object.keys(request.params).every(key=>['protocolVersion','capabilities','clientInfo'].includes(key)) && emptyObject(request.params.capabilities) &&
    request.params.clientInfo.version === SCRIPT_VERSION && Object.keys(request.params.clientInfo).every(key=>['name','version'].includes(key));
  return emptyObject(request.params);
}

export async function handleMessage(message, network = fetch) {
  if (message?.operation === 'health' && Object.keys(message).length === 1) return {ok:true,ready:true,version:SCRIPT_VERSION};
  if (message?.operation !== 'rpc' || Object.keys(message).some(key=>!['operation','token','sessionId','request'].includes(key)) || typeof message.token !== 'string' || !message.token || message.token.length > 20000 || /[\r\n]/.test(message.token) || !allowedRequest(message.request)) return {ok:false,error:'unsupported_request'};
  const sessionId = message.sessionId || '';
  if (typeof sessionId !== 'string' || sessionId.length > 1000 || /[\r\n]/.test(sessionId)) return {ok:false,error:'invalid_session'};
  const headers = {'Content-Type':'application/json','Accept':'application/json, text/event-stream','Authorization':'Bearer '+message.token};
  if (message.request.method !== 'initialize') headers['MCP-Protocol-Version'] = '2025-06-18';
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;
  try {
    const response = await network(ENDPOINT,{method:'POST',headers,body:JSON.stringify(message.request),redirect:'error',signal:AbortSignal.timeout(15000)});
    if (!response.ok) {recordDiagnostic(diagnosticSummary(message.request,{status:response.status,body:'',contentType:''}));return {ok:false,status:response.status,error:'provider_rejected'};}
    const contentType = response.headers.get('content-type') || '';
    const reader = response.body?.getReader(); let length = 0; const parts = [];
    if (reader) {
      try { while (true) {
        const {done,value} = await reader.read(); if (done) break;
        length += value.byteLength; if (length > MAX_BODY) { await reader.cancel(); return {ok:false,error:'response_too_large'}; } parts.push(value);
        // A valid SSE response need not close its stream after the result. Stop
        // once the matching complete frame arrives, rather than timing out on
        // later keepalives. Never match a server notification or another ID.
        if (contentType.includes('text/event-stream') && message.request.id !== undefined) {
          const events = Buffer.concat(parts).toString('utf8').split(/\r?\n\r?\n/); events.pop();
          const finished = events.some(event=>{
            try {
              const payload = event.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
              const parsed = JSON.parse(payload);
              return parsed?.jsonrpc === '2.0' && parsed.id === message.request.id && (Object.hasOwn(parsed,'result') || Object.hasOwn(parsed,'error'));
            } catch (_) { return false; }
          });
          if (finished) { await reader.cancel(); break; }
        }
      } }
      finally { reader.releaseLock(); }
    }
    const body = Buffer.concat(parts).toString('utf8');
    const returnedSession = response.headers.get('mcp-session-id') || sessionId;
    if (returnedSession.length > 1000 || /[\r\n]/.test(returnedSession)) return {ok:false,error:'invalid_session'};
    const result={ok:true,status:response.status,contentType,sessionId:returnedSession,body};
    recordDiagnostic(diagnosticSummary(message.request,result));
    return result;
  } catch (_) { return {ok:false,error:'network_failure'}; }
}

export function runNativeHost(input = process.stdin, output = process.stdout) {
  let buffer = Buffer.alloc(0), tasks = Promise.resolve(), stopped = false;
  function send(result) {
    let payload = Buffer.from(JSON.stringify(result),'utf8');
    if (payload.length > MAX_FRAME) payload = Buffer.from('{"ok":false,"error":"response_too_large"}');
    const header = Buffer.alloc(4); header.writeUInt32LE(payload.length); output.write(Buffer.concat([header,payload]));
  }
  input.on('data',chunk=>{
    if (stopped) return;
    buffer = Buffer.concat([buffer,chunk]);
    if (buffer.length > MAX_FRAME * 2) { stopped = true; send({ok:false,error:'request_too_large'}); input.pause(); return; }
    while (buffer.length >= 4) {
      const size = buffer.readUInt32LE(0);
      if (!size || size > MAX_FRAME) { stopped = true; send({ok:false,error:'invalid_frame'}); input.pause(); return; }
      if (buffer.length < size + 4) break;
      const data = buffer.subarray(4,size+4).toString('utf8'); buffer = buffer.subarray(size+4);
      tasks = tasks.then(async()=>{ let message; try { message = JSON.parse(data); } catch (_) { send({ok:false,error:'invalid_json'}); return; } send(await handleMessage(message)); }).catch(()=>send({ok:false,error:'request_failed'}));
    }
  });
  input.on('error',()=>{ stopped = true; });
}

// Node canonicalizes import.meta.url but argv may retain a symlinked parent.
// macOS commonly spells its temporary directory /var/... while the ESM URL
// resolves to /private/var/...; compare actual files, not path spelling.
let isMain = false;
try { isMain = Boolean(process.argv[1]) && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(process.argv[1])); } catch (_) { /* Imported from a synthetic test entry point. */ }
if (isMain) runNativeHost();
