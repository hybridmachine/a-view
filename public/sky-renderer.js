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
uniform vec3 sunDirection, cameraForward, cameraRight, cameraUp;
uniform vec3 cameraProjection;
uniform float sunWarmth;
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
  vec3 ray=normalize(cameraForward+cameraRight*(uv.x-.5)*cameraProjection.x+cameraUp*(cameraProjection.z-uv.y)*cameraProjection.y);
  float warmth=exp((dot(ray,sunDirection)-1.)*9.)*sunWarmth;
  sky+=vec3(.08,.032,.006)*warmth;
  sky=over(texture2D(celestial,uv),sky);
  vec4 farCloud=cloudLayer(uv,layer0,rect0,density0,deform0,tint0)*visibleLayers.x;
  vec4 nearCloud=cloudLayer(uv,layer1,rect1,density1,deform1,tint1)*visibleLayers.y;
  sky=over(nearCloud,over(farCloud,sky));
  float water=texture2D(waterMask,uv).r;
  vec4 original=texture2D(dayImage,uv);
  vec2 delta=vec2(water*sin(uv.y*240.+seconds*.72)*sin(uv.x*58.+seconds*.28)*.00065,
    water*sin(uv.y*170.-seconds*.55)*.00025);
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
  replaceForeground(images){
    images.forEach((image,index)=>{this.gl.activeTexture(this.gl.TEXTURE0+index);this.gl.bindTexture(this.gl.TEXTURE_2D,this.textures[index]);this.upload(image);});
  }
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
  updateCelestial(calendar, override, worldMs=calendar.total, camera=this.scene.sky.camera) {
    const {width,height}=this.scene;
    const pose=celestialPose(calendar,override,this.scene.sky.seed,{model:this.scene.sky.celestial,camera,width,height,worldMs});
    this.celestialPose=pose;
    // Cache the actual raster inputs at subpixel / sub-byte precision. This avoids
    // full canvas uploads for calendar changes too small to alter visible detail.
    const quantize=(x,step)=>Math.round(x/step)*step;
    const rasterBody=body=>{
      const opacity=quantize(body.opacity,1/255);
      // Invisible disks must not erase stars. Phase illumination is separate:
      // a visible new moon still conceals stars with its unlit hemisphere.
      return body.visible&&opacity>0?{
        x:quantize(body.x*width,.125),y:quantize(body.y*height,.125),
        matrix:body.matrix.map(x=>quantize(x,.03125)),opacity,
        warmth:quantize(body.warmth??0,1/255),light:body.light?.map(x=>quantize(x,.001)),
        illumination:quantize(body.illumination??1,1/255),
      }:null;
    };
    const raster={sun:rasterBody(pose.sun),moon:rasterBody(pose.moon),
      stars:pose.stars.filter(star=>star.visible&&star.opacity>1/510).map(star=>({
        x:quantize(star.x*width,.125),y:quantize(star.y*height,.125),radius:star.radius,opacity:quantize(star.opacity,1/255)}))};
    const key=JSON.stringify(raster);
    if(key===this.celestialKey)return;
    this.celestialKey=key;
    const start=performance.now(),ctx=this.celestialContext;
    ctx.clearRect(0,0,width,height);
    for(const star of raster.stars){ctx.fillStyle=`rgba(231,236,218,${star.opacity})`;ctx.beginPath();ctx.arc(star.x,star.y,star.radius,0,Math.PI*2);ctx.fill();}
    // Cover stars before atmospheric halos are drawn. The dark lunar hemisphere
    // must not punch a blue hole in the sun's foreground haze near new moon.
    for(const body of [raster.sun,raster.moon]){
      if(!body)continue;
      ctx.save();ctx.setTransform(...body.matrix,body.x,body.y);ctx.globalCompositeOperation='destination-out';
      ctx.fillStyle='#000';ctx.beginPath();ctx.arc(0,0,1,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    for(const [name,body]of [['sun',raster.sun],['moon',raster.moon]]){
      if(!body)continue;
      ctx.save();ctx.setTransform(...body.matrix,body.x,body.y);
      const solar=name==='sun',warm=body.warmth;
      const color=solar?`255,${Math.round(248-65*warm)},${Math.round(217-89*warm)}`:'230,233,215';
      const glow=ctx.createRadialGradient(0,0,.6,0,0,6);
      glow.addColorStop(0,`rgba(${color},${body.opacity*(solar?.20:.10*body.illumination)})`);glow.addColorStop(1,`rgba(${color},0)`);
      ctx.fillStyle=glow;ctx.fillRect(-6,-6,12,12);
      ctx.fillStyle=`rgba(${color},${body.opacity})`;ctx.beginPath();
      if(solar){ctx.arc(0,0,1,0,Math.PI*2);}
      else{
        const [lx,ly,lz]=body.light;
        ctx.rotate(Math.atan2(ly,lx));
        ctx.arc(0,0,1,-Math.PI/2,Math.PI/2);
        for(let i=0;i<=48;i++){const y=1-i/24;ctx.lineTo(-Math.max(-1,Math.min(1,lz))*Math.sqrt(Math.max(0,1-y*y)),y);}
        ctx.closePath();
      }
      ctx.fill();ctx.restore();
    }
    this.gl.activeTexture(this.gl.TEXTURE0+5);this.gl.bindTexture(this.gl.TEXTURE_2D,this.textures[5]);this.upload(this.celestialCanvas);
    this.stats.celestialUploads++;this.stats.uploadMs+=performance.now()-start;
  }
  draw({calendar,weather,realSeconds,motionSeconds=realSeconds,celestialTime=calendar.total,camera=this.scene.sky.camera,crop=[1,1],offset=[0,0],moon,debug=0,visibleLayers=[1,1],effects=1,synthetic=false,uniforms={}}) {
    if(!synthetic)this.updateCelestial(calendar,moon,celestialTime,camera);
    const gl=this.gl;gl.useProgram(this.program);gl.disable(gl.BLEND);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);const position=gl.getAttribLocation(this.program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    ['dayImage','nightImage','skyDay','skyNight','cloudAtlas','celestial','waterMask'].forEach((name,index)=>{
      gl.activeTexture(gl.TEXTURE0+index);gl.bindTexture(gl.TEXTURE_2D,this.textures[index]);gl.uniform1i(this.location(name),index);
    });
    const lighting=skyLighting(calendar,weather),states=sampleCloudLayers({realSeconds,motionSeconds,weather,config:this.scene.sky});
    const values={crop,offset,texel:[1/this.scene.width,1/this.scene.height],seconds:motionSeconds,light:calendar.light,
      cloud:weather.cloud,rain:weather.rain,wind:weather.wind,...lighting,effects,debugMode:debug,visibleLayers};
    const pose=synthetic?null:this.celestialPose,frame=pose?.frame;
    Object.assign(values,{sunDirection:pose?.sun.direction??[0,0,1],cameraForward:frame?.forward??[0,1,0],
      cameraRight:frame?.right??[1,0,0],cameraUp:frame?.up??[0,0,1],
      cameraProjection:frame?[frame.width/frame.focal,frame.height/frame.focal,frame.centerY]:[1,1,.5],
      sunWarmth:pose?(1-weather.cloud*.85)*Math.max(0,1-Math.abs(pose.sun.altitude-.05)/.22)*effects:0});
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
