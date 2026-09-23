import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {WorldStore} from '../src/store.js';
import {createCottageState,cottageIntent,sampleCottage,completeCottage,smokePuffs,validCottageState} from '../shared/cottage.js';
import {WorldClient} from '../public/world-client.js';
import {calendar} from '../shared/world.js';
const epoch=1_800_000_000_000;

test('cottage catch-up matches arbitrary reads, including all causal event order',()=>{
  const regular=new WorldStore(':memory:',epoch),catchup=new WorldStore(':memory:',epoch);
  try{
    for(let t=719;t<3600_000;t+=4193)regular.advance(epoch+t);
    const end=epoch+3*86400_000,a=regular.snapshot(end),b=catchup.snapshot(end);
    assert.deepEqual({...a,notes:{...a.notes,id:b.notes.id}},b);
    const events=regular.db.prepare('SELECT * FROM events ORDER BY seq').all();
    assert.deepEqual(events,catchup.db.prepare('SELECT * FROM events ORDER BY seq').all());
    assert.ok(events.some(event=>event.type==='cottage.casement'));
    assert.ok(events.some(event=>event.type==='cottage.hearth'));
    assert.ok(events.some(event=>event.type==='cottage.light'));
    for(let i=1;i<events.length;i++)assert.ok(events[i].at>=events[i-1].at);
    for(const event of events.filter(event=>event.type.startsWith('cottage.'))){
      const payload=JSON.parse(event.payload);assert.ok(payload.end>payload.start);assert.equal(payload.end,event.at);
    }
  }finally{regular.close();catchup.close();}
});

test('bad weather closes a casement, hysteresis avoids toggling, and dwell delays reopening',()=>{
  const state=createCottageState(epoch,epoch),at=epoch+600_000;
  const c={...calendar(epoch,at),hour:14,light:1,sunrise:6,sunset:20};
  state.rooms={main:false,second:false};state.casement=1;
  assert.equal(cottageIntent(state,epoch,at,{calendar:c,weather:{rain:.3,wind:.3}}).target,0);
  assert.equal(cottageIntent(state,epoch,at,{calendar:c,weather:{rain:0,wind:.5}}).target,0);
  assert.equal(cottageIntent(state,epoch,at,{calendar:c,weather:{rain:.08,wind:.3}}),null);
  state.casement=0;state.lastCasementAt=at;
  assert.equal(cottageIntent(state,epoch,at+30_000,{calendar:c,weather:{rain:0,wind:.3}}),null);
  assert.equal(cottageIntent(state,epoch,at+180_000,{calendar:c,weather:{rain:0,wind:.3}}).target,1);
});

test('invalid cottage timing and effects are rejected before sampling',()=>{
  const state=createCottageState(epoch,epoch);
  for(const bad of [{...state,nextDecisionAt:epoch},{...state,nextDecisionAt:epoch+1},
    {...state,hearth:{on:true,since:NaN,lastBurn:null}},
    {...state,pending:{start:epoch,end:epoch+1000,kind:'unknown'}},
    {...state,lastLightAt:null}]){
    assert.equal(validCottageState(bad),false);assert.equal(sampleCottage(bad,epoch),null);assert.deepEqual(smokePuffs(bad,epoch,epoch),[]);
  }
});

test('casement motion is sampled within its committed action; reduced motion uses settled state',()=>{
  const state=createCottageState(epoch,epoch);
  state.pending={id:'test',actor:state.residentId,kind:'casement',room:'main',target:1,from:0,start:epoch,motionStart:epoch+8000,end:epoch+12000};
  assert.equal(sampleCottage(state,epoch+7000).open,0);
  assert.ok(Math.abs(sampleCottage(state,epoch+10000).open-.5)<.001);
  assert.equal(sampleCottage(state,epoch+10000,{reducedMotion:true}).open,0);
  const completed=completeCottage(state,epoch,epoch+12000);
  assert.equal(sampleCottage(completed.state,epoch+12000,{reducedMotion:true}).open,1);
  assert.equal(state.casement,0);
});

test('bird delivery wins a simultaneous completion tie, and the client waits for both effects',async()=>{
  const store=new WorldStore(':memory:',epoch);
  try{
    const first=store.snapshot(epoch),end=first.world.action.end,state=first.world;
    state.cottage.pending={id:'cottage-tie',actor:state.cottage.residentId,kind:'light',room:'main',target:true,from:0,start:epoch,motionStart:end-1000,end};
    state.cottage.routineCounter=1;
    store.db.prepare('UPDATE world SET state=?').run(JSON.stringify(state));
    let elapsed=0;const client=new WorldClient({clock:()=>elapsed,request:async()=>store.snapshot(epoch+elapsed)});
    client.accept(store.snapshot(epoch));elapsed=end-epoch;
    assert.equal(client.now(),end-1);assert.equal(client.needsRefresh(),true);
    await client.refresh();assert.equal(client.snapshot.world.nest.materials,4);assert.equal(client.snapshot.world.cottage.rooms.main,true);
    const events=store.db.prepare('SELECT type FROM events WHERE at=? ORDER BY seq').all(end);
    assert.deepEqual(events.map(event=>event.type),['nest.material-delivered','cottage.light']);
  }finally{store.close();}
});

test('client rejects malformed, past, or regressing aggregate action boundaries',()=>{
  const store=new WorldStore(':memory:',epoch);
  try{
    let elapsed=0;const client=new WorldClient({clock:()=>elapsed}),snapshot=store.snapshot(epoch);
    assert.equal(client.accept(snapshot),true);elapsed=1000;client.now();
    for(const nextCommitAt of [NaN,epoch,epoch+500,null,epoch+100_000]){
      assert.equal(client.accept({...snapshot,serverTime:epoch+10,nextCommitAt}),false);
    }
    assert.equal(client.accept({...snapshot,serverTime:epoch+10,world:{...snapshot.world,cottage:{...snapshot.world.cottage,nextDecisionAt:NaN}}}),false);
    assert.equal(client.snapshot,snapshot);
  }finally{store.close();}
});

test('smoke emission starts with the hearth and disperses after extinction',()=>{
  const state=createCottageState(epoch,epoch);
  assert.deepEqual(smokePuffs(state,epoch,epoch+30_000),[]);
  state.hearth={on:true,since:epoch,lastBurn:null};
  const puffs=smokePuffs(state,epoch,epoch+30_000);assert.ok(puffs.length>0&&puffs.length<=16);
  assert.deepEqual(smokePuffs(state,epoch,epoch+30_000),puffs);
  state.hearth={on:false,since:epoch+32_000,lastBurn:{start:epoch,end:epoch+32_000}};
  assert.ok(smokePuffs(state,epoch,epoch+40_000).length>0);
  assert.deepEqual(smokePuffs(state,epoch,epoch+100_000),[]);
});

test('v2 migration and restart preserve environmental history and pending cottage actions',()=>{
  const directory=mkdtempSync(join(tmpdir(),'a-view-cottage-')),file=join(directory,'world.sqlite');
  try{
    const seed=new WorldStore(':memory:',epoch),old=seed.snapshot(epoch+28_000);seed.close();
    const db=new DatabaseSync(file),state={...old.world,version:2};delete state.cottage;
    db.exec(`CREATE TABLE world (id TEXT PRIMARY KEY, state TEXT NOT NULL);
      CREATE TABLE events (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, at INTEGER NOT NULL, type TEXT NOT NULL, text TEXT NOT NULL);`);
    db.prepare('INSERT INTO world VALUES (?,?)').run('stillwater',JSON.stringify(state));
    for(const event of old.events)db.prepare('INSERT INTO events(seq,id,at,type,text) VALUES (?,?,?,?,?)').run(event.seq,event.id,event.at,event.type,event.text);
    assert.deepEqual(db.prepare('PRAGMA table_info(events)').all().map(column=>column.name),['seq','id','at','type','text']);db.close();
    let store=new WorldStore(file,epoch+60_000);const migrated=store.snapshot(epoch+60_000);
    assert.deepEqual(store.db.prepare('PRAGMA table_info(events)').all().map(column=>column.name),['seq','id','at','type','text','payload','noteVisible']);
    for(const event of old.events){
      const saved=store.db.prepare('SELECT * FROM events WHERE id=?').get(event.id);
      assert.equal(saved.seq,event.seq);assert.equal(saved.text,event.text);assert.equal(saved.payload,null);assert.equal(saved.noteVisible,1);
    }
    assert.equal(migrated.world.cottage.introducedAt,epoch+60_000);assert.equal(migrated.world.epoch,epoch);assert.deepEqual(migrated.world.nest,old.world.nest);
    assert.equal(migrated.world.environment.introducedAt,old.world.environment.introducedAt);
    let current=migrated;
    while(!current.world.cottage.pending)current=store.snapshot(current.world.cottage.nextDecisionAt);
    store.close();store=new WorldStore(file,current.serverTime+1);
    assert.deepEqual(store.snapshot(current.serverTime),current);
    const end=current.world.cottage.pending.end,completed=store.snapshot(end);assert.deepEqual(store.snapshot(end),completed);store.close();
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('routine history cannot push meaningful notes out of the bounded note query',()=>{
  const store=new WorldStore(':memory:',epoch);
  try{
    const initial=store.snapshot(epoch);
    for(let i=0;i<50;i++)store.db.prepare('INSERT INTO events(id,at,type,text,noteVisible) VALUES (?,?,?,?,0)').run(`hidden-${i}`,epoch,'cottage.light','Routine');
    assert.deepEqual(store.snapshot(epoch).events,initial.events);
    const start=performance.now(),final=store.snapshot(epoch+30*86400_000);
    assert.ok(validCottageState(final.world.cottage));assert.ok(final.events.length<=20);assert.ok(JSON.stringify(final.world.cottage).length<1800);
    console.log(`30-day joint catch-up: ${Math.round(performance.now()-start)} ms; ${store.db.prepare('SELECT count(*) n FROM events').get().n} events`);
  }finally{store.close();}
});
