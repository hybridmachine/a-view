import {createFoliageMesh,sampleFoliage,validateFoliageConfig} from '/shared/foliage.js';
import {skyLighting} from '/shared/sky.js';
import {loadImage} from './sky-renderer.js';

export const FOLIAGE_VERTEX=`
attribute vec4 positionUv;
attribute vec2 weights;
uniform vec2 sceneSize, crop, offset;
uniform vec3 pose;
varying vec2 uv;
void main(){
  vec2 point=positionUv.xy+vec2(pose.x*weights.x+pose.y*weights.y,pose.z*weights.x);
  vec2 screen=(point/sceneSize-offset)/crop;
  gl_Position=vec4(screen.x*2.-1.,1.-screen.y*2.,0.,1.);
  // Atlas rows already use image-top coordinates and uploads are unflipped.
  // Only scene Y is inverted for clip space; inverting atlas V would flip paint.
  uv=positionUv.zw;
}`;
export const FOLIAGE_FRAGMENT=`precision mediump float;
uniform sampler2D dayImage,nightImage;
uniform float light;
uniform vec3 tint;
varying vec2 uv;
void main(){vec4 paint=mix(texture2D(nightImage,uv),texture2D(dayImage,uv),light);gl_FragColor=vec4(paint.rgb*tint,paint.a);}`;

export async function loadFoliageAssets(scene){
  if(!scene.foliage)return null;
  const config=validateFoliageConfig(scene.foliage,scene.width,scene.height);
  const images=await Promise.all(['baseDay','baseNight','day','night'].map(key=>loadImage(config.assets[key])));
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
  for(let pair=0;pair<2;pair++){
    const size=pair?config.atlasSize:[scene.width,scene.height];
    const data=images.slice(pair*2,pair*2+2).map(image=>{
      if(image.naturalWidth!==size[0]||image.naturalHeight!==size[1])throw new Error('Invalid foliage asset dimensions');
      canvas.width=size[0];canvas.height=size[1];ctx.drawImage(image,0,0);
      return ctx.getImageData(0,0,...size).data;
    });
    let opaque=0,clear=0;
    for(let i=3;i<data[0].length;i+=4){
      if(data[0][i]!==data[1][i])throw new Error('Foliage coverage mismatch');
      if(data[0][i]===255)opaque++;if(data[0][i]===0)clear++;
    }
    if(!opaque||!clear)throw new Error('Foliage needs both covered and transparent pixels');
    if(pair)for(const patch of config.patches){
      const [x,y,w,h]=patch.rect;
      for(let yy=y-4;yy<y+h+4;yy++)for(let xx=x-4;xx<x+w+4;xx++){
        if(xx>=x&&xx<x+w&&yy>=y&&yy<y+h)continue;
        if(data[0][(yy*size[0]+xx)*4+3])throw new Error('Foliage atlas gutter is not clear');
      }
    }
  }
  canvas.width=canvas.height=1;
  return images;
}

export class FoliageRenderer{
  constructor(gl,scene,images){
    this.gl=gl;this.scene=scene;this.config=validateFoliageConfig(scene.foliage,scene.width,scene.height);
    this.textures=[];this.shaders=[];this.patches=[];this.locations=new Map();this.poses=[];this.attributes=[];
    try{
      if(Math.max(...this.config.atlasSize)>gl.getParameter(gl.MAX_TEXTURE_SIZE)||gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)<2)throw new Error('Insufficient foliage texture capacity');
      this.program=gl.createProgram();
      for(const [type,source]of [[gl.VERTEX_SHADER,FOLIAGE_VERTEX],[gl.FRAGMENT_SHADER,FOLIAGE_FRAGMENT]]){
        const shader=gl.createShader(type);this.shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);
        if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader)||'Foliage shader compilation failed');
        gl.attachShader(this.program,shader);
      }
      gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error('Foliage shader link failed');
      this.attributes=[['positionUv',4,0],['weights',2,16]].map(([name,size,start])=>({location:gl.getAttribLocation(this.program,name),size,start}));
      const vertices=[];
      for(const patch of [...this.config.patches].sort((a,b)=>a.order-b.order)){
        const mesh=createFoliageMesh(patch,this.config.atlasSize);
        this.patches.push({patch,first:vertices.length/6,count:mesh.length/6});vertices.push(...mesh);
      }
      this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
      for(const [index,image]of images.entries()){
        const texture=gl.createTexture();this.textures.push(texture);gl.activeTexture(gl.TEXTURE0+index);gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
      }
      if(gl.getError()!==gl.NO_ERROR)throw new Error('Foliage upload failed');
      this.stats={patches:this.patches.length,vertices:vertices.length/6,staticUploads:2};
    }catch(error){this.dispose();throw error;}
    finally{gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.BROWSER_DEFAULT_WEBGL);}
  }
  location(name){if(!this.locations.has(name))this.locations.set(name,this.gl.getUniformLocation(this.program,name));return this.locations.get(name);}
  draw({calendar,weather,motionSeconds,crop,offset,windOverride=null,rest=false,only=null}){
    const gl=this.gl;gl.useProgram(this.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    for(const {location,size,start}of this.attributes){
      gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,24,start);
    }
    for(const [index,name]of ['dayImage','nightImage'].entries()){
      gl.activeTexture(gl.TEXTURE0+index);gl.bindTexture(gl.TEXTURE_2D,this.textures[index]);gl.uniform1i(this.location(name),index);
    }
    gl.uniform2f(this.location('sceneSize'),this.scene.width,this.scene.height);
    gl.uniform2fv(this.location('crop'),crop);gl.uniform2fv(this.location('offset'),offset);gl.uniform1f(this.location('light'),calendar.light);
    const {dusk}=skyLighting(calendar,weather),shade=1-weather.cloud*.09-weather.rain*.07;
    gl.uniform3f(this.location('tint'),(1+dusk*.08)*shade,(1-dusk*.025)*shade,(1-dusk*.11)*shade);
    gl.enable(gl.BLEND);gl.blendEquation(gl.FUNC_ADD);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    gl.viewport(0,0,gl.canvas.width,gl.canvas.height);this.poses.length=0;
    try{
      for(const {patch,first,count}of this.patches){
        // A pilot selection holds the other patches at rest, never removes them.
        const pose=sampleFoliage(motionSeconds,patch,this.config.seed,rest||(only&&!only.includes(patch.id))?0:windOverride);
        this.poses.push(pose);gl.uniform3f(this.location('pose'),pose.bend,pose.flutter,pose.lift);gl.drawArrays(gl.TRIANGLES,first,count);
      }
    }finally{gl.disable(gl.BLEND);for(const {location}of this.attributes)gl.disableVertexAttribArray(location);}
    return this.poses;
  }
  dispose(){
    const gl=this.gl;
    for(const {location}of this.attributes)gl.disableVertexAttribArray(location);
    for(const texture of this.textures)gl.deleteTexture(texture);for(const shader of this.shaders)gl.deleteShader(shader);
    if(this.buffer)gl.deleteBuffer(this.buffer);if(this.program)gl.deleteProgram(this.program);
    this.textures=[];this.shaders=[];this.buffer=null;this.program=null;this.locations.clear();
  }
}
