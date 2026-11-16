/* Catnap presentation geometry check, version 0.7.0.
 * Fresh Chromium, synthetic documents/artwork and simulated Radio status only.
 * No provider request, user profile, microphone, capture, relay or native Play.
 */
'use strict';
const {pathToFileURL}=require('node:url');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const SCRIPT_VERSION='0.7.0',ROOT=path.resolve(__dirname,'..'),OUTPUT=process.env.CATNAP_QA_DIR||os.tmpdir(),ID='11111111-1111-4111-8111-111111111111';
const code=['helpers.js','content.js','lyric-scroll.js','visual-media.js','standalone.js','managed-player.js','managed-media.js','managed-show.js','broadcast-source.js','radio-tab.js'].map(name=>fs.readFileSync(path.join(ROOT,'extension',name),'utf8'));
const rectInside=(inner,outer)=>inner.x>=outer.x-1&&inner.y>=outer.y-1&&inner.right<=outer.right+1&&inner.bottom<=outer.bottom+1;
(async()=>{
 const {chromium}=await import(process.env.CATNAP_PLAYWRIGHT_MODULE?pathToFileURL(process.env.CATNAP_PLAYWRIGHT_MODULE).href:'playwright');
 const browser=await chromium.launch({executablePath:process.env.CATNAP_CHROME||'/usr/bin/google-chrome',headless:true});
 const results=[];fs.mkdirSync(OUTPUT,{recursive:true});
 try{
  for(const size of [{width:1280,height:720},{width:900,height:650},{width:390,height:844}]){
   const context=await browser.newContext({viewport:size});
   await context.route('**/*',route=>{const u=new URL(route.request().url());
    if(u.hostname==='suno.com')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><main><a aria-label="Playbar: Title for Fixture song" href="/song/'+ID+'">Fixture song</a></main></body></html>'});
    if(u.hostname==='cdn1.suno.ai')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><defs><linearGradient id="a"><stop stop-color="#512a83"/><stop offset="1" stop-color="#146c71"/></linearGradient></defs><rect width="1024" height="1024" fill="url(#a)"/><circle cx="512" cy="450" r="240" fill="#e3c392" opacity=".8"/><text x="512" y="820" text-anchor="middle" fill="white" font-family="sans-serif" font-size="80">Fixture artwork</text></svg>'});
    if(u.hostname==='fixture.invalid')return route.fulfill({contentType:'image/png',body:fs.readFileSync(path.join(ROOT,'extension/assets/aiu-logo.png'))});
    return route.abort();
   });
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('https://suno.com/playlist/'+ID);
   await page.evaluate(()=>{
    const handlers=[],saved={'catnap-theatre-settings-v1':{schemaVersion:1,brand:'Fixture Radio',layout:'duet',fontSize:21}};window.__messages=[];
    const live={ok:true,state:'live',source:true,hideTheatreButton:false,radioOnly:false,listenerUrl:'https://listen.catnapradio.com/'};
    window.chrome={runtime:{id:'fixture',getURL:file=>'https://fixture.invalid/'+file,getManifest:()=>({version:'0.7.0',background:{service_worker:'broadcast-worker.js'}}),onMessage:{addListener:fn=>handlers.push(fn),removeListener(){}},sendMessage:async m=>{__messages.push(m);return m.target==='managed-native'?{ok:true,data:{ready:true,enabled:m.action!=='disable',permitted:m.action==='play'}}:m.target==='catnap-radio-ui'?live:{ok:true,opened:true};}},storage:{local:{get:async key=>({[key]:saved[key]}),set:async value=>Object.assign(saved,value)}}};
    window.__send=message=>new Promise(resolve=>{for(const fn of handlers)fn({target:'catnap-show-tab',...message},{id:'fixture'},resolve);});
   });
   for(const content of code)await page.addScriptTag({content});await page.locator('#catnap-theater-launch').click();
   await page.evaluate(async id=>{const entries=Array.from({length:12},(_,i)=>({id:'entry-'+i,title:i?'Song '+String(i+1).padStart(2,'0'):'A Longer Song Title with Room to Breathe',artist:'Synthetic Artist and Guest',preferredSource:'suno',sunoId:id,sunoUrl:'https://suno.com/song/'+id,artworkUrl:'https://cdn1.suno.ai/fixture.png'}));await __send({action:'enable',show:{id:'layout-show',mode:'lp',autoplay:false,warningSeconds:5,entries}});await __send({action:'load',index:0,showId:'layout-show'});CatnapTheatreView.writeLyrics(Array.from({length:25},(_,i)=>'A quiet lyric line '+(i+1)+' beside the artwork.').join('\n'));},ID);
   await page.locator('.ct-radio-listener:not([hidden])').waitFor();await page.waitForFunction(()=>document.querySelector('#catnap-theater-root')?.dataset.layout);
   for(const layout of ['duet','lineup','art']){
    await page.evaluate(layout=>CatnapPresentationSettings.save({...CatnapPresentationSettings.read(),layout}),layout);
    await page.waitForTimeout(60);
    const data=await page.evaluate(()=>{
     const root=document.querySelector('#catnap-theater-root'),r=selector=>root.querySelector(selector),box=selector=>r(selector).getBoundingClientRect().toJSON(),visible=selector=>getComputedStyle(r(selector)).display!=='none';
     const playlist=r('.ct-managed-lineup'),panel=playlist.getBoundingClientRect();
     return {dataset:{...root.dataset},root:root.getBoundingClientRect().toJSON(),main:box('.ct-main'),showcase:box('.ct-showcase'),wrap:box('.ct-art-wrap'),art:box('.ct-art-frame'),title:box('.ct-song-title'),artist:box('.ct-artist'),status:box('.ct-managed-playback-status'),progress:box('.ct-progress'),footer:box('.ct-bottom'),lyrics:box('.ct-lyrics-panel'),lyricsVisible:visible('.ct-lyrics-panel'),playlist:panel.toJSON(),playlistVisible:visible('.ct-managed-lineup'),visibleRows:Array.from(playlist.querySelectorAll('button')).filter(b=>{const x=b.getBoundingClientRect();return x.top>=panel.top&&x.bottom<=panel.bottom;}).length,caption:box('.ct-radio-caption'),header:box('.ct-header'),listener:box('.ct-radio-listener'),listenerHref:r('.ct-radio-listener').href,desc:r('.ct-desc').textContent,statusText:r('.ct-managed-playback-status').textContent,overflow:getComputedStyle(root).overflow,scrollWidth:root.scrollWidth,clientWidth:root.clientWidth,scrollHeight:root.scrollHeight,clientHeight:root.clientHeight,nativePlay:__messages.filter(m=>m.target==='managed-native'&&m.action==='play').length};
    });
    assert.ok(Math.abs(data.art.width-data.art.height)<1,JSON.stringify({size,layout,data}));assert.ok(data.art.width>90,JSON.stringify({size,layout,data}));assert.ok(rectInside(data.art,data.wrap));assert.ok(Math.abs(data.art.width-Math.min(data.wrap.width,data.wrap.height))<2,'art must fill its available square');
    assert.ok(rectInside(data.title,data.showcase));assert.ok(rectInside(data.artist,data.showcase));assert.ok(data.title.bottom<=data.artist.y+1);assert.ok(data.art.bottom<=data.title.y+1);assert.ok(rectInside(data.status,data.footer));assert.ok(data.status.bottom<=data.progress.y+1);assert.equal(data.desc,'');assert.equal(data.statusText,'Suno · Loaded');
    if(layout!=='art'){assert.equal(data.lyricsVisible,true);assert.ok(rectInside(data.lyrics,data.main));}else assert.equal(data.lyricsVisible,false);
    if(layout==='lineup'){assert.equal(data.playlistVisible,true,JSON.stringify({size,layout,data}));assert.ok(rectInside(data.playlist,data.main));assert.ok(data.visibleRows>=3,JSON.stringify({size,layout,data}));}
    assert.equal(data.overflow,'hidden');assert.ok(rectInside(data.main,data.root));assert.ok(rectInside(data.footer,data.root));assert.ok(rectInside(data.listener,data.header));assert.equal(data.listenerHref,'https://listen.catnapradio.com/');assert.equal(data.nativePlay,0);
    if(size.width!==900)await page.screenshot({path:path.join(OUTPUT,'theatre-'+layout+'-'+size.width+'x'+size.height+'.png')});results.push({viewport:size,layout,...data});
   }
   assert.deepEqual(errors,[]);await context.close();
  }
  const report={version:SCRIPT_VERSION,simulatedRadioState:true,capture:false,results};fs.writeFileSync(path.join(OUTPUT,'theatre-layout-070.json'),JSON.stringify(report,null,2)+'\n');process.stdout.write(JSON.stringify({version:SCRIPT_VERSION,cases:results.length,passed:true})+'\n');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
