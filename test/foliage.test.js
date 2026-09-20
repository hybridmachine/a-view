import test from 'node:test';
import assert from 'node:assert/strict';
import {createFoliageMesh,foliageWeights,sampleFoliage,validateFoliageConfig} from '../shared/foliage.js';
import {LAKESIDE_FOLIAGE as config} from '../shared/lakeside-foliage.js';

test('foliage reconstructs the same poses without intervening frames',()=>{
  for(const patch of config.patches){
    const expected=sampleFoliage(18432.4,patch,config.seed);
    for(const time of [2,-1,999999,18,0])sampleFoliage(time,patch,config.seed);
    assert.deepEqual(sampleFoliage(18432.4,patch,config.seed),expected);
  }
});
test('calm is at rest and strong gusts stay inside the authored displacement envelope',()=>{
  for(const patch of config.patches)for(const time of [-3153600000,0,.001,17.3,18432,3153600000]){
    const calm=sampleFoliage(time,patch,config.seed,0);
    assert.equal(Math.abs(calm.bend)+Math.abs(calm.flutter)+Math.abs(calm.lift),0);
    for(const wind of [null,.05,.53,1]){
      const pose=sampleFoliage(time,patch,config.seed,wind);
      assert.ok(Object.values(pose).every(Number.isFinite));
      assert.ok(Math.hypot(Math.abs(pose.bend)+Math.abs(pose.flutter),pose.lift)<=patch.maxDisplacement);
    }
  }
});
test('motion remains continuous across phase wraps, including long elapsed times',()=>{
  const patch=config.patches[0];
  for(const time of [17.3,31.7,17300000,3153600000]){
    const a=sampleFoliage(time-.0001,patch),b=sampleFoliage(time+.0001,patch);
    for(const key of ['bend','flutter','lift'])assert.ok(Math.abs(a[key]-b[key])<.002);
  }
});
test('neighboring patches share gusts but retain different seeded responses',()=>{
  const p=config.patches[4],neighbor={...p,id:'neighbor',bounds:[p.bounds[0]+8,p.bounds[1],...p.bounds.slice(2)]};
  const a=sampleFoliage(12,p),b=sampleFoliage(12,neighbor);
  assert.ok(Math.abs(a.gust-b.gust)<.01);assert.notEqual(a.bend,b.bend);
});
test('mesh anchors and both side seams remain fixed; tip weights increase smoothly',()=>{
  for(const patch of config.patches){
    for(const u of [0,.1,.5,.9,1])assert.deepEqual(foliageWeights(u,patch.anchor[1],patch),[0,0]);
    for(const v of [0,.2,.5,.8,1])for(const u of [0,1])assert.deepEqual(foliageWeights(u,v,patch),[0,0]);
    const weights=[0,.25,.5,.75,1].map(t=>foliageWeights(.5,patch.type==='grass'?1-t:t,patch)[0]);
    assert.ok(weights.every((w,i)=>!i||w>=weights[i-1]));assert.equal(weights.at(-1),1);
    const mesh=createFoliageMesh(patch,config.atlasSize);assert.equal(mesh.length,patch.mesh[0]*patch.mesh[1]*36);
    assert.ok([...mesh].every(Number.isFinite));
  }
});
test('asset layout validates and rejects unsafe configuration before allocating GPU resources',()=>{
  assert.equal(validateFoliageConfig(config,1672,941),config);
  const reject=change=>{const c=structuredClone(config);change(c);assert.throws(()=>validateFoliageConfig(c,1672,941),/Invalid foliage/);};
  reject(c=>c.patches[0].maxDisplacement=Infinity);reject(c=>c.patches[0].anchor[1]=.5);
  reject(c=>c.patches[0].rect[0]=0);reject(c=>c.patches[1].rect=c.patches[0].rect);
  reject(c=>c.patches[0].bounds[0]=-1);reject(c=>c.patches[0].mesh=[0,3]);
  reject(c=>c.patches[1].id=c.patches[0].id);reject(c=>c.assets.day='');
});
