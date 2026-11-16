'use strict';
/* Development package acceptance, version 0.8.2.
 * Uses only a temporary synthetic source checkout. Never installs any flavor.
 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync,execFileSync} = require('node:child_process');
const SOURCE = path.resolve(__dirname,'..');

function sandbox(t) {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'catnap-package-test-'));
  t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const root=path.join(temp,'project'),output=path.join(temp,'packages');
  fs.mkdirSync(path.join(root,'scripts'),{recursive:true});
  fs.copyFileSync(path.join(SOURCE,'scripts/build-dev.sh'),path.join(root,'scripts/build-dev.sh'));
  fs.cpSync(path.join(SOURCE,'extension'),path.join(root,'extension'),{recursive:true});
  fs.cpSync(path.join(SOURCE,'native'),path.join(root,'native'),{recursive:true});
  fs.cpSync(path.join(SOURCE,'packaging'),path.join(root,'packaging'),{recursive:true});
  fs.mkdirSync(path.join(root,'docs'));
  fs.writeFileSync(path.join(root,'docs/ACCEPTANCE.md'),'# Synthetic acceptance notes\n');
  fs.writeFileSync(path.join(root,'docs/BROADCAST-PILOT.md'),'# Synthetic broadcast guide\n');
  fs.writeFileSync(path.join(root,'docs/RADIO.md'),'# Synthetic current Radio guide\n');
  fs.writeFileSync(path.join(root,'docs/private-event.csv'),'private fixture excluded\n');
  for(const name of ['README.md','CHANGELOG.md','LICENSE','NOTICE','LICENSING.md'])fs.copyFileSync(path.join(SOURCE,name),path.join(root,name));
  // Fix the fixture's manifest version independently of whatever shared branch
  // metadata is being edited concurrently. No real source file is changed.
  for(const relative of ['extension/manifest.json','packaging/inbox/manifest.json','packaging/radio/manifest.json']) {
    const manifestPath=path.join(root,relative),manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));manifest.version='0.8.2';
    fs.writeFileSync(manifestPath,JSON.stringify(manifest));
  }
  fs.writeFileSync(path.join(root,'extension/connection.local.json'),'PRIVATE-FIXTURE-TOKEN');
  fs.writeFileSync(path.join(root,'.env'),'PRIVATE-FIXTURE-TOKEN');
  const build=(...args)=>spawnSync('bash',[path.join(root,'scripts/build-dev.sh'),'--output',output,...args],{encoding:'utf8'});
  return {root,output,build};
}

test('both flavors produce root-manifest folders/ZIPs with licensing and matching SHA-256 files',t=>{
  const f=sandbox(t),built=f.build();assert.equal(built.status,0,built.stderr);
  for(const name of ['Catnap-Theatre-Inbox-Dev-v0.8.2','Catnap-Inbox-Dev-v0.8.2']) {
    const folder=path.join(f.output,name),archive=path.join(f.output,name+'.zip');
    const manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8'));
    assert.equal(manifest.version,'0.8.2');assert.equal(manifest.manifest_version,3);
    const members=execFileSync('unzip',['-Z1',archive],{encoding:'utf8'}).split('\n').filter(Boolean);
    for(const file of ['manifest.json','LICENSE','NOTICE','LICENSING.md','PACKAGE-README.md','native/README.md','native/catnap-suno-host.mjs','native/install-linux.sh','native/install-windows.cmd','native/install-windows.ps1','native/CatnapSunoLauncher.cs','native/install-macos.sh','docs/ACCEPTANCE.md'])assert.equal(members.includes(file),true,file);
    assert.equal(members.some(file=>file.startsWith('extension/')),false);
    assert.equal(members.some(file=>file.includes('connection.local')||file.endsWith('.env')||file.endsWith('.csv')),false);
    const digest=crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
    assert.equal(fs.readFileSync(archive+'.sha256','utf8').trim().startsWith(digest+' '),true);
    assert.equal(fs.existsSync(path.join(folder,'connection.local.json')),false);
  }
  const inbox=path.join(f.output,'Catnap-Inbox-Dev-v0.8.2');
  const manifest=JSON.parse(fs.readFileSync(path.join(inbox,'manifest.json'),'utf8'));
  assert.equal(manifest.background.service_worker,'inbox-worker.js');
  assert.equal('content_scripts' in manifest,false);
  assert.equal(manifest.permissions.includes('tabCapture'),false);assert.equal(manifest.permissions.includes('offscreen'),false);
  assert.equal(manifest.permissions.includes('activeTab'),false);
  assert.equal(fs.existsSync(path.join(inbox,'content.js')),false);
  assert.equal(fs.existsSync(path.join(inbox,'managed-media.js')),false);
  assert.equal(fs.existsSync(path.join(inbox,'broadcast-worker.js')),false);
  assert.equal(fs.existsSync(path.join(inbox,'assets/icons/inbox-128.png')),true);
  assert.notDeepEqual(fs.readFileSync(path.join(inbox,'assets/icons/inbox-128.png')),fs.readFileSync(path.join(f.output,'Catnap-Theatre-Inbox-Dev-v0.8.2/assets/icons/theatre-128.png')));
  assert.equal(fs.existsSync(path.join(f.output,'Catnap-Theatre-Inbox-Dev-v0.8.2/managed-show.js')),true);
  assert.match(fs.readFileSync(path.join(inbox,'package-mode.js'),'utf8'),/inboxOnly:true/);
  assert.match(fs.readFileSync(path.join(f.output,'Catnap-Theatre-Inbox-Dev-v0.8.2/package-mode.js'),'utf8'),/inboxOnly:false/);
  assert.equal(fs.existsSync(path.join(f.output,'Catnap-Radio-Dev-v0.8.2')),false,'both keeps its original Theatre + Inbox meaning');
});

test('all adds a separately pinned Radio package with an exact minimal file and permission inventory',t=>{
  const f=sandbox(t),built=f.build('--flavor','all');assert.equal(built.status,0,built.stderr);
  const folder=path.join(f.output,'Catnap-Radio-Dev-v0.8.2'),archive=folder+'.zip';
  const manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8'));
  assert.equal(manifest.version,'0.8.2');assert.equal(manifest.background.service_worker,'broadcast-worker.js');
  assert.deepEqual(manifest.permissions,['storage','activeTab','tabCapture','offscreen']);
  assert.deepEqual(manifest.optional_host_permissions,['http://*/*','https://*/*']);
  assert.equal('host_permissions' in manifest,false);assert.equal('web_accessible_resources' in manifest,false);
  assert.equal(manifest.options_page,'broadcast.html');
  assert.deepEqual(manifest.content_scripts.flatMap(script=>script.matches),['https://suno.com/*','https://www.suno.com/*','https://party.aiu.fm/party','https://party.aiu.fm/party/*']);
  assert.equal(manifest.content_scripts.every(script=>script.all_frames===false),true);
  const publicDer=Buffer.from(manifest.key,'base64');assert.doesNotThrow(()=>crypto.createPublicKey({key:publicDer,type:'spki',format:'der'}));
  for(const relative of ['extension/manifest.json','packaging/inbox/manifest.json'])assert.notEqual(manifest.key,JSON.parse(fs.readFileSync(path.join(f.root,relative),'utf8')).key);
  const expected=[
    'manifest.json','package-mode.js','PACKAGE-README.md','LICENSE','NOTICE','LICENSING.md','docs/BROADCAST-PILOT.md','docs/RADIO.md',
    'broadcast-source.js','broadcast-core.js','broadcast-metadata-core.js','broadcast-metadata.js','broadcast-worker.js',
    'broadcast-panel.js','broadcast-offscreen.js','broadcast.html','broadcast.css','broadcast-offscreen.html','radio-tab.js','visualizer.js',
    ...[16,32,48,128].map(size=>'assets/icons/radio-'+size+'.png')
  ];
  const members=execFileSync('unzip',['-Z1',archive],{encoding:'utf8'}).split('\n').filter(name=>name&&!name.endsWith('/'));
  assert.deepEqual(members.sort(),expected.sort(),'no Inbox, helper, Theatre, event data or extra docs enter Radio');
  assert.match(fs.readFileSync(path.join(folder,'package-mode.js'),'utf8'),/radioOnly:true/);
  assert.match(fs.readFileSync(path.join(folder,'PACKAGE-README.md'),'utf8'),/does not need Node\.js, Suno MCP or an LLM/);
  for(const size of [16,32,48,128]){
    const png=fs.readFileSync(path.join(folder,'assets/icons/radio-'+size+'.png'));
    assert.equal(png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),true);
    assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);
  }
  const icon=fs.readFileSync(path.join(folder,'assets/icons/radio-128.png'));
  for(const other of ['Catnap-Inbox-Dev-v0.8.2/assets/icons/inbox-128.png','Catnap-Theatre-Inbox-Dev-v0.8.2/assets/icons/theatre-128.png'])assert.notDeepEqual(icon,fs.readFileSync(path.join(f.output,other)));
  const digest=crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
  assert.equal(fs.readFileSync(archive+'.sha256','utf8').trim().startsWith(digest+' '),true);
});

test('radio can build without an inbox engine, native companion, Theatre or shared project docs',t=>{
  const f=sandbox(t);
  for(const relative of ['native','packaging/inbox','extension/show.html','extension/show-worker.js','extension/content.js','extension/inbox-core.js','README.md','CHANGELOG.md','docs/ACCEPTANCE.md'])fs.rmSync(path.join(f.root,relative),{recursive:true,force:true});
  const built=f.build('--flavor','radio');assert.equal(built.status,0,built.stderr);
  assert.deepEqual(fs.readdirSync(f.output).sort(),['Catnap-Radio-Dev-v0.8.2','Catnap-Radio-Dev-v0.8.2.zip','Catnap-Radio-Dev-v0.8.2.zip.sha256']);
});

test('radio validates its source entry points and refuses overwrite without altering package mode',t=>{
  const f=sandbox(t),original=fs.readFileSync(path.join(f.root,'extension/package-mode.js'),'utf8');
  assert.equal(f.build('--flavor','radio').status,0);
  assert.match(f.build('--flavor','radio').stderr,/already exists/);
  assert.equal(fs.readFileSync(path.join(f.root,'extension/package-mode.js'),'utf8'),original);
  fs.rmSync(f.output,{recursive:true,force:true});
  const manifestPath=path.join(f.root,'packaging/radio/manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  manifest.content_scripts[0].js.push('../outside.js');fs.writeFileSync(manifestPath,JSON.stringify(manifest));
  const built=f.build('--flavor','radio');assert.notEqual(built.status,0);assert.match(built.stderr,/Missing\/invalid manifest resource/);
  assert.equal(fs.existsSync(path.join(f.output,'Catnap-Radio-Dev-v0.8.2.zip')),false);
});

test('builder refuses to overwrite an existing package and does not alter source configuration',t=>{
  const f=sandbox(t);
  const original=fs.readFileSync(path.join(f.root,'extension/package-mode.js'),'utf8');
  assert.equal(f.build('--flavor','inbox').status,0);
  const result=f.build('--flavor','inbox');assert.notEqual(result.status,0);assert.match(result.stderr,/already exists/);
  assert.equal(fs.readFileSync(path.join(f.root,'extension/package-mode.js'),'utf8'),original);
  assert.equal(fs.existsSync(path.join(f.output,'Catnap-Inbox-Dev-v0.8.2/manifest.json')),true);
});

test('builder rejects an invalid manifest reference and never releases a broken archive',t=>{
  const f=sandbox(t),manifestPath=path.join(f.root,'packaging/inbox/manifest.json');
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  manifest.options_page='missing-controls.html';fs.writeFileSync(manifestPath,JSON.stringify(manifest));
  const built=f.build('--flavor','inbox');assert.notEqual(built.status,0);assert.match(built.stderr,/Missing\/invalid manifest resource/);
  assert.equal(fs.existsSync(path.join(f.output,'Catnap-Inbox-Dev-v0.8.2.zip')),false);
});
