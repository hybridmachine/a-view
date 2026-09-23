import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorldStore } from '../src/store.js';
import { ACTION_DURATION, birdPose, calendar, INITIAL_WORLD_MS, RATE, realTime, viewConditions, WORLD_DAY, worldTime } from '../shared/world.js';

const epoch=1_800_000_000_000;
test('thirty elapsed days advance exactly one 365-day year',()=>{
  assert.equal(worldTime(epoch,epoch+30*WORLD_DAY)-INITIAL_WORLD_MS,365*WORLD_DAY);
  assert.ok(Math.abs(realTime(epoch,INITIAL_WORLD_MS+WORLD_DAY)-epoch-WORLD_DAY/RATE)<.001);
});
test('visible movement uses elapsed seconds, independently of the accelerated calendar',()=>{
  const action={start:epoch,end:epoch+ACTION_DURATION};
  const departure=birdPose(action,epoch),bank=birdPose(action,epoch+8000),arrival=birdPose(action,epoch+ACTION_DURATION);
  assert.equal(departure.flying,true);assert.equal(bank.flying,false);
  assert.ok(Math.abs(bank.x-.49)<.0001);assert.ok(Math.abs(bank.y-.62)<.0001);
  assert.equal(arrival.flying,false);assert.ok(Math.abs(arrival.x-departure.x)<.0001);
});
test('a twig is added only after the return completes, and only once',()=>{
  const store=new WorldStore(':memory:',epoch);
  const initial=store.snapshot(epoch),end=initial.world.action.end;
  assert.equal(store.snapshot(end-1).world.nest.materials,3);
  const completed=store.snapshot(end);
  assert.equal(completed.world.nest.materials,4);
  assert.equal(completed.events.filter(e=>e.type==='nest.material-delivered').length,1);
  assert.deepEqual(store.snapshot(end),completed);store.close();
});
test('reopening the database preserves the epoch, action, and history',()=>{
  const directory=mkdtempSync(join(tmpdir(),'a-view-world-')),path=join(directory,'world.sqlite');
  try{
    let store=new WorldStore(path,epoch);
    const saved=store.snapshot(epoch+28_000);store.close();
    store=new WorldStore(path,epoch+60_000);
    const reloaded=store.snapshot(epoch+28_000);
    assert.deepEqual(reloaded,saved);store.close();
  }finally{rmSync(directory,{recursive:true,force:true});}
});
test('unwatched catch-up matches regular execution without duplicate material',()=>{
  const regular=new WorldStore(':memory:',epoch),catchup=new WorldStore(':memory:',epoch);
  const final=epoch+7*WORLD_DAY;
  for(let time=epoch;time<epoch+60*60*1000;time+=2000)regular.advance(time);
  const a=regular.snapshot(final),b=catchup.snapshot(final);
  // Database identities differ; the complete simulated history must still agree.
  assert.notEqual(a.notes.id,b.notes.id);
  assert.deepEqual({...a,notes:{...a.notes,id:b.notes.id}},b);assert.equal(a.world.nest.materials,12);assert.equal(a.world.nest.stage,'built');
  assert.equal(regular.db.prepare("SELECT count(*) AS n FROM events WHERE type IN ('world.opened','nest.material-delivered')").get().n,10);
  assert.equal(a.world.action,null);regular.close();catchup.close();
});
test('all visitors sample identical weather, seasons, and entity state',()=>{
  const store=new WorldStore(':memory:',epoch),a=store.snapshot(epoch+35_000),b=store.snapshot(epoch+35_000);
  assert.deepEqual(a,b);assert.equal(a.calendar.season,'Spring');
  const summer=calendar(epoch,realTime(epoch,200*WORLD_DAY));assert.equal(summer.season,'Summer');store.close();
});
test('scheduled future collection starts in daylight',()=>{
  const store=new WorldStore(':memory:',epoch);
  let state=store.advance(epoch);
  while(state.action){
    if(state.action.id!=='delivery-4'){
      const c=calendar(epoch,state.action.start);assert.ok(c.hour>=c.sunrise&&c.hour<c.sunset,`Collection at ${c.hour}`);
    }
    state=store.advance(state.action.end);
  }
  store.close();
});
test('light studies affect only sampled conditions, not the shared world',()=>{
  const store=new WorldStore(':memory:',epoch),before=store.snapshot(epoch);
  const night=viewConditions(epoch,epoch,'night'),rain=viewConditions(epoch,epoch,'rain');
  assert.equal(night.calendar.period,'Night');assert.ok(Math.abs(night.calendar.hour-.5)<1e-6);assert.equal(rain.weather.name,'Passing rain');
  assert.deepEqual(store.snapshot(epoch),before);store.close();
});
