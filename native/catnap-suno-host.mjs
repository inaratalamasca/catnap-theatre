#!/usr/bin/env node
/** Catnap native Suno transport, SCRIPT_VERSION 0.6.0.
 * Restricted stdio client: no listening server, disk credentials or dynamic URL.
 * Change summary: support the four explicit playlist MCP tools for Theatre.
 */
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export const SCRIPT_VERSION = '0.6.0';
const ENDPOINT = 'https://api.suno.com/mcp';
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const MAX_FRAME = 1024 * 1024, MAX_BODY = 700000;
const TOOLS = new Set(['playlists-list','playlists-list-clips','playlists-create','playlists-add-clips']);

function validArguments(name, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return false;
  const allowed = name === 'playlists-list' ? ['limit','cursor'] : name === 'playlists-list-clips' ? ['id','limit','cursor'] : name === 'playlists-create' ? ['name','visibility'] : ['id','clip_ids'];
  if (Object.keys(args).some(key=>!allowed.includes(key))) return false;
  if ('limit' in args && (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 100)) return false;
  if ('cursor' in args && (typeof args.cursor !== 'string' || args.cursor.length > 2000)) return false;
  if (['playlists-list-clips','playlists-add-clips'].includes(name) && !UUID.test(String(args.id))) return false;
  if (name === 'playlists-add-clips' && (!Array.isArray(args.clip_ids) || args.clip_ids.length < 1 || args.clip_ids.length > 25 || args.clip_ids.some(id=>typeof id !== 'string' || !UUID.test(id)))) return false;
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
    if (!response.ok) return {ok:false,status:response.status,error:'provider_rejected'};
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
    return {ok:true,status:response.status,contentType,sessionId:returnedSession,body};
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

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) runNativeHost();
