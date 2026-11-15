#!/usr/bin/env node
/** SCRIPT_VERSION 0.6.0.
 * Platform smoke test for installer manifests and native byte framing.
 * All files stay under a disposable temporary directory; Windows uses the
 * explicit NoRegister path. No browser, OAuth or Suno network request is used.
 */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';

const SCRIPT_VERSION='0.6.0', run=promisify(execFile);
const PROJECT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const EXTENSION_ID='abcdefghijklmnopabcdefghijklmnop';
const sandbox=await mkdtemp(path.join(tmpdir(),'Catnap native smoke '));

async function health(launcher) {
  const data=Buffer.from('{"operation":"health"}'),header=Buffer.alloc(4);header.writeUInt32LE(data.length);
  const output=await new Promise((resolve,reject)=>{
    const child=spawn(launcher,[],{stdio:['pipe','pipe','pipe'],windowsHide:true});
    const chunks=[];let received=0,errors='';
    const timer=setTimeout(()=>{child.kill();reject(Error('Native health message timed out.'));},10000);
    child.stdout.on('data',chunk=>{received+=chunk.length;if(received>1024*1024){child.kill();reject(Error('Unexpectedly large health output.'));}else chunks.push(chunk);});
    child.stderr.on('data',chunk=>{errors=(errors+chunk.toString()).slice(0,1000);});
    child.on('error',error=>{clearTimeout(timer);reject(error);});
    child.on('close',code=>{
      clearTimeout(timer);
      if(code!==0 || received<4)reject(Error('Native health failed: '+JSON.stringify({exitCode:code,stdoutBytes:received,stderr:errors,platform:process.platform,node:process.versions.node})));
      else resolve(Buffer.concat(chunks));
    });
    child.stdin.end(Buffer.concat([header,data]));
  });
  assert.ok(output.length>=4,'Expected native binary frame');
  const size=output.readUInt32LE(0);assert.equal(size,output.length-4,'Only one framed health reply is allowed');
  const reply=JSON.parse(output.subarray(4).toString('utf8'));
  assert.deepEqual(reply,{ok:true,ready:true,version:SCRIPT_VERSION});
}

try {
  const env={...process.env};let manifests=[];
  if(process.platform==='win32') {
    env.LOCALAPPDATA=path.join(sandbox,'Local AppData');
    const powershell=path.join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
    await run(powershell,['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(PROJECT,'native','install-windows.ps1'),'-ExtensionId',EXTENSION_ID,'-Browser','all','-NoRegister'],{env,timeout:120000});
    manifests=[path.join(env.LOCALAPPDATA,'Catnap-Suno-MCP','com.catnap.suno_mcp.json')];
  } else if(process.platform==='darwin') {
    env.CATNAP_NATIVE_APPLICATION_SUPPORT=path.join(sandbox,'Application Support');
    await run('bash',[path.join(PROJECT,'native','install-macos.sh'),EXTENSION_ID,'all'],{env,timeout:30000});
    manifests=['Google/Chrome','BraveSoftware/Brave-Browser','Chromium'].map(browser=>path.join(env.CATNAP_NATIVE_APPLICATION_SUPPORT,browser,'NativeMessagingHosts','com.catnap.suno_mcp.json'));
  } else if(process.platform==='linux') {
    env.XDG_DATA_HOME=path.join(sandbox,'data');env.XDG_CONFIG_HOME=path.join(sandbox,'config');
    await run('bash',[path.join(PROJECT,'native','install-linux.sh'),EXTENSION_ID,'all'],{env,timeout:30000});
    manifests=['google-chrome','BraveSoftware/Brave-Browser','chromium'].map(browser=>path.join(env.XDG_CONFIG_HOME,browser,'NativeMessagingHosts','com.catnap.suno_mcp.json'));
  } else throw Error('Unsupported smoke-test platform: '+process.platform);
  const launchers=new Set();
  for(const filename of manifests) {
    const manifest=JSON.parse(await readFile(filename,'utf8'));
    assert.equal(manifest.name,'com.catnap.suno_mcp');assert.equal(manifest.type,'stdio');
    assert.deepEqual(manifest.allowed_origins,['chrome-extension://'+EXTENSION_ID+'/']);
    assert.ok(path.isAbsolute(manifest.path));
    const relative=path.relative(sandbox,manifest.path);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),'Launcher must remain inside disposable test directory');
    launchers.add(manifest.path);
  }
  for(const launcher of launchers)await health(launcher);
  console.log(JSON.stringify({test:'catnap-native-platform',version:SCRIPT_VERSION,platform:process.platform,node:process.versions.node,manifests:manifests.length,framedHealth:'passed',realBrowserRegistration:false,providerRequests:0}));
} finally { await rm(sandbox,{recursive:true,force:true}); }
