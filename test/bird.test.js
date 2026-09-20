import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WorldStore} from '../src/store.js';
import {WorldClient} from '../public/world-client.js';
import {sceneText} from '../public/scene-description.js';
import {calendar,birdPose,hash} from '../shared/world.js';
import {createBirdState,validBirdState,decideBird,completeBird,sampleBird,birdFixture} from '../shared/bird.js';
import {LAKESIDE_BIRD,validBirdArt} from '../shared/lakeside-bird.js';
const epoch=1_800_000_000_000;
const fair={calendar:{hour:12,sunrise:6,sunset:20,day:135},weather:{rain:0,wind:.2}};

test('authored routes have exact continuous endpoints, bounded scale, and valid art',()=>{
  assert.ok(validBirdArt(LAKESIDE_BIRD));assert.equal(validBirdArt({...LAKESIDE_BIRD,version:99}),false);
  for(const [name,duration]of [['Oak flight',4000],['Shelter flight',6000],['Roof flight',9000]]){
    const {state}=birdFixture(name);assert.ok(validBirdState(state));
    const from=LAKESIDE_BIRD.locations[state.pending.from],to=LAKESIDE_BIRD.locations[state.pending.to];
    for(let at=0;at<=duration;at+=10){
      const pose=sampleBird(state,null,at);assert.ok(Number.isFinite(pose.x)&&Number.isFinite(pose.y));assert.ok(pose.scale>=.76&&pose.scale<=1);
    }
    const start=sampleBird(state,null,0),end=sampleBird(state,null,duration);
    assert.deepEqual([start.x*1672,start.y*941],from.point);
    assert.ok(Math.abs(end.x*1672-to.point[0])<1e-8);assert.ok(Math.abs(end.y*941-to.point[1])<1e-8);
    assert.equal(sampleBird(state,null,duration/2,{reducedMotion:true}).flying,false);
  }
});

test('construction owns the bird until the final committed delivery',()=>{
  const store=new WorldStore(':memory:',epoch);
  try{
    let s=store.snapshot(epoch);
    while(s.world.action){
      const action=s.world.action,mid=(action.start+action.end)/2;
      const sampled=sampleBird(s.world.bird,action,mid),legacy=birdPose(action,mid);
      assert.equal(sampled.x,legacy.x);assert.equal(sampled.y,legacy.y);assert.equal(s.world.bird.pending,null);
      s=store.snapshot(action.end);
    }
    assert.equal(s.world.nest.materials,12);
    s=store.snapshot(s.world.bird.nextDecisionAt);
    assert.equal(s.world.bird.mode,'routine');assert.equal(s.world.bird.pending.from,'nest');
    const flight=s.world.bird.pending,before=sampleBird(s.world.bird,null,flight.end-1),after=store.snapshot(flight.end);
    assert.equal(after.world.bird.locationId,'oak-perch');assert.equal(after.world.nest.materials,12);
    assert.ok(Math.abs(before.x-sampleBird(after.world.bird,null,flight.end).x)<1e-6);
  }finally{store.close();}
});

test('rain waits for an accepted flight, then shelters without teleporting or overriding its action',()=>{
  let state=createBirdState(epoch,false);
  let result=decideBird(state,epoch,state.nextDecisionAt,{conditions:fair});state=result.state;
  const flight=state.pending,bad={...fair,weather:{rain:.8,wind:.8}};
  state=completeBird(state,epoch,flight.end).state;
  result=decideBird(state,epoch,state.nextDecisionAt,{conditions:bad});state=result.state;
  assert.equal(state.locationId,'oak-perch');assert.equal(state.pending.to,'oak-shelter');
  state=completeBird(state,epoch,state.pending.end).state;assert.equal(state.locationId,'oak-shelter');
  for(let i=0;i<3;i++)state=decideBird(state,epoch,state.nextDecisionAt,{conditions:fair}).state;
  assert.equal(state.pending,null,'minimum rest survives brief fair weather');
  state.restUntil=state.nextDecisionAt;
  state=decideBird(state,epoch,state.nextDecisionAt,{conditions:fair}).state;
  assert.equal(state.pending.from,'oak-shelter');assert.equal(state.pending.to,'oak-perch');
});

test('bird state rejects malformed routes, timing, unsupported rules, and two owners',()=>{
  const state=birdFixture('Roof flight').state;
  for(const change of [{rulesVersion:99},{nextDecisionAt:1},{locationId:'lake'},
    {pending:{...state.pending,routeId:'missing'}},{pending:{...state.pending,end:NaN}},
    {pending:{...state.pending,from:'nest'}},{mode:'construction'}]){
    const invalid={...state,...change};assert.equal(validBirdState(invalid),false);assert.equal(sampleBird(invalid,null,100),null);
  }
});

test('roof opportunities are considered once per absolute day, including skipped weather',()=>{
  const day=Array.from({length:365},(_,i)=>i+135).find(day=>hash(day+613)<1/3);
  let state=createBirdState(epoch,false);state.locationId='oak-perch';state.fairSince=epoch;state.restUntil=epoch;
  const conditions={...fair,calendar:{...fair.calendar,day,hour:18},weather:{rain:.08,wind:.36}};
  state=decideBird(state,epoch,state.nextDecisionAt,{conditions}).state;
  assert.equal(state.roofConsideredDay,day);assert.notEqual(state.pending?.to,'roof-perch');
  // A skipped opportunity cannot be rerolled by another request on the same day.
  state.pending=null;state.fairSince=epoch;
  for(let i=0;i<4;i++){
    state=decideBird(state,epoch,state.nextDecisionAt,{conditions:{...conditions,weather:fair.weather}}).state;
    assert.notEqual(state.pending?.to,'roof-perch');
    state.pending=null;
  }
  state.roofConsideredDay=null;state.fairSince=epoch;state.restUntil=epoch;
  state=decideBird(state,epoch,state.nextDecisionAt,{conditions:{...conditions,weather:fair.weather}}).state;
  assert.equal(state.pending.to,'roof-perch');
});

test('an unfinished rest does not consume the daily roof opportunity',()=>{
  const day=Array.from({length:365},(_,i)=>i+135).find(day=>hash(day+613)<1/3);
  let state=createBirdState(epoch,false);state.locationId='oak-perch';state.fairSince=epoch;state.restUntil=epoch+90_000;
  const conditions={...fair,calendar:{...fair.calendar,day,hour:18}};
  for(let i=0;i<2;i++){
    state=decideBird(state,epoch,state.nextDecisionAt,{conditions}).state;
    assert.equal(state.roofConsideredDay,null);assert.equal(state.pending,null);
  }
  state=decideBird(state,epoch,state.nextDecisionAt,{conditions}).state;
  assert.equal(state.roofConsideredDay,day);assert.equal(state.pending.to,'roof-perch');
});

test('a month has long quiet intervals, at most one roof outing per day, and bounded facts',()=>{
  const store=new WorldStore(':memory:',epoch);
  try{
    const final=store.snapshot(epoch+30*86400_000),events=store.db.prepare("SELECT * FROM events WHERE type='bird.action-started'").all();
    const roofs=events.filter(e=>JSON.parse(e.payload).to==='roof-perch'),days=roofs.map(e=>calendar(epoch,e.at).day);
    assert.ok(roofs.length>0);assert.equal(new Set(days).size,days.length);
    const calls=events.filter(e=>JSON.parse(e.payload).kind==='call');assert.ok(calls.length>0);
    for(let i=1;i<calls.length;i++)assert.ok(calls[i].at-calls[i-1].at>=300_000);
    let activeMs=0;for(const event of events){const action=JSON.parse(event.payload);activeMs+=action.end-action.start;}
    assert.ok(activeMs/(30*86400_000)<.02,'visible actions occupy under 2% of elapsed time');
    assert.equal(final.world.bird.familiarity.returns.length,3);assert.ok(JSON.stringify(final.world.bird).length<2000);
    assert.equal(final.world.nest.materials,12);
  }finally{store.close();}
});

test('regular execution, arbitrary reads, and catch-up produce the same complete bird history',()=>{
  const regular=new WorldStore(':memory:',epoch),catchup=new WorldStore(':memory:',epoch);
  try{
    for(let t=391;t<86400_000;t+=13_731)regular.advance(epoch+t);
    const end=epoch+3*86400_000;
    assert.deepEqual(regular.snapshot(end),catchup.snapshot(end));
    const events=regular.db.prepare('SELECT * FROM events ORDER BY seq').all();
    assert.deepEqual(events,catchup.db.prepare('SELECT * FROM events ORDER BY seq').all());
    const call=events.find(e=>e.type==='bird.action-started'&&JSON.parse(e.payload).kind==='call');assert.ok(call);
    const phrase=JSON.parse(call.payload);assert.equal(phrase.phrase,'oak-phrase-1');assert.equal(phrase.phraseStart,phrase.start+5000);
    const notes=events.filter(e=>e.type.startsWith('bird.')&&e.noteVisible);
    assert.ok(notes.length<=2);assert.ok(notes.some(e=>e.type==='bird.habit-noticed'));
    const habit=JSON.parse(notes.find(e=>e.type==='bird.habit-noticed').payload);
    assert.equal(new Set(habit.returns.map(r=>r.day)).size,3);
    for(const fact of habit.returns)assert.ok(events.some(e=>e.id===fact.id&&JSON.parse(e.payload).to==='oak-perch'));
    for(let i=1;i<events.length;i++)assert.ok(events[i].at>=events[i-1].at);
  }finally{regular.close();catchup.close();}
});

test('v3 upgrade preserves active, future, final, and historical deliveries without backfilled habits',()=>{
  for(const kind of ['active','future','final','built','stale']){
    const directory=mkdtempSync(join(tmpdir(),'a-view-bird-')),file=join(directory,'world.sqlite');
    try{
      let store=new WorldStore(file,epoch),snapshot=store.snapshot(epoch);
      if(['final','built','stale'].includes(kind)){
        while(snapshot.world.nest.materials<11)snapshot=store.snapshot(snapshot.world.action.end);
        if(kind==='built')snapshot=store.snapshot(snapshot.world.action.end);
      }
      const upgradeAt=kind==='active'?snapshot.world.action.start+5000:kind==='future'?snapshot.serverTime+1000:kind==='stale'?epoch+86400_000:snapshot.serverTime;
      const old={...snapshot.world,version:3};delete old.bird;
      store.db.prepare('UPDATE world SET state=?').run(JSON.stringify(old));
      const history=store.db.prepare('SELECT * FROM events ORDER BY seq').all();store.close();
      store=new WorldStore(file,upgradeAt);
      const migrated=JSON.parse(store.db.prepare('SELECT state FROM world').get().state);
      assert.equal(migrated.version,4);assert.deepEqual(migrated.action,old.action);assert.deepEqual(migrated.nest,old.nest);
      assert.deepEqual(migrated.environment,old.environment);assert.deepEqual(migrated.cottage,old.cottage);
      assert.deepEqual(store.db.prepare('SELECT * FROM events ORDER BY seq').all(),history);
      assert.equal(migrated.bird.introducedAt,upgradeAt);
      const current=store.snapshot(upgradeAt);
      assert.equal(current.world.bird.pending,null);
      assert.equal(store.db.prepare("SELECT count(*) n FROM events WHERE type LIKE 'bird.%'").get().n,0);
      store.close();store=new WorldStore(file,upgradeAt+1);assert.deepEqual(store.snapshot(upgradeAt),current);store.close();
    }finally{rmSync(directory,{recursive:true,force:true});}
  }
});

test('restart during a routine flight preserves pose and commits its destination once',()=>{
  const directory=mkdtempSync(join(tmpdir(),'a-view-bird-flight-')),file=join(directory,'world.sqlite');
  try{
    let store=new WorldStore(file,epoch),snapshot=store.snapshot(epoch);
    while(snapshot.world.bird.pending?.kind!=='flight')snapshot=store.snapshot(snapshot.nextCommitAt);
    const action=snapshot.world.bird.pending,at=action.start+2000,middle=store.snapshot(at);
    const pose=sampleBird(middle.world.bird,null,at);store.close();store=new WorldStore(file,at+1);
    assert.deepEqual(store.snapshot(at),middle);assert.deepEqual(sampleBird(store.snapshot(at).world.bird,null,at),pose);
    const done=store.snapshot(action.end);assert.equal(done.world.bird.locationId,action.to);assert.deepEqual(store.snapshot(action.end),done);
    assert.equal(store.db.prepare('SELECT count(*) n FROM events WHERE id=?').get(`${action.id}:action-completed`).n,1);store.close();
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('failed bird completion rolls back state, counter, and event history together',()=>{
  const store=new WorldStore(':memory:',epoch);
  try{
    let s=store.snapshot(epoch);while(s.world.bird.pending?.kind!=='flight')s=store.snapshot(s.nextCommitAt);
    const saved=store.db.prepare('SELECT state FROM world').get().state,count=store.db.prepare('SELECT count(*) n FROM events').get().n;
    store.db.exec("CREATE TRIGGER fail_bird BEFORE INSERT ON events WHEN NEW.type='bird.action-completed' BEGIN SELECT RAISE(ABORT,'injected failure'); END");
    assert.throws(()=>store.snapshot(s.world.bird.pending.end),/injected failure/);
    assert.equal(store.db.prepare('SELECT state FROM world').get().state,saved);assert.equal(store.db.prepare('SELECT count(*) n FROM events').get().n,count);
    store.db.exec('DROP TRIGGER fail_bird');assert.equal(store.snapshot(s.world.bird.pending.end).world.bird.locationId,'oak-perch');
  }finally{store.close();}
});

test('clients hold before bird arrival and reject malformed or missing version-4 bird state',async()=>{
  const store=new WorldStore(':memory:',epoch);
  try{
    let s=store.snapshot(epoch);while(s.world.bird.pending?.kind!=='flight')s=store.snapshot(s.nextCommitAt);
    let elapsed=0;const client=new WorldClient({clock:()=>elapsed,request:async()=>store.snapshot(s.serverTime+elapsed)});
    assert.equal(client.accept(JSON.parse(JSON.stringify(s))),true);
    elapsed=s.world.bird.pending.end-s.serverTime+1;assert.equal(client.now(),s.world.bird.pending.end-1);
    assert.equal(client.snapshot.world.bird.locationId,'nest');await client.refresh();assert.equal(client.snapshot.world.bird.locationId,'oak-perch');
    const current=client.snapshot;
    for(const bird of [null,{...current.world.bird,nextDecisionAt:NaN},{...current.world.bird,rulesVersion:99}]){
      assert.equal(client.accept({...current,serverTime:current.serverTime+1,world:{...current.world,bird}}),false);
    }
    const first=sceneText(current,current.serverTime),later=sceneText(current,current.serverTime+1000);
    assert.equal(first.announcement,later.announcement);assert.match(first.description,/bird rests/);
    assert.doesNotMatch(sceneText(current,current.serverTime,{study:'night'}).description,/bird rests/);
  }finally{store.close();}
});
