// Catnap theatre visual layer.
// Version 0.4.0: shared presentation controls and uploader-first AIU banners.
// Presentation only: never controls Suno audio, navigation, voice or Discord.
(() => {
  'use strict';
  const SCRIPT_VERSION = '0.4.0';
  // Keep at most five local files / 100 MiB in this tab; never upload or persist them.
  const recentFiles = [];
  let selectedFile = null;
  const ROOT = 'catnap-theater-root';
  let mounted = null, ui = null, songKey = '', sourceKey = '', failed = '', objectUrl = '', deadline = 0;
  const normalize = s => String(s || '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const imageKey = s => { try { const u = new URL(s); u.searchParams.delete('width'); u.searchParams.delete('height'); return u.href; } catch { return ''; } };
  function safeVideo(src) {
    try { const u = new URL(src); return u.protocol === 'https:' && /(^|\.)suno\.(ai|com)$/i.test(u.hostname) ? u.href : ''; } catch { return ''; }
  }
  function release(video) { video.pause(); video.removeAttribute('src'); video.load(); video.hidden = true; }
  function clearOverlay() {
    if (!ui) return;
    release(ui.overlayVideo); ui.overlayImage.removeAttribute('src'); ui.overlayImage.hidden = true;
    ui.banner.textContent = ''; ui.banner.hidden = true; ui.layer.hidden = true;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = ''; deadline = 0;
    ui.status.textContent = 'Overlay cleared.';
  }
  function dispose() {
    if (!ui) return;
    clearOverlay(); release(ui.songVideo); mounted = null; ui = null; selectedFile = null; songKey = ''; sourceKey = ''; failed = '';
  }
  function mount(root) {
    const style = document.createElement('style');
    style.textContent = `
#${ROOT} [hidden]{display:none!important}
#${ROOT} .ct-song-video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#100e18;pointer-events:none;z-index:1}
#${ROOT} .ct-visual-tools{position:absolute;right:18px;bottom:80px;z-index:30;font:13px system-ui;color:#fff}
#${ROOT} .ct-visual-tools>summary{cursor:pointer;background:#292139;padding:7px 12px;border:1px solid #82709b;border-radius:9px;list-style:none}
#${ROOT} .ct-visual-panel{width:310px;max-height:65vh;overflow:auto;background:#171322;border:1px solid #82709b;padding:14px;border-radius:12px;box-shadow:0 8px 35px #000b;display:grid;gap:10px}
#${ROOT} .ct-visual-panel label{display:grid;gap:4px} #${ROOT} .ct-visual-panel label.ct-visual-check{display:flex;align-items:center}
#${ROOT} .ct-visual-panel input,#${ROOT} .ct-visual-panel select,#${ROOT} .ct-visual-panel button{font:13px system-ui;color:#fff;background:#30263f;border:1px solid #786a89;border-radius:5px;padding:6px;max-width:100%}
#${ROOT} .ct-visual-layer{position:absolute;z-index:15;pointer-events:none;display:grid;place-items:center;overflow:hidden;background:transparent}
#${ROOT} .ct-visual-layer[data-placement="art"]{inset:0}
#${ROOT} .ct-visual-layer[data-placement="corner"]{right:22px;bottom:100px;width:26%;height:30%}
#${ROOT} .ct-visual-layer[data-placement="stage"]{inset:80px 20px 90px}
#${ROOT} .ct-visual-layer img,#${ROOT} .ct-visual-layer video{width:100%;height:100%;object-fit:contain}
#${ROOT} .ct-visual-banner{position:absolute;left:5%;right:5%;bottom:110px;z-index:20;pointer-events:none;text-align:center;white-space:pre-wrap;overflow-wrap:anywhere;padding:18px;background:#171020eF;border:2px solid #b491d0;border-radius:14px;color:white;font:700 clamp(20px,2.5vw,42px)/1.3 system-ui;box-shadow:0 8px 30px #0008}
`;
    root.appendChild(style);
    const frame = root.querySelector('.ct-art-frame');
    if (!frame) return;
    const songVideo = document.createElement('video');
    songVideo.className = 'ct-song-video'; songVideo.hidden = true; songVideo.muted = true; songVideo.defaultMuted = true; songVideo.playsInline = true; songVideo.preload = 'metadata';
    songVideo.setAttribute('aria-label', 'Current song video, muted'); frame.appendChild(songVideo);
    const tools = document.createElement('details'); tools.className = 'ct-visual-tools';
    tools.innerHTML = `<summary>Visuals</summary><div class="ct-visual-panel">
<label class="ct-visual-check"><input type="checkbox" class="ct-enable-video" checked> Play available song video</label>
<div class="ct-presets" aria-label="Quick banners"></div>
<label>Banner text<input class="ct-banner-text" maxlength="240" placeholder="Content warning, announcement, silliness…"></label>
<label>Local image / GIF / video<input type="file" class="ct-overlay-file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"></label>
<label>Recently used<select class="ct-recents"><option value="">Choose a recent file…</option></select></label>
<button class="ct-forget-files" type="button">Forget recent files</button>
<label>Media placement<select class="ct-placement"><option value="art">Over artwork</option><option value="corner">Corner</option><option value="stage">Across theatre</option></select></label>
<label>Clear after<select class="ct-expiry"><option value="15">15 seconds</option><option value="30">30 seconds</option><option value="60">1 minute</option><option value="0">Until cleared</option></select></label>
<button class="ct-show-overlay" type="button">Show overlay</button><button class="ct-clear-overlay" type="button">Clear overlay</button>
<small class="ct-visual-status" role="status">Local files stay in this tab. All video is muted.</small></div>`;
    root.appendChild(tools);
    const layer = document.createElement('div'); layer.className = 'ct-visual-layer'; layer.hidden = true;
    const overlayImage = document.createElement('img'); overlayImage.alt = 'Host visual overlay'; overlayImage.hidden = true;
    const overlayVideo = document.createElement('video'); overlayVideo.muted = true; overlayVideo.defaultMuted = true; overlayVideo.playsInline = true; overlayVideo.loop = true; overlayVideo.hidden = true;
    layer.append(overlayImage, overlayVideo); frame.appendChild(layer);
    const banner = document.createElement('div'); banner.className = 'ct-visual-banner'; banner.hidden = true; root.appendChild(banner);
    ui = {root,frame,songVideo,tools,layer,overlayImage,overlayVideo,banner,status:tools.querySelector('.ct-visual-status'),enabled:tools.querySelector('.ct-enable-video')};
    mounted = root; root.dataset.visualVersion = SCRIPT_VERSION;
    songVideo.addEventListener('error', () => { failed = sourceKey; release(songVideo); });
    songVideo.addEventListener('playing', () => { songVideo.hidden = false; });
    songVideo.addEventListener('loadeddata', () => { if (sourceKey && sourceKey !== failed) songVideo.hidden = false; });
    ui.enabled.addEventListener('change', () => { if (!ui.enabled.checked) { release(songVideo); sourceKey = ''; } else failed = ''; });
    tools.querySelector('.ct-clear-overlay').addEventListener('click', clearOverlay);
    function renderRecents(){
      const select=tools.querySelector('.ct-recents'); select.replaceChildren();
      const empty=document.createElement('option');empty.value='';empty.textContent='Choose a recent file…';select.appendChild(empty);
      recentFiles.forEach((file,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=file.name;select.appendChild(option);});
    }
    renderRecents();
    tools.querySelector('.ct-overlay-file').addEventListener('change',()=>{selectedFile=tools.querySelector('.ct-overlay-file').files[0]||null;tools.querySelector('.ct-recents').value='';});
    tools.querySelector('.ct-recents').addEventListener('change',event=>{
      selectedFile=event.target.value===''?null:recentFiles[Number(event.target.value)];
      tools.querySelector('.ct-overlay-file').value='';
      ui.status.textContent=selectedFile?'Loaded '+selectedFile.name+'; click Show overlay.':'No file selected.';
    });
    tools.querySelector('.ct-forget-files').addEventListener('click',()=>{clearOverlay();recentFiles.length=0;selectedFile=null;tools.querySelector('.ct-overlay-file').value='';renderRecents();ui.status.textContent='Recent files forgotten.';});
    const presets=[['⚠️ Trigger warning','⚠️ TRIGGER WARNING — Sensitive themes in the next track. Take care of yourself.'],['⚠️ Content warning','⚠️ CONTENT WARNING — Mature themes / explicit lyrics.'],['🎶 AIU uploader','🎶 AIU UPLOADER — Submit your track through https://uploader.aiu.fm/'],['🛑 No More Tracks','🛑 NO MORE TRACKS — Requests are closed. Enjoy the rest of the queue!'],['☕ Quick Break','☕ QUICK BREAK — Back in a moment!'],['💜 Thanks for Listening','💜 THANKS FOR LISTENING — You made the party!'],['🎶 Chat drops · emergency / non-AIU','🎶 CHAT DROPS — Emergency or non-AIU use only. Share your Suno song link in chat when the host explicitly opens chat requests.']];
    for(const [label,text] of presets){const button=document.createElement('button');button.type='button';button.textContent=label;button.addEventListener('click',()=>{tools.querySelector('.ct-banner-text').value=text;showOverlay(text,null);});tools.querySelector('.ct-presets').appendChild(button);}
    tools.querySelector('.ct-show-overlay').addEventListener('click',()=>showOverlay(tools.querySelector('.ct-banner-text').value.trim(),selectedFile||tools.querySelector('.ct-overlay-file').files[0]));
    // Standalone controls stay available here; there is no external controller bridge.
    function showOverlay(text,file){
      clearOverlay();
      if (file && (!/^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm))$/.test(file.type) || file.size > 100 * 1024 * 1024)) {
        ui.status.textContent = 'Choose PNG, JPEG, WebP, GIF, MP4 or WebM under 100 MB.'; return;
      }
      if (!text && !file) { ui.status.textContent = 'Enter banner text or choose a local media file.'; return; }
      if(file){
        const old=recentFiles.findIndex(f=>f.name===file.name&&f.size===file.size&&f.lastModified===file.lastModified);
        if(old>=0)recentFiles.splice(old,1);recentFiles.unshift(file);
        while(recentFiles.length>5||recentFiles.reduce((sum,f)=>sum+f.size,0)>100*1024*1024)recentFiles.pop();
        renderRecents();
      }
      banner.textContent = text; banner.hidden = !text;
      const placement = tools.querySelector('.ct-placement').value;
      layer.dataset.placement = placement;
      (placement === 'art' ? frame : root).appendChild(layer);
      if (file) {
        objectUrl = URL.createObjectURL(file); layer.hidden = false;
        if (file.type.startsWith('video/')) {
          overlayVideo.src = objectUrl; overlayVideo.hidden = false;
          overlayVideo.play().catch(() => { if (ui) ui.status.textContent = 'Overlay video could not play. Clear it or choose another file.'; });
        } else { overlayImage.src = objectUrl; overlayImage.hidden = false; }
      }
      const seconds = Number(tools.querySelector('.ct-expiry').value);
      deadline = seconds ? Date.now() + seconds * 1000 : 0;
      ui.status.textContent = 'Overlay showing; included in the shared theatre tab.'; tools.open = false;
    }
  }
  // Bind only a current-song video: matching poster or a tight native container
  // containing the title-labelled detail artwork. Never select an unrelated feed clip.
  function findNativeVideo(root, title) {
    const images = Array.from(document.querySelectorAll('img[alt]')).filter(img => !root.contains(img) && normalize(img.alt.replace(/^Image for\s*/i, '').replace(/\s*artwork$/i, '')) === normalize(title));
    if (!images.length) return null;
    return Array.from(document.querySelectorAll('video')).find(video => {
      if (root.contains(video) || !safeVideo(video.currentSrc || video.getAttribute('src'))) return false;
      if (video.poster && images.some(img => imageKey(img.currentSrc || img.src) === imageKey(video.poster))) return true;
      let parent = video.parentElement;
      for (let i = 0; i < 4 && parent && !['BODY','HTML','MAIN'].includes(parent.tagName); i++, parent = parent.parentElement) {
        if (parent.querySelectorAll('video').length !== 1) break;
        if (images.some(img => /^Image for\s/i.test(img.alt) && parent.contains(img))) return true;
      }
      return false;
    }) || null;
  }
  function tick() {
    const root = document.getElementById(ROOT);
    if (mounted && root !== mounted) dispose();
    if (!root) return;
    if (!ui) mount(root);
    if (!ui) return;
    if (deadline && Date.now() >= deadline) clearOverlay();
    const titleLink = document.querySelector('a[aria-label^="Playbar: Title for"]');
    const key = titleLink?.getAttribute('href') || '';
    const title = titleLink?.textContent?.trim() || titleLink?.getAttribute('aria-label')?.replace(/^Playbar: Title for\s*/i, '') || '';
    if (key !== songKey) { release(ui.songVideo); sourceKey = ''; failed = ''; songKey = key; }
    if (!key || !ui.enabled.checked) return;
    const native = findNativeVideo(root, title);
    if (!native) { if (sourceKey) release(ui.songVideo); sourceKey = ''; return; }
    const src = safeVideo(native.currentSrc || native.getAttribute('src'));
    if (src === failed) return;
    const video = ui.songVideo;
    if (sourceKey !== src) { release(video); sourceKey = src; video.src = src; video.load(); }
    video.muted = true;
    // Native video owns its timeline (including looping animated covers). Copy it,
    // rather than guessing whether this is a full music video or a short loop.
    if (video.readyState >= 1 && Math.abs(video.currentTime - native.currentTime) > 0.8) {
      try { video.currentTime = native.currentTime; } catch { /* metadata/seek race */ }
    }
    video.loop = native.loop; video.playbackRate = native.playbackRate || 1;
    if (native.paused || native.ended) video.pause();
    else if (video.paused) video.play().catch(() => { if (ui?.songVideo === video && sourceKey === src) { failed = src; release(video); } });
  }
  setInterval(tick, 400);
  tick();
})();
