// Offline production art: canonical geometry, neutral repairs, and separate light.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {LAKESIDE_COTTAGE as config} from '../shared/lakeside-cottage.js';
const sharp=createRequire(import.meta.url)('sharp'),width=1672,height=941;
const directory='public/assets/lakeside-cottage-v1';await mkdir(directory,{recursive:true});await mkdir('docs/cottage-validation',{recursive:true});
const sources=await Promise.all(['day','night'].map(light=>sharp(`public/assets/lakeside-sky-v1/foreground-${light}.png`).ensureAlpha().raw().toBuffer()));
const repair=await sharp('artwork/lakeside-cottage-v1/interior-source.png').resize(148,72).ensureAlpha().raw().toBuffer();
const [aw,ah]=config.atlasSize,atlases=[Buffer.alloc(aw*ah*4),Buffer.alloc(aw*ah*4)];
const clamp=(value,a=0,b=1)=>Math.max(a,Math.min(b,value));
const pane=config.casement.bounds;
const inPane=(x,y)=>x>=pane[0]&&x<pane[0]+pane[2]&&y>=pane[1]&&y<pane[1]+pane[3];
for(const room of config.rooms){
  const [left,top,w,h]=room.bounds;
  // Estimate ambient color from the surrounding stone, outside the baked glow.
  const sums=[0,0,0],counts=[0,0,0];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    if(Math.min(x,y,w-1-x,h-1-y)>2)continue;
    const i=((top+y)*width+left+x)*4;
    for(let c=0;c<3;c++)if(sources[0][i+c]>50){sums[c]+=sources[1][i+c]/sources[0][i+c];counts[c]++;}
  }
  const ambient=sums.map((sum,c)=>clamp(sum/Math.max(1,counts[c]),.15,.6));
  for(const [part,rect]of [['base',room.rect],['emission',room.emissionRect]]){
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const sx=left+x,sy=top+y,i=(sy*width+sx)*4,j=((rect[1]+y)*aw+rect[0]+x)*4;
      const edge=clamp(Math.min(x,y,w-1-x,h-1-y)/8);
      const luminance=(sources[0][i]+sources[0][i+1]+sources[0][i+2])/3;
      const glass=room.id==='main'?inPane(sx,sy):(sx>=603&&sx<=615&&sy>=491&&sy<=519);
      const isInterior=room.id==='main'&&inPane(sx,sy);
      const emission=glass?(isInterior?.84:clamp((90-luminance)/35)*.9):0;
      for(let light=0;light<2;light++){
        const target=atlases[light];target[j+3]=Math.round((part==='emission'?emission:edge)*255);
        for(let c=0;c<3;c++){
          const reference=isInterior?repair[((sy-476)*148+sx-490)*4+c]:sources[0][i+c];
          target[j+c]=Math.round(part==='emission'?[224,166,76][c]:light?reference*ambient[c]:reference);
        }
      }
    }
  }
  if(room.id==='main'){
    const [left,top,w,h]=pane;
    for(const [part,rect]of [['pane',config.casement.rect],['emission',config.casement.emissionRect]]){
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const i=((top+y)*width+left+x)*4,j=((rect[1]+y)*aw+rect[0]+x)*4;
        const luminance=(sources[0][i]+sources[0][i+1]+sources[0][i+2])/3;
        for(let light=0;light<2;light++){
          atlases[light][j+3]=part==='pane'?255:Math.round(clamp((92-luminance)/38)*.9*255);
          for(let c=0;c<3;c++)atlases[light][j+c]=part==='emission'?[224,166,76][c]:Math.round(sources[0][i+c]*(light?ambient[c]:1));
        }
      }
    }
  }
}
for(let i=3;i<atlases[0].length;i+=4)if(atlases[0][i]!==atlases[1][i])throw new Error('Cottage alpha mismatch');
for(const [i,light]of ['day','night'].entries())await sharp(atlases[i],{raw:{width:aw,height:ah,channels:4}}).png().toFile(`${directory}/cottage-${light}.png`);
await writeFile(`${directory}/export.json`,JSON.stringify({version:1,atlas:config.atlasSize,rooms:2,casements:1,alpha:'matching straight-alpha pair; premultiplied once on upload',interiorSource:'generated repair restricted to the main casement recess',geometry:'canonical registered daytime foreground'},null,2)+'\n');
