/* Catnap radio source policy, version 0.7.0.
 * Shared by the worker and isolated page display. No capture or network calls.
 * Keep this allowlist aligned with the packaged content-script matches.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CatnapBroadcastSource=api;})(globalThis,()=>{
  'use strict';
  const VERSION='0.7.0';
  function kind(value){
    try{
      const u=new URL(value);
      if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
      if(['suno.com','www.suno.com'].includes(u.hostname))return 'suno';
      if(u.hostname==='party.aiu.fm'&&/^\/party(?:\/|$)/.test(u.pathname)&&!/^\/party\/(?:login|auth)(?:\/|$)/.test(u.pathname))return 'aiu';
    }catch{/* Unknown and browser-internal pages cannot become sources. */}
    return null;
  }
  const allowed=value=>kind(value)!==null;
  function senderAllowed(sender,id){
    return sender?.id===id&&Number.isInteger(sender.tab?.id)&&sender.frameId===0&&allowed(sender.url);
  }
  function label(value){return kind(value)==='suno'?'Suno':kind(value)==='aiu'?'AIU player':'No supported source';}
  return {VERSION,kind,allowed,senderAllowed,label};
});
