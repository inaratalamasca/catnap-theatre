/* Catnap publisher metadata validation, version 0.4.0.
 * Change: bounded public projection and exact publishing-tab authorization.
 * This module never reads storage, captures media, or controls playback.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CatnapBroadcastMetadata=api;})(globalThis,()=>{
  'use strict';
  const VERSION='0.4.0',MAX_BODY_BYTES=128*1024,ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const text=(value,max=220)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';
  function sunoURL(value,kind){try{const u=new URL(value);if(u.protocol!=='https:'||!['suno.com','www.suno.com'].includes(u.hostname)||u.username||u.password)return null;const match=u.pathname.match(new RegExp('^/'+kind+'/([0-9a-f-]{36})/?$','i'));return match&&ID.test(match[1])?{id:match[1].toLowerCase(),url:'https://suno.com/'+kind+'/'+match[1].toLowerCase()}:null;}catch{return null;}}
  const seconds=value=>typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=86400?value:null;
  function artwork(value){try{if(typeof value!=='string'||value.length>4096)return null;const u=new URL(value);if(u.protocol!=='https:'||!['cdn1.suno.ai','cdn2.suno.ai','cdn.suno.ai'].includes(u.hostname)||u.username||u.password||!(/\.(?:png|jpe?g|webp|gif|avif)$/i.test(u.pathname)))return null;u.search='';u.hash='';return u.href.length<=2048?u.href:null;}catch{return null;}}
  function track(value){if(!value||typeof value!=='object')return null;const u=sunoURL(value.url,'song');const id=text(value.id).toLowerCase(),title=text(value.title);if(!u||u.id!==id||!title)return null;return {id,title,artist:text(value.artist),url:u.url,durationSeconds:seconds(value.durationSeconds)};}
  function sanitize(value){
    if(!value||value.version!==1)return null;
    const song=track(value.song);if(!song)return null;
    song.artworkUrl=artwork(value.song.artworkUrl);
    song.currentTimeSeconds=typeof value.song.currentTimeSeconds==='number'&&Number.isFinite(value.song.currentTimeSeconds)&&value.song.currentTimeSeconds>=0&&song.durationSeconds!==null&&value.song.currentTimeSeconds<=song.durationSeconds?value.song.currentTimeSeconds:null;
    song.playing=typeof value.song.playing==='boolean'?value.song.playing:null;
    const shuffle=value.shuffle===true,p=value.playlist;let playlist=null;
    if(p&&typeof p==='object'&&ID.test(p.id||'')){
      const position=Number.isInteger(p.position)&&p.position>0&&p.position<=2000?p.position:null;
      playlist={id:p.id.toLowerCase(),title:text(p.title),position,total:null,orderBasis:'visible-dom',upNext:[]};
      if(!shuffle&&position!==null&&Array.isArray(p.upNext))playlist.upNext=p.upNext.slice(0,100).map(track).filter(Boolean);
    }
    return {version:1,song,playlist,shuffle};
  }
  function sourceAllowed(sender,extensionID,sourceTabID){
    if(sender?.id!==extensionID||!Number.isInteger(sourceTabID)||sender?.tab?.id!==sourceTabID||sender?.frameId!==0)return false;
    try{const u=new URL(sender.url);return u.protocol==='https:'&&['suno.com','www.suno.com'].includes(u.hostname);}catch{return false;}
  }
  function endpoint(whip){const u=new URL(whip);return u.origin+'/api/now-playing';}
  const clear=()=>({version:1,song:null,playlist:null,shuffle:false,active:false});
  function serialize(value){
    const projected=value?.version===1&&value?.active===false?clear():sanitize(value);if(!projected)return null;
    const encoder=new TextEncoder();let body=JSON.stringify(projected);
    // Character limits do not bound UTF-8 byte length. Retain current song and
    // the nearest upcoming entries; shed only the farthest tail when necessary.
    while(encoder.encode(body).byteLength>MAX_BODY_BYTES&&projected.playlist?.upNext.length){projected.playlist.upNext.pop();body=JSON.stringify(projected);}
    return encoder.encode(body).byteLength<=MAX_BODY_BYTES?body:null;
  }
  return {VERSION,MAX_BODY_BYTES,text,sunoURL,track,seconds,artwork,sanitize,serialize,sourceAllowed,endpoint,clear};
});
