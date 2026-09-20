import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WorldStore} from '../src/store.js';
import {advanceSurface, createSurfaceState, sampleSurface, surfaceStep, surfaceTime, surfaceFixture, validSurfaceState, SURFACE_KEYS} from '../shared/surface-weather.js';
import {sceneText} from '../public/scene-description.js';

const epoch=1_800_000_000_000;
test('arbitrary reads and partial ticks cannot alter surface history',()=>{
  const initial=createSurfaceState(epoch);
  let regular=initial;
  for(let t=137;t<1_000_000;t+=2917){
    const before=structuredClone(regular);
    sampleSurface(regular,epoch,epoch+t);
    assert.deepEqual(regular,before);
    regular=advanceSurface(regular,epoch,epoch+t).state;
  }
  assert.deepEqual(advanceSurface(regular,epoch,epoch+1_000_000).state,advanceSurface(initial,epoch,epoch+1_000_000).state);
  const checkpoint=advanceSurface(initial,epoch,epoch+10_000).state;
  assert.deepEqual(sampleSurface(initial,epoch,epoch+10_000),checkpoint);
});

test('rain wets the painting and the after-rain stores decay on real seconds',()=>{
  let surface=createSurfaceState(epoch);
  for(let i=0;i<120;i++)surface=surfaceStep(surface,10,{rain:1,wind:.2,light:.7});
  assert.ok(surface.pathWetness>.7&&surface.puddleStorage>.6&&surface.canopyStorage>.5);
  const wet=surface;
  for(let i=0;i<12;i++)surface=surfaceStep(surface,10,{rain:0,wind:.2,light:.7});
  assert.ok(surface.canopyStorage<.06&&surface.pathWetness>.4&&surface.puddleStorage>.4);
  for(let i=0;i<180;i++)surface=surfaceStep(surface,10,{rain:0,wind:.2,light:.7});
  for(const key of SURFACE_KEYS)assert.ok(surface[key]<wet[key]*.15);
  assert.ok(validSurfaceState(surface));
});

test('bounded catch-up converges exactly and stale projections are refused',()=>{
  const initial=createSurfaceState(epoch),target=epoch+86400_000;
  let state=initial,result;
  do{result=advanceSurface(state,epoch,target,1234);state=result.state;}while(!result.complete);
  assert.deepEqual(state,advanceSurface(initial,epoch,target).state);
  assert.equal(sampleSurface(state,epoch,surfaceTime(state)-1),null);
  assert.equal(sampleSurface(state,epoch,surfaceTime(state)+60_001),null);
  assert.equal(sampleSurface({...state,rulesVersion:99},epoch,target),null);
  assert.equal(sampleSurface({...state,puddleStorage:NaN},epoch,target),null);
});

test('a month of weather stays bounded and produces dry intervals',()=>{
  let state=createSurfaceState(epoch),max=0,min=1;
  const start=performance.now();
  for(let day=1;day<=30;day++){
    state=advanceSurface(state,epoch,epoch+day*86400_000).state;
    assert.ok(validSurfaceState(state));max=Math.max(max,state.pathWetness);min=Math.min(min,state.pathWetness);
  }
  assert.ok(max>.2&&min<.1,`range ${min}–${max}`);
  console.log(`30-day surface catch-up: ${Math.round(performance.now()-start)} ms`);
});

test('v1 migration preserves history and starts surface memory exactly once',()=>{
  const directory=mkdtempSync(join(tmpdir(),'a-view-surface-')),file=join(directory,'world.sqlite');
  try{
    let store=new WorldStore(file,epoch),before=store.snapshot(epoch+28_000);store.close();
    const db=new DatabaseSync(file),old={...before.world,version:1};delete old.environment;
    db.prepare('UPDATE world SET state=?').run(JSON.stringify(old));db.close();
    const introduced=epoch+60_000;
    store=new WorldStore(file,introduced);
    const migrated=store.snapshot(introduced);
    assert.equal(migrated.world.environment.introducedAt,introduced);
    assert.equal(migrated.world.epoch,old.epoch);assert.deepEqual(migrated.world.nest,old.nest);
    assert.deepEqual(migrated.events,before.events);store.close();
    store=new WorldStore(file,introduced+1000);
    assert.deepEqual(store.snapshot(introduced),migrated);store.close();
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('wet studies and quiet surface descriptions cannot change the live world',()=>{
  const store=new WorldStore(':memory:',epoch);
  try{
    const before=store.snapshot(epoch);
    const wet={...before,world:{...before.world,environment:{...before.world.environment,...surfaceFixture('wet')}}};
    assert.match(sceneText(wet,epoch).description,/shallow hollow/);
    assert.equal(sceneText(wet,epoch).announcement,sceneText(before,epoch).announcement);
    assert.match(sceneText(before,epoch,{study:'rain'}).description,/shallow hollow/);
    assert.deepEqual(store.snapshot(epoch),before);
  }finally{store.close();}
});
