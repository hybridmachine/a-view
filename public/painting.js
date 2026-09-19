import { birdPose, clamp, hash, mix, mod, SCENES, smooth, viewConditions } from '/shared/world.js';

const VERTEX = `attribute vec2 position; varying vec2 vUv; void main(){vUv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
const FRAGMENT = `precision highp float;
uniform sampler2D dayImage; uniform sampler2D nightImage; uniform sampler2D waterMask;
uniform vec2 crop; uniform vec2 offset; uniform float seconds; uniform float light; uniform float cloud; uniform float rain; uniform float wind; uniform float dusk;
varying vec2 vUv;
void main(){
  vec2 uv=vec2(vUv.x,1.-vUv.y)*crop+offset;
  float water=texture2D(waterMask,uv).r;
  float wave=sin(uv.y*240.+seconds*.72)*sin(uv.x*58.+seconds*.28);
  vec2 sampleUv=uv;
  sampleUv.x+=water*wave*.00065;
  sampleUv.y+=water*sin(uv.y*170.-seconds*.55)*.00025;
  // Tiny local displacement in leafy areas; stable trunks and cottage geometry.
  vec3 original=texture2D(dayImage,uv).rgb;
  float canopy=(1.-smoothstep(.40,.55,uv.x))*(1.-smoothstep(.27,.39,uv.y));
  float grass=smoothstep(.79,.98,uv.y)*(1.-smoothstep(.45,.58,uv.x));
  float green=smoothstep(.025,.12,original.g-original.b)*(1.-smoothstep(.65,.8,original.r));
  sampleUv.x+=(canopy+grass)*green*sin(seconds*1.1+uv.x*55.+uv.y*12.)*.00037*wind;
  vec3 day=texture2D(dayImage,sampleUv).rgb;
  vec3 night=texture2D(nightImage,sampleUv).rgb;
  vec3 color=mix(night,day,light);
  color*=vec3(1.+dusk*.08,1.-dusk*.025,1.-dusk*.11);
  color*=1.-cloud*.09-rain*.07;
  float glimmer=pow(max(0.,sin(uv.y*790.+sin(uv.x*160.)+seconds*.6)),18.);
  color+=water*glimmer*.011*light;
  gl_FragColor=vec4(color,1.);
}`;

function loadImage(url) { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error(`Could not load ${url}`)); image.src = url; }); }
function shader(gl, type, source) { const s=gl.createShader(type); gl.shaderSource(s,source); gl.compileShader(s); if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
function makeWaterMask() {
  const canvas=document.createElement('canvas');canvas.width=836;canvas.height=471;
  const ctx=canvas.getContext('2d');ctx.fillStyle='black';ctx.fillRect(0,0,836,471);ctx.fillStyle='white';
  const outline=[[.49,.567],[1,.561],[1,1],[.966,1],[.897,.907],[.797,.843],[.743,.802],[.677,.78],[.602,.758],[.535,.747],[.52,.725],[.573,.706],[.637,.685],[.646,.674],[.619,.667],[.566,.638],[.508,.615]];
  ctx.beginPath();outline.forEach(([x,y],i)=>i?ctx.lineTo(x*836,y*471):ctx.moveTo(x*836,y*471));ctx.closePath();ctx.fill();return canvas;
}

export class Painting {
  constructor(canvas, lifeCanvas) {
    this.canvas=canvas;this.lifeCanvas=lifeCanvas;this.ctx=lifeCanvas.getContext('2d');this.pan=.38;this.motion=!matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.width=innerWidth;this.height=innerHeight;this.scene=SCENES[0];this.ready=false;this.fallback=document.querySelector('#fallback');
    this.resize=()=>{
      this.width=innerWidth;this.height=innerHeight;
      const dpr=Math.min(devicePixelRatio||1,1.6);
      for(const c of [canvas,lifeCanvas]) { c.width=Math.round(this.width*dpr);c.height=Math.round(this.height*dpr); }
      this.dpr=dpr; this.ctx.setTransform(dpr,0,0,dpr,0,0);
      if(this.gl)this.gl.viewport(0,0,canvas.width,canvas.height);
      const scale=Math.max(this.width/1672,this.height/941);
      this.artWidth=1672*scale;this.artHeight=941*scale;this.scale=scale;
      this.crop=[this.width/this.artWidth,this.height/this.artHeight];
      this.updateCrop();
    };
    addEventListener('resize',this.resize);this.resize();
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.ready=false;canvas.classList.remove('ready');});
    canvas.addEventListener('webglcontextrestored',()=>this.init().catch(console.error));
  }
  updateCrop(){this.offset=[(1-this.crop[0])*this.pan,(1-this.crop[1])*.5];this.fallback.style.objectPosition=`${this.pan*100}% 50%`;}
  panBy(dx){if(this.artWidth>this.width+10){this.pan=clamp(this.pan-dx/(this.artWidth-this.width));this.updateCrop();}}
  point(x,y){return [(x-this.offset[0])*this.artWidth,(y-this.offset[1])*this.artHeight];}
  async init(){
    this.images=await Promise.all([loadImage(this.scene.assets.day),loadImage(this.scene.assets.night)]);
    const gl=this.canvas.getContext('webgl',{alpha:false,antialias:false,powerPreference:'low-power'});this.gl=gl;
    if(!gl){this.ready=true;return;}
    const program=gl.createProgram();gl.attachShader(program,shader(gl,gl.VERTEX_SHADER,VERTEX));gl.attachShader(program,shader(gl,gl.FRAGMENT_SHADER,FRAGMENT));gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));gl.useProgram(program);this.program=program;
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    [...this.images,makeWaterMask()].forEach((image,index)=>{
      const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0+index);gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);gl.uniform1i(gl.getUniformLocation(program,['dayImage','nightImage','waterMask'][index]),index);
    });
    this.uniforms=Object.fromEntries(['crop','offset','seconds','light','cloud','rain','wind','dusk'].map(name=>[name,gl.getUniformLocation(program,name)]));
    this.resize();this.ready=true;this.canvas.classList.add('ready');
  }
  render(snapshot,now,study=null){
    if(!this.ready||!snapshot)return;
    const epoch=snapshot.world.epoch;
    const {calendar:c,weather:w}=viewConditions(epoch,now,study);
    const seconds=this.motion?(now-epoch)/1000:0;
    const dusk=(1-smooth(.04,.30,Math.abs(c.elevation)))*smooth(-.15,.04,c.elevation);
    if(this.gl){
      const gl=this.gl,u=this.uniforms;gl.useProgram(this.program);gl.uniform2fv(u.crop,this.crop);gl.uniform2fv(u.offset,this.offset);
      for(const [key,value]of Object.entries({seconds,light:c.light,cloud:w.cloud,rain:w.rain,wind:w.wind,dusk}))gl.uniform1f(u[key],value);
      gl.drawArrays(gl.TRIANGLES,0,6);
    }else{
      // Static painting remains available when GPU rendering is unavailable.
      const url=c.light>.5?this.scene.assets.day:this.scene.assets.night;
      if(this.fallback.getAttribute('src')!==url)this.fallback.src=url;
    }
    this.ctx.clearRect(0,0,this.width,this.height);
    this.drawSky(c,w,seconds);
    if(this.motion){this.drawSmoke(c,seconds);this.drawReeds(c,w,seconds);}
    this.drawNest(snapshot.world.nest,c);
    if(!study)this.drawBird(snapshot.world.action,now,c,seconds);
    if(this.motion&&!study)this.drawDistantBirds(c,seconds);
    if(w.rain>.05)this.drawRain(w,seconds,c);
    return {calendar:c,weather:w};
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
      const bend=Math.sin(seconds*(.7+hash(i)*.15)+i)*3*w.wind*this.scale;
      ctx.strokeStyle=`rgba(${Math.round(55*c.light+21)},${Math.round(66*c.light+27)},${Math.round(33*c.light+20)},.42)`;ctx.lineWidth=.7*this.scale;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+5*this.scale+bend,y-height*.5,x+8*this.scale+bend*2,y-height);ctx.stroke();
    }
  }
  drawSky(c,w,seconds){
    const ctx=this.ctx,night=1-c.light;
    if(night<.05)return;
    for(let i=0;i<48;i++){
      // Stable star field drifts with the accelerated sky; restrict to clear sky.
      const ux=.58+mod(hash(i+617)*.53+c.hour*.003,.45),uy=.025+hash(i+941)*.24;
      const [x,y]=this.point(ux,uy),r=(.35+hash(i)*.6)*this.scale;
      ctx.fillStyle=`rgba(231,236,218,${night*(1-w.cloud)*(.2+hash(i+7)*.45)})`;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    }
    const phase=mod(c.total/86400000,29.53)/29.53,angle=(c.hour-12)/24*Math.PI*2-phase*Math.PI*2;
    const elevation=Math.cos(angle);
    if(elevation<.15)return;
    const [x,y]=this.point(.78+Math.sin(angle)*.12,.30-elevation*.19),r=9*this.scale;
    const glow=ctx.createRadialGradient(x,y,r*.5,x,y,r*5);glow.addColorStop(0,`rgba(235,232,199,${night*.12*(1-w.cloud)})`);glow.addColorStop(1,'rgba(235,232,199,0)');ctx.fillStyle=glow;ctx.fillRect(x-r*5,y-r*5,r*10,r*10);
    // Disk phase is sampled geometrically, with no opaque dark overlay on the sky.
    ctx.fillStyle=`rgba(230,232,207,${night*.68*(1-w.cloud*.8)})`;
    const sunX=Math.sin(phase*Math.PI*2),sunZ=-Math.cos(phase*Math.PI*2);
    for(let yy=-r;yy<=r;yy+=1){for(let xx=-r;xx<=r;xx+=1){const nx=xx/r,ny=yy/r,nz=Math.sqrt(Math.max(0,1-nx*nx-ny*ny));if(nx*nx+ny*ny<=1&&nx*sunX+nz*sunZ>0)ctx.fillRect(x+xx,y+yy,1.2,1.2);}}
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
