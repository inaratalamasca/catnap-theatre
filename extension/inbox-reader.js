/* Catnap authenticated uploader reader, version 0.8.0.
 * Change summary: bounded same-origin reads and explicit fixed-reason Decline
 * with fresh Pending checks and exact declined readback. Never extracts
 * credentials, retries a write, contacts Suno or controls media.
 */
(function (root, factory) {
  const core = typeof module === 'object' && module.exports ? require('./inbox-core.js') : root.CatnapInboxCore;
  const api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.CatnapInboxReader = api;
    if (root.location?.origin === api.ORIGIN && root.top === root && root.chrome?.runtime?.onMessage && !root.__catnapInboxReaderInstalled) {
      api.install(root.chrome, root.location.origin);
      root.__catnapInboxReaderInstalled = true;
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Core) {
  'use strict';
  const VERSION = '0.8.0', DECLINE_REASON = 'Only one song at a time, please.', ORIGIN = 'https://uploader.aiu.fm', MAX_BYTES = 2 * 1024 * 1024;
  const FIELDS = ['id', 'status', 'deleted', 'submission_type', 'submitted_at', 'suno_url', 'canonical_suno_url', 'youtube_url',
    'title', 'artist', 'uploader_name', 'uploader_id', 'message', 'disclaimer_needed', 'submit_to_radio'];
  function createClient({fetch: request = globalThis.fetch, origin = ORIGIN} = {}) {
    if (!Core || origin !== ORIGIN || typeof request !== 'function') throw Error('Open the signed-in AIU Uploader tab.');
    const declining = new Set();
    async function read(path) {
      if (!/^\/(?:me|hosts|inboxes\/[A-Za-z0-9_.-]{1,100}(?:\/summary|\?status=(?:pending|declined)))$/.test(path) || path.includes('..')) throw Error('Unsupported uploader request.');
      const response = await request(path, {method: 'GET', credentials: 'same-origin', redirect: 'manual', cache: 'no-store',
        headers: {accept: 'application/json'}, signal: AbortSignal.timeout(12000)});
      if (response.status === 401 || response.status === 403 || response.type === 'opaqueredirect' || response.status >= 300 && response.status < 400) throw Error('Sign in to AIU Uploader with access to this inbox.');
      if (response.status === 429) throw Error('Uploader rate limited this read. Try again later.');
      if (!response.ok) throw Error('Uploader request failed (HTTP ' + response.status + ').');
      const body = await response.text();
      if (new TextEncoder().encode(body).length > MAX_BYTES) throw Error('Uploader response is too large.');
      try { return JSON.parse(body); } catch (_) { throw Error('Uploader did not return JSON. Sign in and try again.'); }
    }
    async function discover() {
      const me = await read('/me');
      if (!me || typeof me !== 'object' || Array.isArray(me) || !(me.id || me.userId)) throw Error('Sign in to AIU Uploader.');
      const hosts = Array.isArray(me.hosts) && me.hosts.length ? me.hosts : await read('/hosts');
      return {inboxes: Core.discoverInboxes(me, hosts)};
    }
    async function readInbox(inboxId, mode) {
      if (!Core.validInboxId(inboxId) || !['lp', 'ap'].includes(mode)) throw Error('Choose a valid LP or AP inbox.');
      // Refresh discovery every time. A catalog match is only selection validation:
      // the server's authenticated inbox requests remain the access authority.
      const {inboxes} = await discover();
      const inbox = inboxes[mode].find(item => item.id === inboxId);
      if (!inbox) throw Error('This inbox is not available in the current uploader session.');
      const base = '/inboxes/' + encodeURIComponent(inboxId);
      const summary = await read(base + '/summary');
      if (!summary || typeof summary !== 'object' || Array.isArray(summary)) throw Error('Uploader returned an invalid inbox summary.');
      const raw = await read(base + '?status=pending');
      if (!Array.isArray(raw) || raw.length > Core.MAX_ROWS) throw Error('Uploader returned an invalid Pending list.');
      const rows = raw.filter(row => row && typeof row === 'object').map(row => {
        // Send only host/show fields to the extension. Never forward storage paths,
        // review metadata, unrelated account fields or full provider payloads.
        const selected = {};
        for (const key of FIELDS) {
          const value = row[key];
          if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) selected[key] = value;
        }
        return selected;
      });
      const counts = {};
      for (const field of ['pending', 'accepted', 'declined']) if (Number.isInteger(summary[field]) && summary[field] >= 0) counts[field] = summary[field];
      return {inbox, summary: counts, rows};
    }
    async function decline(inboxId, mode, submissionId) {
      if (!Core.validInboxId(inboxId) || !['lp', 'ap'].includes(mode) || typeof submissionId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(submissionId)) throw Error('Choose a valid Pending submission to decline.');
      const key = inboxId + ':' + submissionId;
      if (declining.has(key)) throw Error('This Decline is already in progress.');
      declining.add(key);
      try {
        // Catalog discovery is not authorization. Recheck this exact selected
        // inbox's authenticated Pending response before the one manual write.
        const fresh = await readInbox(inboxId, mode);
        const matches = fresh.rows.filter(row => String(row.id) === submissionId);
        const row = matches[0], deleted = row?.deleted;
        if (matches.length !== 1 || typeof row.status !== 'string' || row.status.trim().toLowerCase() !== 'pending' || deleted === true || deleted === 1 || typeof deleted === 'string' && ['true','1','yes'].includes(deleted.trim().toLowerCase())) throw Error('This submission is no longer confirmed Pending in the selected inbox. Read the uploader again.');
        try {
          // First-party uploader client contract: one same-origin session POST,
          // JSON {reason}; no explicit CSRF header/token in that client. The
          // server remains the authorization authority. No DOM playback calls.
          const response = await request('/uploads/' + encodeURIComponent(submissionId) + '/decline', {
            method: 'POST', credentials: 'same-origin', redirect: 'manual', cache: 'no-store',
            headers: {accept: 'application/json', 'Content-Type': 'application/json'},
            body: JSON.stringify({reason: DECLINE_REASON}), signal: AbortSignal.timeout(12000)
          });
          if (!response.ok || response.type === 'opaqueredirect' || response.status < 200 || response.status >= 300) throw Error('Unconfirmed Decline response.');
          const declined = await read('/inboxes/' + encodeURIComponent(inboxId) + '?status=declined');
          if (!Array.isArray(declined) || declined.length > Core.MAX_ROWS) throw Error('Invalid Decline readback.');
          const confirmed = declined.filter(item => item && typeof item === 'object' && String(item.id) === submissionId);
          if (confirmed.length !== 1 || typeof confirmed[0].status !== 'string' || confirmed[0].status.trim().toLowerCase() !== 'declined') throw Error('Decline not confirmed by exact readback.');
          return {declined: true, inboxId, submissionId};
        } catch (_) {
          const error = Error('Decline is not confirmed. Check the uploader before trying again; no automatic retry was made.');
          error.uncertain = true;
          throw error;
        }
      } finally { declining.delete(key); }
    }
    async function checkDecline(inboxId, mode, submissionId) {
      if (!Core.validInboxId(inboxId) || !['lp', 'ap'].includes(mode) || typeof submissionId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(submissionId)) throw Error('Choose a valid submission to check.');
      if (declining.has(inboxId + ':' + submissionId)) throw Error('This Decline is already in progress.');
      const fresh = await readInbox(inboxId, mode);
      const declined = await read('/inboxes/' + encodeURIComponent(inboxId) + '?status=declined');
      if (!Array.isArray(declined) || declined.length > Core.MAX_ROWS) throw Error('Uploader returned an invalid Declined list.');
      const pendingMatches = fresh.rows.filter(item => String(item.id) === submissionId);
      const declinedMatches = declined.filter(item => item && typeof item === 'object' && String(item.id) === submissionId);
      const statusOf = item => typeof item?.status === 'string' ? item.status.trim().toLowerCase() : '';
      const deleted = pendingMatches[0]?.deleted;
      const validPending = pendingMatches.length === 1 && statusOf(pendingMatches[0]) === 'pending' && deleted !== true && deleted !== 1 && !(typeof deleted === 'string' && ['true','1','yes'].includes(deleted.trim().toLowerCase()));
      // Conflicting snapshots are unknown, even if one list claims a match.
      const status = declinedMatches.length === 1 && statusOf(declinedMatches[0]) === 'declined' && pendingMatches.length === 0 ? 'declined' : validPending && declinedMatches.length === 0 ? 'pending' : 'unknown';
      return {inboxId, submissionId, status};
    }
    return {discover, readInbox, decline, checkDecline};
  }
  function install(chrome, origin) {
    const client = createClient({origin});
    chrome.runtime.onMessage.addListener((message, sender, reply) => {
      if (sender?.id !== chrome.runtime.id || message?.target !== 'catnap-inbox') return;
      const run = message.action === 'discover' ? () => client.discover() : message.action === 'read' ? () => client.readInbox(message.inboxId, message.mode) : message.action === 'decline' ? () => client.decline(message.inboxId, message.mode, message.submissionId) : message.action === 'check-decline' ? () => client.checkDecline(message.inboxId, message.mode, message.submissionId) : null;
      if (!run) { reply({ok: false, error: 'Unknown uploader operation.'}); return; }
      Promise.resolve().then(run).then(data => reply({ok: true, data}), error => reply({ok: false, error: Core.text(error?.message || 'Uploader operation failed.', 240), uncertain: error?.uncertain === true}));
      return true;
    });
  }
  return {VERSION, ORIGIN, MAX_BYTES, FIELDS, DECLINE_REASON, createClient, install};
});
