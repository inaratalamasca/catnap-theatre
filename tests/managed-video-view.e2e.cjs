/* Catnap YouTube window-view Chromium check, version 0.8.1.
 * Fresh browser context, synthetic Suno/YouTube documents, no user profile,
 * provider network, native media, tab capture or display fullscreen operation.
 */
'use strict';
const {pathToFileURL}=require('node:url');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const SCRIPT_VERSION='0.8.1',ROOT=path.resolve(__dirname,'..'),OUTPUT=process.env.CATNAP_QA_DIR||os.tmpdir();
const ID='11111111-1111-4111-8111-111111111111';
const html='<!doctype html><html><body><main><a aria-label="Playbar: Title for Old song" href="/song/'+ID+'">Old song</a></main></body></html>';
const video='<!doctype html><html><body style="margin:0;background:linear-gradient(140deg,#241047,#093f4e);height:100vh;display:grid;place-items:center;color:white;font:30px system-ui">Synthetic video<script>window.commands=[];addEventListener("message",e=>{try{const x=JSON.parse(e.data);if(x.func)commands.push(x.func);}catch{}});</script></body></html>';
const source=['helpers.js','content.js','lyric-scroll.js','visual-media.js','standalone.js','managed-player.js','managed-media.js','managed-show.js'].map(name=>fs.readFileSync(path.join(ROOT,'extension',name),'utf8'));
(async()=>{
 const {chromium}=await import(process.env.CATNAP_PLAYWRIGHT_MODULE?pathToFileURL(process.env.CATNAP_PLAYWRIGHT_MODULE).href:'playwright');
 const browser=await chromium.launch({executablePath:process.env.CATNAP_CHROME||'/usr/bin/google-chrome',headless:true});
 const results=[];fs.mkdirSync(OUTPUT,{recursive:true});
 try{
  for(const size of [{width:1280,height:720},{width:900,height:650},{width:390,height:844}]){
   const context=await browser.newContext({viewport:size});let videoRequests=0;
   await context.route('**/*',route=>{const u=new URL(route.request().url());
    if(u.hostname==='suno.com')return route.fulfill({contentType:'text/html',body:html});
    if(u.hostname==='www.youtube-nocookie.com'){videoRequests++;return route.fulfill({contentType:'text/html',body:video});}
    if(u.hostname==='fixture.invalid')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'});
    return route.abort();
   });
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('https://suno.com/playlist/'+ID);
   await page.evaluate(()=>{
    const listeners=[];window.__messages=[];window.__fullscreenCalls=0;
    window.chrome={runtime:{id:'fixture',getURL:file=>'https://fixture.invalid/'+file,getManifest:()=>({version:'0.8.1',background:{service_worker:'broadcast-worker.js'}}),onMessage:{addListener:fn=>listeners.push(fn)},sendMessage:async message=>{__messages.push(message);return message.target==='managed-native'?{ok:true,data:{ready:true,enabled:message.action!=='disable',permitted:message.action==='play'}}:{ok:true};}},storage:{local:{get:async()=>({}),set:async()=>{}}}};
    window.__send=message=>new Promise(resolve=>{for(const handler of listeners)handler({target:'catnap-show-tab',...message},{id:'fixture'},resolve);});
    Element.prototype.requestFullscreen=()=>{__fullscreenCalls++;throw Error('Display fullscreen is forbidden in this check.');};
   });
   for(const content of source)await page.addScriptTag({content});
   await page.locator('#catnap-theater-launch').click();await page.locator('#catnap-theater-root').waitFor();
   await page.evaluate(async id=>{await __send({action:'enable',show:{id:'view-show',mode:'lp',autoplay:false,warningSeconds:30,entries:[{id:'video',title:'Synthetic video',preferredSource:'youtube',youtubeUrl:'https://www.youtube.com/watch?v=abcdefghijk',disclaimer:'yes'},{id:'suno',title:'Next Suno',preferredSource:'suno',sunoId:id,sunoUrl:'https://suno.com/song/'+id}]}});await __send({action:'load',index:0,showId:'view-show'});window.__video=document.querySelector('.ct-managed-youtube');window.__parent=__video.parentElement;window.__src=__video.src;},ID);
   const frame=page.locator('.ct-managed-youtube');await frame.waitFor();
   const before=await page.evaluate(()=>({expanded:document.querySelector('#catnap-theater-root').classList.contains('ct-managed-window-video'),frame:document.querySelector('.ct-managed-youtube').getBoundingClientRect().toJSON(),art:document.querySelector('.ct-art-frame').getBoundingClientRect().toJSON()}));
   await page.screenshot({path:path.join(OUTPUT,'managed-video-artwork-'+size.width+'x'+size.height+'.png')});
   assert.equal(before.expanded,false);assert.ok(Math.abs(before.frame.width-before.art.width)<1);assert.ok(Math.abs(before.frame.x-before.art.x)<1);
   await page.evaluate(()=>{window.__playing=__send({action:'play',showId:'view-show'});});
   const signal=async data=>page.evaluate(data=>dispatchEvent(new MessageEvent('message',{origin:'https://www.youtube-nocookie.com',source:__video.contentWindow,data:JSON.stringify(data)})),data);
   await signal({event:'onReady'});await signal({event:'onStateChange',info:1});await page.evaluate(()=>__playing);
   const expanded=await page.evaluate(()=>{const root=document.querySelector('#catnap-theater-root'),video=root.querySelector('.ct-managed-youtube'),stage=root.querySelector('.ct-managed-media-stage'),restore=root.querySelector('.ct-managed-video-restore'),warning=root.querySelector('.ct-managed-warning');return {frame:video.getBoundingClientRect().toJSON(),restore:restore.getBoundingClientRect().toJSON(),restoreOpacity:getComputedStyle(restore).opacity,strip:!!root.querySelector('.ct-managed-video-controls'),warningZ:getComputedStyle(warning).zIndex,stageZ:getComputedStyle(stage).zIndex,warningVisible:!warning.hidden,fullscreen:__fullscreenCalls,displayFullscreen:!!document.fullscreenElement,same:video===__video&&video.parentElement===__parent&&video.src===__src};});
   assert.equal(expanded.same,true);assert.equal(expanded.fullscreen,0);assert.equal(expanded.displayFullscreen,false);assert.equal(expanded.warningVisible,true);assert.ok(Number(expanded.warningZ)>Number(expanded.stageZ));
   for(const key of ['x','y'])assert.ok(Math.abs(expanded.frame[key])<1,JSON.stringify(expanded));assert.ok(Math.abs(expanded.frame.width-size.width)<1);assert.ok(Math.abs(expanded.frame.height-size.height)<1);assert.equal(expanded.strip,false);assert.equal(expanded.restoreOpacity,'0');assert.ok(expanded.restore.x>=0&&expanded.restore.right<=size.width+1&&expanded.restore.bottom<=size.height+1);assert.equal(expanded.restore.width,44);assert.equal(expanded.restore.height,44);
   // Cross-origin iframe keys cannot reach the parent. A dedicated edge target
   // reveals on hover/focus; it never needs iframe mouse or keyboard events.
   const embedded=await (await frame.elementHandle()).contentFrame();await embedded.evaluate(()=>{document.body.tabIndex=0;document.body.focus();});await page.keyboard.press('Escape');assert.equal(await page.locator('#catnap-theater-root').evaluate(root=>root.classList.contains('ct-managed-window-video')),true);
   await page.keyboard.press('Tab');assert.equal(await page.locator('.ct-managed-video-restore').evaluate(button=>document.activeElement===button&&getComputedStyle(button).opacity==='1'),true,'Tab from the iframe must reach a visible recovery control');await page.keyboard.press('Escape');assert.equal(await page.locator('#catnap-theater-root').evaluate(root=>root.classList.contains('ct-managed-window-video')),false);await page.locator('.ct-managed-video-window').click();await embedded.evaluate(()=>document.body.focus());
   const requests=videoRequests;await page.mouse.move(expanded.restore.x+22,expanded.restore.y+22);await page.waitForFunction(()=>getComputedStyle(document.querySelector('.ct-managed-video-restore')).opacity==='1');await page.locator('.ct-managed-video-restore').click();assert.equal(await page.locator('#catnap-theater-root').evaluate(root=>root.classList.contains('ct-managed-window-video')),false);await page.locator('.ct-managed-video-window').click();await page.mouse.move(10,size.height-10);assert.equal(await page.locator('.ct-managed-video-restore').evaluate(button=>getComputedStyle(button).opacity),'0');assert.equal(videoRequests,requests,'View changes must not navigate/reload the player');
   assert.equal(await page.evaluate(()=>document.querySelector('.ct-managed-youtube')===__video&&__video.parentElement===__parent&&__video.src===__src),true);
   await page.screenshot({path:path.join(OUTPUT,'managed-video-window-'+size.width+'x'+size.height+'.png')});
   await page.locator('.ct-managed-video-restore').focus();assert.equal(await page.locator('.ct-managed-video-restore').evaluate(button=>getComputedStyle(button).opacity),'1');await page.keyboard.press('Escape');assert.equal(await page.locator('#catnap-theater-root').count(),1);assert.equal(await page.locator('#catnap-theater-root').evaluate(root=>root.classList.contains('ct-managed-window-video')),false);
   await page.locator('.ct-managed-video-window').click();await signal({event:'onStateChange',info:0});await page.waitForFunction(()=>CatnapManagedShow.snapshot().phase==='ended');assert.equal(await frame.count(),0);assert.equal(await page.locator('#catnap-theater-root').evaluate(root=>root.classList.contains('ct-managed-window-video')),false);
   await page.evaluate(()=>__send({action:'next',showId:'view-show'}));assert.equal(await page.evaluate(()=>CatnapManagedShow.snapshot().current.id),'suno');assert.equal(await frame.count(),0);assert.equal(await page.evaluate(()=>__messages.filter(m=>m.target==='managed-native'&&m.action==='play').length),0);
   assert.deepEqual(errors,[]);results.push({viewport:size,quietLoad:true,quietFrame:before.frame,expandedFrame:expanded.frame,restoreTarget:expanded.restore,customStripAbsent:true,restoreHiddenAtRest:true,restoreOnHoverAndFocus:true,tabFromIframeRecovery:true,warningZ:expanded.warningZ,stageZ:expanded.stageZ,fullTheatreViewport:true,sameIframe:true,restore:true,heldEnding:true,sunoReturn:true,iframeFocusUsesEdgeRestore:true,fullscreenCalls:0});await context.close();
  }
  const report={version:SCRIPT_VERSION,results};fs.writeFileSync(path.join(OUTPUT,'managed-video-window-081.json'),JSON.stringify(report,null,2)+'\n');process.stdout.write(JSON.stringify(report)+'\n');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
