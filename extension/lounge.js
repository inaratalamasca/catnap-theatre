// Catnap Theatre lounge, version 0.2.0.
// Explicit user-start radio only. Never changes audio in another Suno tab.
(() => {
  'use strict';
  const SCRIPT_VERSION='0.2.0';
  const STREAM_URL='https://streaming.aiu.fm/listen/aiu.fm/radio.mp3';
  const STORAGE_KEY='catnap-theatre-lounge-v1';
  const $=id=>document.getElementById(id);
  const audio=$('radio'),play=$('play'),stop=$('stop'),status=$('status');
  let request=0;
  const scenes={waiting:['WAITING','Make yourself comfortable.','We’ll be with you in a moment.'],pre:['PRE-SHOW','Settle in. The show is coming.','Good company. Great music. A little catnap before we begin.'],after:['AFTER-SHOW','Thanks for being here.','Take the good music with you. We’ll see you at the next party.']};
  function display(){const scene=scenes[$('scene').value]||scenes.pre;$('scene-name').textContent=scene[0];$('headline').textContent=scene[1];$('message').textContent=scene[2];$('schedule-display').textContent=$('schedule').value;}
  function persist(){display();chrome.storage.local.set({[STORAGE_KEY]:{scene:$('scene').value,schedule:$('schedule').value.slice(0,240),playlist:$('playlist').value.slice(0,300)}}).catch(()=>{status.textContent='Lounge preferences could not be saved.';});}
  function stopRadio(message='Radio stopped.'){
    request++;audio.pause();audio.removeAttribute('src');audio.load();play.disabled=false;stop.disabled=true;status.textContent=message;
  }
  play.onclick=async()=>{
    const current=++request;play.disabled=true;stop.disabled=false;status.textContent='Connecting to AIU Radio…';
    audio.volume=Number($('volume').value);audio.src=STREAM_URL;
    try{await audio.play();if(request===current)status.textContent='AIU Radio is playing.';}
    catch{if(request===current)stopRadio('Could not start AIU Radio. Try again or open the full radio page.');}
  };
  stop.onclick=()=>stopRadio();
  $('volume').oninput=()=>{audio.volume=Number($('volume').value);};
  $('scene').onchange=persist;$('schedule').onchange=persist;$('playlist').onchange=persist;
  $('open-playlist').onclick=()=>{
    try{
      const url=new URL($('playlist').value);
      if(url.protocol!=='https:'||!['suno.com','www.suno.com'].includes(url.hostname)||!/^\/playlist\/[0-9a-f-]{36}\/?$/i.test(url.pathname))throw new Error();
      stopRadio('Radio stopped. Start your playlist in the new Suno tab.');window.open(url.href,'_blank','noopener');
    }catch{status.textContent='Paste a full https://suno.com/playlist/… link.';}
  };
  audio.addEventListener('error',()=>{if(audio.hasAttribute('src'))stopRadio('The radio connection dropped. Press Play to reconnect.');});
  globalThis.addEventListener('pagehide',()=>stopRadio());
  chrome.storage.local.get(STORAGE_KEY).then(data=>{
    const value=data[STORAGE_KEY];if(!value||typeof value!=='object')return;
    $('scene').value=scenes[value.scene]?value.scene:'pre';
    $('schedule').value=typeof value.schedule==='string'?value.schedule.slice(0,240):'';
    $('playlist').value=typeof value.playlist==='string'?value.playlist.slice(0,300):'';display();
  }).catch(()=>{});
  $('scene').value='pre';display();
})();
