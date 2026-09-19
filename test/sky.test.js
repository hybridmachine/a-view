import test from 'node:test';
import assert from 'node:assert/strict';
import { integratedWind, sampleWind } from '../shared/wind.js';
import { celestialPose, cloudAlpha, cloudDensity, sampleCloudLayers } from '../shared/sky.js';
import { calendar, SCENES, viewConditions, weather } from '../shared/world.js';

const config=SCENES[0].sky;
const sample=(realSeconds,more={})=>sampleCloudLayers({realSeconds,weather:weather(0,realSeconds*1000),config,...more});
test('cloud state is deterministic and has no dependence on intervening frames',()=>{
  const future=sample(910000);
  for(const t of [0,34,999999,2,48000,-10])sample(t);
  assert.deepEqual(sample(910000),future);
  assert.deepEqual(sample(617),sample(617));
});
test('light-study calendar cannot change real-time displacement',()=>{
  const now=12345000,live=viewConditions(0,now),night=viewConditions(0,now,'night');
  assert.notEqual(live.calendar.hour,night.calendar.hour);
  const geometry=w=>sample(now/1000,{weather:w}).map(({phase,deformation})=>({phase,deformation}));
  assert.deepEqual(geometry(live.weather),geometry(night.weather));
});
test('wind integral derivative matches the weather sampler',()=>{
  for(const t of [0,.1,83,221,1000,1000000,31536000*7]){
    const derivative=(integratedWind(t+.1)-integratedWind(t-.1))/.2;
    assert.ok(Math.abs(derivative-sampleWind(t))<1e-6,`${t}: ${derivative}`);
  }
  assert.equal(integratedWind(0),0);
});
test('extracted wind preserves the existing weather schedule',()=>{
  for(const t of [-100,0,1,221,900,1000000]){
    const expected=.28+.13*Math.sin(t/83)+.12*Math.sin(t/221);
    assert.equal(weather(2000,2000+t*1000).wind,expected);
  }
});
test('phases are finite and bounded across wraps and multi-year time jumps',()=>{
  for(const t of [-1,0,1,3600,31536000,31536000*100])for(const [i,layer]of sample(t).entries()){
    assert.ok(Number.isFinite(layer.phase)&&layer.phase>=0&&layer.phase<config.layers[i].period);
    assert.ok(layer.deformation>=0&&layer.deformation<Math.PI*2);
  }
  // Seek an actual phase boundary, then compare modular travel to integrated wind.
  const layer=config.layers[1];let lo=0,hi=1;
  while(sample(hi)[1].phase>=sample(0)[1].phase)hi*=2;
  for(let i=0;i<60;i++){const mid=(lo+hi)/2;if(sample(mid)[1].phase>sample(0)[1].phase)lo=mid;else hi=mid;}
  const delta=(sample(hi+.01)[1].phase-sample(lo-.01)[1].phase+layer.period)%layer.period;
  assert.ok(Math.abs(delta-layer.speed*(integratedWind(hi+.01)-integratedWind(lo-.01)))<1e-10);
});
test('held motion retains geometry while current weather changes appearance',()=>{
  const a=sample(100,{motionSeconds:42,weather:{cloud:0,rain:0}}),b=sample(900,{motionSeconds:42,weather:{cloud:.9,rain:.8}});
  for(let i=0;i<a.length;i++){assert.equal(a[i].phase,b[i].phase);assert.equal(a[i].deformation,b[i].deformation);assert.notDeepEqual(a[i].density,b[i].density);}
});
test('zero cover is clear; coverage is monotone at every fixed texel',()=>{
  for(const layer of config.layers)for(const rain of [0,.5,1])for(const base of [0,.1,.25,.5,.75,1]){
    let previous=0;
    assert.equal(cloudAlpha(base,cloudDensity(0,rain,layer.density)),0);
    for(let step=0;step<=100;step++){
      const alpha=cloudAlpha(base,cloudDensity(step/100,rain,layer.density));
      assert.ok(alpha>=previous&&alpha<=1);previous=alpha;
    }
    assert.ok(previous>=.97,'overcast closes gaps');
  }
});
test('celestial pose stays finite across calendar boundaries; fixtures are injectable',()=>{
  for(const t of [-31536000000,0,86400000,315360000000]){
    const pose=celestialPose(calendar(0,t));
    for(const key of ['x','y','phase','radius'])assert.ok(Number.isFinite(pose.moon[key]));
    assert.ok(pose.moon.phase>=0&&pose.moon.phase<1);
    assert.equal(pose.stars.length,48);
  }
  const moon={x:.7,y:.2,phase:.5,visible:true};
  assert.deepEqual({...celestialPose(calendar(0,0),moon).moon,radius:undefined},{...moon,radius:undefined});
});
test('known full-moon fixture preserves the original approximate lunar path',()=>{
  const {moon}=celestialPose({total:14.765*86400000,hour:0,light:0});
  assert.ok(Math.abs(moon.phase-.5)<1e-12);
  assert.ok(Math.abs(moon.x-.78)<1e-12);
  assert.ok(Math.abs(moon.y-.11)<1e-12);
  assert.equal(moon.visible,true);
});
