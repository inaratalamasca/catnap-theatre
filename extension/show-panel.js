/* Catnap host-only Inbox & show window, version 0.6.7.
 * Change summary: ordered setup actions, saved inbox selection, explicit queue
 * commands and clipboard-only announcements. Playback never queues extra starts.
 */
(() => {
  'use strict';
  const SCRIPT_VERSION='0.6.7', $=id=>document.getElementById(id);
  let snapshot=null,inboxes={lp:[],ap:[]},playlists=[],busy=false,queueSignature='',sunoMessage='',playerChoice;
  let actionTail=Promise.resolve(),waiting=0,refreshRevision=0,failureRevision=0,lastFailure='';
  if(globalThis.CatnapPackage?.inboxOnly){document.title='Catnap Inbox · playlist creator';document.querySelector('h1').textContent='Inbox → playlist';document.querySelector('header > p:last-child').textContent='Read Pending submissions and keep your Suno playlist up to date.';$('theatre-playback').hidden=true;$('current-card').hidden=true;$('mode').querySelector('[value=lp]').textContent='Listening party';$('queue-help').textContent='FIFO submission list. This creator updates playlists; Suno controls playback.';}
  const status=value=>{$('status').textContent=value;};
  async function send(action,extra={}){const reply=await chrome.runtime.sendMessage({target:'catnap-show-worker',action,...extra});if(!reply?.ok)throw Error(reply?.error||'Show controls unavailable.');return reply.data;}
  function options(select,items,current,empty){
    const signature=JSON.stringify([items,current]);if(select.dataset.signature===signature){select.value=String(current||'');return;}
    select.dataset.signature=signature;select.replaceChildren(new Option(empty,''),...items.map(row=>new Option(row.name,String(row.id))));select.value=String(current||'');
  }
  function render(data){
    snapshot=data;const s=data.state,linked=data.playbackHealth?.linked===true,p=linked?(s.playback||{}):{},entry=linked?s.entries.find(e=>e.id===p.current?.id):null;
    $('mode').value=s.mode;
    if(document.activeElement!==$('show-name'))$('show-name').value=s.showName;
    options($('uploader-tab'),data.tabs.filter(t=>t.kind==='uploader').map(t=>({id:t.id,name:t.title})),s.uploaderTabId,'Choose the signed-in uploader');
    const playerTabs=data.tabs.filter(t=>t.kind==='suno'),available=id=>playerTabs.some(t=>t.id===id);
    // A changing tab title must not discard the operator's unbound selection.
    // This selects a target only; it never connects or starts another tab.
    const chosen=playerChoice!==undefined?(available(playerChoice)?playerChoice:null):[s.playerTabId,data.suggestedTabId].find(available);
    options($('player-tab'),playerTabs.map(t=>({id:t.id,name:t.title})),chosen,'Choose your playing Theatre tab');
    if(s.inboxes)inboxes=s.inboxes;
    const availableInboxes=[...(inboxes[s.mode]||[])];
    if(s.inboxId&&!availableInboxes.some(row=>row.id===s.inboxId))availableInboxes.push({id:s.inboxId,name:s.inboxName||'Selected inbox · Find my inboxes to verify'});
    options($('inbox'),availableInboxes,s.inboxId,'Choose your inbox');
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
    $('reload-lyrics').disabled=!entry||(p.source||entry.preferredSource)!=='suno';
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
  async function refresh(){const revision=++refreshRevision,data=await send('status');if(revision===refreshRevision&&!busy&&!waiting)render(data);return data;}
  function action(fn,success,interrupt=false,{queue=false,progress='Working…'}={}){
    if((busy||waiting)&&!interrupt&&!queue){status('Please wait for the current step. Pause is still available.');return Promise.resolve();}
    ++refreshRevision;
    const expectedFailure=failureRevision;
    const run=async()=>{
      const ownsBusy=!busy;if(ownsBusy){busy=true;document.body.setAttribute('aria-busy','true');}status(progress);
      try{
        // Failed target selection must not send queued Read/Sync to the old
        // saved inbox or playlist. A later distinct click can try again.
        if(queue&&expectedFailure!==failureRevision){status('Previous step failed: '+lastFailure+' Check the selection, then click the next step again.');return;}
        const result=await fn(),message=typeof success==='function'?success(result):success;if(message)status(message);
      }catch(error){lastFailure=error.message;failureRevision++;status(lastFailure);}
      finally{if(ownsBusy){busy=false;document.body.removeAttribute('aria-busy');}try{await refresh();}catch(error){status(error.message);}}
    };
    if(interrupt)return run();
    // Queue setup changes and their next button click instead of silently
    // discarding them. Capture each field value in its event handler below.
    // Playback buttons remain immediate-or-held, never delayed extra starts.
    const deferred=busy||waiting;
    if(deferred)waiting++;
    const next=deferred? actionTail.then(()=>{waiting--;return run();}):run();
    actionTail=next.catch(()=>{});return next;
  }
  const setup=(fn,success,progress)=>action(fn,success,false,{queue:true,progress});
  const setupButton=(id,fn,success,progress)=>{
    const button=$(id);button.disabled=true;
    return setup(fn,success,progress).finally(()=>{button.disabled=false;});
  };
  const requestAccess=origins=>chrome.permissions.request({origins}).then(granted=>({granted}),error=>({error}));
  async function requireAccess(request,message){const result=await request;if(result.error)throw result.error;if(!result.granted)throw Error(message);}
  const configure=settings=>send('configure',{settings});
  async function copy(value){try{await navigator.clipboard.writeText(value);$('copy-fallback').hidden=true;status('Copied. Paste into your chosen chat.');}catch(_){const field=$('copy-fallback');field.hidden=false;field.closest('details').open=true;field.value=value;field.focus();field.select();status('Select and copy the text below.');}}
  $('grant-inbox').onclick=()=>{
    const request=requestAccess(['https://uploader.aiu.fm/*','https://studio-api-prod.suno.com/*','https://suno.com/*','https://www.suno.com/*']);
    return setupButton('grant-inbox',()=>requireAccess(request,'Inbox access was not granted. Theatre still works normally.'),'Inbox access enabled. Choose the signed-in uploader tab, then Find my inboxes.','Enabling inbox access…');
  };
  $('player-tab').onchange=()=>{playerChoice=Number($('player-tab').value)||null;if(snapshot&&!busy&&!waiting)render(snapshot);};
  $('uploader-tab').onchange=()=>{const uploaderTabId=Number($('uploader-tab').value);return setup(()=>configure({uploaderTabId}),'Uploader tab selected.','Saving uploader tab…');};
  $('mode').onchange=()=>{const mode=$('mode').value;return setup(()=>configure({mode}),'Party type saved. Choose the matching inbox.','Saving party type…');};
  $('show-name').onchange=()=>{const showName=$('show-name').value;return setup(()=>configure({showName}),'Show name saved.','Saving show name…');};
  $('discover').onclick=()=>{const uploaderTabId=Number($('uploader-tab').value);return setupButton('discover',async()=>{await configure({uploaderTabId});inboxes=(await send('discover')).inboxes;},'Choose your LP or AP inbox.','Finding your inboxes…');};
  $('inbox').onchange=()=>{const inboxId=$('inbox').value;return setup(()=>configure({inboxId}),'Inbox selected. Read Pending submissions when ready.','Saving selected inbox…');};
  $('import').onclick=()=>setupButton('import',()=>send('import'),state=>state?.error||'Inbox read. The running order is ready; no songs were started.','Reading Pending submissions…');
  $('bind-player').onclick=()=>action(()=>send('bind-player',{tabId:Number($('player-tab').value)}),'Theatre linked. Load a song, then Play.');
  $('unbind-player').onclick=()=>action(()=>send('unbind-player'),'Managed show stopped. Ordinary Suno controls restored.');
  $('autoplay').onchange=()=>{const autoplay=$('autoplay').checked;return setup(()=>configure({autoplay}),'Playback setting saved.','Saving playback setting…');};
  $('warning-seconds').onchange=()=>{const warningSeconds=Number($('warning-seconds').value);return setup(()=>configure({warningSeconds}),'Warning duration saved.','Saving warning duration…');};
  $('watch').onchange=()=>{const enabled=$('watch').checked;return setup(()=>send('watch',{enabled}),'Inbox update setting saved.','Updating AP inbox settings…');};
  $('new-show').onclick=()=>action(async()=>{await send('new-show');inboxes={lp:[],ap:[]};queueSignature='';},'New local show. Existing Suno playlists and uploader submissions are unchanged.');
  for(const id of ['previous','next','play','repeat-warning'])$(id).onclick=()=>action(()=>send(id,{tabId:Number($('player-tab').value)}),['next','previous'].includes(id)?'Loaded quietly. Press Play when ready.':undefined);
  $('pause').onclick=()=>action(()=>send('pause',{tabId:Number($('player-tab').value)}),undefined,true);
  $('reload-lyrics').onclick=()=>action(()=>send('reload-lyrics'),'Requested lyrics for the loaded Suno song.');
  $('connect-suno').onclick=()=>{
    // Request from this click before the worker attempts its authorization fetch.
    // A missing optional host grant otherwise looks like a generic CORS error.
    const request=requestAccess(['https://studio-api-prod.suno.com/*']);
    return setupButton('connect-suno',async()=>{
    sunoMessage='Connecting to Suno…';$('suno-status').textContent=sunoMessage;
    try{
      await requireAccess(request,'Suno connection access was not granted. Click Connect Suno to try again.');
      await send('connect-suno');sunoMessage='';
    }catch(error){sunoMessage=error.message;throw error;}
    },'Suno connected.','Connecting to Suno…');
  };
  $('disconnect-suno').onclick=()=>setupButton('disconnect-suno',async()=>{await send('disconnect-suno');sunoMessage='';},'Suno disconnected.','Disconnecting Suno…');
  $('playlists').onclick=()=>setupButton('playlists',async()=>{playlists=await send('playlists');},'Choose a destination playlist.','Loading your Suno playlists…');
  $('playlist').onchange=()=>{const playlistId=$('playlist').value;return setup(()=>configure({playlistId}),'Destination playlist selected.','Saving destination playlist…');};
  $('create-playlist').onclick=()=>{const name=$('new-playlist-name').value,visibility=$('visibility').value;return setupButton('create-playlist',async()=>{const playlist=await send('create-playlist',{name,visibility});playlists.unshift(playlist);},'Playlist created and selected.','Creating your Suno playlist…');};
  $('sync-playlist').onclick=()=>setupButton('sync-playlist',()=>send('sync-playlist'),result=>result?.playerUpdateWarning||'Playlist membership checked. See the verification result below.','Adding missing Suno songs and verifying the playlist…');
  $('copy-playing').onclick=()=>action(async()=>copy((await send('announcement')).text));
  $('copy-link').onclick=()=>action(async()=>copy((await send('announcement')).context.url));
  $('copy-context').onclick=()=>action(async()=>copy(JSON.stringify((await send('announcement',{includeNotes:$('include-notes').checked})).context,null,2)));
  refresh().then(()=>{if($('status').textContent==='Loading show…')status('Ready. Choose your inbox or continue the saved show.');}).catch(error=>status(error.message));
  setInterval(()=>{if(!busy&&!waiting)refresh().catch(error=>status(error.message));},1500);
})();
