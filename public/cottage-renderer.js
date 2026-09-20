import {loadImage} from './sky-renderer.js';
import {skyLighting} from '/shared/sky.js';

const VERTEX=`attribute vec2 corner;
uniform vec4 bounds,rect;
uniform vec2 sceneSize,atlasSize,crop,offset;
uniform float opening,hinged;
varying vec2 uv;
void main(){
  vec2 p=bounds.xy+corner*bounds.zw;
  if(hinged>.5){p.x=bounds.x+corner.x*bounds.z*cos(opening*1.18);p.y+=corner.x*opening*2.;}
  p=(p/sceneSize-offset)/crop;gl_Position=vec4(p.x*2.-1.,1.-p.y*2.,0.,1.);
  uv=(rect.xy+corner*rect.zw)/atlasSize;
}`;
const FRAGMENT=`precision mediump float;
uniform sampler2D dayImage,nightImage;
uniform float light,amount,emission;
uniform vec3 tint;
varying vec2 uv;
void main(){
  vec4 paint=mix(texture2D(nightImage,uv),texture2D(dayImage,uv),light);
  float strength=amount*(emission>.5?1.-light*.35:1.);
  gl_FragColor=vec4(paint.rgb*(emission>.5?vec3(1.):tint)*strength,paint.a*strength);
}`;

export function validateCottageConfig(config,scene){
  if(config?.version!==1||!Array.isArray(config.atlasSize)||config.atlasSize.length!==2||!config.atlasSize.every(n=>Number.isSafeInteger(n)&&n>0&&n<=512)||config.rooms?.length!==2||config.rooms[0].id!=='main'||config.rooms[1].id!=='second'||!config.casement)throw new Error('Invalid cottage configuration');
  for(const part of [...config.rooms,config.casement]){
    for(const [rect,size,padding]of [[part.bounds,[scene.width,scene.height],0],[part.rect,config.atlasSize,4],[part.emissionRect,config.atlasSize,4]]){
      if(!Array.isArray(rect)||rect.length!==4||!rect.every(Number.isSafeInteger)||rect[0]<padding||rect[1]<padding||rect[2]<=0||rect[3]<=0||rect[0]+rect[2]>size[0]-padding||rect[1]+rect[3]>size[1]-padding)throw new Error('Invalid cottage bounds');
    }
  }
  const room=config.rooms.find(room=>room.id===config.casement.room),pane=config.casement.bounds;
  if(!room||pane[0]<room.bounds[0]||pane[1]<room.bounds[1]||pane[0]+pane[2]>room.bounds[0]+room.bounds[2]||pane[1]+pane[3]+2>room.bounds[1]+room.bounds[3])throw new Error('Casement escapes its repair');
  const rects=[...config.rooms,config.casement].flatMap(part=>[part.rect,part.emissionRect]);
  for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){
    const a=rects[i],b=rects[j];
    if(a[0]-4<b[0]+b[2]+4&&a[0]+a[2]+4>b[0]-4&&a[1]-4<b[1]+b[3]+4&&a[1]+a[3]+4>b[1]-4)throw new Error('Cottage atlas regions overlap');
  }
  return config;
}

export async function loadCottageAssets(scene){
  if(!scene.cottageLife)return null;
  const config=validateCottageConfig(scene.cottageLife,scene),images=await Promise.all(['day','night'].map(key=>loadImage(config.assets[key])));
  const canvas=document.createElement('canvas');[canvas.width,canvas.height]=config.atlasSize;
  const ctx=canvas.getContext('2d',{willReadFrequently:true}),data=images.map(image=>{
    if(image.naturalWidth!==canvas.width||image.naturalHeight!==canvas.height)throw new Error('Invalid cottage atlas dimensions');
    ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height).data;
  });
  let covered=0,clear=0;
  for(let i=3;i<data[0].length;i+=4){if(data[0][i]!==data[1][i])throw new Error('Cottage coverage mismatch');if(data[0][i]===255)covered++;if(data[0][i]===0)clear++;}
  if(!covered||!clear)throw new Error('Invalid cottage coverage');
  for(const part of [...config.rooms,config.casement])for(const rect of [part.rect,part.emissionRect]){
    const [left,top,width,height]=rect;let visible=0,opaque=0;
    for(let y=top-4;y<top+height+4;y++)for(let x=left-4;x<left+width+4;x++){
      const alpha=data[0][(y*canvas.width+x)*4+3],inside=x>=left&&x<left+width&&y>=top&&y<top+height;
      if(!inside&&alpha)throw new Error('Cottage atlas padding is not clear');
      if(inside&&alpha)visible++;if(inside&&alpha===255)opaque++;
    }
    if(!visible||(rect===part.rect&&!opaque))throw new Error('Incomplete cottage repair or emission');
  }
  return images;
}

export class CottageRenderer{
  constructor(gl,scene,images){
    this.gl=gl;this.scene=scene;this.config=validateCottageConfig(scene.cottageLife,scene);
    this.textures=[];this.shaders=[];this.locations=new Map();this.attribute=-1;this.firstFrame=true;
    try{
      if(Math.max(...this.config.atlasSize)>gl.getParameter(gl.MAX_TEXTURE_SIZE)||gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)<2)throw new Error('Insufficient cottage texture capacity');
      this.program=gl.createProgram();
      for(const [type,source]of [[gl.VERTEX_SHADER,VERTEX],[gl.FRAGMENT_SHADER,FRAGMENT]]){
        const shader=gl.createShader(type);this.shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);
        if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));gl.attachShader(this.program,shader);
      }
      gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error('Cottage shader link failed');
      this.attribute=gl.getAttribLocation(this.program,'corner');this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1]),gl.STATIC_DRAW);
      images.forEach((image,i)=>{
        const texture=gl.createTexture();this.textures.push(texture);gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,texture);
        for(const name of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,name,gl.LINEAR);
        for(const name of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,name,gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
      });
      if(gl.getError()!==gl.NO_ERROR)throw new Error('Cottage upload failed');this.stats={textures:2,draws:6};
    }catch(error){this.dispose();throw error;}
    finally{gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.BROWSER_DEFAULT_WEBGL);}
  }
  location(name){if(!this.locations.has(name))this.locations.set(name,this.gl.getUniformLocation(this.program,name));return this.locations.get(name);}
  draw({calendar,weather,pose,crop,offset,diagnostics=false}){
    if(!pose)return;
    const gl=this.gl;gl.useProgram(this.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.enableVertexAttribArray(this.attribute);gl.vertexAttribPointer(this.attribute,2,gl.FLOAT,false,8,0);
    ['dayImage','nightImage'].forEach((name,i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,this.textures[i]);gl.uniform1i(this.location(name),i);});
    gl.uniform2f(this.location('sceneSize'),this.scene.width,this.scene.height);gl.uniform2fv(this.location('atlasSize'),this.config.atlasSize);
    gl.uniform2fv(this.location('crop'),crop);gl.uniform2fv(this.location('offset'),offset);gl.uniform1f(this.location('light'),calendar.light);gl.uniform1f(this.location('opening'),pose.open);
    const {dusk}=skyLighting(calendar,weather),shade=1-weather.cloud*.09-weather.rain*.07;gl.uniform3f(this.location('tint'),(1+dusk*.08)*shade,(1-dusk*.025)*shade,(1-dusk*.11)*shade);
    gl.enable(gl.BLEND);gl.blendEquation(gl.FUNC_ADD);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    try{
      for(const [part,hinged]of [...this.config.rooms.map(room=>[room,0]),[this.config.casement,1]]){
        gl.uniform4fv(this.location('bounds'),part.bounds);gl.uniform1f(this.location('hinged'),hinged);
        for(const emission of [0,1]){
          gl.uniform4fv(this.location('rect'),emission?part.emissionRect:part.rect);gl.uniform1f(this.location('emission'),emission);
          gl.uniform1f(this.location('amount'),emission?pose[part.id??part.room]:1);gl.drawArrays(gl.TRIANGLES,0,6);
        }
      }
      if((this.firstFrame||diagnostics)&&gl.getError()!==gl.NO_ERROR)throw new Error('Cottage draw failed');this.firstFrame=false;
    }finally{gl.disable(gl.BLEND);gl.disableVertexAttribArray(this.attribute);}
  }
  dispose(){
    const gl=this.gl;if(this.attribute>=0)gl.disableVertexAttribArray(this.attribute);
    this.textures.forEach(texture=>gl.deleteTexture(texture));this.shaders.forEach(shader=>gl.deleteShader(shader));
    if(this.buffer)gl.deleteBuffer(this.buffer);if(this.program)gl.deleteProgram(this.program);
    this.textures=[];this.shaders=[];this.buffer=null;this.program=null;this.locations.clear();
  }
}
