import { birdPose, clamp, hash, mix, mod, SCENES, viewConditions } from '/shared/world.js';
import { loadImage, loadSkyAssets, SkyRenderer } from './sky-renderer.js';
import { FoliageRenderer, loadFoliageAssets } from './foliage-renderer.js';
import { sampleFoliage } from '/shared/foliage.js';

export class Painting {
  constructor(canvas, lifeCanvas, { scene = SCENES[0], fallback = document.querySelector('#fallback') } = {}) {
    this.canvas=canvas;this.lifeCanvas=lifeCanvas;this.ctx=lifeCanvas.getContext('2d');this.pan=.38;
    this.scene=scene;this.fallback=fallback;this.ready=false;this.generation=0;this.disposed=false;
    this.media=matchMedia('(prefers-reduced-motion: reduce)');this.motion=!this.media.matches;
    this.frozenMotion=null;this.lastMotion=null;
    this.motionChanged=event=>{
      this.motion=!event.matches;
      this.frozenMotion=this.motion?null:this.lastMotion;
    };
    this.media.addEventListener('change',this.motionChanged);
    this.resize=()=>{
      this.width=innerWidth;this.height=innerHeight;
      const dpr=Math.min(devicePixelRatio||1,1.6);
      for(const c of [canvas,lifeCanvas]) { c.width=Math.round(this.width*dpr);c.height=Math.round(this.height*dpr); }
      this.dpr=dpr;this.ctx.setTransform(dpr,0,0,dpr,0,0);
      const scale=Math.max(this.width/this.scene.width,this.height/this.scene.height);
      this.artWidth=this.scene.width*scale;this.artHeight=this.scene.height*scale;this.scale=scale;
      this.crop=[this.width/this.artWidth,this.height/this.artHeight];this.updateCrop();
    };
    this.contextLost=event=>{
      event.preventDefault();this.generation++;this.ready=false;
      this.hideGPU();this.ctx.clearRect(0,0,this.width,this.height);
      this.renderer?.dispose();this.renderer=null;this.foliageRenderer?.dispose();this.foliageRenderer=null;this.intactForeground=null;
    };
    this.contextRestored=()=>{if(!this.disposed)this.init();};
    addEventListener('resize',this.resize);
    canvas.addEventListener('webglcontextlost',this.contextLost);
    canvas.addEventListener('webglcontextrestored',this.contextRestored);
    this.resize();
  }
  hideGPU(){this.canvas.classList.remove('ready');this.canvas.style.visibility='hidden';}
  updateCrop(){this.offset=[(1-this.crop[0])*this.pan,(1-this.crop[1])*.5];if(this.fallback)this.fallback.style.objectPosition=`${this.pan*100}% 50%`;}
  panBy(dx){if(this.artWidth>this.width+10){this.pan=clamp(this.pan-dx/(this.artWidth-this.width));this.updateCrop();}}
  point(x,y){return [(x-this.offset[0])*this.artWidth,(y-this.offset[1])*this.artHeight];}
  async init(){
    if(this.disposed)return;
    const generation=++this.generation;
    this.ready=false;this.hideGPU();this.renderer?.dispose();this.renderer=null;
    this.foliageRenderer?.dispose();this.foliageRenderer=null;this.intactForeground=null;this.foliageFailure=null;this.completeFrame=false;
    // Original plates load independently; sky failure cannot reject this fallback.
    this.fallbackImages??=Promise.allSettled([loadImage(this.scene.assets.day),loadImage(this.scene.assets.night)]);
    try{
      const gl=this.canvas.getContext('webgl',{alpha:false,antialias:false,powerPreference:'low-power'});this.gl=gl;
      if(!gl||gl.isContextLost())return;
      const [images,foliage]=await Promise.all([loadSkyAssets(this.scene),loadFoliageAssets(this.scene).then(images=>({images}),error=>({error}))]);
      if(this.disposed||generation!==this.generation||gl.isContextLost())return;
      this.intactForeground=images.slice(0,2);
      if(foliage.error)this.foliageFailure=foliage.error.message;
      if(foliage.images){
        try{this.foliageRenderer=new FoliageRenderer(gl,this.scene,foliage.images.slice(2));}
        catch(error){this.foliageFailure=error.message;}
      }
      this.renderer=new SkyRenderer(gl,this.scene,this.foliageRenderer?[...foliage.images.slice(0,2),...images.slice(2)]:images);
      this.ready=true;this.failure=null;
      // Visibility is committed only by the first successful complete render.
    }catch(error){
      if(generation===this.generation&&!this.disposed){this.renderer?.dispose();this.renderer=null;this.foliageRenderer?.dispose();this.foliageRenderer=null;this.intactForeground=null;this.failure=error.message;this.hideGPU();console.warn('Dynamic sky unavailable; using original painting.',error);}
    }
  }
  render(snapshot,now,study=null,preview=null){
    if(this.disposed||!snapshot)return;
    const epoch=snapshot.world.epoch;
    const {calendar:c,weather:w}=preview?.conditions??viewConditions(epoch,now,study);
    const realSeconds=preview?.realSeconds??(now-epoch)/1000;
    if(!this.motion&&this.frozenMotion===null)this.frozenMotion=realSeconds;
    const motionSeconds=preview?.motionSeconds??(this.motion?realSeconds:this.frozenMotion);
    this.lastMotion=motionSeconds;
    // Keep fallback illumination current during startup, failures and context loss.
    const url=c.light>.5?this.scene.assets.day:this.scene.assets.night;
    if(this.fallback&&this.fallback.getAttribute('src')!==url)this.fallback.src=url;
    if(this.ready&&this.renderer&&!this.gl.isContextLost()){
      this.cloudState=this.renderer.draw({calendar:c,weather:w,realSeconds,motionSeconds,crop:this.crop,offset:this.offset,
        moon:preview?.moon,debug:preview?.debug,visibleLayers:preview?.visibleLayers});
      if(this.foliageRenderer&&!preview?.debug){
        try{
          this.foliageState=this.foliageRenderer.draw({calendar:c,weather:w,motionSeconds,crop:this.crop,offset:this.offset,
            windOverride:preview?.foliageWind,rest:preview?.foliageRest,only:preview?.foliageOnly});
          if(!this.completeFrame&&this.gl.getError()!==this.gl.NO_ERROR)throw new Error('Foliage frame failed');
        }catch(error){
          this.foliageFailure=error.message;this.foliageRenderer.dispose();this.foliageRenderer=null;this.foliageState=null;
          this.renderer.replaceForeground(this.intactForeground);
          this.cloudState=this.renderer.draw({calendar:c,weather:w,realSeconds,motionSeconds,crop:this.crop,offset:this.offset,moon:preview?.moon});
        }
      }
      if(!preview?.debug)this.completeFrame=true;
      this.canvas.style.visibility='visible';this.canvas.classList.add('ready');
    }
    const seconds=motionSeconds;
    this.ctx.clearRect(0,0,this.width,this.height);
    if(!preview?.debug){
      if(this.motion){this.drawSmoke(c,seconds);this.drawReeds(c,w,seconds);}
      this.drawNest(snapshot.world.nest,c);
      if(!study)this.drawBird(snapshot.world.action,now,c,seconds);
      if(this.motion&&!study)this.drawDistantBirds(c,seconds);
      if(w.rain>.05)this.drawRain(w,seconds,c);
    }
    return {calendar:c,weather:w};
  }
  dispose(){
    if(this.disposed)return;
    this.disposed=true;this.generation++;this.ready=false;this.hideGPU();
    removeEventListener('resize',this.resize);this.media.removeEventListener('change',this.motionChanged);
    this.canvas.removeEventListener('webglcontextlost',this.contextLost);this.canvas.removeEventListener('webglcontextrestored',this.contextRestored);
    this.renderer?.dispose();this.renderer=null;this.foliageRenderer?.dispose();this.foliageRenderer=null;this.intactForeground=null;this.fallbackImages=null;
    this.ctx.clearRect(0,0,this.width,this.height);
  }
  drawNest(nest,c){
    const ctx=this.ctx,[x,y]=this.point(this.scene.nest.x,this.scene.nest.y+.006),s=this.scale;
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.globalAlpha=.75;ctx.lineWidth=.85;
    for(let i=0;i<nest.materials*3;i++){
      ctx.strokeStyle=i%3===0?'#b2a079':'#5f5940';ctx.globalAlpha=mix(.25,.85,c.light);ctx.beginPath();
      const a=hash(i+1),b=hash(i+99);ctx.moveTo(-10+a*8,-2+b*4);ctx.quadraticCurveTo(0,8+hash(i)*3,4+a*7,-1+b*3);ctx.stroke();
    }ctx.restore();
  }
  drawBird(action,now,c,seconds){
    if(c.elevation<-.12)return;
    const pose=birdPose(action,now);const [x,y]=this.point(pose.x,pose.y);
    const ctx=this.ctx;const size=this.scale*(pose.y>.5?.85:1);
    ctx.save();ctx.translate(x,y);ctx.scale(size*pose.direction,size);ctx.globalAlpha=mix(.55,.9,c.light);
    ctx.fillStyle='#4a4b3b';ctx.beginPath();ctx.ellipse(0,-2,5.3,3.1,-.1,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#736750';ctx.beginPath();ctx.ellipse(1,-1.4,3.6,2.3,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#393e32';ctx.beginPath();ctx.arc(4,-4,2.6,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.moveTo(5,-4.3);ctx.lineTo(8,-3.5);ctx.lineTo(5,-2.9);ctx.fill();
    ctx.beginPath();ctx.moveTo(-4,-2);ctx.lineTo(-10,-5);ctx.lineTo(-8,0);ctx.closePath();ctx.fill();
    if(pose.flying&&this.motion){
      const flap=Math.sin(seconds*37);ctx.fillStyle='#4b5041';ctx.beginPath();ctx.moveTo(-2,-3);ctx.quadraticCurveTo(-5,-8-flap*6,2,-12-flap*5);ctx.lineTo(4,-4);ctx.closePath();ctx.fill();
      ctx.globalAlpha*=.65;ctx.beginPath();ctx.moveTo(-1,-2);ctx.quadraticCurveTo(0,2+flap*7,6,5+flap*7);ctx.lineTo(3,-2);ctx.fill();
    }else{ctx.strokeStyle='#62573f';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(0,1);ctx.lineTo(0,4);ctx.moveTo(3,1);ctx.lineTo(2,4);ctx.stroke();}
    ctx.fillStyle='#d9d5b7';ctx.beginPath();ctx.arc(5,-4.6,.6,0,Math.PI*2);ctx.fill();
    if(pose.carrying){ctx.strokeStyle='#a88e63';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(7,-4);ctx.lineTo(13,1);ctx.stroke();}ctx.restore();
  }
  drawDistantBirds(c,seconds){
    if(c.light<.4)return;
    const cycle=Math.floor(seconds/135),t=mod(seconds,135);
    if(t>23)return;
    const ctx=this.ctx;
    for(let i=0;i<3;i++){
      const x=.52+t/23*.53-i*.035,y=.28+hash(cycle+20)*.1+i*.009+Math.sin(t*.3+i)*.008;
      const [px,py]=this.point(x,y);const wing=Math.sin(t*12+i)*3.5*this.scale;
      ctx.strokeStyle='#424b4899';ctx.lineWidth=.85*this.scale;ctx.beginPath();ctx.moveTo(px-4*this.scale,py-wing);ctx.quadraticCurveTo(px-2*this.scale,py,px,py+1);ctx.quadraticCurveTo(px+2*this.scale,py,px+4*this.scale,py-wing);ctx.stroke();
    }
  }
  drawSmoke(c,seconds){
    const ctx=this.ctx,[x,y]=this.point(...this.scene.cottage.chimney);
    const warmth=c.hour>16||c.hour<9?.14:.055;
    for(let i=0;i<9;i++){
      const age=mod(seconds*.18+i/9,1),s=this.scale;
      const px=x+age*22*s+Math.sin(age*5+seconds*.12)*6*s,py=y-age*75*s;
      const r=(5+age*13)*s;const g=ctx.createRadialGradient(px,py,0,px,py,r);
      g.addColorStop(0,`rgba(209,206,188,${Math.sin(age*Math.PI)*warmth})`);g.addColorStop(1,'rgba(209,206,188,0)');ctx.fillStyle=g;ctx.fillRect(px-r,py-r,r*2,r*2);
    }
  }
  drawReeds(c,w,seconds){
    const ctx=this.ctx;
    for(let i=0;i<24;i++){
      const ux=.69+hash(i+132)*.24,uy=.92+hash(i+31)*.1;
      const [x,y]=this.point(ux,uy),height=(28+hash(i+63)*53)*this.scale;
      // Painted shore tufts now occupy this range; retain only the sparse reeds
      // farther east, driven by the same deterministic passing breeze.
      if(this.foliageRenderer&&ux<.865)continue;
      const bend=sampleFoliage(seconds,{id:`reed-${i}`,type:'grass',bounds:[ux*this.scene.width,uy*this.scene.height],maxDisplacement:3,exposure:.9},this.scene.foliage?.seed).bend*this.scale;
      ctx.strokeStyle=`rgba(${Math.round(55*c.light+21)},${Math.round(66*c.light+27)},${Math.round(33*c.light+20)},.42)`;ctx.lineWidth=.7*this.scale;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+5*this.scale+bend,y-height*.5,x+8*this.scale+bend*2,y-height);ctx.stroke();
    }
  }
  drawRain(w,seconds,c){
    const ctx=this.ctx;ctx.lineWidth=.65;ctx.strokeStyle=`rgba(223,230,224,${.10+w.rain*.13})`;
    const count=Math.round(230*w.rain);
    ctx.beginPath();for(let i=0;i<count;i++){
      const x=mod(hash(i+811)*this.width+seconds*(11+hash(i)*8),this.width),y=mod(hash(i+328)*this.height+seconds*(240+hash(i+21)*160),this.height);
      ctx.moveTo(x,y);ctx.lineTo(x+2,y+7+hash(i)*5);
    }ctx.stroke();
  }
}
