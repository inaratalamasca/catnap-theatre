/* Catnap authenticated uploader reader, version 0.6.0.
 * Change summary: bounded same-origin GET discovery/Pending reads. This adapter
 * never extracts credentials, mutates submissions, contacts Suno or controls media.
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
  const VERSION = '0.6.0', ORIGIN = 'https://uploader.aiu.fm', MAX_BYTES = 2 * 1024 * 1024;
  const FIELDS = ['id', 'status', 'deleted', 'submission_type', 'submitted_at', 'suno_url', 'canonical_suno_url', 'youtube_url',
    'title', 'artist', 'uploader_name', 'uploader_id', 'message', 'disclaimer_needed', 'submit_to_radio'];
  function createClient({fetch: request = globalThis.fetch, origin = ORIGIN} = {}) {
    if (!Core || origin !== ORIGIN || typeof request !== 'function') throw Error('Open the signed-in AIU Uploader tab.');
    async function read(path) {
      if (!/^\/(?:me|hosts|inboxes\/[A-Za-z0-9_.-]{1,100}(?:\/summary|\?status=pending))$/.test(path) || path.includes('..')) throw Error('Unsupported uploader request.');
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
    return {discover, readInbox};
  }
  function install(chrome, origin) {
    const client = createClient({origin});
    chrome.runtime.onMessage.addListener((message, sender, reply) => {
      if (sender?.id !== chrome.runtime.id || message?.target !== 'catnap-inbox') return;
      const run = message.action === 'discover' ? () => client.discover() : message.action === 'read' ? () => client.readInbox(message.inboxId, message.mode) : null;
      if (!run) { reply({ok: false, error: 'Unknown uploader operation.'}); return; }
      Promise.resolve().then(run).then(data => reply({ok: true, data}), error => reply({ok: false, error: Core.text(error?.message || 'Uploader read failed.', 240)}));
      return true;
    });
  }
  return {VERSION, ORIGIN, MAX_BYTES, FIELDS, createClient, install};
});
