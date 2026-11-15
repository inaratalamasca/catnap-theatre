/* Catnap host-only Inbox & show window, version 0.6.5.
 * Change summary: explicit queue commands and clipboard-only announcements.
 */
(() => {
  'use strict';
  const SCRIPT_VERSION='0.6.5', $=id=>document.getElementById(id);
  let snapshot=null,inboxes={lp:[],ap:[]},playlists=[],busy=false,queueSignature='',sunoMessage='',playerChoice;
  if(globalThis.CatnapPackage?.inboxOnly){document.title='Catnap Inbox · playlist creator';document.querySelector('h1').textContent='Inbox → playlist';document.querySelector('header > p:last-child').textContent='Read Pending submissions and keep your Suno playlist up to date.';$('theatre-playback').hidden=true;$('current-card').hidden=true;$('mode').querySelector('[value=lp]').textContent='Listening party';$('queue-help').textContent='FIFO submission list. This creator updates playlists; Suno controls playback.';}
  const status=value=>{$('status').textContent=value;};
  async function send(action,extra={}){const reply=await chrome.runtime.sendMessage({target:'catnap-show-worker',action,...extra});if(!reply?.ok)throw Error(reply?.error||'Show controls unavailable.');return reply.data;}
  function options(select,items,current,empty){
    const signature=JSON.stringify([items,current]);if(select.dataset.signature===signature)return;
    select.dataset.signature=signature;select.replaceChildren(new Option(empty,''),...items.map(row=>new Option(row.name,String(row.id))));select.value=String(current||'');
  }
  function render(data){
    snapshot=data;const s=data.state,linked=data.playbackHealth?.linked===true,p=linked?(s.playback||{}):{},entry=linked?s.entries.find(e=>e.id===p.current?.id):null;
    if(document.activeElement!==$('mode'))$('mode').value=s.mode;
    if(document.activeElement!==$('show-name'))$('show-name').value=s.showName;
    options($('uploader-tab'),data.tabs.filter(t=>t.kind==='uploader').map(t=>({id:t.id,name:t.title})),s.uploaderTabId,'Choose the signed-in uploader');
    const playerTabs=data.tabs.filter(t=>t.kind==='suno'),available=id=>playerTabs.some(t=>t.id===id);
    // A changing tab title must not discard the operator's unbound selection.
    // This selects a target only; it never connects or starts another tab.
    const chosen=playerChoice!==undefined?(available(playerChoice)?playerChoice:null):[s.playerTabId,data.suggestedTabId].find(available);
    options($('player-tab'),playerTabs.map(t=>({id:t.id,name:t.title})),chosen,'Choose your playing Theatre tab');
    options($('inbox'),inboxes[s.mode]||[],s.inboxId,'Choose your inbox');
    const listed=[...playlists];if(s.playlistId&&!listed.some(p=>p.id===s.playlistId))listed.push({id:s.playlistId,name:'Selected playlist · load to verify'});
    options($('playlist'),listed,s.playlistId,'Choose a Suno playlist');
    $('autoplay').checked=s.autoplay;$('autoplay').disabled=s.mode==='lp';
    $('watch').checked=s.watch?.enabled===true;$('watch').disabled=s.mode!=='ap';
    if(document.activeElement!==$('warning-seconds'))$('warning-seconds').value=s.warningSeconds;
    $('inbox-status').textContent=s.error||s.lastRead? s.error||`Last read: ${s.lastRead.pending} Pending submissions · ${s.lastRead.held} held · ${new Date(s.lastRead.at).toLocaleTimeString()}`:'Reads Pending only. Acceptance, release and cleanup stay manual.';
    $('playback-status').textContent=linked?`${data.playbackHealth.phase||p.phase||'Ready'}${p.error?' · '+p.error:''} · ${s.mode==='ap'&&s.autoplay?'AP autoplay':'Manual advance'}`:(data.playbackHealth?.reason||'Choose your Suno tab, then Load or Play to connect the show.');
    $('autoplay-help').textContent=linked?'Manual mode stops at the end. Load next changes artwork and warning without playing audio.':'Playback is not connected. Load or Play reconnects the selected Theatre; ordinary Suno playback is not yet controlled.';
    $('current-title').textContent=entry?entry.title:'No song loaded';
    $('current-credit').textContent=entry?`${entry.artist||'Artist unavailable'} · Submitted by ${entry.uploaderName||'Unavailable'} · ${p.source||entry.preferredSource||'source unavailable'}`:'';
    $('current-note').textContent=entry?.note||'No uploader note.';
    $('current-warning').textContent=entry?entry.disclaimer==='yes'?'⚠ Uploader requested a content disclaimer':entry.disclaimer==='no'?'Uploader disclaimer: No':'Uploader disclaimer: Unavailable':'';
    $('current-warning').dataset.warning=entry?.disclaimer||'unknown';
    for(const id of ['copy-playing','copy-link','copy-context','repeat-warning'])$(id).disabled=!entry;
    $('suno-status').textContent=sunoMessage||(data.suno.connected?'Suno connected. Playlist changes require your explicit action.':data.suno.reconnectRequired?'Suno needs updated permissions. Click Connect Suno and approve account profile and library access.':'Suno not connected. Connect Suno to authorize playlist changes.');
    $('playlist-status').textContent=s.lastPlaylistSync?`Last verified: ${s.lastPlaylistSync.confirmed?.length??s.lastPlaylistSync.confirmed??0} confirmed · ${s.lastPlaylistSync.missing?.length||0} missing`:'';
    $('queue-count').textContent=`(${s.entries.length})`;
    const nextSignature=JSON.stringify([s.entries.map(e=>[e.id,e.title,e.artist,e.uploaderName,e.disclaimer,e.preferredSource,e.state,e.holdReason]),entry?.id,s.playerTabId,Number($('player-tab').value)]);
    if(nextSignature!==queueSignature){
      queueSignature=nextSignature;$('queue').replaceChildren();
      s.entries.forEach((e,index)=>{
        const li=document.createElement('li');li.setAttribute('aria-current',String(e.id===entry?.id));
        const title=document.createElement('strong');title.textContent=`${index+1}. ${e.title||'Untitled submission'}`;
        const info=document.createElement('small');info.textContent=`${(e.preferredSource||'held').toUpperCase()} · ${e.uploaderName||'Uploader unavailable'}${e.disclaimer==='yes'?' · ⚠ Disclaimer':''}${e.holdReason?' · '+e.holdReason:''}`;
        const button=document.createElement('button');button.type='button';button.textContent='Load';button.hidden=globalThis.CatnapPackage?.inboxOnly===true;button.disabled=e.state==='held'||!Number($('player-tab').value);button.onclick=()=>action(()=>send('load',{index,tabId:Number($('player-tab').value)}), 'Loaded quietly. Press Play when ready.');
        li.append(title,info,button);$('queue').append(li);
      });
    }
  }
  async function refresh(){const data=await send('status');if(!busy)render(data);return data;}
  async function action(fn,success,interrupt=false){if(busy&&!interrupt)return;const ownsBusy=!busy;if(ownsBusy){busy=true;document.body.setAttribute('aria-busy','true');}try{await fn();if(success)status(success);}catch(error){status(error.message);}finally{if(ownsBusy){busy=false;document.body.removeAttribute('aria-busy');}try{await refresh();}catch(error){status(error.message);}}}
  const configure=settings=>send('configure',{settings});
  async function copy(value){try{await navigator.clipboard.writeText(value);$('copy-fallback').hidden=true;status('Copied. Paste into your chosen chat.');}catch(_){const field=$('copy-fallback');field.hidden=false;field.closest('details').open=true;field.value=value;field.focus();field.select();status('Select and copy the text below.');}}
  $('grant-inbox').onclick=()=>action(async()=>{
    const granted=await chrome.permissions.request({origins:['https://uploader.aiu.fm/*','https://studio-api-prod.suno.com/*','https://suno.com/*','https://www.suno.com/*']});
    if(!granted)throw Error('Inbox access was not granted. Theatre still works normally.');
  },'Inbox access enabled. Choose the signed-in uploader tab, then Find my inboxes.');
  $('player-tab').onchange=()=>{playerChoice=Number($('player-tab').value)||null;if(snapshot)render(snapshot);};
  $('uploader-tab').onchange=()=>action(()=>configure({uploaderTabId:Number($('uploader-tab').value)}));
  $('mode').onchange=()=>action(()=>configure({mode:$('mode').value}));
  $('show-name').onchange=()=>action(()=>configure({showName:$('show-name').value}));
  $('discover').onclick=()=>action(async()=>{await configure({uploaderTabId:Number($('uploader-tab').value)});inboxes=(await send('discover')).inboxes;},'Choose your LP or AP inbox.');
  $('inbox').onchange=()=>action(()=>configure({inboxId:$('inbox').value}));
  $('import').onclick=()=>action(()=>send('import'),'Inbox read. The running order is ready; no songs were started.');
  $('bind-player').onclick=()=>action(()=>send('bind-player',{tabId:Number($('player-tab').value)}),'Theatre linked. Load a song, then Play.');
  $('unbind-player').onclick=()=>action(()=>send('unbind-player'),'Managed show stopped. Ordinary Suno controls restored.');
  $('autoplay').onchange=()=>action(()=>configure({autoplay:$('autoplay').checked}));
  $('warning-seconds').onchange=()=>action(()=>configure({warningSeconds:Number($('warning-seconds').value)}));
  $('watch').onchange=()=>action(()=>send('watch',{enabled:$('watch').checked}),'Inbox update setting saved.');
  $('new-show').onclick=()=>action(async()=>{await send('new-show');inboxes={lp:[],ap:[]};queueSignature='';},'New local show. Existing Suno playlists and uploader submissions are unchanged.');
  for(const id of ['previous','next','play','repeat-warning'])$(id).onclick=()=>action(()=>send(id,{tabId:Number($('player-tab').value)}),['next','previous'].includes(id)?'Loaded quietly. Press Play when ready.':undefined);
  $('pause').onclick=()=>action(()=>send('pause',{tabId:Number($('player-tab').value)}),undefined,true);
  $('connect-suno').onclick=()=>action(async()=>{
    // Request from this click before the worker attempts its authorization fetch.
    // A missing optional host grant otherwise looks like a generic CORS error.
    sunoMessage='Connecting to Suno…';$('suno-status').textContent=sunoMessage;
    try{
      const granted=await chrome.permissions.request({origins:['https://studio-api-prod.suno.com/*']});
      if(!granted)throw Error('Suno connection access was not granted. Click Connect Suno to try again.');
      await send('connect-suno');sunoMessage='';
    }catch(error){sunoMessage=error.message;throw error;}
  },'Suno connected.');
  $('disconnect-suno').onclick=()=>action(async()=>{await send('disconnect-suno');sunoMessage='';},'Suno disconnected.');
  $('playlists').onclick=()=>action(async()=>{playlists=await send('playlists');},'Choose a destination playlist.');
  $('playlist').onchange=()=>action(()=>configure({playlistId:$('playlist').value}));
  $('create-playlist').onclick=()=>action(async()=>{const playlist=await send('create-playlist',{name:$('new-playlist-name').value,visibility:$('visibility').value});playlists.unshift(playlist);},'Playlist created and selected.');
  $('sync-playlist').onclick=()=>action(()=>send('sync-playlist'),'Playlist membership checked. See the verification result below.');
  $('copy-playing').onclick=()=>action(async()=>copy((await send('announcement')).text));
  $('copy-link').onclick=()=>action(async()=>copy((await send('announcement')).context.url));
  $('copy-context').onclick=()=>action(async()=>copy(JSON.stringify((await send('announcement',{includeNotes:$('include-notes').checked})).context,null,2)));
  refresh().catch(error=>status(error.message));
  setInterval(()=>{if(!busy)refresh().catch(error=>status(error.message));},1500);
})();
