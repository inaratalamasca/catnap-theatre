/* Catnap isolated persistent-controls browser check, version 0.5.0.
 * Node is required for the Chromium test API. This creates a temporary browser
 * profile, intercepts all Suno requests with a synthetic fixture and never opens
 * a user profile or starts audio capture. Run separately from the unit suite.
 */
'use strict';
const {pathToFileURL}=require('node:url');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const SCRIPT_VERSION='0.5.0';
const ROOT=path.resolve(__dirname,'..');
const OUTPUT=process.env.CATNAP_QA_DIR||os.tmpdir();
fs.mkdirSync(OUTPUT,{recursive:true});
const A='11111111-1111-4111-8111-111111111111';
const html=`<!doctype html><html><head><title>Presentation fixture</title></head><body><main><article><a href="/song/${A}">Fixture song</a><button aria-label="Play Song">Play</button></article></main><a aria-label="Playbar: Title for Fixture song" href="/song/${A}">Fixture song</a><a aria-label="Playbar: Artist for Fixture artist">Fixture artist</a><button aria-label="Playbar: Pause button">Pause</button><script>window.nativePlaybackClicks=0;document.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>nativePlaybackClicks++));</script></body></html>`;
(async()=>{
const modulePath=process.env.CATNAP_PLAYWRIGHT_MODULE;
const {chromium}=await import(modulePath?pathToFileURL(modulePath).href:'playwright');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'catnap-presentation-'));
const context=await chromium.launchPersistentContext(dir,{executablePath:process.env.CATNAP_CHROME||'/usr/bin/google-chrome',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
try{
 const cdp=await context.browser().newBrowserCDPSession();
 const {id}=await cdp.send('Extensions.loadUnpacked',{path:path.join(ROOT,'extension')});
 const worker=context.serviceWorkers().find(w=>w.url().endsWith('/broadcast-worker.js'))||await context.waitForEvent('serviceworker');
 await worker.evaluate(()=>chrome.storage.session.set({broadcastSourceTabId:987654,broadcastWindowId:987655}));
 await context.route('https://suno.com/**',route=>route.fulfill({contentType:'text/html',body:html}));
 const source=await context.newPage();await source.goto('https://suno.com/playlist/'+A);
 await source.locator('#catnap-theater-launch').click();
 await source.locator('.ct-popout-controls').waitFor();
 async function openPanel(page){
  const opened=context.waitForEvent('page');await page.locator('.ct-popout-controls').click();
  const panel=await opened;await panel.waitForLoadState();await panel.locator('#source').filter({hasText:'Linked Suno tab'}).waitFor();return panel;
 }
 let panel=await openPanel(source);
 await panel.locator('#layout').selectOption('lineup');
 await source.waitForFunction(()=>document.querySelector('#catnap-theater-root').dataset.layout==='lineup');
 await panel.locator('#font-up').evaluate(el=>{el.click();el.click();});await panel.waitForFunction(()=>document.querySelector('#font-value').textContent==='25 px');
 await panel.locator('#brand').fill('Popout test host');await panel.locator('#brand').press('Tab');
 await source.waitForFunction(()=>document.querySelector('.ct-brand-main').textContent==='Popout test host');
 await panel.locator('#visualizerEnabled').uncheck();
 await panel.waitForFunction(()=>document.getElementById('visualizerOpacity').disabled);
 await panel.locator('#visualizerEnabled').check();
 await panel.waitForFunction(()=>!document.getElementById('visualizerOpacity').disabled);
 await panel.locator('#visualizerOpacity').fill('35');
 await panel.locator('#visualizerOpacity').dispatchEvent('change');
 await panel.waitForFunction(()=>document.getElementById('visualizer-opacity-value').textContent==='35%');
 await panel.locator('#expiry').selectOption('0');
 await panel.getByRole('button',{name:'☕ Quick Break',exact:true}).click();
 await source.locator('.ct-visual-banner').filter({hasText:'QUICK BREAK'}).waitFor({state:'visible'});
 await panel.locator('#banner-text').fill('Fresh immediate banner');await panel.locator('#show-overlay').click();await source.waitForFunction(()=>document.querySelector('.ct-visual-banner').textContent==='Fresh immediate banner');
 await panel.locator('#clear-overlay').click();await source.locator('.ct-visual-banner').waitFor({state:'hidden'});
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lVEAAAAASUVORK5CYII=','base64');
 await panel.locator('#overlay-file').setInputFiles({name:'synthetic-reaction.png',mimeType:'image/png',buffer:png});
 await panel.locator('#status').filter({hasText:'Local file ready'}).waitFor();
 await panel.locator('#show-overlay').click();
 await source.waitForFunction(()=>{const img=document.querySelector('.ct-visual-layer img');return img&&!img.hidden&&img.naturalWidth===1;});
 const firstUrl=panel.url();
 await source.locator('.ct-popout-controls').click();
 await source.waitForTimeout(200);assert.equal(context.pages().filter(p=>p.url().includes('presentation-panel.html')).length,1);assert.equal(panel.url(),firstUrl);
 assert.equal(await source.getByRole('button',{name:'Theatre controls',exact:true}).count(),1);
 assert.equal(await source.getByRole('button',{name:'Smaller lyrics',exact:true}).count(),0);
 assert.equal(await source.getByRole('button',{name:'Auto-scroll',exact:true}).count(),0);
 assert.equal(await source.getByRole('button',{name:'Reload lyrics',exact:true}).count(),0);
 assert.equal(await source.getByRole('combobox').count(),0);
 assert.equal(await source.locator('.ct-visual-tools').isVisible(),false);
 assert.equal(await source.locator('.ct-standalone-tools').isVisible(),false);
 assert.equal(await source.locator('.ct-toggle').isVisible(),true);
 assert.equal(await source.locator('.ct-progress').isVisible(),true);
 await source.setViewportSize({width:1440,height:900});
 await source.screenshot({path:path.join(OUTPUT,'Theatre-Canvas-0.5.0.png'),fullPage:true});
 await panel.setViewportSize({width:440,height:800});await panel.screenshot({path:path.join(OUTPUT,'Presentation-Controls-0.5.0.png'),fullPage:true});
 await panel.close();panel=await openPanel(source);
 assert.equal(await panel.locator('#layout').inputValue(),'lineup');assert.equal(await panel.locator('#brand').inputValue(),'Popout test host');
 assert.match(await panel.locator('#recent').textContent(),/synthetic-reaction.png/);
 const second=await context.newPage();await second.goto('https://suno.com/playlist/22222222-2222-4222-8222-222222222222');await second.locator('#catnap-theater-launch').click();await second.locator('.ct-popout-controls').waitFor();
 const secondPanel=await openPanel(second);await secondPanel.locator('#layout').selectOption('art');
 await second.waitForFunction(()=>document.querySelector('#catnap-theater-root').dataset.layout==='art');
 assert.equal(await source.locator('#catnap-theater-root').getAttribute('data-layout'),'lineup');
 const untouched=await worker.evaluate(async()=>({stored:await chrome.storage.session.get(['broadcastSourceTabId','broadcastWindowId']),captures:await chrome.tabCapture.getCapturedTabs(),offscreen:await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']})}));
 assert.equal(untouched.stored.broadcastSourceTabId,987654);assert.equal(untouched.stored.broadcastWindowId,987655);assert.equal(untouched.captures.length,0);assert.equal(untouched.offscreen.length,0);
 assert.equal(await source.evaluate(()=>nativePlaybackClicks),0);assert.equal(await second.evaluate(()=>nativePlaybackClicks),0);
 console.log(JSON.stringify({version:SCRIPT_VERSION,extension:id,settings:'popout-only settings verified',mainOptionsHidden:true,reuse:true,reopenPersistence:true,localFileTransfer:true,overlay:true,pinnedSources:true,nativePlaybackClicks:0,captures:0,offscreenDocuments:0,broadcastBindingUntouched:true,screenshot:path.join(OUTPUT,'Presentation-Controls-0.5.0.png')}));
}finally{await context.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
