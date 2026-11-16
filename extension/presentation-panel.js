/* Catnap persistent presentation controls, version 0.7.0.
 * This window sends presentation commands to its fixed source tab. Settings
 * and overlays are applied by the same handlers used by the inline Theatre UI.
 */
(() => {
  'use strict';
  const SCRIPT_VERSION='0.7.0';
  const {settings,defaults}=globalThis.CatnapTheatre;
  const control=new URLSearchParams(location.search).get('control');
  const $=id=>document.getElementById(id);
  let current=null,busy=0,uploading=false,refreshing=false,presetKey='',recentKey='',lastOpen=null,refreshFailed=false;
  let lastStatus={text:'Linking to your Suno tab…',error:false,neutral:true};
  let operations=Promise.resolve(),mutationEpoch=0;
  const visualIds=['auto-scroll','reload-lyrics','video-enabled','banner-text','overlay-file','recent','forget-files','placement','expiry','show-overlay','clear-overlay','logo-file','background-file','clear-images'];
  function paintStatus() {
    const box=$('status'),known=current?.playbackMode==='inbox'||current?.playbackMode==='suno';
    const mode=current?.connected===true&&known?(current.playbackMode==='inbox'?'Inbox mode':'Suno playlist mode'):'Mode unavailable';
    const playbackError=current?.connected===true&&current.playbackMode==='inbox'&&typeof current.playbackError==='string'?current.playbackError.trim().slice(0,240):'';
    const error=lastStatus.error||!!playbackError;
    const ready=!error&&!lastStatus.neutral&&current?.connected===true&&current.open===true&&known;
    box.classList.toggle('error',error);box.classList.toggle('ready',ready);
    box.dataset.state=error?'error':ready?'ready':'neutral';
    const heading=document.createElement('strong');heading.className='ct-control-mode';heading.textContent=mode;
    const message=document.createElement('span');message.textContent=playbackError?'Playback: '+playbackError+(lastStatus.error?' · '+lastStatus.text:''):lastStatus.text;box.replaceChildren(heading,message);
  }
  const status=(text,error=false,neutral=false)=>{lastStatus={text,error,neutral};paintStatus();};
  $('radio-controls').onclick=async()=>{try{await send('open-radio');}catch(error){status(error.message||'Radio controls unavailable.',true);}};
  $('show-controls').onclick=async()=>{try{const result=await chrome.runtime.sendMessage({target:'catnap-show-worker',action:'open'});if(!result?.ok)throw Error(result?.error||'Show controls unavailable.');}catch(error){status(error.message,true);}};
  async function send(action,details={}) {
    const result=await chrome.runtime.sendMessage({target:'presentation-worker',control,action,...details});
    if(!result)throw Error('The linked Suno tab is unavailable. Reopen controls from Theatre.');
    if(result.error)throw Error(result.error);
    return result;
  }
  function value(id,next,property='value') {const input=$(id);if(document.activeElement!==input)input[property]=next;}
  function paint(next) {
    current=next;paintStatus();
    $('source').textContent='Linked Suno tab · '+(next.sourceTitle||'Catnap Theatre');
    const prefs=next.settings;
    for(const name of ['layout','brand','background'])value(name,prefs[name]);
    value('stripTags',prefs.stripTags,'checked');$('font-value').textContent=prefs.fontSize+' px';
    value('visualizerEnabled',prefs.visualizerEnabled!==false,'checked');
    const opacity=Math.round((Number.isFinite(prefs.visualizerOpacity)?prefs.visualizerOpacity:.20)*100);
    value('visualizerOpacity',String(opacity));$('visualizer-opacity-value').textContent=opacity+'%';
    $('visualizerOpacity').disabled=prefs.visualizerEnabled===false;
    const visualizer=next.visualizer||{};
    const visualizerReason=typeof visualizer.reason==='string'?visualizer.reason.trim().slice(0,180):'';
    $('visualizer-status').textContent=prefs.visualizerEnabled===false?'Background bars are off.':visualizer.state==='reduced-motion'?'Background bars respect reduced-motion preferences.':visualizer.source==='none'||!visualizer.source?visualizerReason||'Waiting for a supported music source.':visualizer.state==='quiet'?'Music is quiet; the bars settle into the background.':'Reacting to the music behind the presentation.';
    for(const id of visualIds)$(id).disabled=!next.open||uploading;
    $('reload-lyrics').disabled=!next.open||next.reloadDisabled||uploading;
    $('auto-scroll').setAttribute('aria-pressed',String(next.autoScroll));
    const visual=next.visual||{};
    value('video-enabled',visual.videoEnabled??true,'checked');
    value('banner-text',visual.bannerText||'');value('placement',visual.placement||'art');value('expiry',visual.expiry||'15');
    const key=JSON.stringify(next.presets);
    if(key!==presetKey){presetKey=key;$('presets').replaceChildren();next.presets.forEach((label,index)=>{const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>run(()=>send('preset',{index}));$('presets').appendChild(button);});}
    for(const button of $('presets').children)button.disabled=!next.open||uploading;
    const recent=JSON.stringify(next.recent);
    if(recent!==recentKey){recentKey=recent;$('recent').replaceChildren();for(const item of next.recent){const option=document.createElement('option');option.value=item.value;option.textContent=item.label;$('recent').appendChild(option);}}
    value('recent',visual.recent||'');
    $('visual-status').textContent=next.open?(next.visualStatus||'Local media stays in the linked Suno tab.'):'Open Theatre in the linked Suno tab to use visual controls.';
  }
  function run(task,message='Updated Theatre.') {
    mutationEpoch++;
    busy++;status('Updating Theatre…',false,true);
    // A queued task reads current only after the preceding reply has repainted
    // it. This preserves rapid font increments and blur→Show overlay ordering.
    const pending=operations.then(async()=>{
      try{const result=await task();if(result.settings)paint(result);status(message,false,busy>1);return result;}
      catch(error){status(error.message||'Could not update Theatre.',true);return null;}
      finally{busy--;}
    });
    operations=pending.catch(()=>{});
    return pending;
  }
  function changeSetting(name,getValue) {
    $(name).addEventListener('change',()=>{
      if(!current)return;
      const value=getValue();
      void run(()=>send('set-settings',{settings:settings({...current.settings,[name]:value})}),'Settings saved.');
    });
  }
  for(const name of ['layout','brand','background'])changeSetting(name,()=>$(name).value);
  changeSetting('stripTags',()=>$('stripTags').checked);
  changeSetting('visualizerEnabled',()=>$('visualizerEnabled').checked);
  changeSetting('visualizerOpacity',()=>Number($('visualizerOpacity').value)/100);
  $('visualizerOpacity').addEventListener('input',()=>{$('visualizer-opacity-value').textContent=$('visualizerOpacity').value+'%';});
  for(const [id,delta] of [['font-down',-2],['font-up',2]])$(id).onclick=()=>current&&run(()=>send('set-settings',{settings:settings({...current.settings,fontSize:current.settings.fontSize+delta})}),'Lyrics size updated.');
  $('reset').onclick=()=>run(()=>send('set-settings',{settings:{...defaults}}),'Settings reset.');
  const field=(id,name,property='value')=>$(id).addEventListener('change',()=>{const value=$(id)[property];void run(()=>send('field',{name,value}));});
  field('video-enabled','videoEnabled','checked');field('banner-text','bannerText');field('placement','placement');field('expiry','expiry');field('recent','recent');
  $('auto-scroll').onclick=()=>run(()=>send('field',{name:'autoScroll',value:!current?.autoScroll}),'Lyric following updated.');
  for(const [id,name] of [['reload-lyrics','reloadLyrics'],['clear-images','clearImages'],['forget-files','forgetFiles'],['show-overlay','showOverlay'],['clear-overlay','clearOverlay']])$(id).onclick=()=>run(()=>send('button',{name}),id==='reload-lyrics'?'Requested current-song lyrics.':'Updated Theatre.');
  $('export').onclick=()=>{
    if(!current)return;
    const url=URL.createObjectURL(new Blob([JSON.stringify(current.settings,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='catnap-theatre-settings.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);if(!lastStatus.error)status('Settings file saved.');
  };
  $('import').onchange=async event=>{
    const file=event.target.files[0];if(!file)return;
    await run(async()=>{if(file.size>16000)throw Error('This settings file is too large.');return send('set-settings',{settings:settings(JSON.parse(await file.text()))});},'Settings loaded.');
    event.target.value='';
  };
  async function uploadFile(file,kind) {
    if(!file||uploading)return;
    mutationEpoch++;
    uploading=true;status('Loading local file…',false,true);document.body.dataset.uploading='true';if(current)paint(current);
    const id=crypto.randomUUID();
    try{
      await send('file-begin',{id,kind,name:file.name,type:file.type,size:file.size});
      const chunkSize=256*1024;
      for(let offset=0;offset<file.size;offset+=chunkSize){
        const bytes=new Uint8Array(await file.slice(offset,offset+chunkSize).arrayBuffer());
        let binary='';for(let index=0;index<bytes.length;index+=8192)binary+=String.fromCharCode(...bytes.subarray(index,index+8192));
        await send('file-chunk',{id,data:btoa(binary)});
        status('Loading local file… '+Math.round(Math.min(file.size,offset+chunkSize)/file.size*100)+'%',false,true);
      }
      paint(await send('file-finish',{id}));
      status(kind==='overlay'?'Local file ready. Choose Show overlay.':'Local image applied to Theatre.');
    }catch(error){await send('file-cancel',{id}).catch(()=>{});status(error.message||'Could not load the local file.',true);}
    finally{uploading=false;document.body.dataset.uploading='false';if(current)paint(current);}
  }
  for(const [id,kind] of [['logo-file','logo'],['background-file','background'],['overlay-file','overlay']])$(id).onchange=event=>{const file=event.target.files[0];void uploadFile(file,kind);event.target.value='';};
  $('lounge').href=chrome.runtime.getURL('lounge.html');
  async function refresh() {
    if(refreshing||busy||uploading)return;
    const epoch=mutationEpoch;
    refreshing=true;
    // A reply can arrive after an edit has already completed. Discard that old
    // snapshot so the next queued edit cannot resend preferences it has undone.
    try{const next=await send('state');if(epoch!==mutationEpoch||busy||uploading)return;paint(next);if(next.connected!==true||!['inbox','suno'].includes(next.playbackMode)){status('The linked Theatre status is not ready.',false,true);refreshFailed=true;}else{if(!next.open)status('Theatre is closed. Saved settings are still available.',false,true);else if(lastOpen!==true||refreshFailed)status('Theatre controls are ready.');refreshFailed=false;}lastOpen=next.open;}
    catch(error){if(epoch===mutationEpoch&&!busy&&!uploading){refreshFailed=true;if(current)current={...current,connected:false};status(error.message||'The linked Suno tab is unavailable.',true);}}
    finally{refreshing=false;}
  }
  document.documentElement.dataset.catnapPresentationVersion=SCRIPT_VERSION;paintStatus();
  void refresh();setInterval(refresh,1000);
})();
