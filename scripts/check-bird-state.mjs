import {mkdir,writeFile} from 'node:fs/promises';
import {WorldStore} from '../src/store.js';
const epoch=1_800_000_000_000,results=[];
for(const days of [1,30,365]){
  const store=new WorldStore(':memory:',epoch),at=epoch+days*86_400_000,start=performance.now();
  let yields=0,snapshot;
  try{
    for(;;){try{snapshot=store.snapshot(at);break;}catch(error){if(error.code!=='WORLD_CATCHING_UP')throw error;yields++;}}
    const elapsedMs=performance.now()-start,events=store.db.prepare('SELECT type,count(*) count FROM events GROUP BY type').all();
    const actions=store.db.prepare("SELECT payload FROM events WHERE type='bird.action-started'").all().map(e=>JSON.parse(e.payload));
    const activeMs=actions.reduce((sum,a)=>sum+a.end-a.start,0);
    const result={realDays:days,elapsedMs,yields,birdStateBytes:Buffer.byteLength(JSON.stringify(snapshot.world.bird)),
      eventCount:events.reduce((n,e)=>n+e.count,0),events,activeFraction:activeMs/(days*86_400_000),
      calls:actions.filter(a=>a.kind==='call').length,roofVisits:actions.filter(a=>a.to==='roof-perch'&&a.kind==='flight').length};
    results.push(result);console.log(`${days} real days: ${Math.round(elapsedMs)} ms, ${yields} yields, ${result.eventCount} events, ${(result.activeFraction*100).toFixed(2)}% active`);
  }finally{store.close();}
}
await mkdir('docs/bird-validation',{recursive:true});
await writeFile('docs/bird-validation/catchup-results.json',JSON.stringify({node:process.version,epoch,results},null,2)+'\n');
