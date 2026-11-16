/* Catnap optional music broadcaster, version 0.3.0.
 * Change summary: bounded WHIP lifecycle, stereo Opus and private Catnap publish preflight.
 * This module has no Suno/Discord API, microphone, recording or content-script bridge.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CatnapBroadcast = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = '0.3.0';
  const BITRATE = 256000;
  const DEFAULT_ENDPOINT = 'https://listen.catnapradio.com/live/whip';
  function endpoint(value) {
    const u = new URL(String(value).trim());
    const host = u.hostname.replace(/^\[|\]$/g, '');
    const privateHost = host === 'localhost' || host === '::1' || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    if (u.username || u.password || u.hash || u.search || !u.pathname.endsWith('/whip')) throw Error('Use a WHIP endpoint without credentials or query parameters.');
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && privateHost)) throw Error('Use HTTPS, or an HTTP address on your private LAN.');
    return u.href;
  }
  function permissionOrigin(value) { const u = new URL(endpoint(value)); return u.origin + '/*'; }
  function sessionURL(location, base) {
    if (!location) throw Error('Relay did not return a session location.');
    const u = new URL(location, base), b = new URL(base);
    if (u.origin !== b.origin || u.username || u.password) throw Error('Relay returned an unexpected session origin.');
    return u.href;
  }
  // Opus stereo negotiation must be explicit; maxBitrate is also applied to the sender.
  function stereoSDP(sdp) {
    const payload = /^a=rtpmap:(\d+) opus\/48000\/2\r?$/mi.exec(sdp);
    if (!payload) throw Error('Stereo Opus is unavailable in this browser.');
    const id = payload[1], re = new RegExp('^a=fmtp:' + id + ' (.*)$', 'mi');
    const match = re.exec(sdp);
    const existing = match ? match[1].trim().split(';').filter(x => !/^(stereo|sprop-stereo|maxaveragebitrate|usedtx)=/i.test(x.trim())) : [];
    const line = 'a=fmtp:' + id + ' ' + [...existing, 'stereo=1', 'sprop-stereo=1', 'maxaveragebitrate=' + BITRATE, 'usedtx=0'].join(';');
    const result = match ? sdp.replace(re, line) : sdp.replace(payload[0], payload[0] + '\r\n' + line);
    return result.replace(/\r?\n/g, '\r\n');
  }
  async function bounded(promise, signal, ms, onLate) {
    let done = false, timer, abort;
    return new Promise((resolve, reject) => {
      const finish = (fn, value) => { if (done) return; done = true; clearTimeout(timer); signal.removeEventListener('abort', abort); fn(value); };
      abort = () => finish(reject, Error('Broadcast stopped.'));
      signal.addEventListener('abort', abort, {once:true});
      if (signal.aborted) { abort(); return; }
      timer = setTimeout(() => finish(reject, Error('Relay or audio capture timed out.')), ms);
      Promise.resolve(promise).then(value => { if (done) { if (onLate) onLate(value); } else finish(resolve, value); }, error => finish(reject, error));
    });
  }
  function stopTracks(stream) { if (stream) stream.getTracks().forEach(track => track.stop()); }
  class Publisher {
    constructor(env) { this.env = env; this.state = 'idle'; this.generation = 0; this.resources = null; }
    report(state, message) { this.state = state; this.env.onStatus({state, message, bitrate:BITRATE, version:VERSION}); }
    async start(options) {
      if (this.state !== 'idle' && this.state !== 'error') throw Error('A broadcast is already starting or running.');
      const url = endpoint(options.endpoint), token = String(options.token || '').trim();
      const takeover = options.takeover === true;
      if (takeover && url !== DEFAULT_ENDPOINT) throw Error('Broadcast takeover is available only on the Catnap relay.');
      if (/[\r\n]/.test(token)) throw Error('Invalid token.');
      const generation = ++this.generation;
      const r = {controller:new AbortController(), token, url, pc:null, stream:null, monitor:null, session:null};
      this.resources = r; this.report('starting', 'Connecting music audio…');
      const current = () => { if (generation !== this.generation || r.controller.signal.aborted) throw Error('Broadcast stopped.'); };
      try {
        r.stream = await bounded(this.env.capture(options.streamId), r.controller.signal, 12000, stopTracks); current();
        if (!r.stream.getAudioTracks().length || r.stream.getVideoTracks().length) throw Error('Expected audio-only tab capture.');
        // Chrome tabCapture suppresses its normal local output. Restore exactly one monitor.
        r.monitor = await bounded(this.env.monitor(r.stream), r.controller.signal, 12000, value => { void value.close(); }); current();
        r.pc = this.env.createPeer();
        const sender = r.pc.addTrack(r.stream.getAudioTracks()[0], r.stream);
        const transceiver = r.pc.getTransceivers()[0];
        if (transceiver) transceiver.direction = 'sendonly';
        if (transceiver && transceiver.setCodecPreferences && this.env.audioCodecs) {
          const opus = this.env.audioCodecs().filter(c => c.mimeType.toLowerCase() === 'audio/opus');
          if (!opus.length) throw Error('Opus is unavailable in this browser.');
          transceiver.setCodecPreferences(opus);
        }
        r.pc.onconnectionstatechange = () => {
          if (generation !== this.generation) return;
          const state = r.pc.connectionState;
          if (state === 'connected') this.report('live', 'Live · stereo Opus · 256 kbps target');
          if (state === 'disconnected') this.report('reconnecting', 'Connection interrupted; waiting for recovery…');
          if (state === 'failed') void this.fail(r, 'Connection failed. Stop and start again to reconnect.');
        };
        r.stream.getAudioTracks()[0].onended = () => { if (generation === this.generation) void this.stop('Source tab closed or capture ended.'); };
        const offer = await r.pc.createOffer(); current();
        await r.pc.setLocalDescription({type:'offer', sdp:stereoSDP(offer.sdp)}); current();
        const params = sender.getParameters();
        if (!params.encodings || !params.encodings.length) params.encodings = [{}];
        params.encodings[0].maxBitrate = BITRATE;
        await sender.setParameters(params); current();
        await bounded(this.env.gather(r.pc), r.controller.signal, 12000); current();
        const headers = {'Content-Type':'application/sdp'}; if (token) headers.Authorization = 'Bearer ' + token;
        // Native MediaMTX can answer WHIP before deciding whether a path already
        // has a publisher. Catnap's own relay provides a private preflight that
        // distinguishes a busy stream from a rejected key. Other relays retain
        // their existing behavior; old Catnap installations can return 404/405.
        if (url === DEFAULT_ENDPOINT) {
          const checkHeaders = {'Content-Type':'application/json'};
          if (token) checkHeaders.Authorization = 'Bearer ' + token;
          const check = await bounded(this.env.fetch(new URL('/hosts/api/publish-check', url).href, {
            method:'POST', headers:checkHeaders, body:takeover?'\u007b"takeover":true\u007d':'{}', signal:r.controller.signal,
            redirect:'error', credentials:'omit'
          }), r.controller.signal, 12000); current();
          if (check.status === 409) throw Error('Another host is broadcasting. Wait for them to stop, then try again.');
          if (check.status === 401 || check.status === 403) throw Error('Relay rejected the publish token.');
          if (takeover && [404,405].includes(check.status)) throw Error('Broadcast takeover is unavailable on this relay.');
          if (![200,404,405].includes(check.status)) throw Error('Relay availability check failed. Try again shortly.');
        }
        const response = await bounded(this.env.fetch(url, {method:'POST',headers,body:r.pc.localDescription.sdp,signal:r.controller.signal,redirect:'error',credentials:'omit'}), r.controller.signal, 12000, response => {
          // If Stop wins a race with a successful POST, release that newly allocated session.
          if (response.status === 201) {
            try { const lateURL=sessionURL(response.headers.get('Location'),url); const lateHeaders={}; if(token) lateHeaders.Authorization='Bearer '+token; void this.env.fetch(lateURL,{method:'DELETE',headers:lateHeaders,signal:AbortSignal.timeout(3000),credentials:'omit',redirect:'error'}).catch(()=>{}); } catch (_) {}
          }
        }); current();
        if (response.status !== 201) throw Error(response.status === 401 || response.status === 403 ? 'Relay rejected the publish token.' : 'Relay refused the broadcast (HTTP ' + response.status + ').');
        r.session = sessionURL(response.headers.get('Location'), url);
        const answer = await response.text(); current();
        await r.pc.setRemoteDescription({type:'answer',sdp:answer}); current();
        // A successful WHIP answer isn't proof of flowing media; connection callback marks Live.
        if (r.pc.connectionState === 'connected') this.report('live', 'Live · stereo Opus · 256 kbps target');
        else this.report('connecting', 'Relay accepted; establishing audio connection…');
        r.connectTimer = setTimeout(() => { if (generation === this.generation && r.pc.connectionState !== 'connected') void this.fail(r, 'Audio connection timed out. Check relay media ports.'); }, 15000);
        return true;
      } catch (error) {
        if (generation === this.generation) await this.fail(r, error.message || 'Broadcast failed.');
        else await this.cleanup(r);
        return false;
      }
    }
    async cleanup(r) {
      if (!r || r.cleaned) return; r.cleaned = true; r.controller.abort(); clearTimeout(r.connectTimer);
      if (r.pc) { r.pc.onconnectionstatechange = null; r.pc.close(); }
      stopTracks(r.stream);
      if (r.monitor) { try { await r.monitor.close(); } catch (_) { /* Continue releasing relay even if the audio context was already closed. */ } }
      if (r.session) {
        const headers = {}; if (r.token) headers.Authorization = 'Bearer ' + r.token;
        try { await this.env.fetch(r.session, {method:'DELETE',headers,signal:AbortSignal.timeout(3000),credentials:'omit',redirect:'error'}); } catch (_) { /* Tracks are already stopped; relay expires an unreachable session. */ }
      }
      r.token = '';
      if (this.resources === r) this.resources = null;
    }
    async fail(r, message) {
      if (this.resources !== r) return;
      const generation = ++this.generation;
      await this.cleanup(r);
      // Old monitor/relay cleanup can finish after Stop and a newer Start.
      // It may release its own resources, never replace the new peer's status.
      if (generation === this.generation && (!this.resources || this.resources === r)) this.report('error', message);
    }
    async stop(message = 'Stopped. Local playback continues.') {
      const generation = ++this.generation, r = this.resources;
      await this.cleanup(r);
      if (generation === this.generation && (!this.resources || this.resources === r)) this.report('idle', message);
    }
  }
  return {VERSION,BITRATE,DEFAULT_ENDPOINT,endpoint,permissionOrigin,sessionURL,stereoSDP,Publisher};
});
