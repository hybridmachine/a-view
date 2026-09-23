import {mkdir,writeFile} from 'node:fs/promises';
import {WorldStore} from '../src/store.js';
import {identityOf} from '../shared/field-notes.js';

const epoch=1_800_000_000_000,results=[];
for(const days of [30,365]){
  const store=new WorldStore(':memory:',epoch);
  try{
    const first=store.snapshot(epoch);let last;
    for(;;){try{last=store.snapshot(epoch+days*86_400_000);break;}catch(e){if(e.code!=='WORLD_CATCHING_UP')throw e;}}
    const interval={identity:identityOf(last.notes),after:first.notes.head,through:last.notes.head};
    const stateBefore=store.db.prepare('SELECT state FROM world').get().state;
    const samples=[];let summary;
    for(let i=0;i<100;i++){const start=performance.now();summary=store.notes(interval);samples.push(performance.now()-start);}
    samples.sort((a,b)=>a-b);
    const result={realDays:days,eventCount:store.db.prepare('SELECT count(*) n FROM events').get().n,
      visibleCount:store.db.prepare('SELECT count(*) n FROM events WHERE noteVisible=1').get().n,
      medianMs:samples[50],p95Ms:samples[95],responseBytes:Buffer.byteLength(JSON.stringify(summary)),
      facts:summary.facts.map(f=>f.kind),coverage:summary.coverage,
      stateUnchanged:stateBefore===store.db.prepare('SELECT state FROM world').get().state,
      selectionPlan:store.db.prepare('EXPLAIN QUERY PLAN SELECT * FROM events INDEXED BY notes_by_type WHERE noteVisible=1 AND type=? AND seq>? AND seq<=? ORDER BY seq DESC LIMIT 1')
        .all('cottage.light',interval.after.seq,interval.through.seq).map(row=>row.detail)};
    results.push(result);console.log(JSON.stringify(result));
    if(!result.stateUnchanged||result.coverage!=='complete'||result.responseBytes>2048)process.exitCode=1;
  }finally{store.close();}
}
const directory=process.env.NOTES_VALIDATION_DIR||'docs/field-notes-validation';
await mkdir(directory,{recursive:true});await writeFile(`${directory}/history-results.json`,JSON.stringify({node:process.version,results},null,2)+'\n');
