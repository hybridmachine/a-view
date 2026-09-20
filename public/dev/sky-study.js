import { Painting } from '../painting.js';
import { SkyRenderer } from '../sky-renderer.js';
import { calendar, realTime, SCENES, viewConditions } from '/shared/world.js';
import { runFoliagePixelChecks } from './foliage-checks.js';
import {surfaceFixture} from '/shared/surface-weather.js';

const $=id=>document.getElementById(id);
export const fixtures={
  'After rain':{hour:15.5,cover:.18,motion:12,surface:'wet'},
  'Drying path':{hour:15.5,cover:.18,motion:12,surface:'drying'},
  'Clear night':{hour:0,cover:0,motion:1000},
  'Thin cloud over moon':{hour:0,cover:.4,motion:1000},
  'Dense cloud over moon':{hour:0,cover:.96,motion:1000},
  'Cloud edge crossing':{hour:0,cover:.65,motion:120},
  'Daytime overcast':{hour:15.5,cover:1,motion:1000},
  'Dawn':{hour:4.5,cover:.35,motion:1000},
  'Dusk':{hour:19.5,cover:.35,motion:1000},
  'Oak and horizon':{hour:15.5,cover:.45,motion:1000},
  'Foliage pilot':{hour:15.5,cover:.18,motion:12,foliageWind:.53,foliagePilot:true},
  'Foliage calm':{hour:15.5,cover:.18,motion:12,foliageWind:0},
  'Foliage breeze':{hour:15.5,cover:.18,motion:12,foliageWind:.28},
  'Foliage gust':{hour:15.5,cover:.18,motion:12,foliageWind:.8},
};
for(const name of Object.keys(fixtures))$('fixture').add(new Option(name,name));
const painter=new Painting($('painting'),$('life'));
const snapshot={world:{epoch:0,nest:{materials:6},action:null}};
const state={hour:0,cover:0,time:1000,motion:1000,moonX:.78,moonY:.16,debug:0,fixed:true,far:true,near:true,rain:0,playing:false,foliageWind:null,foliageRest:false,foliagePilot:false,foliageGuides:false,surface:'dry'};
let lastFrame=0,lastMotionFrame=0,lastUpdate=0;
function conditions(){
  const c=calendar(0,realTime(0,135*86400000+state.hour*3600000));
  const {weather}=viewConditions(0,state.time*1000);
  return {calendar:c,weather:{...weather,cloud:state.cover,rain:state.rain}};
}
function render(){
  painter.render(snapshot,state.time*1000,'preview',{conditions:conditions(),realSeconds:state.time,motionSeconds:state.motion,
    surface:surfaceFixture(state.surface),
    moon:state.fixed?{x:state.moonX,y:state.moonY,phase:.5,visible:true}:null,debug:state.debug,visibleLayers:[+state.far,+state.near],
    foliageWind:state.foliageWind,foliageRest:state.foliageRest,foliageOnly:state.foliagePilot?['oak-east','grass-shore-west']:null});
  if(state.foliageGuides){
    const ctx=painter.ctx;ctx.save();ctx.strokeStyle='#ffe4a0';ctx.fillStyle='#ffe4a0';ctx.font='12px system-ui';
    for(const p of painter.scene.foliage.patches){
      const [x,y,w,h]=p.bounds,[sx,sy]=painter.point(x/painter.scene.width,y/painter.scene.height);
      ctx.strokeRect(sx,sy,w*painter.scale,h*painter.scale);ctx.fillText(p.id,sx,sy-4);
      ctx.beginPath();ctx.arc(sx+w*p.anchor[0]*painter.scale,sy+h*p.anchor[1]*painter.scale,3,0,Math.PI*2);ctx.fill();
    }ctx.restore();
  }
}
function sync(){
  for(const name of ['hour','cover','time','motion','moonX','moonY','debug'])$(name).value=state[name];
  for(const name of ['fixed','far','near','foliageRest','foliagePilot','foliageGuides'])$(name).checked=state[name];
  $('foliageWind').value=state.foliageWind??'';
  $('surface').value=state.surface;
  render();
}
function fixture(name){Object.assign(state,{foliageWind:null,foliageRest:false,foliagePilot:false,surface:'dry'},fixtures[name],{time:1000,rain:name==='Daytime overcast'?.7:0,moonX:.78,moonY:.16});sync();}
$('fixture').onchange=()=>fixture($('fixture').value);
for(const name of ['hour','cover','time','motion','moonX','moonY','debug'])$(name).oninput=()=>{state[name]=+$(name).value;render();};
for(const name of ['fixed','far','near','foliageRest','foliagePilot','foliageGuides'])$(name).oninput=()=>{state[name]=$(name).checked;render();};
$('foliageWind').oninput=()=>{state.foliageWind=$('foliageWind').value===''?null:+$('foliageWind').value;render();};
$('surface').oninput=()=>{state.surface=$('surface').value;render();};
$('play').onclick=()=>{state.playing=!state.playing;$('play').textContent=state.playing?'Pause crossing':'Play crossing';};
$('loss').onclick=()=>{const extension=painter.gl?.getExtension('WEBGL_lose_context');if(extension){extension.loseContext();setTimeout(()=>extension.restoreContext(),1500);}};
let drag=null;
$('world').onpointerdown=e=>{drag=e.clientX;$('world').setPointerCapture(e.pointerId);};
$('world').onpointermove=e=>{if(drag!==null){painter.panBy(e.clientX-drag);drag=e.clientX;render();}};
$('world').onpointerup=$('world').onpointercancel=()=>{drag=null;};
addEventListener('keydown',e=>{if(e.key.toLowerCase()==='h'&&!/input|select/i.test(e.target.tagName))document.querySelector('aside').classList.toggle('hidden');});
function frame(timestamp){
  requestAnimationFrame(frame);if(document.hidden||timestamp-lastFrame<1000/30)return;
  if(state.playing&&lastMotionFrame){const elapsed=Math.min(1,(timestamp-lastMotionFrame)/1000);state.time+=elapsed;state.motion+=elapsed;}
  lastMotionFrame=timestamp;lastFrame=timestamp-(timestamp-lastFrame)%(1000/30);render();
  window.skyStudy?.onFrame?.(timestamp);
  if(timestamp-lastUpdate>1000){lastUpdate=timestamp;$('state').textContent=JSON.stringify({version:1,...state,ready:painter.ready,failure:painter.failure,
    layers:painter.cloudState,stats:painter.renderer?.stats,foliageFailure:painter.foliageFailure,foliage:painter.foliageState,foliageStats:painter.foliageRenderer?.stats},null,2);}
}
await painter.init();fixture('Clear night');requestAnimationFrame(frame);
addEventListener('pagehide',()=>painter.dispose(),{once:true});

// All numeric fixtures use the production SkyRenderer and FRAGMENT shader.
export function runPixelChecks(){
  const output=[];const canvas=document.createElement('canvas');canvas.width=canvas.height=32;
  const gl=canvas.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true});
  if(!gl)return [{name:'WebGL available',pass:false,detail:'No WebGL context'}];
  function texture(color,w=8,h=8){const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,w,h);return c;}
  const transparent=texture('rgba(0,0,0,0)'),sky=texture('rgb(32,64,96)'),atlas=texture('white');
  const scene=structuredClone(SCENES[0]);scene.width=scene.height=8;scene.sky.atlasSize=[8,8];
  const renderer=new SkyRenderer(gl,scene,[transparent,transparent,sky,sky,atlas],{water:texture('black'),celestialTexture:transparent});
  const base={calendar:{light:1,elevation:1,total:0,hour:12},weather:{cloud:0,rain:0,wind:0},realSeconds:0,synthetic:true,effects:0,
    uniforms:{dusk:0,tint0:[1,1,1],tint1:[1,1,1],layer0:[0,1,0,1],layer1:[0,1,0,1],rect0:[.25,.25,0,0],rect1:[.25,.75,0,0],deform0:[0,0],deform1:[0,0],density0:[.5,.5,0,0],density1:[.5,.5,0,0]}};
  function set(index,image){gl.activeTexture(gl.TEXTURE0+index);gl.bindTexture(gl.TEXTURE_2D,renderer.textures[index]);renderer.upload(image,false);}
  function draw(extra={}){renderer.draw({...base,...extra,uniforms:{...base.uniforms,...extra.uniforms}});}
  function pixel(x=16,y=16){const rgba=new Uint8Array(4);gl.readPixels(x,canvas.height-1-y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,rgba);return [...rgba].slice(0,3);}
  function check(name,actual,expected,tolerance=3){const pass=actual.every((n,i)=>Math.abs(n-expected[i])<=tolerance);output.push({name,pass,actual,expected,tolerance});}
  try{
    const moon=texture('transparent');const ctx=moon.getContext('2d');ctx.fillStyle='white';ctx.fillRect(3,3,2,2);ctx.fillRect(0,0,2,2);set(5,moon);
    draw();check('Clear moon visible',pixel(),[255,255,255]);check('Clear star visible',pixel(3,3),[255,255,255]);
    draw({uniforms:{density0:[0,.01,1,0]}});const hidden=pixel(),hiddenStar=pixel(3,3);set(5,transparent);draw({uniforms:{density0:[0,.01,1,0]}});check('Opaque cloud hides moon and glow',pixel(),hidden);check('Opaque cloud hides star',pixel(3,3),hiddenStar);
    const half=texture('rgba(200,100,50,0.5)');set(4,half);draw({uniforms:{density0:[.5,.5,1,0]}});
    check('Half cloud uses premultiplied over once',pixel(),[116,82,73]);
    set(4,texture('rgba(255,255,255,.5)'));set(5,texture('white'));draw({uniforms:{density0:[.5,.5,1,0],density1:[.5,.5,1,0]}});const bothBright=pixel();
    set(5,texture('black'));draw({uniforms:{density0:[.5,.5,1,0],density1:[.5,.5,1,0]}});
    check('Two layers multiply transmission',bothBright.map((n,i)=>n-pixel()[i]),[64,64,64]);
    set(0,texture('rgb(18,90,40)'));set(1,texture('rgb(18,90,40)'));draw();check('Opaque foreground conceals sky',pixel(),[18,90,40]);
    const holes=texture('rgb(18,90,40)');holes.getContext('2d').clearRect(2,2,4,4);set(0,holes);set(1,holes);set(5,transparent);draw();check('Leaf hole reveals sky',pixel(),[32,64,96]);
    set(0,texture('rgba(200,100,50,.5)'));set(1,texture('rgba(200,100,50,.5)'));draw();check('Partial foreground is not premultiplied twice',pixel(),[116,82,73]);
    set(0,transparent);set(1,transparent);
    const corners=texture('black');const cc=corners.getContext('2d');for(const [color,x,y]of [['red',0,0],['lime',4,0],['blue',0,4],['white',4,4]]){cc.fillStyle=color;cc.fillRect(x,y,4,4);}set(2,corners);set(3,corners);draw();
    check('Top-left upload orientation',pixel(2,2),[255,0,0]);check('Top-right upload orientation',pixel(29,2),[0,255,0]);check('Bottom-left upload orientation',pixel(2,29),[0,0,255]);check('Bottom-right upload orientation',pixel(29,29),[255,255,255]);
    draw({crop:[.5,.5],offset:[.5,0]});check('Scene crop and pan share coordinates',pixel(),[0,255,0]);
    canvas.width=canvas.height=64;draw({crop:[.5,.5],offset:[.5,.5]});check('Changed pixel ratio preserves mapping',pixel(32,32),[255,255,255]);
    set(2,sky);set(3,sky);
    const tile=texture('transparent');const tc=tile.getContext('2d');tc.fillStyle='rgba(180,180,180,.7)';tc.fillRect(2,0,4,8);set(4,tile);
    const periodic={rect0:[.0625,.25,.875,0],density0:[.5,.5,1,0],layer0:[.5078025,1,0,1]};
    draw({uniforms:periodic});const before=pixel(32,32);draw({uniforms:{...periodic,layer0:[.5078225,1,0,1]}});check('Atlas wrap boundary is continuous',pixel(32,32),before);
    check('No WebGL error',[gl.getError()],[gl.NO_ERROR],0);
  }finally{renderer.dispose();gl.getExtension('WEBGL_lose_context')?.loseContext();}
  return output;
}
$('tests').onclick=()=>{
  const results=[...runPixelChecks(),...runFoliagePixelChecks()];$('results').className=results.every(x=>x.pass)?'pass':'fail';
  $('results').textContent=results.map(x=>`${x.pass?'PASS':'FAIL'} ${x.name}`).join('\n');
};

// Deliberately preview-only; the visitor page exposes no renderer controls.
window.skyStudy={painter,state,fixture,render,sync,runPixelChecks,runFoliagePixelChecks,conditions,ready:true};
