import {FoliageRenderer} from '../foliage-renderer.js';

// Synthetic assets exercise the production mesh shader and premultiplied blend.
export function runFoliagePixelChecks(){
  const output=[],canvas=document.createElement('canvas');canvas.width=canvas.height=64;
  const gl=canvas.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true});
  if(!gl)return [{name:'Foliage WebGL available',pass:false}];
  const texture=(color)=>{const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(17,4,6,40);return c;};
  const patch={id:'fixture',type:'grass',bounds:[16,16,32,40],rect:[4,4,32,40],anchor:[.5,1],mesh:[8,10],maxDisplacement:8,exposure:1,order:0};
  const scene={width:64,height:64,foliage:{version:1,seed:941,atlasSize:[64,64],assets:{baseDay:'x',baseNight:'x',day:'x',night:'x'},patches:[patch]}};
  const renderer=new FoliageRenderer(gl,scene,[texture('rgba(64,160,40,.5)'),texture('rgba(20,40,80,.5)')]);
  const conditions={calendar:{light:1,elevation:1,hour:12},weather:{cloud:0,rain:0},motionSeconds:12,crop:[1,1],offset:[0,0],windOverride:0};
  const pixel=(x,y)=>{const p=new Uint8Array(4);gl.readPixels(x,63-y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return [...p].slice(0,3);};
  const check=(name,actual,expected,tolerance=3)=>output.push({name,actual,expected,pass:actual.every((n,i)=>Math.abs(n-expected[i])<=tolerance)});
  const draw=(extra={})=>{gl.clearColor(32/255,64/255,96/255,1);gl.clear(gl.COLOR_BUFFER_BIT);renderer.draw({...conditions,...extra});};
  try{
    draw();check('Foliage alpha is premultiplied exactly once',pixel(31,20),[48,112,68]);
    const tip=pixel(29,20),root=pixel(31,54);
    draw({windOverride:1});check('Root remains attached under a strong gust',pixel(31,54),root);
    output.push({name:'Moving silhouette reveals the background',pass:pixel(29,20).some((n,i)=>Math.abs(n-tip[i])>5)});
    draw({calendar:{...conditions.calendar,light:0}});check('Night color follows the registered night atlas',pixel(31,20),[26,52,88]);
    draw({crop:[.5,.5],offset:[.25,.25]});check('Foliage uses scene crop and pan',pixel(30,8),[48,112,68]);
    draw();check('Atlas padding does not produce a rectangle',pixel(18,20),[32,64,96]);
    check('No foliage WebGL errors',[gl.getError()],[gl.NO_ERROR],0);
  }finally{renderer.dispose();gl.getExtension('WEBGL_lose_context')?.loseContext();}
  return output;
}
