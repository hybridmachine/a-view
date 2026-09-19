import { celestialPose, sampleCloudLayers, skyLighting } from '/shared/sky.js';

export const VERTEX = `attribute vec2 position;
varying vec2 vUv;
void main(){vUv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;

// Samples are premultiplied on upload. Like the original painting renderer,
// blending is in the image's display/sRGB values (not a new linear-light pipeline).
export const FRAGMENT = `precision highp float;
uniform sampler2D dayImage, nightImage, skyDay, skyNight, cloudAtlas, celestial, waterMask;
uniform vec2 crop, offset, texel;
uniform float seconds, light, cloud, rain, wind, dusk, effects, debugMode;
uniform vec3 waterTint;
uniform vec4 layer0, layer1, rect0, rect1, density0, density1;
uniform vec2 deform0, deform1;
uniform vec3 tint0, tint1;
uniform vec2 visibleLayers;
varying vec2 vUv;
vec3 over(vec4 front, vec3 back){return front.rgb+(1.-front.a)*back;}
vec4 cloudLayer(vec2 uv,vec4 layer,vec4 rect,vec4 density,vec2 deform,vec3 tint){
  vec2 local=vec2((uv.x-layer.x)/layer.y,(uv.y-layer.z)/layer.w);
  // Periodic, cloud-local deformation keeps shading attached to the density.
  local.y+=sin(local.x*6.283185307+deform.x)*deform.y;
  local.x+=sin(local.y*5.+deform.x)*deform.y*.3;
  float band=smoothstep(0.,.035,local.y)*(1.-smoothstep(.965,1.,local.y));
  vec4 paint=texture2D(cloudAtlas,rect.xy+vec2(fract(local.x),clamp(local.y,0.,1.))*rect.zw);
  float alpha=max(smoothstep(density.x-density.y,density.x+density.y,paint.a)*density.z*band,density.w);
  vec3 shading=paint.a>.001?paint.rgb/paint.a:vec3(.82);
  return vec4(shading*tint*alpha,alpha);
}
float interior(vec2 uv){
  float a=texture2D(dayImage,uv).a;
  a=min(a,texture2D(dayImage,uv+vec2(texel.x*2.,0.)).a);
  a=min(a,texture2D(dayImage,uv-vec2(texel.x*2.,0.)).a);
  a=min(a,texture2D(dayImage,uv+vec2(0.,texel.y*2.)).a);
  a=min(a,texture2D(dayImage,uv-vec2(0.,texel.y*2.)).a);
  return step(.999,a);
}
void main(){
  vec2 uv=vec2(vUv.x,1.-vUv.y)*crop+offset;
  vec3 sky=mix(texture2D(skyNight,uv).rgb,texture2D(skyDay,uv).rgb,light);
  sky*=vec3(1.+dusk*.08,1.-dusk*.025,1.-dusk*.11);
  sky=over(texture2D(celestial,uv),sky);
  vec4 farCloud=cloudLayer(uv,layer0,rect0,density0,deform0,tint0)*visibleLayers.x;
  vec4 nearCloud=cloudLayer(uv,layer1,rect1,density1,deform1,tint1)*visibleLayers.y;
  sky=over(nearCloud,over(farCloud,sky));
  float water=texture2D(waterMask,uv).r;
  vec4 original=texture2D(dayImage,uv);
  vec2 delta=vec2(water*sin(uv.y*240.+seconds*.72)*sin(uv.x*58.+seconds*.28)*.00065,
    water*sin(uv.y*170.-seconds*.55)*.00025);
  float canopy=(1.-smoothstep(.40,.55,uv.x))*(1.-smoothstep(.27,.39,uv.y));
  float grass=smoothstep(.79,.98,uv.y)*(1.-smoothstep(.45,.58,uv.x));
  float green=smoothstep(.025,.12,original.g-original.b)*(1.-smoothstep(.65,.8,original.r));
  delta.x+=(canopy+grass)*green*sin(seconds*1.1+uv.x*55.+uv.y*12.)*.00037*wind;
  delta*=effects;
  vec2 sampleUv=uv;
  if(original.a>=.999 && dot(delta,delta)>0.){
    // Only moving interior landscape needs neighborhood taps. Sky and fixed
    // silhouette texels avoid these samples entirely; the 2px margin exceeds
    // the authored displacement, and proposed coverage is checked as well.
    float safe=interior(uv)*step(.999,texture2D(dayImage,uv+delta).a);
    sampleUv+=delta*safe;
  }
  vec4 foreground=mix(texture2D(nightImage,sampleUv),texture2D(dayImage,sampleUv),light);
  foreground.rgb*=mix(1.,1.-cloud*.09-rain*.07,effects);
  foreground.rgb*=mix(vec3(1.),vec3(1.+dusk*.08,1.-dusk*.025,1.-dusk*.11),effects);
  float glimmer=pow(max(0.,sin(uv.y*790.+sin(uv.x*160.)+seconds*.6)),18.);
  foreground.rgb+=water*(waterTint+glimmer*.011*light)*foreground.a*effects;
  vec3 color=over(foreground,sky);
  if(debugMode==1.)color=vec3(original.a);
  if(debugMode==2.)color=vec3(farCloud.a);
  if(debugMode==3.)color=vec3(nearCloud.a);
  if(debugMode==4.)color=vec3((1.-farCloud.a)*(1.-nearCloud.a));
  if(debugMode==5.)color=sky;
  gl_FragColor=vec4(color,1.);
}`;

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer=setTimeout(()=>{image.onload=image.onerror=null;image.src='';reject(new Error(`Timed out loading ${url}`));},15000);
    image.onload = () => {clearTimeout(timer);resolve(image);};
    image.onerror = () => {clearTimeout(timer);reject(new Error(`Could not load ${url}`));};
    image.src = url;
  });
}

export async function loadSkyAssets(scene) {
  if (!scene.sky || scene.sky.version !== 1) throw new Error('No supported sky bundle');
  const keys = ['foregroundDay', 'foregroundNight', 'day', 'night', 'clouds'];
  const images = await Promise.all(keys.map(key => loadImage(scene.sky.assets[key])));
  images.forEach((image, i) => {
    const size = i === 4 ? scene.sky.atlasSize : [scene.width, scene.height];
    if (image.naturalWidth !== size[0] || image.naturalHeight !== size[1]) throw new Error(`Invalid sky asset dimensions: ${keys[i]}`);
  });
  if (scene.sky.layers.length !== 2) throw new Error('Exactly two cloud layers required');
  for (const layer of scene.sky.layers) {
    const [x,y,w,h]=layer.rect,[aw,ah]=scene.sky.atlasSize;
    if (![x,y,w,h].every(Number.isFinite) || x<1 || y<1 || w<=0 || h<=0 || x+w>=aw || y+h>=ah || layer.period<=0 || layer.height<=0) throw new Error('Invalid atlas interior');
  }
  const canvas=document.createElement('canvas');canvas.width=scene.width;canvas.height=scene.height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const data=images.slice(0,2).map(image=>{ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height).data;});
  let transparent=0,opaque=0;
  for(let i=3;i<data[0].length;i+=4){
    if(data[0][i]!==data[1][i])throw new Error('Foreground coverage mismatch');
    if(data[0][i]===0)transparent++;
    if(data[0][i]===255)opaque++;
  }
  canvas.width=canvas.height=1;
  if(!transparent||!opaque)throw new Error('Foreground needs both sky and landscape coverage');
  for(const image of images.slice(2,4)){
    canvas.width=scene.width;canvas.height=scene.height;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0);
    const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    for(let i=3;i<rgba.length;i+=4)if(rgba[i]!==255)throw new Error('Clear sky must be opaque');
  }
  canvas.width=canvas.height=1;
  return images;
}

export function makeWaterMask(scene) {
  const canvas=document.createElement('canvas');canvas.width=Math.ceil(scene.width/2);canvas.height=Math.ceil(scene.height/2);
  const ctx=canvas.getContext('2d');ctx.fillStyle='black';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='white';
  const outline=[[.49,.567],[1,.561],[1,1],[.966,1],[.897,.907],[.797,.843],[.743,.802],[.677,.78],[.602,.758],[.535,.747],[.52,.725],[.573,.706],[.637,.685],[.646,.674],[.619,.667],[.566,.638],[.508,.615]];
  ctx.beginPath();outline.forEach(([x,y],i)=>i?ctx.lineTo(x*canvas.width,y*canvas.height):ctx.moveTo(x*canvas.width,y*canvas.height));ctx.closePath();ctx.fill();return canvas;
}

export class SkyRenderer {
  constructor(gl, scene, images, { water = makeWaterMask(scene), celestialTexture = null } = {}) {
    this.gl=gl;this.scene=scene;this.textures=[];this.shaders=[];this.locations=new Map();
    this.stats={celestialUploads:0,uploadMs:0,staticUploads:0};
    try {
      const maxSize=gl.getParameter(gl.MAX_TEXTURE_SIZE);
      if(gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)<7 || Math.max(scene.width,scene.height,...scene.sky.atlasSize)>maxSize)throw new Error('Insufficient WebGL texture capacity');
      this.program=gl.createProgram();
      for(const [type,source]of [[gl.VERTEX_SHADER,VERTEX],[gl.FRAGMENT_SHADER,FRAGMENT]]){
        const shader=gl.createShader(type);this.shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);
        if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader)||'Sky shader compilation failed');
        gl.attachShader(this.program,shader);
      }
      gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(this.program)||'Sky program linking failed');
      this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      this.celestialCanvas=document.createElement('canvas');this.celestialCanvas.width=scene.width;this.celestialCanvas.height=scene.height;
      this.celestialContext=this.celestialCanvas.getContext('2d');
      [...images,celestialTexture??this.celestialCanvas,water].forEach((image,index)=>{
        const texture=gl.createTexture();this.textures.push(texture);gl.activeTexture(gl.TEXTURE0+index);gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        this.upload(image,false);this.stats.staticUploads++;
      });
      if(gl.getError()!==gl.NO_ERROR)throw new Error('Sky texture upload failed');
    } catch(error) { this.dispose();throw error; }
  }
  location(name){if(!this.locations.has(name))this.locations.set(name,this.gl.getUniformLocation(this.program,name));return this.locations.get(name);}
  uniform(name,value){
    const gl=this.gl,location=this.location(name);
    if(location===null)return;
    if(Array.isArray(value)||ArrayBuffer.isView(value))gl[`uniform${value.length}fv`](location,value);else gl.uniform1f(location,value);
  }
  upload(image, update=true) {
    const gl=this.gl;
    // Top-left image rows match the shader's flipped viewport UV. No GL blending:
    // explicit premultiplied 'over' happens exactly once inside the shader.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);
    if(update)gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,image);
    else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.BROWSER_DEFAULT_WEBGL);
  }
  updateCelestial(calendar, override) {
    const pose=celestialPose(calendar,override,this.scene.sky.seed);
    // Cache the actual raster inputs at subpixel / sub-byte precision. This avoids
    // full canvas uploads for calendar changes too small to alter visible detail.
    const quantize=(x,step)=>Math.round(x/step)*step;
    pose.night=quantize(pose.night,1/255);
    pose.moon.x=quantize(pose.moon.x,1/(this.scene.width*4));pose.moon.y=quantize(pose.moon.y,1/(this.scene.height*4));
    pose.moon.phase=quantize(pose.moon.phase,.0002);
    for(const star of pose.stars)star.x=quantize(star.x,1/(this.scene.width*4));
    const key=JSON.stringify(pose);
    if(key===this.celestialKey)return;
    this.celestialKey=key;
    const start=performance.now(),ctx=this.celestialContext,{width,height}=this.scene;
    ctx.clearRect(0,0,width,height);
    if(pose.night>=.05){
      for(const star of pose.stars){ctx.fillStyle=`rgba(231,236,218,${pose.night*star.opacity})`;ctx.beginPath();ctx.arc(star.x*width,star.y*height,star.radius,0,Math.PI*2);ctx.fill();}
      if(pose.moon.visible){
        const {x:ux,y:uy,radius:r,phase}=pose.moon,x=ux*width,y=uy*height;
        const glow=ctx.createRadialGradient(x,y,r*.5,x,y,r*5);glow.addColorStop(0,`rgba(235,232,199,${pose.night*.12})`);glow.addColorStop(1,'rgba(235,232,199,0)');ctx.fillStyle=glow;ctx.fillRect(x-r*5,y-r*5,r*10,r*10);
        ctx.fillStyle=`rgba(230,232,207,${pose.night*.68})`;
        const sunX=Math.sin(phase*Math.PI*2),sunZ=-Math.cos(phase*Math.PI*2);
        for(let yy=-r;yy<=r;yy++)for(let xx=-r;xx<=r;xx++){
          const nx=xx/r,ny=yy/r,nz=Math.sqrt(Math.max(0,1-nx*nx-ny*ny));
          if(nx*nx+ny*ny<=1&&nx*sunX+nz*sunZ>0)ctx.fillRect(x+xx,y+yy,1.2,1.2);
        }
      }
    }
    this.gl.activeTexture(this.gl.TEXTURE0+5);this.gl.bindTexture(this.gl.TEXTURE_2D,this.textures[5]);this.upload(this.celestialCanvas);
    this.stats.celestialUploads++;this.stats.uploadMs+=performance.now()-start;
  }
  draw({calendar,weather,realSeconds,motionSeconds=realSeconds,crop=[1,1],offset=[0,0],moon,debug=0,visibleLayers=[1,1],effects=1,synthetic=false,uniforms={}}) {
    if(!synthetic)this.updateCelestial(calendar,moon);
    const gl=this.gl;gl.useProgram(this.program);gl.disable(gl.BLEND);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);const position=gl.getAttribLocation(this.program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    ['dayImage','nightImage','skyDay','skyNight','cloudAtlas','celestial','waterMask'].forEach((name,index)=>{
      gl.activeTexture(gl.TEXTURE0+index);gl.bindTexture(gl.TEXTURE_2D,this.textures[index]);gl.uniform1i(this.location(name),index);
    });
    const lighting=skyLighting(calendar,weather),states=sampleCloudLayers({realSeconds,motionSeconds,weather,config:this.scene.sky});
    const values={crop,offset,texel:[1/this.scene.width,1/this.scene.height],seconds:motionSeconds,light:calendar.light,
      cloud:weather.cloud,rain:weather.rain,wind:weather.wind,...lighting,effects,debugMode:debug,visibleLayers};
    states.forEach((state,index)=>{
      const config=this.scene.sky.layers[index],density=state.density,[aw,ah]=this.scene.sky.atlasSize,[x,y,w,h]=config.rect;
      values[`layer${index}`]=[state.phase,config.period,config.top,config.height];
      // Pixel-center bounds plus duplicated gutters protect linear filtering.
      values[`rect${index}`]=[(x+.5)/aw,(y+.5)/ah,(w-1)/aw,(h-1)/ah];
      values[`density${index}`]=[density.threshold,density.softness,density.opacity,density.floor];
      values[`deform${index}`]=[state.deformation,config.deformationAmount];
      const warmth=[1+lighting.dusk*.08,1-lighting.dusk*.025,1-lighting.dusk*.11];
      values[`tint${index}`]=config.dayTint.map((day,i)=>(config.nightTint[i]+(day-config.nightTint[i])*calendar.light)*(1-weather.rain*.16)*warmth[i]);
    });
    for(const [name,value]of Object.entries({...values,...uniforms}))this.uniform(name,value);
    gl.viewport(0,0,gl.canvas.width,gl.canvas.height);gl.drawArrays(gl.TRIANGLES,0,6);
    return states;
  }
  dispose(){
    const gl=this.gl;
    for(const texture of this.textures)gl.deleteTexture(texture);
    for(const shader of this.shaders)gl.deleteShader(shader);
    if(this.buffer)gl.deleteBuffer(this.buffer);
    if(this.program)gl.deleteProgram(this.program);
    this.textures=[];this.shaders=[];this.buffer=null;this.program=null;this.locations.clear();
    if(this.celestialCanvas)this.celestialCanvas.width=this.celestialCanvas.height=1;
    this.celestialCanvas=null;this.celestialContext=null;
  }
}
