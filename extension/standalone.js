// Catnap Theatre standalone companion, version 0.6.9.
// Changes: group matching control-window buttons and explicitly label Suno rows.
// Reads native page rows only. Never refreshes the page, fetches a private API,
// alters the playlist, or contacts a bot. Keep source adapters small and replaceable.
(() => {
  'use strict';
  const SCRIPT_VERSION = '0.6.9';
  const {defaults,settings,isCue,songId} = globalThis.CatnapTheatre;
  const STORAGE_KEY='catnap-theatre-settings-v1';
  let prefs={...defaults},root=null,tools=null,playlist=null,status=null,signature='',observer=null,ready=false,logoUrl='',backgroundUrl='';
  const element=(tag,attributes={},text='')=>{
    const el=document.createElement(tag);
    for(const [key,value] of Object.entries(attributes))el.setAttribute(key,String(value));
    if(text)el.textContent=text;return el;
  };
  async function save(next){
    prefs=settings(next);paint();
    globalThis.CatnapVisualizer?.refreshSettings?.();
    try{await chrome.storage.local.set({[STORAGE_KEY]:prefs});if(status)status.textContent='Settings saved in this browser profile.';}
    catch{if(status)status.textContent='Settings work for this tab, but browser storage is unavailable.';}
  }
  // Isolated-world adapter: both control surfaces use this same validator,
  // preferences object, repaint and profile storage write.
  globalThis.CatnapPresentationSettings=Object.freeze({read:()=>({...prefs}),save});
  function hideOptionControls(){
    if(!root)return;
    // These nodes retain the existing local handlers used by the popout and
    // advanced bridge. Hidden + inert removes them from layout, tab order and
    // the accessibility tree without changing any playback code.
    for(const control of root.querySelectorAll('.ct-standalone-tools,.ct-visual-tools,.ct-lyrics-auto,.ct-lyrics-reload')){
      control.hidden=true;control.inert=true;control.setAttribute('inert','');control.setAttribute('aria-hidden','true');control.setAttribute('tabindex','-1');
    }
  }
  function paint(){
    if(!root)return;
    root.dataset.layout=prefs.layout;root.style.setProperty('--ct-lyric-size',prefs.fontSize+'px');
    root.style.setProperty('--ct-background',prefs.background);root.style.setProperty('background',prefs.background,'important');
    if(backgroundUrl){root.style.setProperty('background-image',`url("${backgroundUrl}")`,'important');root.style.setProperty('background-size','cover','important');root.style.setProperty('background-position','center','important');}
    else root.style.removeProperty('background-image');
    const customLogo=root.querySelector('.ct-custom-logo');if(customLogo){customLogo.hidden=!logoUrl;if(logoUrl)customLogo.src=logoUrl;}
    const catIcon=root.querySelector('.ct-brand>svg');if(catIcon)catIcon.style.display=logoUrl?'none':'';
    const brand=root.querySelector('.ct-brand-main');if(brand)brand.textContent=prefs.brand||'Catnap Theatre';
    for(const line of root.querySelectorAll('.ct-lyrics-content>div'))line.hidden=prefs.stripTags&&isCue(line.textContent);
    if(tools){
      tools.querySelector('[name="layout"]').value=prefs.layout;
      tools.querySelector('[name="brand"]').value=prefs.brand;
      tools.querySelector('[name="background"]').value=prefs.background;
      tools.querySelector('[name="stripTags"]').checked=prefs.stripTags;
      tools.querySelector('.ct-font-value').textContent=prefs.fontSize+' px';
    }
  }
  function mount(next){
    observer?.disconnect();root=next;signature='';
    const style=element('style');style.textContent=`
#catnap-theater-root::before {opacity:.3}
#catnap-theater-root .ct-lyrics-content {font-size:var(--ct-lyric-size,21px)}
#catnap-theater-root .ct-standalone-tools[hidden],#catnap-theater-root .ct-visual-tools[hidden],#catnap-theater-root .ct-lyrics-auto,#catnap-theater-root .ct-lyrics-reload {display:none!important}
#catnap-theater-root .ct-standalone-tools summary {cursor:pointer;padding:7px 10px;border:1px solid #77618c;border-radius:8px;list-style:none}
#catnap-theater-root .ct-settings-panel {position:absolute;top:40px;right:0;width:300px;max-height:75vh;overflow:auto;padding:15px;background:#161322;border:1px solid #77618c;border-radius:12px;display:grid;gap:11px;box-shadow:0 10px 35px #000b;letter-spacing:normal}
#catnap-theater-root .ct-settings-panel label {display:grid;gap:5px;font-size:13px}
#catnap-theater-root .ct-settings-panel input,#catnap-theater-root .ct-settings-panel select,#catnap-theater-root .ct-settings-panel button {font:13px system-ui;color:#f5efff;background:#30283f;border:1px solid #77618c;padding:7px;border-radius:6px;max-width:100%}
#catnap-theater-root .ct-settings-panel .ct-check {display:flex;gap:8px;align-items:center}
#catnap-theater-root .ct-settings-panel .ct-font-row {display:flex;align-items:center;gap:10px}
#catnap-theater-root .ct-settings-panel a {color:#a8dfef;text-decoration:underline}
#catnap-theater-root .ct-lineup {display:none;min-height:0;overflow-y:auto;border:1px solid #4b3a5b;border-radius:12px;padding:12px;background:#0d0e19}
#catnap-theater-root .ct-lineup h2 {font:700 12px system-ui;letter-spacing:.15em;color:#d8bee9;margin:0 0 8px}
#catnap-theater-root .ct-lineup small {display:block;color:#a9a3b5;font-size:11px;line-height:1.4;margin-bottom:10px}
#catnap-theater-root .ct-track {display:block;width:100%;padding:10px 5px;text-align:left;border-bottom:1px solid #34283e;border-radius:3px;font-size:13px;overflow-wrap:anywhere}
#catnap-theater-root .ct-track:disabled {cursor:default;opacity:.65}
#catnap-theater-root .ct-track[aria-current="true"] {color:#f5d391;border-left:3px solid #ebc987;padding-left:8px;background:#33283c;opacity:1}
#catnap-theater-root[data-layout="lineup"] .ct-main {grid-template-columns:minmax(170px,.36fr) minmax(0,.95fr) minmax(280px,.8fr);gap:20px}
#catnap-theater-root[data-layout="lineup"] .ct-lineup {display:block}
#catnap-theater-root[data-layout="art"] .ct-main {grid-template-columns:1fr}
#catnap-theater-root[data-layout="art"] .ct-lyrics-panel {display:none}
#catnap-theater-root[data-layout="art"] .ct-showcase {align-items:center}
#catnap-theater-root[data-layout="art"] .ct-meta {width:min(100%,85vw);padding-top:10px;text-align:center}
#catnap-theater-root[data-layout="art"] .ct-desc {display:none}
#catnap-theater-root[data-layout="art"] .ct-song-title {font-size:clamp(20px,2vw,32px)}
#catnap-theater-root .ct-brand-sub {font-size:8px;letter-spacing:.08em}
@media(max-width:950px){#catnap-theater-root[data-layout="lineup"] .ct-main{grid-template-columns:160px minmax(0,1fr) minmax(220px,1fr);gap:12px}#catnap-theater-root .ct-aiu {flex-basis:90px}}
@media(max-width:700px){#catnap-theater-root[data-layout="lineup"] .ct-main{display:flex}#catnap-theater-root[data-layout="lineup"] .ct-lineup{display:none}#catnap-theater-root .ct-up-next {display:none}#catnap-theater-root .ct-standalone-tools{margin-left:auto}#catnap-theater-root .ct-settings-panel{right:-100px}}
`;
    root.appendChild(style);
    tools=element('div',{class:'ct-standalone-tools',hidden:'',inert:'','aria-hidden':'true',tabindex:'-1'});tools.inert=true;
    tools.innerHTML=`<div class="ct-settings-panel">
<label>Layout<select name="layout"><option value="duet">Artwork + lyrics</option><option value="lineup">Playlist + artwork + lyrics</option><option value="art">Artwork focus</option></select></label>
<label>Lyrics size<span class="ct-font-row"><button type="button" class="ct-font-down" aria-label="Smaller lyrics">A−</button><span class="ct-font-value"></span><button type="button" class="ct-font-up" aria-label="Larger lyrics">A+</button></span></label>
<label class="ct-check"><input name="stripTags" type="checkbox">Hide [section / metadata] lines</label>
<label>Host name<input name="brand" maxlength="50"></label>
<label>Background colour<input name="background" type="color"></label>
<label>Host logo (this tab)<input class="ct-logo-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label>
<label>Background image (this tab)<input class="ct-background-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label>
<button type="button" class="ct-clear-branding">Clear local images</button>
<button type="button" class="ct-export">Save settings file</button>
<label>Load settings file<input class="ct-import" type="file" accept="application/json,.json"></label>
<button type="button" class="ct-reset">Reset settings</button>
<a class="ct-lounge" target="_blank" rel="noopener">Open waiting / pre-show / after-show lounge</a>
<small class="ct-settings-status" role="status">Settings stay in this browser profile. Local overlay files stay in this tab.</small>
</div>`;
    tools.querySelector('.ct-lounge').href=chrome.runtime.getURL('lounge.html');
    root.appendChild(tools);
    const header=root.querySelector('.ct-header');
    let actions=header.querySelector('.ct-header-actions');if(!actions){actions=element('div',{class:'ct-header-actions',role:'group','aria-label':'Theatre control windows'});header.append(actions);}
    const controls=element('button',{type:'button',class:'ct-header-action ct-popout-controls','aria-label':'Theatre controls',title:'Open presentation settings'},'Presentation ↗');
    actions.insertBefore(controls,actions.firstChild);
    const close=element('button',{type:'button',class:'ct-header-action ct-close','aria-label':'Close theatre',title:'Close theatre (Esc)'},'×');
    close.onclick=()=>document.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',key:'Escape',bubbles:true}));actions.appendChild(close);
    status=tools.querySelector('.ct-settings-status');
    controls.onclick=async()=>{
      try{const result=await chrome.runtime.sendMessage({target:'presentation-worker',action:'open'});if(result?.error)throw Error(result.error);controls.textContent='Presentation ↗';controls.title='Open presentation settings';}
      catch(error){controls.textContent='Controls unavailable';controls.title=error.message||'Could not open controls.';}
    };
    const logo=element('img',{class:'ct-custom-logo',alt:'Host logo',hidden:''});Object.assign(logo.style,{maxWidth:'100px',height:'36px',objectFit:'contain'});root.querySelector('.ct-brand').prepend(logo);
    function localImage(control,kind){control.onchange=e=>{const file=e.target.files[0];if(!file)return;if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type)||file.size>20*1024*1024){status.textContent='Choose a PNG, JPEG, WebP or GIF under 20 MB.';return;}const old=kind==='logo'?logoUrl:backgroundUrl;if(old)URL.revokeObjectURL(old);const url=URL.createObjectURL(file);if(kind==='logo')logoUrl=url;else backgroundUrl=url;paint();status.textContent='Local image loaded for this tab only. It is not included in settings exports.';};}
    localImage(tools.querySelector('.ct-logo-file'),'logo');localImage(tools.querySelector('.ct-background-file'),'background');
    tools.querySelector('.ct-clear-branding').onclick=()=>{if(logoUrl)URL.revokeObjectURL(logoUrl);if(backgroundUrl)URL.revokeObjectURL(backgroundUrl);logoUrl='';backgroundUrl='';paint();status.textContent='Local images cleared.';};
    tools.querySelector('[name="layout"]').onchange=e=>save({...prefs,layout:e.target.value});
    tools.querySelector('[name="stripTags"]').onchange=e=>save({...prefs,stripTags:e.target.checked});
    tools.querySelector('[name="brand"]').onchange=e=>save({...prefs,brand:e.target.value});
    tools.querySelector('[name="background"]').onchange=e=>save({...prefs,background:e.target.value});
    tools.querySelector('.ct-font-down').onclick=()=>save({...prefs,fontSize:prefs.fontSize-2});
    tools.querySelector('.ct-font-up').onclick=()=>save({...prefs,fontSize:prefs.fontSize+2});
    tools.querySelector('.ct-reset').onclick=()=>save({...defaults});
    tools.querySelector('.ct-export').onclick=()=>{
      const url=URL.createObjectURL(new Blob([JSON.stringify(prefs,null,2)],{type:'application/json'}));
      const link=element('a',{href:url,download:'catnap-theatre-settings.json'});link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
    };
    tools.querySelector('.ct-import').onchange=async e=>{
      const file=e.target.files[0];if(!file)return;
      try{if(file.size>16000)throw new Error('This settings file is too large.');await save(settings(JSON.parse(await file.text())));}
      catch(error){status.textContent=error.message||'Could not read this settings file.';}
      e.target.value='';
    };
    playlist=element('aside',{class:'ct-lineup','aria-label':'Visible Suno playlist'});
    root.querySelector('.ct-main').prepend(playlist);
    observer=new MutationObserver(()=>paint());observer.observe(root.querySelector('.ct-lyrics-content'),{childList:true});
    hideOptionControls();paint();refreshPlaylist();
  }
  function nativeRows(){
    if(!/^\/playlist\//.test(location.pathname))return [];
    const seen=new Set(),rows=[];
    for(const link of document.querySelectorAll('a[href*="/song/"]')){
      if(root.contains(link)||link.matches('[aria-label^="Playbar:"]'))continue;
      const id=songId(link.href),title=link.textContent.trim().replace(/\s+/g,' ');
      if(!id||!title||seen.has(id))continue;seen.add(id);
      let button=null,parent=link.parentElement;
      for(let depth=0;parent&&depth<5;depth++,parent=parent.parentElement){
        if(['BODY','HTML','MAIN'].includes(parent.tagName)||parent.contains(root))break;
        const ids=new Set(Array.from(parent.querySelectorAll('a[href*="/song/"]')).map(a=>songId(a.href)).filter(Boolean));
        if(ids.size!==1)break;
        button=Array.from(parent.querySelectorAll('button')).find(b=>!b.disabled&&/^play(?:\s|$)/i.test(b.getAttribute('aria-label')||b.title||'')&&!/playlist/i.test(b.getAttribute('aria-label')||b.title||''));
        if(button)break;
      }
      rows.push({id,title,button});
    }
    return rows;
  }
  function refreshPlaylist(){
    if(!root?.isConnected||!playlist)return;
    if(globalThis.CatnapManagedShow?.active)return;
    const rows=nativeRows();
    const current=songId(document.querySelector('a[aria-label^="Playbar: Title for "]')?.href||'');
    const nextSignature=JSON.stringify([location.pathname,current,rows.map(r=>[r.id,r.title,!!r.button])]);
    if(nextSignature===signature)return;signature=nextSignature;
    const scroll=playlist.scrollTop;
    playlist.replaceChildren(element('h2',{},'SUNO PLAYLIST'),element('small',{},'Suno controls playback. These are the visible Suno playlist rows.'));
    if(!rows.length)playlist.append(element('small',{},'Open a Suno playlist. Suno may need to load more rows before they can appear here.'));
    rows.forEach((row,index)=>{
      const button=element('button',{type:'button',class:'ct-track','aria-current':String(row.id===current)},`${String(index+1).padStart(2,'0')}  ${row.title}`);
      button.disabled=!row.button;button.title=row.button?'Play using this song’s native Suno button':'No unambiguous native Play button is exposed; use Suno to select this song.';
      button.onclick=()=>{const latest=nativeRows().find(r=>r.id===row.id);if(latest?.button?.isConnected)latest.button.click();else{signature='';refreshPlaylist();}};
      playlist.appendChild(button);
    });
    playlist.scrollTop=scroll;
  }
  // Isolated-world extension settings never use Suno's page storage. Import accepts
  // a tiny fixed schema; no URLs, script, HTML or file paths are executable fields.
  chrome.storage.local.get(STORAGE_KEY).then(data=>{
    try{if(data[STORAGE_KEY])prefs=settings(data[STORAGE_KEY]);}catch{/* Recover unsupported old preferences with defaults. */}
  }).catch(()=>{}).finally(()=>{ready=true;tick();});
  function tick(){
    if(!ready)return;
    const next=document.getElementById('catnap-theater-root');
    if(!next){observer?.disconnect();root=null;tools=null;playlist=null;status=null;return;}
    if(next!==root)mount(next);
    hideOptionControls();
    refreshPlaylist();
  }
  setInterval(tick,1200);
})();
