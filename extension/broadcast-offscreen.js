/* Catnap offscreen music publisher, version 0.5.0.
 * Reuse the existing monitor analyser for the optional source-tab visualizer.
 * No additional capture, output route, microphone or video is requested.
 */
'use strict';
const SCRIPT_VERSION = '0.5.0';
let status = {state:'idle',message:'Ready.'}, meter = 0, analyser, meterTimer;
const publisher = new CatnapBroadcast.Publisher({
  capture: async streamId => {
    // Chromium's tab source uses legacy mandatory constraints. Do not mix standard
    // processing keys into that getUserMedia object; apply them to the track afterward.
    const stream=await navigator.mediaDevices.getUserMedia({audio:{mandatory:{chromeMediaSource:'tab',chromeMediaSourceId:streamId}},video:false});
    try { await stream.getAudioTracks()[0].applyConstraints({echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:{ideal:2}}); return stream; }
    catch(error) { stream.getTracks().forEach(track=>track.stop()); throw error; }
  },
  monitor: async stream => {
    const context = new AudioContext({sampleRate:48000,latencyHint:'interactive'});
    const source = context.createMediaStreamSource(stream);
    analyser = context.createAnalyser(); analyser.fftSize = 512;
    // The canvas already eases movement. Avoid a second long spectral tail at
    // the existing 250ms meter interval; this never changes monitor audio/RMS.
    analyser.smoothingTimeConstant = .15;
    source.connect(analyser); source.connect(context.destination);
    await context.resume();
    const values=new Float32Array(analyser.fftSize),frequencyValues=new Uint8Array(analyser.frequencyBinCount);
    meterTimer = setInterval(() => {
      analyser.getFloatTimeDomainData(values);meter=Math.min(1,Math.sqrt(values.reduce((sum,x)=>sum+x*x,0)/values.length));
      if(status.state==='live'){
        analyser.getByteFrequencyData(frequencyValues);
        const bands=CatnapVisualizer.spectrum(frequencyValues,context.sampleRate,analyser.fftSize);
        void chrome.runtime.sendMessage({target:'broadcast-visualizer',bands}).catch(()=>{});
      }
    },250);
    return {close:async () => { clearInterval(meterTimer); meter=0; source.disconnect(); analyser.disconnect(); await context.close(); }};
  },
  createPeer: () => new RTCPeerConnection({iceServers:[],bundlePolicy:'max-bundle'}),
  audioCodecs: () => RTCRtpSender.getCapabilities('audio').codecs,
  gather: pc => pc.iceGatheringState === 'complete' ? Promise.resolve() : new Promise(resolve => { const listener = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange',listener); resolve(); } }; pc.addEventListener('icegatheringstatechange',listener); }),
  fetch: (...args) => fetch(...args),
  onStatus: update => { status = update; void chrome.runtime.sendMessage({target:'broadcast-status',state:update.state}).catch(()=>{}); }
});
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message.target !== 'broadcast-offscreen' || sender.id !== chrome.runtime.id || sender.tab || (sender.url && sender.url !== chrome.runtime.getURL(chrome.runtime.getManifest?.().background?.service_worker||'broadcast-worker.js'))) return;
  if (message.action === 'status') { reply({...status,level:meter}); return; }
  if (message.action === 'start') { publisher.start(message).then(() => reply({...status,level:meter})); return true; }
  if (message.action === 'stop') { publisher.stop().then(() => reply({...status,level:meter})); return true; }
});
