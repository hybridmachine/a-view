import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {WorldStore} from '../src/store.js';

test('HTTP and SSE withhold success headers until long catch-up finishes', {timeout:30_000}, async()=>{
  const directory=mkdtempSync(join(tmpdir(),'a-view-http-catchup-')),path=join(directory,'world.sqlite');
  const epoch=Date.now()-365*86_400_000;
  const store=new WorldStore(path,epoch);store.close();
  const child=spawn(process.execPath,['src/server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,A_VIEW_DB:path,PORT:'0'},stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr.on('data',data=>stderr+=data);
  try{
    const base=await new Promise((resolve,reject)=>{
      let output='';const timer=setTimeout(()=>reject(new Error(`Server startup timed out: ${stderr}`)),10_000);
      child.once('error',error=>{clearTimeout(timer);reject(error);});
      child.once('exit',code=>{clearTimeout(timer);reject(new Error(`Server exited ${code}: ${stderr}`));});
      child.stdout.on('data',data=>{output+=data;const match=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});
    });
    for(const endpoint of ['/api/world','/api/stream']){
      const response=await fetch(base+endpoint,{signal:AbortSignal.timeout(5000)});
      assert.equal(response.status,503,endpoint);
      assert.equal(response.headers.get('retry-after'),'2');
      assert.equal(await response.text(),'World is catching up');
    }
    let response;
    for(let i=0;i<20;i++){
      response=await fetch(base+'/api/world',{signal:AbortSignal.timeout(5000)});
      if(response.ok)break;
      assert.equal(response.status,503);await response.text();
    }
    assert.equal(response.status,200);
    const snapshot=await response.json();
    assert.equal(snapshot.world.epoch,epoch);
    assert.ok(snapshot.serverTime-(snapshot.world.environment.tickOrigin+snapshot.world.environment.tickIndex*10_000)<10_000);
  }finally{
    if(child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}
    rmSync(directory,{recursive:true,force:true});
  }
});
