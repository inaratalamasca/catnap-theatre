/* Catnap native Suno metadata reader, version 0.4.0.
 * Dormant until the worker selects the actual audio source tab. Reads rendered
 * text only, including with Theatre closed; no playback actions or network calls.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.CatnapBroadcastMetadataReader=api;if(root.chrome?.runtime&&root.document)api.install(root);}})(globalThis,()=>{
  'use strict';
  const VERSION='0.4.0',ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const clean=value=>String(value||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,220);
  function identity(value,kind){try{const u=new URL(value,'https://suno.com');const match=u.pathname.match(new RegExp('^/'+kind+'/([0-9a-f-]{36})/?$','i'));return u.protocol==='https:'&&['suno.com','www.suno.com'].includes(u.hostname)&&!u.username&&!u.password&&match&&ID.test(match[1])?{id:match[1].toLowerCase(),url:'https://suno.com/'+kind+'/'+match[1].toLowerCase()}:null;}catch{return null;}}
  function native(node){return !node.closest('#catnap-theater-root');}
  function clock(value){
    const parts=clean(value).split(':');if(parts.length<2||parts.length>3||!parts.every(p=>/^\d{1,3}$/.test(p))||parts.slice(1).some(p=>Number(p)>=60))return null;
    const valueSeconds=parts.reduce((sum,n)=>sum*60+Number(n),0);return valueSeconds<=86400?valueSeconds:null;
  }
  const seconds=value=>typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=86400?value:null;
  function artwork(value){try{const u=new URL(value);if(u.protocol!=='https:'||!['cdn1.suno.ai','cdn2.suno.ai','cdn.suno.ai'].includes(u.hostname)||u.username||u.password||!(/\.(?:png|jpe?g|webp|gif|avif)$/i.test(u.pathname)))return null;u.search='';u.hash='';return u.href;}catch{return null;}}
  function currentArtwork(document,titleLink,title){
    const inside=titleLink.querySelector('img');const direct=inside&&artwork(inside.currentSrc||inside.src);if(direct)return direct;
    const normalize=t=>clean(t).toLowerCase();
    const matches=Array.from(document.querySelectorAll('img[alt]')).filter(native).filter(img=>normalize(img.alt.replace(/^Image for\s*/i,'').replace(/\s+artwork$/i,''))===normalize(title));
    for(const img of matches){const url=artwork(img.currentSrc||img.src);if(url)return url;}
    return null;
  }
  function nativeTiming(document,song){
    let durationSeconds=null,currentTimeSeconds=null;
    const progress=Array.from(document.querySelectorAll('input[aria-label="Playback progress"],[role="slider"][aria-label="Playback progress"]')).filter(native);
    if(progress.length===1){
      let el=progress[0].parentElement;
      for(let depth=0;el&&depth<5;depth++,el=el.parentElement){
        if(['BODY','HTML','MAIN'].includes(el.tagName)||el.id==='catnap-theater-root')break;
        const text=clean(el.innerText||el.textContent);if(text.length>160)continue;
        // Flex/inline time labels can have no whitespace in textContent.
        // Read their individual text leaves before using aggregate text.
        const leaves=Array.from(el.querySelectorAll('span,time')).filter(n=>!n.children.length&&!n.closest('a')).map(n=>clean(n.textContent)).filter(t=>/^\d{1,3}:\d{2}(?::\d{2})?$/.test(t));
        const values=leaves.length?leaves:(text.match(/\b\d{1,3}:\d{2}(?::\d{2})?\b/g)||[]);
        if(values.length!==2)continue;
        const elapsed=clock(values[0]),duration=clock(values[1]);
        if(elapsed!==null&&seconds(duration)!==null&&elapsed<=duration){currentTimeSeconds=elapsed;durationSeconds=duration;break;}
      }
    }
    const audio=Array.from(document.querySelectorAll('audio')).filter(native).filter(a=>seconds(a.duration)!==null);
    // A lone unrelated preview element is not proof of current song timing.
    // Accept native audio only when its URL identifies this song, or it agrees
    // with the actual playbar's duration and elapsed labels.
    const matching=audio.filter(a=>String(a.currentSrc||a.src||'').includes(song.id)||(durationSeconds!==null&&Math.abs(a.duration-durationSeconds)<2&&Math.abs(a.currentTime-currentTimeSeconds)<2));
    let playing=null;
    if(matching.length===1){const a=matching[0];durationSeconds=a.duration;currentTimeSeconds=Number.isFinite(a.currentTime)&&a.currentTime>=0&&a.currentTime<=a.duration?a.currentTime:null;playing=!a.paused&&!a.ended;}
    const play=Array.from(document.querySelectorAll('button[aria-label="Playbar: Play button"]')).filter(native).length;
    const pause=Array.from(document.querySelectorAll('button[aria-label="Playbar: Pause button"]')).filter(native).length;
    if(play===1&&pause===0)playing=false;else if(pause===1&&play===0)playing=true;
    return {durationSeconds,currentTimeSeconds,playing};
  }
  function rowDuration(link){
    let row=link.parentElement;
    for(let depth=0;row&&depth<4;depth++,row=row.parentElement){
      if(['BODY','HTML','MAIN'].includes(row.tagName)||row.id==='catnap-theater-root')break;
      const ids=new Set(Array.from(row.querySelectorAll('a[href*="/song/"]')).map(a=>identity(a.href,'song')?.id).filter(Boolean));
      if(ids.size!==1)break;
      const candidates=[];
      for(const el of [row,...row.querySelectorAll('[data-duration-seconds]')]){
        const raw=el.getAttribute('data-duration-seconds');if(raw!==null&&/^\d+(?:\.\d+)?$/.test(raw)&&seconds(Number(raw))!==null)candidates.push(Number(raw));
      }
      for(const el of row.querySelectorAll('time,span,[aria-label]')){
        if(el===link||link.contains(el)||el.children.length)continue;
        const label=el.getAttribute('aria-label')||'',value=clean(label.match(/^Duration:\s*(.+)$/i)?.[1]||el.textContent);
        if(!/^\d{1,3}:\d{2}(?::\d{2})?$/.test(value))continue;
        const duration=clock(value);if(seconds(duration)!==null)candidates.push(duration);
      }
      const unique=new Set(candidates);if(unique.size===1)return candidates[0];if(unique.size>1)return null;
    }
    return null;
  }
  function read(document,location){
    const titleLink=Array.from(document.querySelectorAll('a[aria-label^="Playbar: Title for "]')).find(a=>native(a)&&identity(a.href,'song'));
    if(!titleLink)return null;
    const song=identity(titleLink.href,'song');song.title=clean(titleLink.textContent)||clean(titleLink.getAttribute('aria-label')).replace(/^Playbar:\s*Title for\s*/i,'');
    if(!song.title)return null;
    const artist=Array.from(document.querySelectorAll('a[aria-label^="Playbar: Artist for "]')).find(native);
    song.artist=clean(artist?.textContent)||clean(artist?.getAttribute('aria-label')).replace(/^Playbar:\s*Artist for\s*/i,'');
    song.artworkUrl=currentArtwork(document,titleLink,song.title);
    Object.assign(song,nativeTiming(document,song));
    const shuffle=Array.from(document.querySelectorAll('button[aria-label*="Toggle shuffle"],button[aria-label*="Shuffle playlist"]')).filter(native).some(b=>b.getAttribute('aria-pressed')==='true'||['on','checked'].includes(b.getAttribute('data-state')));
    let playlist=null;const listID=identity(location.href||String(location),'playlist');
    if(listID){
      const rows=[],seen=new Set();
      for(const link of document.querySelectorAll('a[href*="/song/"]')){
        if(!native(link)||link.matches('[aria-label^="Playbar:"]'))continue;
        const item=identity(link.href,'song'),title=clean(link.textContent);if(!item||!title||seen.has(item.id))continue;
        seen.add(item.id);rows.push({...item,title,artist:'',durationSeconds:rowDuration(link)});if(rows.length===2000)break;
      }
      const index=rows.findIndex(r=>r.id===song.id);
      const heading=Array.from(document.querySelectorAll('h1')).find(native);
      playlist={id:listID.id,title:clean(heading?.textContent),position:index<0?null:index+1,total:null,orderBasis:'visible-dom',upNext:!shuffle&&index>=0?rows.slice(index+1,index+101):[]};
    }
    return {version:1,song,playlist,shuffle};
  }
  function install(window){
    if(window.__catnapMetadataReaderInstalled)return;window.__catnapMetadataReaderInstalled=true;
    const runtime=window.chrome.runtime;let active=false,observer,timer,debounce,signature='';
    const send=force=>{
      if(!active)return;const metadata=read(window.document,window.location);if(!metadata)return;
      // Clock ticks update ETA on the heartbeat; track/queue/play-state changes
      // publish promptly without uploading the expanded list every second.
      const next=JSON.stringify({...metadata,song:{...metadata.song,currentTimeSeconds:null}});if(!force&&next===signature)return;signature=next;
      Promise.resolve(runtime.sendMessage({target:'broadcast-metadata',action:'update',metadata})).catch(()=>{});
    };
    const stop=()=>{active=false;observer?.disconnect();window.clearInterval(timer);window.clearTimeout(debounce);signature='';};
    runtime.onMessage.addListener((message,sender,reply)=>{
      if(sender.id!==runtime.id||message?.target!=='broadcast-metadata-reader')return;
      if(message.action==='start'){
        stop();active=true;send(true);
        observer=new window.MutationObserver(()=>{window.clearTimeout(debounce);debounce=window.setTimeout(()=>send(false),250);});
        observer.observe(window.document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['href','src','aria-label','aria-pressed','data-state','data-duration-seconds']});
        timer=window.setInterval(()=>send(true),5000);reply({ok:true});
      }else if(message.action==='stop'){stop();reply({ok:true});}
    });
    window.addEventListener('pagehide',stop);
    Promise.resolve(runtime.sendMessage({target:'broadcast-metadata',action:'ready'})).catch(()=>{});
  }
  return {VERSION,read,install};
});
