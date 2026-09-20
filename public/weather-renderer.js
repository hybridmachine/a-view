import {loadImage} from './sky-renderer.js';
import {skyLighting} from '/shared/sky.js';

const VERTEX = `attribute vec4 positionUv;
uniform vec2 sceneSize,crop,offset;
varying vec2 uv;
void main(){vec2 p=(positionUv.xy/sceneSize-offset)/crop;
gl_Position=vec4(p.x*2.-1.,1.-p.y*2.,0.,1.);uv=positionUv.zw;}`;
const FRAGMENT = `precision mediump float;
uniform sampler2D dayImage,nightImage;
uniform float light,amount,puddle,motion;
uniform vec3 tint;
varying vec2 uv;
void main(){
  vec4 paint=mix(texture2D(nightImage,uv),texture2D(dayImage,uv),light);
  float a=paint.a*amount;
  if(puddle>.5)a=smoothstep(.02,.12,amount)*smoothstep(1.-amount,1.-amount+.12,paint.a)*.78;
  vec3 color=paint.a>.001?paint.rgb/paint.a:vec3(0.);
  float ripple=puddle*sin(uv.y*1800.+motion*2.)*.007*light;
  gl_FragColor=vec4((color*tint+ripple)*a,a);
}`;

export function validateWeatherConfig(config, scene) {
  if (config?.version !== 1 || !Array.isArray(config.atlasSize) || config.atlasSize.length !== 2 ||
      !config.atlasSize.every(n => Number.isSafeInteger(n) && n > 0 && n <= 1024) ||
      !Array.isArray(config.patches) || config.patches.length < 1 || config.patches.length > 8) throw new Error('Invalid weather configuration');
  for (const patch of config.patches) {
    for (const [rect, size] of [[patch.bounds, [scene.width, scene.height]], [patch.rect, config.atlasSize]]) {
      if (!Array.isArray(rect) || rect.length !== 4 || !rect.every(Number.isSafeInteger) ||
          rect[0] < 0 || rect[1] < 0 || rect[2] <= 0 || rect[3] <= 0 || rect[0]+rect[2] > size[0] || rect[1]+rect[3] > size[1]) throw new Error('Invalid weather patch');
    }
    if (!['pathWetness','stoneWetness','puddleStorage'].includes(patch.store)) throw new Error('Unknown weather store');
  }
  return config;
}

export async function loadWeatherAssets(scene) {
  if (!scene.surfaceWeather) return null;
  const config = validateWeatherConfig(scene.surfaceWeather, scene);
  const images = await Promise.all(['day','night'].map(key => loadImage(config.assets[key])));
  const canvas = document.createElement('canvas'); [canvas.width, canvas.height] = config.atlasSize;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  const data = images.map(image => {
    if (image.naturalWidth !== canvas.width || image.naturalHeight !== canvas.height) throw new Error('Invalid weather atlas dimensions');
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  });
  let covered = 0, clear = 0;
  for (let i = 3; i < data[0].length; i += 4) {
    if (data[0][i] !== data[1][i]) throw new Error('Weather coverage mismatch');
    if (data[0][i]) covered++; else clear++;
  }
  if (!covered || !clear) throw new Error('Empty or unmasked weather atlas');
  return images;
}

export class WeatherRenderer {
  constructor(gl, scene, images) {
    this.gl=gl; this.scene=scene; this.config=validateWeatherConfig(scene.surfaceWeather, scene);
    this.textures=[]; this.shaders=[]; this.locations=new Map(); this.attribute=-1; this.firstFrame=true;
    try {
      if (Math.max(...this.config.atlasSize)>gl.getParameter(gl.MAX_TEXTURE_SIZE) || gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)<2) throw new Error('Insufficient weather texture capacity');
      this.program=gl.createProgram();
      for (const [type,source] of [[gl.VERTEX_SHADER,VERTEX],[gl.FRAGMENT_SHADER,FRAGMENT]]) {
        const shader=gl.createShader(type); this.shaders.push(shader); gl.shaderSource(shader,source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
        gl.attachShader(this.program,shader);
      }
      gl.linkProgram(this.program); if (!gl.getProgramParameter(this.program,gl.LINK_STATUS)) throw new Error('Weather shader link failed');
      this.attribute=gl.getAttribLocation(this.program,'positionUv');
      const vertices=[],[aw,ah]=this.config.atlasSize;
      for (const {bounds:[x,y,w,h],rect:[ax,ay,rw,rh]} of this.config.patches) {
        for (const [u,v] of [[0,0],[1,0],[0,1],[0,1],[1,0],[1,1]]) vertices.push(x+u*w,y+v*h,(ax+u*rw)/aw,(ay+v*rh)/ah);
      }
      this.buffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
      images.forEach((image,i) => {
        const texture=gl.createTexture(); this.textures.push(texture); gl.activeTexture(gl.TEXTURE0+i); gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
      });
      if (gl.getError()!==gl.NO_ERROR) throw new Error('Weather upload failed');
      this.stats={textures:2,vertices:vertices.length/4};
    } catch(error) {this.dispose(); throw error;}
    finally {gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.BROWSER_DEFAULT_WEBGL);}
  }
  location(name) {if (!this.locations.has(name)) this.locations.set(name,this.gl.getUniformLocation(this.program,name)); return this.locations.get(name);}
  draw({calendar,weather,surface,motionSeconds,crop,offset,diagnostics=false}) {
    if (!surface) return;
    const gl=this.gl; gl.useProgram(this.program); gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    gl.enableVertexAttribArray(this.attribute); gl.vertexAttribPointer(this.attribute,4,gl.FLOAT,false,16,0);
    ['dayImage','nightImage'].forEach((name,i) => {gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,this.textures[i]);gl.uniform1i(this.location(name),i);});
    gl.uniform2f(this.location('sceneSize'),this.scene.width,this.scene.height); gl.uniform2fv(this.location('crop'),crop); gl.uniform2fv(this.location('offset'),offset);
    gl.uniform1f(this.location('light'),calendar.light); gl.uniform1f(this.location('motion'),motionSeconds%4096);
    const {dusk}=skyLighting(calendar,weather),shade=1-weather.cloud*.09-weather.rain*.07;
    gl.uniform3f(this.location('tint'),(1+dusk*.08)*shade,(1-dusk*.025)*shade,(1-dusk*.11)*shade);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    try {
      this.config.patches.forEach((patch,i) => {
        gl.uniform1f(this.location('amount'),surface[patch.store]); gl.uniform1f(this.location('puddle'),patch.store==='puddleStorage'?1:0);
        gl.drawArrays(gl.TRIANGLES,i*6,6);
      });
      if ((this.firstFrame||diagnostics) && gl.getError()!==gl.NO_ERROR) throw new Error('Weather draw failed');
      this.firstFrame=false;
    } finally {gl.disable(gl.BLEND);gl.disableVertexAttribArray(this.attribute);}
  }
  dispose() {
    const gl=this.gl;
    if (this.attribute>=0) gl.disableVertexAttribArray(this.attribute);
    this.textures.forEach(texture=>gl.deleteTexture(texture));this.shaders.forEach(shader=>gl.deleteShader(shader));
    if(this.buffer)gl.deleteBuffer(this.buffer);if(this.program)gl.deleteProgram(this.program);
    this.textures=[];this.shaders=[];this.buffer=null;this.program=null;this.locations.clear();
  }
}
