/* Catnap managed-show visual fixture, version 0.6.0.
 * Change summary: fictional LP data and mock Chrome calls around actual Theatre
 * modules. Default preview has no remote requests, accounts or audio. Appending
 * ?embed=1 before initial navigation permits a paused official YouTube sample
 * embed when its queue entry is loaded. Even then this fixture rejects Play.
 */
(() => {
 'use strict';
 const SCRIPT_VERSION='0.6.0';
 const parameters=new URLSearchParams(location.search),allowEmbed=parameters.get('embed')==='1';
 const warningSeconds=Math.min(120,Math.max(2,Number(parameters.get('warningSeconds'))||10));
 history.replaceState({},'', '/playlist/11111111-1111-4111-8111-111111111111'+location.search);
 const listeners=[],prefs={schemaVersion:1,layout:'lineup',fontSize:23,stripTags:false,background:'#090b14',brand:'Catnap Radio',visualizerEnabled:true,visualizerOpacity:.20};
 let enabled=false,lastObserved=null;
 window.chrome={runtime:{id:'catnap-preview',getURL:file=>'/extension/'+file,onMessage:{addListener:fn=>listeners.push(fn)},sendMessage:async message=>{
  if(message.target==='managed-native'){if(message.action==='enable'||message.action==='block')enabled=true;if(message.action==='disable')enabled=false;return {ok:true,data:{ready:true,enabled,permitted:false,generation:message.generation}};}
  if(message.target==='catnap-show-observed'){lastObserved=message.playback;const status=document.getElementById('managed-preview-status');if(status)status.textContent=`Fictional LP · manual playback · ${lastObserved.phase} · entry ${lastObserved.index+1} of 3`;return {ok:true};}
  if(message.target==='catnap-show-worker'&&message.action==='open'){const controls=document.getElementById('managed-preview-controls');if(controls)controls.style.display='flex';return {ok:true};}
  return {ok:true};
 }},storage:{local:{get:async key=>({[key]:{...prefs}}),set:async data=>{const value=Object.values(data)[0];if(value&&typeof value==='object')Object.assign(prefs,value);}}}};
 const art=new URL('/tests/fixtures/sample-art.svg',location.origin).href;
 const entries=[
  {id:'fictional-inbox:1',submissionId:'1',title:'The Lantern Room',artist:'Sample artist · fictional preview',uploaderName:'FakeUploaderOne',note:'Private fictional host note: introduce the chorus before pressing Play.',disclaimer:'yes',preferredSource:'suno',sunoId:'11111111-1111-4111-8111-111111111111',sunoUrl:'https://suno.com/song/11111111-1111-4111-8111-111111111111',artworkUrl:art,durationSeconds:210,state:'queued'},
  {id:'fictional-inbox:2',submissionId:'2',title:'Sample Video Interlude',artist:'Video source · fictional queue slot',uploaderName:'FakeUploaderTwo',note:'Private fictional note: this is a YouTube-only queue entry with no Suno placeholder.',disclaimer:'no',preferredSource:'youtube',youtubeId:'M7lc1UVf-VE',youtubeUrl:'https://www.youtube.com/watch?v=M7lc1UVf-VE',artworkUrl:art,state:'queued'},
  {id:'fictional-inbox:3',submissionId:'3',title:'After the Rain',artist:'Sample artist · fictional preview',uploaderName:'FakeUploaderThree',note:'Private fictional host note for the final entry.',disclaimer:'no',preferredSource:'suno',sunoId:'33333333-3333-4333-8333-333333333333',sunoUrl:'https://suno.com/song/33333333-3333-4333-8333-333333333333',artworkUrl:art,durationSeconds:185,state:'queued'}
 ];
 const show=()=>({id:'fictional-managed-preview',bindingId:'local-preview-only',name:'Catnap Radio · managed LP preview',mode:'lp',autoplay:false,warningSeconds,entries:entries.map(entry=>({...entry}))});
 function send(action,fields={}){return new Promise((resolve,reject)=>{let handled=false;for(const listener of listeners)if(listener({target:'catnap-show-tab',action,showId:'fictional-managed-preview',...fields},{id:'catnap-preview',url:location.origin+'/extension/show.html'},reply=>{if(reply?.error)reject(Error(reply.error));else resolve(reply);})===true)handled=true;if(!handled)reject(Error('The managed-show preview handler is unavailable.'));});}
 function report(error){document.getElementById('managed-preview-status').textContent=error.message;}
 window.CatnapManagedPreview={SCRIPT_VERSION,send,show,lastObserved:()=>lastObserved};
 window.addEventListener('DOMContentLoaded',async()=>{
  const actualCreate=CatnapManagedMedia.create;
  CatnapManagedMedia.create=options=>{
   const adapter=actualCreate(options);
   return {...adapter,
    stage:async(entry,context)=>{if(entry.preferredSource==='youtube'&&!allowEmbed)return;await adapter.stage(entry,context);if(entry.preferredSource==='youtube'){const frame=document.querySelector('.ct-managed-youtube');if(frame){frame.inert=true;frame.tabIndex=-1;frame.style.pointerEvents='none';frame.setAttribute('aria-label','Paused YouTube embed · silent visual preview');}}},
    play:async()=>{throw Error('This local preview has audio disabled. Load entries to inspect staging, artwork and warnings.');}
   };
  };
  document.getElementById('preview-next').onclick=()=>{const index=((CatnapManagedShow.snapshot()?.index??-1)+1)%entries.length;void send('load',{index}).catch(report);};
  document.getElementById('preview-warning').onclick=()=>{void send('load',{index:0}).then(()=>send('repeat-warning')).catch(report);};
  document.getElementById('preview-reset').onclick=()=>{void send('enable',{show:show()}).then(()=>send('load',{index:0})).catch(report);};
  document.getElementById('preview-hide').onclick=()=>{document.getElementById('managed-preview-controls').style.display='none';};
  try{
   await send('enable',{show:show()});
   // Let the actual standalone companion mount its saved lineup layout before
   // starting the warning timeout; the fixture does not force product styling.
   if(!document.querySelector('#catnap-theater-root .ct-popout-controls'))await new Promise(resolve=>{const observer=new MutationObserver(()=>{if(document.querySelector('#catnap-theater-root .ct-popout-controls')){observer.disconnect();clearTimeout(timeout);resolve();}});const timeout=setTimeout(()=>{observer.disconnect();resolve();},5000);observer.observe(document.documentElement,{subtree:true,childList:true});});
   await send('load',{index:0});
  }catch(error){report(error);}
 });
})();
