// Version 0.6.10: managed lyric reload/recovery obeys the staged song identity.
// Presentation only: read audio progress; never seek, pause, or restart playback.
(() => {
  'use strict';
  const SCRIPT_VERSION='0.6.10';
  if(globalThis.catnapLyricScrollVersion===SCRIPT_VERSION)return;
  globalThis.catnapLyricScrollVersion=SCRIPT_VERSION;
  const preference='catnap-lyrics-auto-scroll-v1';
  let enabled=true;
  try{enabled=sessionStorage.getItem(preference)!=='off';}catch{}
  let root=null,button=null,reloadButton=null,motion={};

  function advanceLyricPosition(state,sample){
    const {key,elapsed,duration,paused,top,max,enabled}=sample;
    if(!Number.isFinite(elapsed)||!Number.isFinite(duration)||duration<=0)return null;
    if(state.key!==key){
      state.key=key;state.elapsed=elapsed;state.carry=0;
      return enabled?Math.max(0,Math.min(max,max*elapsed/duration)):null;
    }
    const delta=elapsed-state.elapsed;state.elapsed=elapsed;
    if(!enabled||paused){state.carry=0;return null;}
    // Start from the actual scroll position every time. A wheel, touch, keyboard,
    // or scrollbar adjustment therefore becomes the new position automatically.
    return Math.max(0,Math.min(max,top+delta*max/duration+(state.carry||0)));
  }

  function currentSong(){
    return Array.from(document.querySelectorAll('a[aria-label^="Playbar: Title for "]'))
      .find(a=>!root?.contains(a))?.getAttribute('href')||'';
  }
  function lyricsWithoutCopy(){
    const song=currentSong();if(!song)return '';
    const heading=Array.from(document.querySelectorAll('h3')).find(h=>
      !root?.contains(h)&&Array.from(h.querySelectorAll('a[href]')).some(a=>a.getAttribute('href')?.split('?')[0]===song.split('?')[0]));
    if(!heading)return '';
    // Bound the search to the native song panel, never the playlist/page.
    let panel=heading.parentElement;
    for(let depth=0;panel&&depth<3;depth++,panel=panel.parentElement){
      if(panel===document.body||panel.contains(root))break;
      const styles=panel.querySelector('button[aria-label="Copy styles to clipboard"]');
      if(!styles)continue;
      const candidates=Array.from(panel.querySelectorAll('div,p')).filter(el=>
        !el.children.length&&!(styles.compareDocumentPosition(el)&2)&&
        !el.closest('button,[role="button"],nav,[role="status"],[role="alert"]')&&
        (el.textContent||'').trim().split(/\n/).filter(line=>line.trim()).length>=2);
      return (candidates.sort((a,b)=>b.textContent.length-a.textContent.length)[0]?.textContent||'').trim().slice(0,42000);
    }
    return '';
  }
  function recoverNativeLyrics(){
    // Managed shows deliberately stage ahead of the native player. Only its
    // identity-bound reader may fill this pane, including YouTube/quiet slots.
    if(globalThis.CatnapManagedShow?.active)return;
    const lyrics=root?.querySelector('.ct-lyrics-content');
    if(!lyrics?.querySelector('.ct-lyrics-empty'))return;
    const text=lyricsWithoutCopy();if(!text)return;
    const lines=text.split('\n').map(line=>{
      const el=document.createElement('div');el.className=!line.trim()?'ct-lyric-gap':/^\s*\[[^\]]{1,160}\]\s*$/.test(line)?'ct-lyric-cue':'ct-lyric-line';el.textContent=line||'\u00a0';return el;
    });
    lyrics.replaceChildren(...lines);motion={};
  }
  async function reloadLyrics(){
    if(!reloadButton?.isConnected||reloadButton.disabled)return;
    const control=reloadButton,song=currentSong();
    if(globalThis.CatnapManagedShow?.active){
      try{control.disabled=true;control.textContent='Reloading…';globalThis.CatnapManagedShow.reloadLyrics();motion={};control.title='Requested lyrics for the selected Suno show entry.';}
      catch(error){control.title=String(error?.message||'Load the selected Suno song before reloading lyrics.');}
      finally{control.disabled=false;control.textContent='Reload lyrics';}
      return;
    }
    const details=document.querySelector('button[aria-label="Playbar: Toggle song details panel"]');
    if(!song||!details){control.title='Suno song details are unavailable. Try again once the player has loaded.';return;}
    control.disabled=true;control.textContent='Reloading…';
    const stillCurrent=()=>control.isConnected&&currentSong()===song;
    try{
      // Closing/reopening requests the native current-song panel. The Theatre's
      // existing reader picks up its lyrics; no private API or playback controls.
      const wasOpen=!!document.querySelector('button[aria-label="Copy lyrics to clipboard"]')||!!lyricsWithoutCopy();
      details.click();
      if(wasOpen){
        await new Promise(resolve=>setTimeout(resolve,350));
        if(!stillCurrent())return;
        if(!document.querySelector('button[aria-label="Copy lyrics to clipboard"]')&&!lyricsWithoutCopy())details.click();
      }
      await new Promise(resolve=>setTimeout(resolve,1500));
      if(stillCurrent())motion={}; // Re-anchor approximate timing, retaining Auto-scroll preference.
      control.title='Requested current-song lyrics from Suno. Auto-scroll uses approximate timing.';
    }catch{
      control.title='Could not reopen Suno song details. Try again.';
    }finally{
      control.disabled=false;control.textContent='Reload lyrics';
    }
  }
  function mount(next){
    root=next;motion={};button=null;reloadButton=null;
    const heading=root.querySelector('.ct-lyrics-heading');
    if(!heading)return;
    // DOM-visible ownership also coordinates with a companion running in a
    // different extension's isolated world, where our globals are not shared.
    root.setAttribute('data-catnap-lyrics-owner','theatre');
    root.setAttribute('data-catnap-lyrics-owner-version',SCRIPT_VERSION);
    const existing=heading.querySelector('.ct-lyrics-auto');
    if(existing?.getAttribute('data-catnap-lyrics-version')===SCRIPT_VERSION&&existing.getAttribute('data-catnap-lyrics-owner')==='theatre'&&heading.querySelector('.ct-lyrics-reload[data-catnap-lyrics-owner="theatre"]'))return;
    // Upgrade an already-open player. Disconnecting the old toggle also stops
    // an older companion in the other extension from moving this lyric pane.
    existing?.remove();heading.querySelector('.ct-lyrics-reload')?.remove();
    const makeButton=(className,text)=>{
      const el=document.createElement('button');el.type='button';el.className=className;el.textContent=text;
      el.setAttribute('data-catnap-lyrics-version',SCRIPT_VERSION);
      el.setAttribute('data-catnap-lyrics-owner','theatre');
      Object.assign(el.style,{float:'right',font:'500 11px system-ui',letterSpacing:'normal',padding:'3px 8px',marginTop:'-5px',marginLeft:'8px',border:'1px solid #665780',borderRadius:'6px',color:'#e4deef',background:'transparent',cursor:'pointer'});
      heading.insertBefore(el,heading.querySelector('.ct-heading-rule'));return el;
    };
    button=makeButton('ct-lyrics-auto','Auto-scroll');
    button.title='Rough lyric timing. Scroll manually to adjust; following continues from there.';
    const paint=()=>{button.setAttribute('aria-pressed',String(enabled));button.style.opacity=enabled?'1':'.5';};
    button.addEventListener('click',()=>{enabled=!enabled;motion.carry=0;try{sessionStorage.setItem(preference,enabled?'on':'off');}catch{}paint();});
    reloadButton=makeButton('ct-lyrics-reload','Reload lyrics');
    reloadButton.title='Reopen Suno song details and resync approximate lyric scrolling without restarting the song.';
    reloadButton.addEventListener('click',reloadLyrics);paint();
    // Older Theatre readers may rewrite their empty message each poll. Repair
    // it in the same mutation turn, before paint, without touching playback.
    if(typeof MutationObserver!=='undefined'){
      const owner=root;const observer=new MutationObserver(()=>{
        if(!button?.isConnected||root!==owner){observer.disconnect();return;}
        recoverNativeLyrics();
      });observer.observe(root.querySelector('.ct-lyrics-content'),{childList:true});
    }
  }
  // Theatre captures Space on document to toggle playback. Handle our buttons
  // earlier at window capture, so keyboard activation never starts/stops music.
  globalThis.addEventListener('keydown',event=>{
    if(!button?.isConnected||![button,reloadButton].includes(event.target))return;
    if(event.code!=='Space'&&event.key!=='Enter')return;
    if(event.ctrlKey||event.altKey||event.metaKey)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(!event.repeat&&!event.target.disabled)event.target.click();
  },true);
  function tick(){
    const next=document.getElementById('catnap-theater-root');
    if(!next){root=null;motion={};return;}
    if(next!==root)mount(next);
    // A companion in another installed extension may already own this pane.
    if(!button?.isConnected)return;
    recoverNativeLyrics();
    const scroller=root.querySelector('.ct-lyrics-scroller'),lyrics=root.querySelector('.ct-lyrics-content');
    if(!scroller||!lyrics||lyrics.querySelector('.ct-lyrics-empty')){motion={};return;}
    const audio=Array.from(document.querySelectorAll('audio')).filter(a=>!root.contains(a)&&Number.isFinite(a.duration)&&a.duration>1);
    const player=audio.find(a=>!a.paused&&!a.ended)||audio[0];if(!player)return;
    const title=Array.from(document.querySelectorAll('a[aria-label^="Playbar: Title for "]')).find(a=>!root.contains(a));
    const key=(title?.getAttribute('href')||root.querySelector('.ct-song-title')?.textContent||'')+'\n'+lyrics.textContent;
    const max=Math.max(0,scroller.scrollHeight-scroller.clientHeight);
    const position=advanceLyricPosition(motion,{key,elapsed:player.currentTime,duration:player.duration,paused:player.paused||player.ended,top:scroller.scrollTop,max,enabled});
    if(position!==null){scroller.scrollTop=position;motion.carry=position-scroller.scrollTop;}
  }
  setInterval(tick,100);
  tick();
})();
