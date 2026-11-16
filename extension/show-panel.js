/* Catnap host-only Inbox & show window, version 0.8.0.
 * Change summary: local readiness, verified playback-mode display, prominent
 * inbox totals, persistent local order/holds and ordered setup actions. Playback
 * never queues extra starts; local edits do not reorder a Suno playlist.
 */
(() => {
  'use strict';
  const SCRIPT_VERSION='0.8.0', $=id=>document.getElementById(id);
  const DECLINE_REASON='Only one song at a time, please.';
  const buildVersion=chrome.runtime.getManifest?.()?.version||SCRIPT_VERSION;
  document.querySelector('header .eyebrow').textContent='CATNAP THEATRE · DEVELOPMENT '+buildVersion;
  let snapshot=null,inboxes={lp:[],ap:[]},playlists=[],busy=false,queueSignature='',sunoMessage='',playerChoice;
  let actionTail=Promise.resolve(),waiting=0,active=0,refreshRevision=0,failureRevision=0,lastFailure='';
  if(globalThis.CatnapPackage?.inboxOnly){document.title='Catnap Inbox · playlist creator';document.querySelector('h1').textContent='Inbox → playlist';document.querySelector('header > p:last-child').textContent='Read Pending submissions and keep your Suno playlist up to date.';$('theatre-playback').hidden=true;$('current-card').hidden=true;$('queue-policy').hidden=true;$('claim-playlist').hidden=true;$('playlist-order-help').hidden=true;$('inbox-read-help').textContent='Counts show the last successful inbox read. Reads Pending only, oldest first. Uploader submissions stay unchanged.';$('mode').querySelector('[value=lp]').textContent='Listening party';$('queue-help').textContent='FIFO submission list. This creator updates playlists; Suno controls playback.';}
  const status=value=>{$('status').textContent=value;};
  // Display/copy only public artwork from the known music CDNs. A thumbnail
  // must not become an arbitrary tracking URL or leak signed query values.
  function artworkURL(value){try{
    if(typeof value!=='string'||value.length>4096)return '';
    const u=new URL(value);
    if(u.protocol!=='https:'||u.username||u.password||u.port||!['cdn1.suno.ai','cdn2.suno.ai','cdn.suno.ai','i.ytimg.com'].includes(u.hostname)||!(/\.(?:png|jpe?g|webp|gif|avif)$/i.test(u.pathname)))return '';
    u.search='';u.hash='';return u.href;
  }catch{return '';}}
  let currentArtworkURL='',failedArtworkURL='';
  $('current-artwork').onerror=()=>{failedArtworkURL=currentArtworkURL;$('current-artwork').hidden=true;$('artwork-placeholder').hidden=false;$('artwork-placeholder').textContent='Image unavailable';};
  const label=(id,value)=>{const element=$(id);if(element.textContent!==value)element.textContent=value;};
  async function send(action,extra={}){const reply=await chrome.runtime.sendMessage({target:'catnap-show-worker',action,...extra});if(!reply?.ok)throw Error(reply?.error||'Show controls unavailable.');return reply.data;}
  function options(select,items,current,empty){
    const signature=JSON.stringify([items,current]);if(select.dataset.signature===signature){select.value=String(current||'');return;}
    select.dataset.signature=signature;select.replaceChildren(new Option(empty,''),...items.map(row=>new Option(row.name,String(row.id))));select.value=String(current||'');
  }
  function readinessDisplay(data,chosen){
    const r=data.readiness||{},s=data.state,inboxOnly=globalThis.CatnapPackage?.inboxOnly===true,inUse=inboxOnly||Number.isInteger(s.playerTabId);
    const step=(id,ready,message)=>{$(id).dataset.state=ready?'ready':'missing';label(id+'-label',message);};
    const checked=Number.isFinite(r.inboxCheckedAt)?new Date(r.inboxCheckedAt).toLocaleTimeString():'';
    $('integration-readiness').dataset.inUse=String(inUse);
    $('suno-connection').dataset.state=!inUse?'inactive':r.sunoAuthorized?'ready':'missing';
    $('inbox-connection').dataset.state=!inUse?'inactive':r.inboxAccessChecked?'ready':'missing';
    label('suno-connection-label',!inUse?'Not in use':r.sunoAuthorized?'Authorized':'Not authorized');
    label('inbox-connection-label',!inUse?'Not in use':r.inboxAccessChecked?`Ready · last access checked${checked?' '+checked:''}`:'Not ready · check setup below');
    label('integration-use',!inUse?'Not in use · Suno controls playback. You can still prepare the inbox and playlist.':inboxOnly?'Playlist creator in use · Suno controls playback.':'Inbox show selected · setup readiness is shown below.');
    step('ready-suno',r.sunoAuthorized,`Suno: ${r.sunoAuthorized?'Authorized · playlist verification is separate':'Not authorized'}`);
    step('ready-uploader-permission',r.uploaderPermission,`Uploader permission: ${r.uploaderPermission?'Enabled':'Not enabled'}`);
    step('ready-uploader-tab',r.uploaderTabOpen,`Uploader tab: ${r.uploaderTabOpen?'Selected and open':'Not selected or no longer open'}`);
    step('ready-inbox',r.inboxSelected,`Inbox: ${r.inboxSelected?'Selected':'Not selected'}`);
    step('ready-inbox-access',r.inboxAccessChecked,`Inbox read access: ${r.inboxAccessChecked?'Last checked'+(checked?' '+checked:''):'Not checked for this tab and inbox'}`);
    step('ready-pending',r.pendingRead,`Pending submissions: ${r.pendingRead?'Read for this selection':'Not read for this selection'}`);
    step('ready-playlist',r.playlistSelected,`Destination playlist: ${r.playlistSelected?'Selected':'Not selected'}`);
    step('ready-verification',r.playlistVerified,`${inboxOnly?'Playlist membership':'Playlist membership and order'}: ${r.playlistVerified?'Verified for this running order':'Not verified for this running order'}`);
    step('ready-theatre-selection',!!chosen,`Theatre tab: ${chosen?'Selected and open':'Not selected'}`);
    step('ready-theatre',!inboxOnly&&data.playbackHealth?.linked===true&&Number.isInteger(s.playerTabId),`Inbox playback connection: ${!inboxOnly&&data.playbackHealth?.linked===true&&Number.isInteger(s.playerTabId)?'Verified':'Not active or needs reconnecting'}`);
  }
  function controlMode(data,chosen){
    const s=data.state,inboxOnly=globalThis.CatnapPackage?.inboxOnly===true,bound=!inboxOnly&&Number.isInteger(s.playerTabId),linked=bound&&data.playbackHealth?.linked===true;
    const ordinary=!bound,kind=linked?'inbox':ordinary?'suno':'reconnect',autoplay=s.mode==='ap'&&s.autoplay;
    $('control-mode').dataset.mode=kind;
    label('control-mode-title',linked?'Inbox show controls active':ordinary?'Suno playlist controls':'Inbox show needs reconnecting');
    label('control-mode-detail',linked?`${s.mode==='lp'?'LP · manual advance':autoplay?'AP · autoplay on':'AP · manual advance'}. ${autoplay?'The next song starts automatically.':'Songs stop at the end. Load the next song quietly, then press Play.'}`:ordinary?inboxOnly?'This extension updates playlists. Suno controls song playback.':'Suno controls playback and its next-song behavior. Choose a Theatre tab, then select “Use this Theatre for the show” for Inbox control.':`${data.playbackHealth?.reason||'The saved Theatre connection could not be verified.'} Playback control is uncertain until you reconnect or return to ordinary Suno.`);
    const tabName=id=>data.tabs.find(tab=>tab.kind==='suno'&&tab.id===id)?.title||'Suno / Theatre';
    label('bound-player',bound?`${linked?'Currently controlled':'Saved connection'}: ${tabName(s.playerTabId)}${linked?'':' · not verified'}`:'');
    $('bound-player').hidden=!bound;
    const different=bound&&chosen&&chosen!==s.playerTabId;
    label('selected-player',inboxOnly?'':chosen?`Selected tab: ${tabName(chosen)}. ${different?'This selection has not changed the controlled tab.':linked?'This is the controlled tab.':'Selecting a tab does not connect it.'}`:'No Theatre tab selected.');
    $('selected-player').hidden=inboxOnly;
    const same=linked&&chosen===s.playerTabId;
    $('bind-player').setAttribute('aria-pressed',String(same));$('bind-player').classList.toggle('is-active',same);$('bind-player').disabled=!chosen||same;
    $('unbind-player').setAttribute('aria-pressed',String(ordinary));$('unbind-player').classList.toggle('is-active',ordinary);$('unbind-player').disabled=ordinary;
  }
  function uploaderGroups(entries){
    const groups=new Map(),result=new Map();
    const key=e=>typeof e.uploaderId==='string'&&e.uploaderId.trim()?'id:'+e.uploaderId.trim():typeof e.uploaderName==='string'&&e.uploaderName.trim()?'name:'+e.uploaderName.trim().toLowerCase():'';
    entries.forEach((e,index)=>{if(e.state==='declined')return;const k=key(e);if(!k)return;if(!groups.has(k))groups.set(k,[]);groups.get(k).push({entry:e,index});});
    for(const [k,items] of groups){if(items.length<2)continue;let hash=2166136261;for(let i=0;i<k.length;i++)hash=Math.imul(hash^k.charCodeAt(i),16777619)>>>0;
      items.sort((a,b)=>(Number.isInteger(a.entry.intakeOrder)?a.entry.intakeOrder:a.index)-(Number.isInteger(b.entry.intakeOrder)?b.entry.intakeOrder:b.index)||a.index-b.index);
      items.forEach(({entry},index)=>result.set(entry.id,{color:hash%6,label:`Same uploader · ${index+1} of ${items.length}`}));
    }
    return result;
  }
  function render(data){
    snapshot=data;const s=data.state,linked=data.playbackHealth?.linked===true,p=linked?(s.playback||{}):{},entry=linked?s.entries.find(e=>e.id===p.current?.id):null;
    const sourceBlocked=e=>e.state==='held'||!(e.preferredSource==='suno'?e.sunoUrl:e.preferredSource==='youtube'?e.youtubeUrl:null);
    const declined=e=>e.state==='declined';
    const held=e=>!declined(e)&&(e.effectiveHeld===true||e.hostHeld===true||sourceBlocked(e));
    const heldCount=s.entries.filter(held).length;
    $('mode').value=s.mode;
    if(document.activeElement!==$('show-name'))$('show-name').value=s.showName;
    options($('uploader-tab'),data.tabs.filter(t=>t.kind==='uploader').map(t=>({id:t.id,name:t.title})),s.uploaderTabId,'Choose the signed-in uploader');
    const playerTabs=data.tabs.filter(t=>t.kind==='suno'),available=id=>playerTabs.some(t=>t.id===id);
    // A changing tab title must not discard the operator's unbound selection.
    // This selects a target only; it never connects or starts another tab.
    const chosen=playerChoice!==undefined?(available(playerChoice)?playerChoice:null):[s.playerTabId,data.suggestedTabId].find(available);
    options($('player-tab'),playerTabs.map(t=>({id:t.id,name:t.title})),chosen,'Choose your playing Theatre tab');
    controlMode(data,chosen);
    readinessDisplay(data,chosen);
    if(s.inboxes)inboxes=s.inboxes;
    const availableInboxes=[...(inboxes[s.mode]||[])];
    if(s.inboxId&&!availableInboxes.some(row=>row.id===s.inboxId))availableInboxes.push({id:s.inboxId,name:s.inboxName||'Selected inbox · Find my inboxes to verify'});
    options($('inbox'),availableInboxes,s.inboxId,'Choose your inbox');
    const listed=[...playlists];if(s.playlistId&&!listed.some(p=>p.id===s.playlistId))listed.push({id:s.playlistId,name:'Selected playlist · load to verify'});
    options($('playlist'),listed,s.playlistId,'Choose a Suno playlist');
    $('autoplay').checked=s.autoplay;$('autoplay').disabled=s.mode==='lp';
    $('watch').checked=s.watch?.enabled===true;$('watch').disabled=s.mode!=='ap';
    if(document.activeElement!==$('warning-seconds'))$('warning-seconds').value=s.warningSeconds;
    const read=s.lastRead,readTime=read?new Date(read.at):null;
    const holdsLabel=globalThis.CatnapPackage?.inboxOnly?`${read?.held||0} held`:`${heldCount} held in show`;
    label('inbox-status',read?`Inbox Submissions: ${read.pending} Pending · ${holdsLabel} · (${Number.isNaN(readTime.getTime())?'time unavailable':readTime.toLocaleTimeString()})`:'Inbox Submissions: Not read yet'+(heldCount?' · '+holdsLabel:''));
    const inboxError=[...new Set([s.error,s.inboxAccessError].filter(Boolean))].join(' ');
    label('inbox-error',inboxError);$('inbox-error').hidden=!inboxError;
    $('playback-status').textContent=linked?`${data.playbackHealth.phase||p.phase||'Ready'}${p.error?' · '+p.error:''} · ${s.mode==='ap'&&s.autoplay?'AP autoplay':'Manual advance'}`:(data.playbackHealth?.reason||'Choose your Suno tab, then Load or Play to connect the show.');
    $('autoplay-help').textContent=linked?(s.mode==='ap'&&s.autoplay?'AP autoplay is on. The next inbox entry starts when the current song ends. Load next still stages a song quietly.':'Manual mode stops at the end. Load next changes artwork and warning without playing audio.'):'Playback is not connected. Load or Play reconnects the selected Theatre; ordinary Suno playback is not yet controlled.';
    $('current-title').textContent=entry?entry.title:'No song loaded';
    $('current-credit').textContent=entry?`${entry.artist||'Artist unavailable'} · Submitted by ${entry.uploaderName||'Unavailable'} · ${p.source||entry.preferredSource||'source unavailable'}`:'';
    const artwork=globalThis.CatnapPackage?.inboxOnly?'':artworkURL(entry?.artworkUrl),image=$('current-artwork');if(artwork!==currentArtworkURL)failedArtworkURL='';currentArtworkURL=artwork;
    if(artwork){if(image.getAttribute('src')!==artwork)image.src=artwork;image.hidden=failedArtworkURL===artwork;image.alt='Artwork for '+(entry.title||'loaded song');}
    else{image.hidden=true;image.removeAttribute('src');image.alt='';}
    $('copy-artwork').disabled=!artwork;$('copy-artwork').title=artwork?'Copy artwork URL':'Artwork unavailable';
    $('artwork-placeholder').hidden=!!artwork&&failedArtworkURL!==artwork;$('artwork-placeholder').textContent=artwork?'Image unavailable':'No artwork';$('artwork-help').textContent=artwork?'Click artwork to copy its image URL':'Artwork unavailable';
    $('current-note').textContent=entry?.note||'No uploader note.';
    $('current-warning').textContent=entry?entry.disclaimer==='yes'?'⚠ Uploader requested a content disclaimer':entry.disclaimer==='no'?'Uploader disclaimer: No':'Uploader disclaimer: Unavailable':'';
    $('current-warning').dataset.warning=entry?.disclaimer||'unknown';
    for(const id of ['copy-playing','copy-link','copy-context','repeat-warning'])$(id).disabled=!entry;
    $('reload-lyrics').disabled=!entry||(p.source||entry.preferredSource)!=='suno';
    $('suno-status').textContent=sunoMessage||(data.suno.connected?'Suno authorized. Playlist changes require your explicit action.':data.suno.reconnectRequired?'Suno needs updated permissions. Click Connect Suno and approve account profile and library access.':'Suno not authorized. Connect Suno to authorize playlist changes.');
    const inboxOnly=globalThis.CatnapPackage?.inboxOnly===true,ownership=s.playlistOwnership;
    const owned=!!s.playlistId&&ownership?.playlistId===s.playlistId&&ownership?.showId===s.id;
    $('claim-playlist').disabled=!s.playlistId||owned;
    $('claim-playlist').textContent=owned?'Playlist order managed':'Manage this playlist’s order';
    $('sync-playlist').textContent=inboxOnly?'Add missing Suno songs & verify':'Sync show order to Suno';
    const sync=s.lastPlaylistSync,verified=sync?`Last verified: ${sync.confirmed?.length??sync.confirmed??0} confirmed · ${sync.missing?.length||0} missing`:'';
    const policy=inboxOnly?'':!s.playlistId?'Choose or create a destination playlist.':!owned?'Order is not managed yet. Create a playlist here or choose Manage this playlist’s order.':sync?.deferred?`Suno order update deferred: ${sync.reason||'the loaded song is protected'}.`:s.playlistDirty||s.playlistSyncPending?'Show order changed · Suno update pending until the next AP update or Sync.':sync?.orderVerified===true?'Suno show order verified.':'Suno show order is not yet verified.';
    $('playlist-status').textContent=[policy,verified].filter(Boolean).join(' ');
    const ids=s.entries.filter(e=>!declined(e)&&typeof e.sunoId==='string'&&e.sunoId).map(e=>e.sunoId);
    $('playlist-duplicates').hidden=inboxOnly||ids.length===new Set(ids).size;
    $('playlist-duplicates').textContent='Repeated Suno song IDs appear once in the Suno playlist. Theatre keeps each submission as its own show entry.';
    $('repeat-uploader-hold').checked=s.repeatUploaderHold===true;
    const currentId=s.playback?.current?.id;
    const played=e=>Number.isFinite(e.playedAt)||e.state==='played';
    const locked=e=>e.id===currentId||played(e)||e.state==='playing'||declined(e);
    $('queue-count').textContent=`(${s.entries.length}${heldCount?' · '+heldCount+' held':''})`;
    const groups=uploaderGroups(s.entries);
    const nextSignature=JSON.stringify([s.entries.map(e=>[e.id,e.title,e.artist,e.uploaderName,e.uploaderId,e.intakeOrder,e.disclaimer,e.preferredSource,e.state,e.declineUncertain,e.holdReason,e.effectiveHeld,e.effectiveHoldReason,e.hostHeld,e.repeatHoldOverride,e.repeatPredecessorId,e.playedAt,e.playedOrder,e.releaseOrder,e.repeatReleasedFor]),currentId,s.playerTabId,Number($('player-tab').value)]);
    if(nextSignature!==queueSignature){
      queueSignature=nextSignature;$('queue').replaceChildren();
      s.entries.forEach((e,index)=>{
        const li=document.createElement('li');li.dataset.entryId=e.id;li.dataset.held=String(held(e));li.dataset.declined=String(declined(e));const group=groups.get(e.id);if(group)li.dataset.uploaderGroup=String(group.color);li.setAttribute('aria-current',String(e.id===entry?.id));
        const title=document.createElement('strong');title.textContent=`${index+1}. ${e.title||'Untitled submission'}`;
        const info=document.createElement('small');info.textContent=`${(e.preferredSource||'held').toUpperCase()} · ${e.uploaderName||'Uploader unavailable'}${e.disclaimer==='yes'?' · ⚠ Disclaimer':''}`;
        const reason=declined(e)?'Decline confirmed in the uploader.':e.declineUncertain?'Check Decline to read the uploader status before trying again.':e.effectiveHoldReason||e.holdReason||(e.hostHeld?'Held by host.':'');
        const badge=document.createElement('span');badge.className='queue-state';badge.textContent=declined(e)?'Declined':e.declineUncertain?'Decline unconfirmed':e.id===currentId?'Loaded / playing':played(e)?'Played':held(e)?'Held':e.repeatHoldOverride?'Host override':'Ready';badge.hidden=!badge.textContent;
        const duplicate=document.createElement('span');duplicate.className='uploader-group';duplicate.textContent=group?.label||'';duplicate.hidden=!group;
        const detail=document.createElement('small');detail.className='queue-hold-reason';detail.textContent=reason;detail.hidden=!reason;
        const controls=document.createElement('div');controls.className='queue-actions';controls.hidden=globalThis.CatnapPackage?.inboxOnly===true;
        const button=(name,text,disabled,click)=>{const control=document.createElement('button');control.type='button';control.dataset.action=name;control.textContent=text;control.hidden=globalThis.CatnapPackage?.inboxOnly===true;control.disabled=disabled;control.setAttribute('aria-label',text+' · '+(e.title||'Untitled submission'));control.onclick=click;controls.append(control);return control;};
        button('load','Load',declined(e)||held(e)||!Number($('player-tab').value),()=>action(()=>send('load',{entryId:e.id,tabId:Number($('player-tab').value)}),'Loaded. Press Play when ready.'));
        const previous=s.entries[index-1],next=s.entries[index+1];
        button('move-up','↑',locked(e)||!previous||locked(previous)||held(e)!==held(previous),()=>action(()=>send('queue-move',{entryId:e.id,beforeEntryId:previous.id}),'Local show order saved.')).setAttribute('aria-label','Move up · '+(e.title||'Untitled submission'));
        button('move-down','↓',locked(e)||!next||locked(next)||held(e)!==held(next),()=>action(()=>send('queue-move',{entryId:e.id,beforeEntryId:s.entries[index+2]?.id||null}),'Local show order saved.')).setAttribute('aria-label','Move down · '+(e.title||'Untitled submission'));
        const automatic=held(e)&&!!e.repeatPredecessorId&&!e.hostHeld,holdButton=button('hold',held(e)?automatic?'Release (host override)':'Release':'Hold',locked(e)||sourceBlocked(e),()=>action(()=>send('queue-hold',{entryId:e.id,held:!held(e)}),held(e)?'Local hold released.':'Local hold saved.'));
        holdButton.title=declined(e)?'Declined submissions stay out of this show.':sourceBlocked(e)?'Fix the submission’s playback source before releasing it.':automatic?'Host override: allow this song before the uploader’s earlier submission finishes.':locked(e)?'Loaded and played songs stay fixed.':held(e)?'Release this song for playback.':'Keep this song in the show without playing it yet.';
        const declineButton=button('decline',declined(e)?'Declined':'Decline',locked(e)||e.declineUncertain===true,()=>{
          if(busy||waiting)return;
          if(!confirm(`Decline “${e.title||'Untitled submission'}” from ${e.uploaderName||'Uploader unavailable'}?\n\nReason: ${DECLINE_REASON}\n\nThis changes the uploader submission.`))return;
          declineButton.disabled=true;
          return action(()=>send('decline-entry',{entryId:e.id}),'Decline confirmed in the uploader.').finally(()=>{queueSignature='';if(snapshot&&!busy&&!waiting)render(snapshot);});
        });
        declineButton.title=e.declineUncertain?'Use Check Decline to read the uploader before another decision.':locked(e)?'Loaded, played and declined submissions stay fixed.':'Decline this Pending submission in the uploader with the fixed reason.';
        const checkButton=button('check-decline','Check Decline',locked(e),()=>action(()=>send('check-decline-entry',{entryId:e.id}),'Decline status checked. See the row result.'));
        checkButton.hidden=globalThis.CatnapPackage?.inboxOnly===true||e.declineUncertain!==true;
        li.append(title,badge,info,duplicate,detail,controls);$('queue').append(li);
      });
    }
  }
  async function refresh(){const revision=++refreshRevision,data=await send('status');if(revision===refreshRevision&&!busy&&!waiting)render(data);return data;}
  function action(fn,success,interrupt=false,{queue=false,progress='Working…'}={}){
    if((busy||waiting)&&!interrupt&&!queue){status('Please wait for the current step. Pause is still available.');return Promise.resolve();}
    ++refreshRevision;
    const expectedFailure=failureRevision;
    const run=async()=>{
      active++;busy=true;document.body.setAttribute('aria-busy','true');status(progress);
      try{
        // Failed target selection must not send queued Read/Sync to the old
        // saved inbox or playlist. A later distinct click can try again.
        if(queue&&expectedFailure!==failureRevision){status('Previous step failed: '+lastFailure+' Check the selection, then click the next step again.');return;}
        const result=await fn(),message=typeof success==='function'?success(result):success;if(message)status(message);
      }catch(error){lastFailure=error.message;failureRevision++;status(lastFailure);}
      finally{active--;busy=active>0;if(!busy)document.body.removeAttribute('aria-busy');try{await refresh();}catch(error){status(error.message);}}
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
  async function copy(value,message='Copied. Paste into your chosen chat.'){try{await navigator.clipboard.writeText(value);$('copy-fallback').hidden=true;status(message);}catch(_){const field=$('copy-fallback');field.hidden=false;field.closest('details').open=true;field.value=value;field.focus();field.select();status('Select and copy the text below.');}}
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
  $('repeat-uploader-hold').onchange=()=>{const repeatUploaderHold=$('repeat-uploader-hold').checked;return setup(()=>configure({repeatUploaderHold}),'Repeat-uploader hold setting saved.','Saving local hold setting…');};
  $('watch').onchange=()=>{const enabled=$('watch').checked;return setup(()=>send('watch',{enabled}),'Inbox update setting saved.','Updating AP inbox settings…');};
  $('new-show').onclick=()=>action(async()=>{await send('new-show');inboxes={lp:[],ap:[]};queueSignature='';},'New local show. Existing Suno playlists and uploader submissions are unchanged.');
  for(const id of ['previous','next','play','repeat-warning'])$(id).onclick=()=>action(()=>send(id,{tabId:Number($('player-tab').value)}),['next','previous'].includes(id)?'Loaded. Press Play when ready.':undefined);
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
    },'Suno authorized.','Connecting to Suno…');
  };
  $('disconnect-suno').onclick=()=>setupButton('disconnect-suno',async()=>{await send('disconnect-suno');sunoMessage='';},'Suno disconnected.','Disconnecting Suno…');
  $('playlists').onclick=()=>setupButton('playlists',async()=>{playlists=await send('playlists');},'Choose a destination playlist.','Loading your Suno playlists…');
  $('playlist').onchange=()=>{const playlistId=$('playlist').value;return setup(()=>configure({playlistId}),'Destination playlist selected.','Saving destination playlist…');};
  $('create-playlist').onclick=()=>{const name=$('new-playlist-name').value,visibility=$('visibility').value;return setupButton('create-playlist',async()=>{const playlist=await send('create-playlist',{name,visibility});playlists.unshift(playlist);},'Playlist created and selected.','Creating your Suno playlist…');};
  $('claim-playlist').onclick=()=>setupButton('claim-playlist',()=>send('claim-playlist'),'Playlist order is managed by this show. Sync when ready.','Checking this playlist for unrelated songs…').finally(()=>{if(snapshot&&!busy&&!waiting)render(snapshot);});
  $('sync-playlist').onclick=()=>setupButton('sync-playlist',()=>send('sync-playlist'),result=>result?.playerUpdateWarning||'Playlist membership checked. See the verification result below.',globalThis.CatnapPackage?.inboxOnly?'Adding missing Suno songs and verifying the playlist…':'Synchronizing managed Suno show order…');
  $('copy-playing').onclick=()=>action(async()=>copy((await send('announcement')).text));
  $('copy-link').onclick=()=>action(async()=>copy((await send('announcement')).context.url));
  $('copy-artwork').onclick=()=>{if(currentArtworkURL)void copy(currentArtworkURL,'Artwork URL copied.');};
  $('copy-context').onclick=()=>action(async()=>copy(JSON.stringify((await send('announcement',{includeNotes:$('include-notes').checked})).context,null,2)));
  refresh().then(()=>{if($('status').textContent==='Loading show…')status('Ready. Choose your inbox or continue the saved show.');}).catch(error=>status(error.message));
  setInterval(()=>{if(!busy&&!waiting)refresh().catch(error=>status(error.message));},1500);
})();
