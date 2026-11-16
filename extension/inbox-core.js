/* Catnap Inbox data model, version 0.8.1.
 * Change summary: independent Pending-only FIFO normalization, retained external
 * sources, selection-stable order and fair repeat rotation at the ready tail.
 * Protecting a loaded entry never changes its place among upcoming entries.
 * Pure functions only: no account access, storage, playback or remote writes.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CatnapInboxCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = '0.8.1';
  const MAX_ROWS = 1000;
  const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  const HOST_ID = /^[A-Za-z0-9_.-]{1,100}$/;
  const SUBMISSION_ID = /^[A-Za-z0-9_-]{1,96}$/;
  const ACTIVE_STATES = new Set(['loading', 'ready', 'playing', 'paused']);
  const MODE = value => typeof value === 'string' ? value.toLowerCase().trim() : '';

  function text(value, max = 240) {
    return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
  }
  function note(value) {
    // Preserve paragraphs for the host. Callers must render this as text, never HTML.
    return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, 8000) : '';
  }
  function validInboxId(value) {
    return typeof value === 'string' && HOST_ID.test(value) && !value.includes('..');
  }
  function normalizeFlag(value) {
    if (value === true || value === 1) return 'yes';
    if (value === false || value === 0) return 'no';
    if (typeof value !== 'string') return 'unknown';
    const normalized = value.trim().toLowerCase();
    if (['yes', 'true', '1'].includes(normalized)) return 'yes';
    if (['no', 'false', '0'].includes(normalized)) return 'no';
    return 'unknown';
  }
  function parseSunoURL(value) {
    if (typeof value !== 'string' || value.length > 2048) return null;
    try {
      const url = new URL(value.trim());
      if (url.protocol !== 'https:' || !['suno.com', 'www.suno.com'].includes(url.hostname) || url.username || url.password) return null;
      const song = url.pathname.match(/^\/song\/([^/]+)\/?$/);
      if (song && UUID.test(song[1])) {
        const id = song[1].toLowerCase();
        return {id, url: 'https://suno.com/song/' + id, shortCode: null};
      }
      const share = url.pathname.match(/^\/s\/([A-Za-z0-9_-]{4,80})\/?$/);
      return share ? {id: null, url: 'https://suno.com/s/' + share[1], shortCode: share[1]} : null;
    } catch (_) { return null; }
  }
  function parseYouTubeURL(value) {
    if (typeof value !== 'string' || value.length > 2048) return null;
    try {
      const url = new URL(value.trim());
      if (url.protocol !== 'https:' || url.username || url.password) return null;
      const host = url.hostname.toLowerCase();
      let id = '';
      if (host === 'youtu.be') id = url.pathname.replace(/^\//, '').split('/')[0];
      else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com', 'youtube-nocookie.com'].includes(host)) {
        if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
        else id = /^(?:\/shorts\/|\/embed\/|\/live\/)([^/]+)\/?$/.exec(url.pathname)?.[1] || '';
      }
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? {id, url: 'https://www.youtube.com/watch?v=' + id} : null;
    } catch (_) { return null; }
  }

  function discoverInboxes(me, fallbackHosts) {
    const rows = Array.isArray(me?.hosts) && me.hosts.length ? me.hosts : Array.isArray(fallbackHosts) ? fallbackHosts : [];
    const inboxes = {lp: [], ap: []}, seen = new Set();
    function add(mode, id, name, host) {
      if (!validInboxId(id) || seen.has(mode + ':' + id)) return;
      seen.add(mode + ':' + id);
      inboxes[mode].push({id, name: text(name) || text(host.inbox_name) || text(host.name) || id, mode});
    }
    for (const host of rows.slice(0, 500)) {
      if (!host || typeof host !== 'object') continue;
      const id = String(host.id ?? '');
      if (!validInboxId(id)) continue;
      const mode = MODE(host.mode);
      if (mode === 'lp' || id.startsWith('lp_')) add('lp', id, host.lp_show_name, host);
      else if (mode === 'ap' || id.startsWith('ap_')) add('ap', id, host.ap_show_name, host);
      else if (host.is_show === true || host.is_show === 1) add('lp', id, host.lp_show_name, host);
      else {
        // Personal host IDs need the provider's LP/AP prefix. A managed show
        // owns its LP; do not create a second personal LP entry for that host.
        if (text(host.lp_reason) !== 'Managed via show' && text(host.lp_show_name)) add('lp', 'lp_' + id, host.lp_show_name, host);
        if (text(host.ap_show_name)) add('ap', 'ap_' + id, host.ap_show_name, host);
      }
    }
    return inboxes;
  }

  function timeKey(value) {
    if (typeof value !== 'string') return NaN;
    // Bare provider timestamps are compared as server wall-clock values. This
    // makes their relative ordering deterministic, without asserting a timezone
    // for display or ETA purposes; the original string remains on each entry.
    const bare = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/.exec(value.trim());
    return Date.parse(bare ? bare[1] + 'T' + bare[2] + 'Z' : value);
  }
  function normalizeRows(rawRows, options) {
    const inboxId = options?.inboxId, mode = MODE(options?.mode);
    if (!validInboxId(inboxId) || !['lp', 'ap'].includes(mode)) throw Error('Choose a valid LP or AP inbox.');
    if (!Array.isArray(rawRows) || rawRows.length > MAX_ROWS) throw Error('Uploader returned an invalid or oversized Pending list.');
    const unique = new Set(), pending = [];
    for (let index = 0; index < rawRows.length; index++) {
      const row = rawRows[index];
      if (!row || typeof row !== 'object') continue;
      const submissionId = String(row.id ?? '');
      if (!SUBMISSION_ID.test(submissionId) || unique.has(submissionId)) continue;
      if (MODE(row.status || 'pending') !== 'pending' || normalizeFlag(row.deleted) === 'yes') continue;
      unique.add(submissionId);
      pending.push({row, submissionId, index, time: timeKey(row.submitted_at)});
    }
    const timestampsComplete = pending.every(item => Number.isFinite(item.time));
    pending.sort((a, b) => timestampsComplete && a.time !== b.time ? a.time - b.time : b.index - a.index);
    const entries = pending.map(({row, submissionId}) => {
      const suno = parseSunoURL(row.canonical_suno_url) || parseSunoURL(row.suno_url);
      const youtube = parseYouTubeURL(row.youtube_url);
      let holdReason = '';
      if (MODE(row.submission_type) !== mode) holdReason = 'Submission does not match this show type.';
      else if (!suno && !youtube) holdReason = 'No supported Suno or YouTube source is available.';
      return {
        id: inboxId + ':' + submissionId, inboxId, submissionId, mode,
        title: text(row.title) || 'Untitled submission', artist: text(row.artist),
        uploaderName: text(row.uploader_name), uploaderId: text(String(row.uploader_id ?? ''), 100),
        note: note(row.message), disclaimer: normalizeFlag(row.disclaimer_needed),
        radioPermission: normalizeFlag(row.submit_to_radio), submittedAt: text(row.submitted_at, 80),
        sunoUrl: suno?.url || null, sunoId: suno?.id || null, sunoShortCode: suno?.shortCode || null,
        youtubeUrl: youtube?.url || null, youtubeId: youtube?.id || null,
        preferredSource: youtube ? 'youtube' : suno ? 'suno' : null,
        state: holdReason ? 'held' : 'queued', holdReason
      };
    });
    return {entries, held: entries.filter(entry => entry.state === 'held'), total: entries.length,
      orderBasis: timestampsComplete ? 'submitted-at-oldest-first' : 'inbox-bottom-up'};
  }
  function mergeEntries(existing, incoming,{activeEntryId=null}={}) {
    if (!Array.isArray(existing) || !Array.isArray(incoming)) throw Error('Queue entries must be arrays.');
    const updates = new Map(incoming.map(entry => [entry.id, entry]));
    const seen = new Set(), merged = [];
    let nextOrder=existing.reduce((max,entry)=>Number.isInteger(entry?.intakeOrder)&&entry.intakeOrder>=0?Math.max(max,entry.intakeOrder+1):max,0);
    const local=(entry,prior)=>{
      const source=prior||{};
      return {...entry,hostHeld:source.hostHeld===true,repeatHoldOverride:source.repeatHoldOverride===true,
        playedAt:typeof source.playedAt==='number'&&Number.isFinite(source.playedAt)&&source.playedAt>=0?source.playedAt:null,
        playedOrder:Number.isInteger(source.playedOrder)&&source.playedOrder>0?source.playedOrder:null,
        releaseOrder:Number.isInteger(source.releaseOrder)&&source.releaseOrder>0?source.releaseOrder:null,
        repeatReleasedFor:typeof source.repeatReleasedFor==='string'?source.repeatReleasedFor:null,
        intakeOrder:Number.isInteger(source.intakeOrder)&&source.intakeOrder>=0?source.intakeOrder:nextOrder++};
    };
    for (const entry of existing) {
      if (!entry || typeof entry.id !== 'string' || seen.has(entry.id)) continue;
      seen.add(entry.id);
      const fresh = updates.get(entry.id);
      if (!fresh) { merged.push(local(entry,entry)); continue; }
      const next = {...entry, ...fresh};
      // Re-reading an inbox is not permission to restart/reopen a played item.
      if (entry.state !== 'queued' && entry.state !== 'held') next.state = entry.state;
      if (ACTIVE_STATES.has(entry.state)||entry.id===activeEntryId||wasPlayed(entry)) {
        for (const field of ['sunoUrl', 'sunoId', 'sunoShortCode', 'youtubeUrl', 'youtubeId', 'preferredSource']) next[field] = entry[field];
        if(entry.id===activeEntryId){next.state=entry.state;next.holdReason=entry.holdReason;}
      }
      merged.push(local(next,entry));
    }
    for (const entry of incoming) {
      if (!entry || typeof entry.id !== 'string' || seen.has(entry.id)) continue;
      seen.add(entry.id); merged.push(local(entry,null));
    }
    return merged;
  }
  const wasPlayed=entry=>typeof entry?.playedAt==='number'&&Number.isFinite(entry.playedAt)&&entry.playedAt>=0;
  const isHeld=entry=>entry?.state==='held'||entry?.state==='declined'||entry?.hostHeld===true||entry?.effectiveHeld===true;
  const sequence=(entry,field)=>Number.isInteger(entry?.[field])&&entry[field]>0?entry[field]:null;
  function completeEntries(entries,orderedIds,{now=Date.now()}={}){
    if(!Array.isArray(entries)||entries.length>MAX_ROWS||!Array.isArray(orderedIds)||orderedIds.length>MAX_ROWS||typeof now!=='number'||!Number.isFinite(now)||now<0)throw Error('Invalid show completion history.');
    const out=entries.map(entry=>({...entry})),known=new Map(out.map(entry=>[entry.id,entry]));
    let order=out.reduce((max,entry)=>Math.max(max,sequence(entry,'playedOrder')||0),0);
    // Older local records had timestamps but no sequence. Retain their recorded
    // order before adding any new genuine completion events.
    for(const entry of out.filter(wasPlayed).filter(entry=>!sequence(entry,'playedOrder')).sort((a,b)=>a.playedAt-b.playedAt))entry.playedOrder=++order;
    for(const id of orderedIds){const entry=known.get(id);if(!entry||wasPlayed(entry)||entry.state==='declined')continue;entry.playedAt=now;entry.playedOrder=++order;}
    return out;
  }
  function releaseEntry(entries,entryId){
    if(!Array.isArray(entries)||entries.length>MAX_ROWS)throw Error('The show queue is invalid or too large.');
    const selected=entries.find(entry=>entry.id===entryId);
    if(!selected||selected.state==='held'||selected.state==='declined')throw Error('Correct the source before releasing this entry.');
    const order=entries.reduce((max,entry)=>Math.max(max,sequence(entry,'releaseOrder')||0),0)+1;
    return [...entries.filter(entry=>entry.id!==entryId).map(entry=>({...entry})),{...selected,hostHeld:false,repeatHoldOverride:true,releaseOrder:order}];
  }
  function rotateReady(entries,{protectedEntryId=null}={}){
    const out=completeEntries(entries,[]),known=new Map(out.map(entry=>[entry.id,entry]));
    let release=out.reduce((max,entry)=>Math.max(max,sequence(entry,'releaseOrder')||0),0);
    const newlyReleased=[];
    for(const entry of out){
      const prior=entry.repeatPredecessorId?known.get(entry.repeatPredecessorId):null;
      const excluded=entry.state==='held'||entry.state==='declined',manual=entry.hostHeld===true;
      const waiting=!!entry.repeatPredecessorId&&!wasPlayed(prior)&&!wasPlayed(entry)&&entry.repeatHoldOverride!==true&&entry.id!==protectedEntryId;
      entry.effectiveHoldReason=entry.state==='declined'?'Declined in uploader.':excluded?(entry.holdReason||'This submission has no usable source.'):manual?'Held by host.':waiting?'Waiting for this uploader’s previous submission to finish.':'';
      entry.effectiveHeld=!!entry.effectiveHoldReason;
      if(prior&&wasPlayed(prior)&&!wasPlayed(entry)&&!entry.effectiveHeld&&entry.repeatHoldOverride!==true&&entry.id!==protectedEntryId&&entry.repeatReleasedFor!==prior.id)newlyReleased.push(entry);
    }
    newlyReleased.sort((a,b)=>(sequence(known.get(a.repeatPredecessorId),'playedOrder')||0)-(sequence(known.get(b.repeatPredecessorId),'playedOrder')||0)||(a.intakeOrder||0)-(b.intakeOrder||0));
    for(const entry of newlyReleased){entry.repeatReleasedFor=entry.repeatPredecessorId;entry.releaseOrder=++release;}
    const released=new Set(newlyReleased.map(entry=>entry.id));
    const played=out.filter(wasPlayed).sort((a,b)=>a.playedOrder-b.playedOrder);
    // Protection prevents a new repeat hold, not a move. The loaded item stays
    // in its existing ready position until completion or an explicit action.
    const ready=out.filter(entry=>!wasPlayed(entry)&&!entry.effectiveHeld&&!released.has(entry.id));
    const held=out.filter(entry=>!wasPlayed(entry)&&entry.effectiveHeld);
    return [...played,...ready,...newlyReleased,...held];
  }
  function applyQueuePolicy(entries,{repeatUploaderHold=false,protectedEntryId=null}={}) {
    if(!Array.isArray(entries)||entries.length>MAX_ROWS)throw Error('The show queue is invalid or too large.');
    // Compare the provider's immutable uploader ID when available, otherwise
    // its explicit submission name. This private key never goes to Theatre.
    const uploaderKey=entry=>text(entry.uploaderId,100)?'id:'+text(entry.uploaderId,100):text(entry.uploaderName)?'name:'+text(entry.uploaderName).toLowerCase():'';
    const previous=new Map(),predecessors=new Map();
    const chronological=entries.map((entry,index)=>({entry,index})).sort((a,b)=>(Number.isInteger(a.entry.intakeOrder)?a.entry.intakeOrder:a.index)-(Number.isInteger(b.entry.intakeOrder)?b.entry.intakeOrder:b.index)||a.index-b.index);
    for(const {entry} of chronological){
      const key=uploaderKey(entry),prior=key?previous.get(key):null;
      predecessors.set(entry.id,repeatUploaderHold&&entry.state!=='declined'&&prior?prior.id:null);
      if(key&&entry.state!=='declined')previous.set(key,entry);
    }
    return rotateReady(entries.map(entry=>({...entry,repeatPredecessorId:predecessors.get(entry.id)||null})),{protectedEntryId});
  }
  function playlistEntries(entries,{currentEntryId=null}={}){
    // Keep the caller's current-entry option compatible without treating a
    // selection as a move ahead of earlier eligible submissions.
    const played=entries.filter(entry=>wasPlayed(entry)&&!isHeld(entry)).slice().sort((a,b)=>(sequence(a,'playedOrder')||0)-(sequence(b,'playedOrder')||0));
    // The current ID is intentionally not promoted. Playlist projection follows
    // the visible upcoming order even when a host quietly selects a later song.
    const ready=entries.filter(entry=>!wasPlayed(entry)&&!isHeld(entry));
    return [...played,...ready];
  }
  return {VERSION, MAX_ROWS, text, note, validInboxId, normalizeFlag, parseSunoURL, parseYouTubeURL, discoverInboxes, normalizeRows, mergeEntries,applyQueuePolicy,wasPlayed,isHeld,completeEntries,releaseEntry,rotateReady,playlistEntries};
});
