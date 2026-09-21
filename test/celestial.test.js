import test from 'node:test';
import assert from 'node:assert/strict';
import {CELESTIAL_MODEL as MODEL,CELESTIAL_DAY as DAY,DEG,sampleCelestial,horizontalDirection,refraction,dot} from '../shared/celestial.js';
import {SKY_CAMERA,cameraFrame,projectDirection,projectBody,intersectsView} from '../shared/celestial-projection.js';
import {calendar,realTime} from '../shared/world.js';
import {celestialPose} from '../shared/sky.js';

const near=(actual,expected,tolerance=1e-10)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} ≠ ${expected}`);
const sample=(day,hour=0,model=MODEL)=>sampleCelestial((day+hour/24)*DAY,model);
test('equinox rises east, transits south at 41 degrees, and sets west at 49 north',()=>{
  const fixedSeason={...MODEL,starCount:0};
  near(sample(80,6,fixedSeason).sun.azimuth,90*DEG,.2*DEG);
  near(sample(80,12,fixedSeason).sun.altitude,41*DEG,.3*DEG);
  near(sample(80,12,fixedSeason).sun.azimuth,180*DEG);
  near(sample(80,18,fixedSeason).sun.azimuth,270*DEG,.4*DEG);
  const summer=sample(171,12).sun,winter=sample(354,12).sun;
  assert.ok(summer.altitude>64*DEG&&summer.altitude<65*DEG);
  assert.ok(winter.altitude>17*DEG&&winter.altitude<18*DEG);
  assert.ok(sample(171,5).sun.altitude>0&&sample(354,5).sun.altitude<0);
});
test('moon phase and daily position arise from a common sun/moon geometry',()=>{
  const day=80.5;
  for(const [phase,expected]of [[0,0],[.25,.5],[.5,1],[.75,.5]]){
    const sky=sample(day,0,{...MODEL,inclination:0,phaseAtEpoch:phase-day/MODEL.synodicDays});
    near(sky.moon.illumination,expected,.002);
    if(phase===0)assert.ok(dot(sky.sun.direction,sky.moon.direction)>.999);
    if(phase===.5)assert.ok(dot(sky.sun.direction,sky.moon.direction)<-.999);
  }
  const firstQuarter={...MODEL,inclination:0,phaseAtEpoch:.25-80.75/MODEL.synodicDays};
  assert.ok(sample(80,18,firstQuarter).moon.altitude>35*DEG);
  assert.ok(sample(80,6,firstQuarter).moon.altitude<0);
});
test('directions remain continuous across midnight, year, phase, and long-time boundaries',()=>{
  for(const day of [0,1,80,171,365,730,MODEL.synodicDays,MODEL.synodicDays*200,365*100,-365*100]){
    const a=sampleCelestial(day*DAY-1),b=sampleCelestial(day*DAY+1);
    for(const [p,q]of [[a.sun,b.sun],[a.moon,b.moon],...a.stars.map((star,i)=>[star,b.stars[i]])]){
      assert.ok(Math.hypot(...p.direction.map((x,i)=>x-q.direction[i]))<1e-6);
      near(Math.hypot(...p.direction),1);
    }
  }
});
test('sampling has no frame history and stars travel together without midnight resets',()=>{
  const a=sample(220,23.999);sample(-10000);sample(10000);
  assert.deepEqual(sample(220,23.999),a);
  const b=sample(221,.001);
  near(dot(a.stars[3].direction,a.stars[27].direction),dot(b.stars[3].direction,b.stars[27].direction));
  // A solar day advances the stellar sky by roughly one degree.
  const next=sample(221,23.999);
  assert.ok(Math.hypot(...a.stars[3].direction.map((x,i)=>x-next.stars[3].direction[i]))>.001);
});
test('camera projects cardinal directions before cropping and clips full drawable extents',()=>{
  const frame=cameraFrame({...SKY_CAMERA,bearing:90*DEG,pitch:0,horizontalFov:90*DEG},1000,600);
  const middle=projectDirection(horizontalDirection(90*DEG,0),frame);
  near(middle.x,.5);near(middle.y,SKY_CAMERA.centerY);
  near(projectDirection(horizontalDirection(135*DEG,0),frame).x,1);
  near(projectDirection(horizontalDirection(45*DEG,0),frame).x,0);
  assert.ok(projectDirection(horizontalDirection(90*DEG,20*DEG),frame).y<middle.y);
  assert.equal(projectDirection(horizontalDirection(270*DEG,0),frame).inFront,false);
  const body={inFront:true,x:1.01,y:.3,extentX:.02,extentY:.02};
  assert.ok(intersectsView(body));assert.ok(!intersectsView({...body,x:1.03}));
  assert.ok(intersectsView({...body,x:.6},[.2,1],[.5,0]));
  assert.ok(!intersectsView({...body,x:.8},[.2,1],[.5,0]));
});
test('body projection is finite at camera-plane singularities and scales angular disks',()=>{
  const frame=cameraFrame();
  for(const direction of [frame.right,frame.forward.map(x=>-x),frame.forward]){
    const b=projectBody({direction,angularDiameter:MODEL.sunDiameter},frame,1.5);
    for(const value of [b.x,b.y,b.radius,...b.matrix,b.extentX,b.extentY])assert.ok(Number.isFinite(value));
  }
  const body={direction:frame.forward,angularDiameter:MODEL.sunDiameter};
  const a=projectBody(body,frame),b=projectBody(body,cameraFrame(SKY_CAMERA,3344,1882));
  near(b.radius,2*a.radius);near(a.x,b.x);near(a.extentX,b.extentX);
});
test('refraction is finite, bounded and continuous through its transition points',()=>{
  for(let degrees=-90;degrees<=90;degrees+=.1){const angle=degrees*DEG,r=refraction(angle);
    assert.ok(Number.isFinite(r)&&r>=0&&r<.7*DEG);
    assert.ok(Math.abs(r-refraction(angle+1e-8))<1e-6);
  }
  near(refraction(-3*DEG),0);near(refraction(90*DEG),0);
});
test('daytime moon and projected bright limb do not depend on night visibility',()=>{
  const c=calendar(0,realTime(0,(184+14/24)*DAY));
  const pose=celestialPose(c);
  assert.equal(c.light,1);assert.ok(pose.moon.opacity>0);
  assert.ok(pose.moon.illumination>.3&&pose.moon.illumination<.7);
  for(const value of pose.moon.light)assert.ok(Number.isFinite(value));
});
test('existing calendar light and sunrise/sunset retain their exact rules',()=>{
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  for(const day of [0,80,135,171,263,354,365,800])for(const hour of [0,6,12,19.9]){
    const c=calendar(0,realTime(0,(day+hour/24)*DAY));
    const d=Math.floor(c.total/DAY),declination=.4091*Math.sin(2*Math.PI*((d%365)-80)/365),latitude=49*Math.PI/180;
    const elevation=Math.asin(Math.sin(latitude)*Math.sin(declination)+Math.cos(latitude)*Math.cos(declination)*Math.cos((c.hour-12)*Math.PI/12));
    assert.equal(c.elevation,elevation);
    const t=clamp((elevation+.15)/.38);assert.equal(c.light,t*t*(3-2*t));
    const daylight=24/Math.PI*Math.acos(clamp(-Math.tan(latitude)*Math.tan(declination),-1,1));
    assert.equal(c.sunrise,12-daylight/2);assert.equal(c.sunset,12+daylight/2);
  }
});
