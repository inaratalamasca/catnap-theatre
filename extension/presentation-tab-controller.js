/* Catnap presentation adapter, version 0.5.0.
 * Reuse the Theatre's real settings and existing visual/lyric handlers. The
 * allowlist deliberately excludes native playback, queue and broadcast actions.
 */
(() => {
  'use strict';
  let upload = null;
  const root = () => document.getElementById('catnap-theater-root');
  const fields = {
    videoEnabled:['.ct-enable-video','checked'],
    bannerText:['.ct-banner-text','value'],
    placement:['.ct-placement','value',['art','corner','stage']],
    expiry:['.ct-expiry','value',['15','30','60','0']],
    recent:['.ct-recents','value'],
  };
  const buttons = {
    clearImages:'.ct-clear-branding',showOverlay:'.ct-show-overlay',clearOverlay:'.ct-clear-overlay',
    forgetFiles:'.ct-forget-files',reloadLyrics:'.ct-lyrics-reload',
  };
  const fileKinds = {logo:['.ct-logo-file',20],background:['.ct-background-file',20],overlay:['.ct-overlay-file',100]};
  function control(selector) {
    const found = root()?.querySelector(selector);
    if (!found) throw Error('Open Theatre in the linked Suno tab to use this control.');
    return found;
  }
  function snapshot() {
    const current = root();
    const result = {settings:globalThis.CatnapPresentationSettings.read(),open:!!current,
      sourceTitle:document.title.slice(0,160),visual:{},autoScroll:true,reloadDisabled:false,presets:[],recent:[],visualizer:globalThis.CatnapVisualizer?.status?.()||{source:'none',state:'quiet'}};
    if (!current) return result;
    for (const [name,[selector,property]] of Object.entries(fields)) result.visual[name]=current.querySelector(selector)?.[property];
    result.autoScroll=current.querySelector('.ct-lyrics-auto')?.getAttribute('aria-pressed')==='true';
    result.reloadDisabled=!!current.querySelector('.ct-lyrics-reload')?.disabled;
    result.presets=Array.from(current.querySelectorAll('.ct-presets button'),button=>button.textContent);
    result.recent=Array.from(current.querySelectorAll('.ct-recents option'),option=>({value:option.value,label:option.textContent}));
    result.visualStatus=current.querySelector('.ct-visual-status')?.textContent || '';
    result.settingsStatus=current.querySelector('.ct-settings-status')?.textContent || '';
    return result;
  }
  function clearUpload() { if(upload?.timer)clearTimeout(upload.timer);upload=null; }
  async function command(message) {
    if (message.action === 'state') return snapshot();
    if (message.action === 'set-settings') {
      await globalThis.CatnapPresentationSettings.save(message.settings);
      return snapshot();
    }
    if (message.action === 'field') {
      if (message.name==='autoScroll') {
        const button=control('.ct-lyrics-auto');
        if(typeof message.value!=='boolean')throw Error('Invalid lyric preference.');
        if((button.getAttribute('aria-pressed')==='true')!==message.value)button.click();
      } else {
        const field=fields[message.name];if(!field)throw Error('Unknown presentation field.');
        const [selector,property,choices]=field,element=control(selector);
        if(property==='checked'&&typeof message.value!=='boolean')throw Error('Invalid visual preference.');
        if(property==='value'&&typeof message.value!=='string')throw Error('Invalid visual value.');
        if(choices&&!choices.includes(message.value))throw Error('Invalid visual option.');
        if(message.name==='bannerText'&&message.value.length>240)throw Error('Banner is too long.');
        if(message.name==='recent'&&!Array.from(element.options).some(option=>option.value===message.value))throw Error('That recent file is unavailable.');
        element[property]=message.value;element.dispatchEvent(new Event('change',{bubbles:true}));
      }
      return snapshot();
    }
    if (message.action === 'button') {
      const selector=buttons[message.name];if(!selector)throw Error('Unknown presentation action.');
      control(selector).click();return snapshot();
    }
    if (message.action === 'preset') {
      const presets=root()?.querySelectorAll('.ct-presets button');
      if(!Number.isInteger(message.index)||message.index<0||!presets?.[message.index])throw Error('Unknown quick banner.');
      presets[message.index].click();return snapshot();
    }
    if (message.action === 'file-begin') {
      const kind=fileKinds[message.kind];if(!kind)throw Error('Unknown image destination.');
      control(kind[0]);
      const types=message.kind==='overlay'?/^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm))$/:/^image\/(png|jpeg|webp|gif)$/;
      if(!Number.isInteger(message.size)||message.size<=0||message.size>kind[1]*1024*1024||!types.test(message.type)||typeof message.name!=='string'||message.name.length>255)throw Error('Choose a supported local file within its size limit.');
      clearUpload();
      upload={id:message.id,kind:message.kind,name:message.name,type:message.type,size:message.size,received:0,chunks:[],timer:setTimeout(clearUpload,120000)};
      return {uploading:true};
    }
    if (message.action === 'file-cancel') {clearUpload();return {cancelled:true};}
    if (message.action === 'file-chunk') {
      if(!upload||upload.id!==message.id||typeof message.data!=='string'||message.data.length>360000)throw Error('Local file transfer expired. Choose the file again.');
      const binary=atob(message.data);
      if(upload.received+binary.length>upload.size)throw Error('Local file exceeds its declared size.');
      upload.chunks.push(Uint8Array.from(binary,char=>char.charCodeAt(0)));upload.received+=binary.length;
      return {received:upload.received};
    }
    if (message.action === 'file-finish') {
      if(!upload||upload.id!==message.id||upload.received!==upload.size)throw Error('Local file transfer was incomplete.');
      const pending=upload;clearUpload();
      const file=new File(pending.chunks,pending.name,{type:pending.type});
      const transfer=new DataTransfer();transfer.items.add(file);
      const input=control(fileKinds[pending.kind][0]);input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
      return snapshot();
    }
    throw Error('Unknown presentation control.');
  }
  chrome.runtime.onMessage.addListener((message,sender,reply) => {
    if(!message||message.target!=='presentation-tab'||sender.id!==chrome.runtime.id||sender.tab)return;
    Promise.resolve().then(()=>command(message)).then(reply,error=>reply({error:error.message||'Presentation control failed.'}));
    return true;
  });
})();
