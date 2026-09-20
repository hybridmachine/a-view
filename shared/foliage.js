import { sampleWind } from './wind.js';

const TAU=Math.PI*2;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const mod=(x,n)=>((x%n)+n)%n;
const phase=(seconds,period,offset=0)=>mod(seconds,period)/period*TAU+offset;
function seedValue(seed,id){
  let h=seed>>>0;
  for(let i=0;i<id.length;i++)h=Math.imul(h^id.charCodeAt(i),16777619)>>>0;
  return h/4294967296;
}

// Direct evaluation, including gust amplitude: no frame history or wall clock.
export function sampleFoliage(motionSeconds,patch,seed=941,windOverride=null){
  const t=Number.isFinite(motionSeconds)?motionSeconds:0;
  const wind=clamp(windOverride??sampleWind(t),0,1);
  const random=seedValue(seed,patch.id),[x,y]=patch.bounds;
  const delayed=t-x/520-y/1800;
  const crest=smooth((Math.sin(phase(delayed,17.3,seed*.01))+.25)/1.25);
  const broad=.5+.5*Math.sin(phase(delayed,31.7,1.9));
  const gust=crest*(.6+.4*broad);
  const strength=clamp(wind/.53)*patch.exposure;
  const sway=Math.sin(phase(t,patch.type==='grass'?5.1+random*1.7:3.8+random,random*TAU));
  const settling=Math.sin(phase(delayed,8.1,random*.8));
  const bend=patch.maxDisplacement*strength*(.13+.55*gust+.16*sway+.06*settling);
  const flutter=patch.maxDisplacement*strength*(patch.type==='leaf'?.085:.035)*
    Math.sin(phase(t,.65+random*.7,random*TAU))*(.25+.75*gust);
  return {bend,flutter,lift:patch.type==='grass'?Math.abs(bend)*.12:bend*.16,gust};
}

// The side attachment margin keeps cut boundaries stationary, even where the
// source joins an unselected tuft or twig. Every vertex at the root is fixed.
export function foliageWeights(u,v,patch){
  const tip=patch.type==='grass'?1-v:v;
  const sides=smooth(u/.18)*smooth((1-u)/.18);
  const bend=smooth(tip)*sides;
  return [bend,bend*tip*tip];
}

export function createFoliageMesh(patch,atlasSize){
  const [x,y,w,h]=patch.bounds,[ax,ay]=patch.rect,[aw,ah]=atlasSize,[columns,rows]=patch.mesh;
  const vertices=[];
  const vertex=(u,v)=>vertices.push(x+u*w,y+v*h,(ax+u*w)/aw,(ay+v*h)/ah,...foliageWeights(u,v,patch));
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
    const u=col/columns,v=row/rows,uu=(col+1)/columns,vv=(row+1)/rows;
    vertex(u,v);vertex(uu,v);vertex(u,vv);vertex(u,vv);vertex(uu,v);vertex(uu,vv);
  }
  return new Float32Array(vertices);
}

export function validateFoliageConfig(config,width,height){
  const fail=()=>{throw new Error('Invalid foliage configuration');};
  if(!config||config.version!==1||!Number.isInteger(config.seed)||!Array.isArray(config.atlasSize)||config.atlasSize.length!==2||
    !config.atlasSize.every(n=>Number.isInteger(n)&&n>0)||!Array.isArray(config.patches)||!config.patches.length||config.patches.length>32)fail();
  if(!['baseDay','baseNight','day','night'].every(key=>typeof config.assets?.[key]==='string'&&config.assets[key].length))fail();
  const ids=new Set(),rects=[],bounds=[];
  for(const patch of config.patches){
    if(typeof patch.id!=='string'||ids.has(patch.id)||!['grass','leaf'].includes(patch.type))fail();ids.add(patch.id);
    for(const [key,size]of [['bounds',4],['rect',4],['anchor',2],['mesh',2]])if(!Array.isArray(patch[key])||patch[key].length!==size||!patch[key].every(Number.isFinite))fail();
    const [x,y,w,h]=patch.bounds,[ax,ay,aw,ah]=patch.rect;
    if(![...patch.bounds,...patch.rect].every(Number.isInteger)||x<0||y<0||w<=0||h<=0||x+w>width||y+h>height||aw!==w||ah!==h||
      ax<4||ay<4||ax+aw+4>config.atlasSize[0]||ay+ah+4>config.atlasSize[1]||
      !patch.mesh.every(n=>Number.isInteger(n)&&n>=2&&n<=24)||
      patch.anchor[0]!==.5||patch.anchor[1]!== (patch.type==='grass'?1:0)||
      !Number.isFinite(patch.maxDisplacement)||patch.maxDisplacement<0||patch.maxDisplacement>8||
      !Number.isFinite(patch.exposure)||patch.exposure<0||patch.exposure>1||!Number.isFinite(patch.order))fail();
    for(const [rx,ry,rw,rh]of rects)if(ax-4<rx+rw+4&&ax+aw+4>rx-4&&ay-4<ry+rh+4&&ay+ah+4>ry-4)fail();
    for(const [rx,ry,rw,rh]of bounds)if(x<rx+rw&&x+w>rx&&y<ry+rh&&y+h>ry)fail();
    rects.push(patch.rect);bounds.push(patch.bounds);
  }
  return config;
}
