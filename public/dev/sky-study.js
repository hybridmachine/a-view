import { Painting } from '../painting.js';
import { SkyRenderer } from '../sky-renderer.js';
import { calendar, realTime, SCENES, viewConditions } from '/shared/world.js';
import { runFoliagePixelChecks } from './foliage-checks.js';
import {surfaceFixture} from '/shared/surface-weather.js';
import {birdFixture} from '/shared/bird.js';
import {celestialPose} from '/shared/sky.js';
import {DEG,horizontalDirection} from '/shared/celestial.js';
import {SKY_CAMERA,projectDirection,intersectsView} from '/shared/celestial-projection.js';

const $=id=>document.getElementById(id);
export const fixtures={
  'Equinox sunrise':{day:80,hour:6.48,cover:.12,fixed:false},
  'Summer sunrise':{day:171,hour:4.65,cover:.12,fixed:false},
  'Winter sunrise':{day:354,hour:8.6,cover:.12,fixed:false},
  'Full moon rising':{day:132,hour:19.5,cover:.10,fixed:false},
  'Daytime quarter moon':{day:184,hour:14,cover:.08,fixed:false},
  'Moonset · southwest view':{day:132,hour:3.8,bearing:240,cover:.1,fixed:false},
  'Oak perch':{hour:15.5,cover:.18,bird:'Oak perch'},
  'Sheltered bird':{hour:15.5,cover:.18,bird:'Sheltered bird'},
  'Roof perch':{hour:15.5,cover:.18,bird:'Roof perch'},
  'Oak flight':{hour:15.5,cover:.18,bird:'Oak flight'},
  'Shelter flight':{hour:15.5,cover:.18,bird:'Shelter flight'},
  'Roof flight':{hour:15.5,cover:.18,bird:'Roof flight'},
  'Cottage dark':{hour:0,cover:.18,motion:12},
  'Main room':{hour:0,cover:.18,motion:12,mainLight:1},
  'Second room':{hour:0,cover:.18,motion:12,secondLight:1},
  'Both rooms':{hour:0,cover:.18,motion:12,mainLight:1,secondLight:1},
  'Open casement':{hour:15.5,cover:.18,motion:12,opening:1},
  'Half-open casement':{hour:15.5,cover:.18,motion:12,opening:.5},
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
const state={hour:0,cover:0,time:1000,motion:1000,moonX:.78,moonY:.16,debug:0,fixed:true,far:true,near:true,rain:0,playing:false,foliageWind:null,foliageRest:false,foliagePilot:false,foliageGuides:false,surface:'dry',mainLight:0,secondLight:0,opening:0};
Object.assign(state,{bird:null,birdTime:0,birdGuides:false});
const cameraDefaults={bearing:SKY_CAMERA.bearing/DEG,pitch:SKY_CAMERA.pitch/DEG,fov:SKY_CAMERA.horizontalFov/DEG,horizon:SKY_CAMERA.centerY};
Object.assign(state,{day:135,calendarPlaying:false,calendarRate:720,skyGuides:false,...cameraDefaults});
let lastFrame=0,lastMotionFrame=0,lastUpdate=0;
function conditions(){
  const c=calendar(0,realTime(0,state.day*86400000+state.hour*3600000));
  const {weather}=viewConditions(0,state.time*1000);
  return {calendar:c,weather:{...weather,cloud:state.cover,rain:state.rain}};
}
function render(){
  const selected=conditions(),camera={bearing:state.bearing*DEG,pitch:state.pitch*DEG,horizontalFov:state.fov*DEG,centerY:state.horizon};
  painter.render(snapshot,state.time*1000,'preview',{conditions:selected,realSeconds:state.time,motionSeconds:state.motion,
    camera,celestialTime:selected.calendar.total,
    surface:surfaceFixture(state.surface),
    bird:birdFixture(state.bird,state.birdTime*1000),
    cottagePose:{main:state.mainLight,second:state.secondLight,open:state.opening},
    moon:state.fixed?{x:state.moonX,y:state.moonY,phase:.5,visible:true}:null,debug:state.debug,visibleLayers:[+state.far,+state.near],
    foliageWind:state.foliageWind,foliageRest:state.foliageRest,foliageOnly:state.foliagePilot?['oak-east','grass-shore-west']:null});
  if(state.skyGuides&&painter.celestialState)drawSkyGuides(selected.calendar,camera);
  if(state.foliageGuides){
    const ctx=painter.ctx;ctx.save();ctx.strokeStyle='#ffe4a0';ctx.fillStyle='#ffe4a0';ctx.font='12px system-ui';
    for(const p of painter.scene.foliage.patches){
      const [x,y,w,h]=p.bounds,[sx,sy]=painter.point(x/painter.scene.width,y/painter.scene.height);
      ctx.strokeRect(sx,sy,w*painter.scale,h*painter.scale);ctx.fillText(p.id,sx,sy-4);
      ctx.beginPath();ctx.arc(sx+w*p.anchor[0]*painter.scale,sy+h*p.anchor[1]*painter.scale,3,0,Math.PI*2);ctx.fill();
    }ctx.restore();
  }
  if(state.birdGuides){
    const ctx=painter.ctx,art=painter.scene.birdLife,toScreen=p=>painter.point(p[0]/art.width,p[1]/art.height);
    ctx.save();ctx.strokeStyle='#ffe4a0';ctx.fillStyle='#ffe4a0';ctx.lineWidth=1;ctx.font='12px system-ui';
    for(const route of Object.values(art.routes)){
      const p=route.points.map(toScreen);ctx.beginPath();ctx.moveTo(...p[0]);ctx.bezierCurveTo(...p[1],...p[2],...p[3]);ctx.stroke();
    }
    for(const [id,location]of Object.entries(art.locations)){
      const [x,y]=toScreen(location.point);ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();ctx.fillText(id,x+6,y-8);
    }
    ctx.strokeStyle='#f9a4a4';ctx.beginPath();art.occluder.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](...toScreen(p)));ctx.closePath();ctx.stroke();ctx.restore();
  }
}
let guideKey=null,guidePaths=null;
function drawSkyGuides(c,camera){
  const key=JSON.stringify([state.day,camera,painter.scene.width,painter.scene.height]);
  if(key!==guideKey){
    guideKey=key;guidePaths={sun:[],moon:[]};
    for(let minute=0;minute<=1440;minute+=8){
      const sample=celestialPose({...c,total:state.day*86400000+minute*60000},null,painter.scene.sky.seed,
        {camera,model:{...painter.scene.sky.celestial,starCount:0},width:painter.scene.width,height:painter.scene.height});
      for(const name of ['sun','moon'])guidePaths[name].push(sample[name]);
    }
  }
  const ctx=painter.ctx;ctx.save();ctx.lineWidth=1;ctx.font='12px system-ui';
  function path(points,color){ctx.strokeStyle=color;ctx.beginPath();let pen=false;
    for(const p of points){if(!p.inFront||p.x<-.1||p.x>1.1||p.y<-.1||p.y>1){pen=false;continue;}
      const xy=painter.point(p.x,p.y);ctx[pen?'lineTo':'moveTo'](...xy);pen=true;}ctx.stroke();}
  path(guidePaths.sun,'#ffdc8f');path(guidePaths.moon,'#c4e5ff');
  const frame=painter.celestialState.frame;
  path(Array.from({length:361},(_,i)=>projectDirection(horizontalDirection(i*DEG,0),frame)),'#d6e0c0');
  for(const [bearing,label]of [[0,'N'],[90,'E'],[180,'S'],[270,'W']]){
    const p=projectDirection(horizontalDirection(bearing*DEG,0),frame);
    if(p.inFront&&p.x>=0&&p.x<=1){ctx.fillStyle='#e5e9d7';const [x,y]=painter.point(p.x,p.y);ctx.fillText(label,x+4,y-5);}
  }
  ctx.restore();
}
function celestialStatus(){
  const pose=painter.celestialState;if(!pose)return 'Sky renderer unavailable.';
  return ['sun','moon'].map(name=>{
    const b=pose[name];let status='in view';
    if(b.apparentAltitude+b.angularDiameter/2<0)status='below horizon';
    else if(!b.inFront)status='behind camera';
    else if(!intersectsView(b,painter.crop,painter.offset,6))status='outside crop';
    else if(b.visible){
      // Foreground coverage is an authored image, not an analytic horizon.
      // Sample it only for this low-frequency diagnostic, never for rendering.
      const coverage=[[0,0],[.9,0],[-.9,0],[0,.9],[0,-.9]].map(([x,y])=>
        terrainAlpha(b.x+(b.matrix[0]*x+b.matrix[2]*y)/painter.scene.width,b.y+(b.matrix[1]*x+b.matrix[3]*y)/painter.scene.height));
      if(coverage.every(a=>a>.98))status='behind landscape';else if(coverage.some(a=>a>.02))status='crossing landscape';
    }
    return `${name==='sun'?'Sun':'Moon'}: ${(b.altitude/DEG).toFixed(1)}° high, ${(b.azimuth/DEG).toFixed(0)}° bearing · ${status}${name==='moon'?` · ${Math.round(b.illumination*100)}% lit`:''}`;
  }).join('\n');
}
let terrain=null;
function terrainAlpha(x,y){
  if(!terrain&&painter.intactForeground){const canvas=document.createElement('canvas');canvas.width=painter.scene.width;canvas.height=painter.scene.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(painter.intactForeground[0],0,0);terrain=ctx.getImageData(0,0,canvas.width,canvas.height).data;}
  if(!terrain||x<0||x>=1||y<0||y>=1)return 0;
  return terrain[(Math.floor(y*painter.scene.height)*painter.scene.width+Math.floor(x*painter.scene.width))*4+3]/255;
}
function sync(){
  for(const name of ['hour','cover','time','motion','moonX','moonY','debug','day','calendarRate','bearing','pitch','fov','horizon'])$(name).value=state[name];
  for(const name of ['fixed','far','near','foliageRest','foliagePilot','foliageGuides'])$(name).checked=state[name];
  $('foliageWind').value=state.foliageWind??'';
  $('surface').value=state.surface;
  for(const name of ['mainLight','secondLight','opening'])$(name).value=state[name];
  $('birdTime').value=state.birdTime;$('birdGuides').checked=state.birdGuides;
  $('skyGuides').checked=state.skyGuides;
  $('calendarPlay').textContent=state.calendarPlaying?'Pause sky':'Play sky';
  render();
}
function fixture(name){Object.assign(state,{day:135,fixed:true,...cameraDefaults,calendarPlaying:false,foliageWind:null,foliageRest:false,foliagePilot:false,surface:'dry',mainLight:0,secondLight:0,opening:0,bird:null,birdTime:0},fixtures[name],{time:1000,rain:name==='Daytime overcast'?.7:0,moonX:.78,moonY:.16});$('fixture').value=name;sync();}
$('fixture').onchange=()=>fixture($('fixture').value);
for(const name of ['hour','cover','time','motion','moonX','moonY','debug','day','calendarRate','bearing','pitch','fov','horizon'])$(name).oninput=()=>{const value=+$(name).value;if(Number.isFinite(value)){state[name]=value;render();}};
for(const name of ['fixed','far','near','foliageRest','foliagePilot','foliageGuides'])$(name).oninput=()=>{state[name]=$(name).checked;render();};
$('foliageWind').oninput=()=>{state.foliageWind=$('foliageWind').value===''?null:+$('foliageWind').value;render();};
$('surface').oninput=()=>{state.surface=$('surface').value;render();};
for(const name of ['mainLight','secondLight','opening'])$(name).oninput=()=>{state[name]=+$(name).value;render();};
$('birdTime').oninput=()=>{state.birdTime=+$('birdTime').value;render();};
$('birdGuides').oninput=()=>{state.birdGuides=$('birdGuides').checked;render();};
$('play').onclick=()=>{state.playing=!state.playing;$('play').textContent=state.playing?'Pause crossing':'Play crossing';};
$('calendarPlay').onclick=()=>{state.calendarPlaying=!state.calendarPlaying;state.fixed=false;sync();};
$('skyGuides').oninput=()=>{state.skyGuides=$('skyGuides').checked;render();};
$('loss').onclick=()=>{const extension=painter.gl?.getExtension('WEBGL_lose_context');if(extension){extension.loseContext();setTimeout(()=>extension.restoreContext(),1500);}};
let drag=null;
$('world').onpointerdown=e=>{drag=e.clientX;$('world').setPointerCapture(e.pointerId);};
$('world').onpointermove=e=>{if(drag!==null){painter.panBy(e.clientX-drag);drag=e.clientX;render();}};
$('world').onpointerup=$('world').onpointercancel=()=>{drag=null;};
addEventListener('keydown',e=>{if(e.key.toLowerCase()==='h'&&!/input|select/i.test(e.target.tagName))document.querySelector('aside').classList.toggle('hidden');});
function frame(timestamp){
  requestAnimationFrame(frame);if(document.hidden||timestamp-lastFrame<1000/30)return;
  if(state.playing&&lastMotionFrame){const elapsed=Math.min(1,(timestamp-lastMotionFrame)/1000);state.time+=elapsed;state.motion+=elapsed;state.birdTime+=elapsed;}
  if(state.calendarPlaying&&lastMotionFrame){const hours=state.hour+Math.min(1,(timestamp-lastMotionFrame)/1000)*state.calendarRate/3600;
    state.day+=Math.floor(hours/24);state.hour=hours%24;$('day').value=state.day;$('hour').value=state.hour;}
  lastMotionFrame=timestamp;lastFrame=timestamp-(timestamp-lastFrame)%(1000/30);render();
  window.skyStudy?.onFrame?.(timestamp);
  if(timestamp-lastUpdate>1000){lastUpdate=timestamp;$('celestial-status').textContent=celestialStatus();$('state').textContent=JSON.stringify({version:2,...state,ready:painter.ready,failure:painter.failure,
    layers:painter.cloudState,stats:painter.renderer?.stats,foliageFailure:painter.foliageFailure,foliage:painter.foliageState,foliageStats:painter.foliageRenderer?.stats},null,2);}
}
await painter.init();fixture('Equinox sunrise');requestAnimationFrame(frame);
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
window.skyStudy={painter,state,fixture,render,sync,runPixelChecks,runFoliagePixelChecks,conditions,celestialStatus,ready:true};
