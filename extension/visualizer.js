/* Catnap background music visualizer, version 0.5.0.
 * An analysis-only clone of a native srcObject stream never replaces/reroutes
 * Suno's audio. The existing broadcaster supplies its available spectrum for
 * URL-backed music. Native captureStream is deliberately never invoked: Chrome
 * can end original srcObject tracks after a captured element changes source.
 * No microphone, getUserMedia, new tab capture, recording or network requests.
 */
(function(scope,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {scope.CatnapVisualizer=api;if(scope.document&&scope.chrome?.runtime&&/^https:\/\/(?:www\.)?suno\.com\//.test(scope.location?.href||''))api.install(scope);}
})(globalThis,()=>{
  'use strict';
  const SCRIPT_VERSION='0.5.0',BAR_COUNT=48,ROOT='catnap-theater-root',LEASE_MS=1600,FRAME_MS=1000/24;
  let installed=null;
  function sanitizeBands(input){
    return Array.isArray(input)&&input.length===BAR_COUNT&&input.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1)?input.slice():null;
  }
  function spectrum(values,sampleRate=48000,fftSize=512){
    const result=new Array(BAR_COUNT).fill(0);
    if(!values?.length||!Number.isFinite(sampleRate)||!Number.isFinite(fftSize)||sampleRate<=0||fftSize<=0)return result;
    const top=Math.min(12000,sampleRate/2),low=Math.min(60,top/2);
    for(let index=0;index<BAR_COUNT;index++){
      const start=Math.min(values.length-1,Math.max(1,Math.floor(low*Math.pow(top/low,index/BAR_COUNT)*fftSize/sampleRate)));
      const end=Math.min(values.length,Math.max(start+1,Math.ceil(low*Math.pow(top/low,(index+1)/BAR_COUNT)*fftSize/sampleRate)));
      let peak=0,sum=0;
      for(let bin=start;bin<end;bin++){const value=Math.max(0,Math.min(255,Number(values[bin])||0));peak=Math.max(peak,value);sum+=value;}
      const level=(peak*.65+sum/(end-start)*.35)/255;
      result[index]=level<0.035?0:Math.min(1,Math.pow(level,1.3));
    }
    return result;
  }
  function smooth(previous,target,deltaMs=FRAME_MS){
    const dt=Math.max(0,Math.min(150,deltaMs));
    return previous.map((value,index)=>{
      const aim=target[index]||0,tau=aim>value?75:230;
      const next=value+(aim-value)*(1-Math.exp(-dt/tau));return next<0.002?0:next;
    });
  }
  function nativeAudio(document){
    const audible=Array.from(document.querySelectorAll('audio')).filter(a=>!a.closest('#'+ROOT)&&!a.paused&&!a.ended&&a.readyState>=2);
    if(audible.length===1)return audible[0];
    const href=document.querySelector('a[aria-label^="Playbar: Title for "]')?.getAttribute('href')||'';
    const id=/\/song\/([0-9a-f-]{36})(?:[/?#]|$)/i.exec(href)?.[1];
    const matching=id?audible.filter(a=>String(a.currentSrc||a.src||'').includes(id)):[];
    return matching.length===1?matching[0]:null;
  }
  function install(window){
    if(installed)return installed;
    const document=window.document,now=()=>window.performance.now(),motion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let root=null,canvas=null,painter=null,resize=null,frame=0,lastFrame=0,frames=0,native=null,lastAttempt=-Infinity;
    let bands=new Array(BAR_COUNT).fill(0),broadcast=null,interval,disposed=false,suspended=false;
    let prefs={visualizerEnabled:true,visualizerOpacity:.20},state='closed',source='none',reason='';
    function closeNative(){
      const old=native;native=null;if(!old)return;
      try{old.node?.disconnect();old.analyser?.disconnect();}catch{}
      // Only this explicit analysis clone is owned. Native srcObject input
      // tracks are never stopped; native playback and other consumers keep them.
      try{old.track?.stop();}catch{}
      if(old.context&&old.context.state!=='closed')void old.context.close().catch(()=>{});
    }
    function size(){
      if(!root||!canvas)return;
      const rect=root.getBoundingClientRect();
      const width=Math.max(1,Math.min(1920,Math.round(rect.width))),height=Math.max(1,Math.min(420,Math.round(rect.height*.36)));
      if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    }
    function clear(){if(painter&&canvas)painter.clearRect(0,0,canvas.width,canvas.height);}
    function destroy(){
      closeNative();if(frame)window.cancelAnimationFrame(frame);frame=0;resize?.disconnect();resize=null;
      canvas?.remove();root?.querySelector('[data-catnap-visualizer-style]')?.remove();
      canvas=null;painter=null;root=null;bands.fill(0);state='closed';source='none';
    }
    function mount(next){
      destroy();root=next;
      const style=document.createElement('style');style.dataset.catnapVisualizerStyle='true';
      style.textContent=`
#${ROOT}>.ct-audio-visualizer{position:absolute!important;left:0!important;right:0!important;bottom:0!important;top:auto!important;width:100%!important;height:36%!important;max-height:420px!important;z-index:0!important;pointer-events:none!important;display:block;background:transparent!important;opacity:.2}
#${ROOT}>.ct-audio-visualizer[hidden]{display:none!important}
#${ROOT}>.ct-header,#${ROOT}>.ct-main,#${ROOT}>.ct-bottom{position:relative;z-index:2}
`;
      canvas=document.createElement('canvas');canvas.className='ct-audio-visualizer';canvas.setAttribute('aria-hidden','true');canvas.setAttribute('inert','');
      root.prepend(canvas);root.append(style);painter=canvas.getContext('2d',{alpha:true});
      if(window.ResizeObserver){resize=new window.ResizeObserver(size);resize.observe(root);}size();
      lastFrame=0;frame=window.requestAnimationFrame(draw);
    }
    function broadcastFresh(){return broadcast&&now()-broadcast.at<LEASE_MS;}
    function openNative(audio){
      const input=audio.srcObject;
      const sourceTrack=input?.getAudioTracks?.().find(track=>track.readyState==='live');
      if(native?.audio===audio&&native.key===String(audio.currentSrc||audio.src||'')&&native.input===input&&native.sourceTrack===sourceTrack&&native.track.readyState==='live'&&native.sourceTrack.readyState==='live')return;
      closeNative();
      if(!input?.getAudioTracks){reason='Start HQ broadcasting for background bars on this music source.';return;}
      if(now()-lastAttempt<1500)return;lastAttempt=now();
      let stream,context;
      try{
        const AudioContext=window.AudioContext||window.webkitAudioContext;
        if(!AudioContext||!window.MediaStream){reason='Audio analysis is unavailable in this browser.';return;}
        const tracks=input.getAudioTracks().filter(track=>track.readyState==='live');
        if(tracks.length!==1||typeof tracks[0].clone!=='function'){
          reason='No safe native audio analysis is available.';return;
        }
        const analysisSource=tracks[0];
        stream=new window.MediaStream([analysisSource.clone()]);
        context=new AudioContext({latencyHint:'playback'});
        const analyser=context.createAnalyser();analyser.fftSize=512;analyser.smoothingTimeConstant=.55;
        const node=context.createMediaStreamSource(stream);node.connect(analyser);
        // AnalyserNode needs no output connection. Connecting to destination
        // here would duplicate the music; that is deliberately never done.
        native={audio,key:String(audio.currentSrc||audio.src||''),input,sourceTrack:analysisSource,track:stream.getAudioTracks()[0],stream,context,node,analyser,values:new Uint8Array(analyser.frequencyBinCount)};
        void context.resume().catch(()=>{});reason='';
      }catch{
        stream?.getTracks().forEach(t=>{try{t.stop();}catch{}});
        if(context&&context.state!=='closed')void context.close().catch(()=>{});
        reason='No safe native audio analysis is available.';
      }
    }
    function update(){
      if(disposed||suspended)return;
      const next=document.getElementById(ROOT);if(next!==root){if(next)mount(next);else destroy();}
      if(!root)return;
      try{prefs=window.CatnapPresentationSettings?.read()||window.CatnapTheatre?.defaults||prefs;}catch{}
      const enabled=prefs.visualizerEnabled!==false&&!motion?.matches;
      canvas.hidden=!enabled;canvas.style.opacity=String(Math.max(.05,Math.min(.4,Number.isFinite(prefs.visualizerOpacity)?prefs.visualizerOpacity:.2)));
      if(!enabled){closeNative();bands.fill(0);clear();state=motion?.matches?'reduced-motion':'disabled';source='none';return;}
      if(broadcastFresh()){closeNative();source='broadcast';reason='';}
      else{const audio=nativeAudio(document);if(audio)openNative(audio);else closeNative();source=native?'native':'none';}
      if(!frame)frame=window.requestAnimationFrame(draw);
    }
    function draw(timestamp){
      frame=0;if(!root?.isConnected||disposed||suspended)return;
      if(canvas.hidden)return;
      if(timestamp-lastFrame<FRAME_MS){frame=window.requestAnimationFrame(draw);return;}
      const delta=lastFrame?timestamp-lastFrame:FRAME_MS;lastFrame=timestamp;frames++;
      let target=new Array(BAR_COUNT).fill(0);
      if(broadcastFresh()){target=broadcast.bands;source='broadcast';}
      else if(native&&!native.audio.paused&&!native.audio.ended&&native.context.state==='running'&&native.track.readyState==='live'&&!native.track.muted){
        try{native.analyser.getByteFrequencyData(native.values);target=spectrum(native.values,native.context.sampleRate,native.analyser.fftSize);source='native';}catch{closeNative();}
      }
      bands=smooth(bands,target,delta);const energy=bands.reduce((a,b)=>a+b,0)/BAR_COUNT;
      state=energy>.005?'reacting':'quiet';
      canvas.dataset.source=source;canvas.dataset.state=state;canvas.dataset.energy=energy.toFixed(4);
      clear();
      if(painter){
        const width=canvas.width,height=canvas.height,step=width/BAR_COUNT,barWidth=Math.max(2,step*.67);
        const gradient=painter.createLinearGradient(0,height,0,0);gradient.addColorStop(0,'#9d80d4');gradient.addColorStop(1,'#68d4c2');painter.fillStyle=gradient;
        for(let index=0;index<BAR_COUNT;index++){const barHeight=bands[index]*height*.92;if(barHeight>=1)painter.fillRect(index*step+(step-barWidth)/2,height-barHeight,barWidth,barHeight);}
      }
      frame=window.requestAnimationFrame(draw);
    }
    function receive(message,sender){
      if(message?.target!=='catnap-visualizer-levels'||sender.id!==window.chrome.runtime.id||sender.tab)return;
      const worker=window.chrome.runtime.getURL(window.chrome.runtime.getManifest?.().background?.service_worker||'broadcast-worker.js');
      if(sender.url&&sender.url!==worker)return;
      if(message.live===false){broadcast=null;update();return;}
      const values=sanitizeBands(message.bands);if(!values)return;
      broadcast={bands:values,at:now()};reason='';if(root&&prefs.visualizerEnabled!==false&&!motion?.matches){source='broadcast';closeNative();if(!frame)frame=window.requestAnimationFrame(draw);}
    }
    const interact=()=>{if(native?.context.state==='suspended')void native.context.resume().catch(()=>{});};
    const hide=()=>{suspended=true;window.clearInterval(interval);destroy();};
    const show=()=>{if(disposed)return;suspended=false;window.clearInterval(interval);interval=window.setInterval(update,400);update();};
    window.chrome.runtime.onMessage.addListener(receive);
    document.addEventListener('pointerdown',interact,{passive:true});document.addEventListener('keydown',interact,{passive:true});
    window.addEventListener('resize',size);window.addEventListener('pagehide',hide);window.addEventListener('pageshow',show);motion?.addEventListener?.('change',update);
    installed={status:()=>({version:SCRIPT_VERSION,state,source,reason,energy:bands.reduce((a,b)=>a+b,0)/BAR_COUNT,frames}),refreshSettings:update,
      dispose:()=>{disposed=true;hide();window.chrome.runtime.onMessage.removeListener?.(receive);document.removeEventListener('pointerdown',interact);document.removeEventListener('keydown',interact);window.removeEventListener('resize',size);window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',show);motion?.removeEventListener?.('change',update);installed=null;}};
    show();return installed;
  }
  return {SCRIPT_VERSION,BAR_COUNT,sanitizeBands,spectrum,smooth,nativeAudio,install,status:()=>installed?.status()||{version:SCRIPT_VERSION,state:'closed',source:'none',energy:0,frames:0},refreshSettings:()=>installed?.refreshSettings()};
});
