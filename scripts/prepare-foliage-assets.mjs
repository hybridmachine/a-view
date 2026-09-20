// Offline deterministic extraction from the canonical painting. Requires Sharp.
// The generated repair source is used ONLY beneath selected grass pixels.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {LAKESIDE_FOLIAGE as config} from '../shared/lakeside-foliage.js';
import {validateFoliageConfig} from '../shared/foliage.js';
import {assertMatchingCoverage,verifyFoliageExport} from './foliage-asset-validation.mjs';
const sharp=createRequire(import.meta.url)('sharp');
const width=1672,height=941,raw={width,height,channels:4};
validateFoliageConfig(config,width,height);
const directory='public/assets/lakeside-foliage-v1';
await mkdir(directory,{recursive:true});await mkdir('docs/foliage-validation',{recursive:true});
async function foreground(path){
  const {data,info}=await sharp(path).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(info.width!==width||info.height!==height||info.channels!==4)throw new Error(`Invalid foreground dimensions: ${path}`);
  return data;
}
const day=await foreground('public/assets/lakeside-sky-v1/foreground-day.png');
const night=await foreground('public/assets/lakeside-sky-v1/foreground-night.png');
assertMatchingCoverage(day,night,width*height,'Source foreground');
const repair=await sharp('artwork/lakeside-foliage-v1/ground-repair-source.png').resize(width,height).ensureAlpha().raw().toBuffer();
const dayLow=await sharp(day,{raw}).blur(8).raw().toBuffer(),nightLow=await sharp(night,{raw}).blur(8).raw().toBuffer();
const bases=[Buffer.from(day),Buffer.from(night)],sources=[day,night];
const [aw,ah]=config.atlasSize,atlases=[Buffer.alloc(aw*ah*4),Buffer.alloc(aw*ah*4)],mask=Buffer.alloc(width*height);
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
for(const patch of config.patches){
  const [left,top,w,h]=patch.bounds,[ax,ay]=patch.rect;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=((top+y)*width+left+x)*4,j=((ay+y)*aw+ax+x)*4;
    // Narrow fixed seams, not a wide feather around each leaf silhouette.
    const edge=smooth(Math.min(x,w-1-x)/5)*smooth(Math.min(y,h-1-y)/4);
    const originalAlpha=day[i+3]/255;
    let selection=edge;
    if(patch.type==='grass'){
      // Author-selected grass rectangles; warm green/ochre blades are separated
      // from the blue-gray water. No runtime color classification is used.
      const chroma=Math.min(day[i+1]-day[i+2],day[i]-day[i+2]);
      selection*=smooth(Math.min((chroma-5)/12,(day[i+1]*.92-day[i+2])/10));
    }
    const alpha=Math.round(originalAlpha*selection*255)/255;
    mask[(top+y)*width+left+x]=Math.round(alpha*255);
    for(let light=0;light<2;light++){
      const source=sources[light],base=bases[light],atlas=atlases[light];
      atlas[j+3]=Math.round(alpha*255);
      if(patch.type==='leaf'){
        // Split original coverage exactly: patch OVER base = original at rest.
        base[i+3]=Math.round((alpha>=1?0:(originalAlpha-alpha)/(1-alpha))*255);
        for(let c=0;c<3;c++)atlas[j+c]=source[i+c];
      }else{
        for(let c=0;c<3;c++){
          const background=Math.min(255,repair[i+c]*(light?nightLow[i+c]/Math.max(1,dayLow[i+c]):1));
          // Limit the repair at translucent edges so recovered paint stays in
          // gamut and the rest composite retains the canonical color.
          const low=alpha&&alpha<1?-(255-source[i+c])*alpha/(1-alpha):-255;
          const high=alpha&&alpha<1?source[i+c]*alpha/(1-alpha):255;
          const delta=Math.max(low,Math.min(high,(background-source[i+c])*alpha));
          base[i+c]=Math.round(source[i+c]+delta);
          const repaired=base[i+c];
          // Remove the old background contribution from partially covered tips.
          atlas[j+c]=Math.round(Math.max(0,Math.min(255,alpha?(source[i+c]-(1-alpha)*repaired)/alpha:source[i+c])));
        }
      }
    }
  }
}
// Validate both lighting plates and all alpha pairs BEFORE writing any exports.
const verification=verifyFoliageExport({sources,bases,atlases,width,height,config});
const stats={version:1,width,height,atlas:config.atlasSize,patches:config.patches.length,alpha:'straight PNG; premultiplied once on upload',
  restMaxError:Math.max(...verification.map(v=>v.maxError)),restMeanError:Math.max(...verification.map(v=>v.meanError)),
  rest:Object.fromEntries(verification.map(({rest,...metrics},i)=>[i?'night':'day',metrics]))};
for(let i=0;i<2;i++){
  await sharp(bases[i],{raw}).png().toFile(`${directory}/base-${i?'night':'day'}.png`);
  await sharp(atlases[i],{raw:{width:aw,height:ah,channels:4}}).png().toFile(`${directory}/foliage-${i?'night':'day'}.png`);
  await sharp(verification[i].rest,{raw}).png().toFile(`docs/foliage-validation/rest-foreground${i?'-night':''}.png`);
}
await sharp(mask,{raw:{width,height,channels:1}}).png().toFile('artwork/lakeside-foliage-v1/selection-mask.png');
const outlines=config.patches.map(p=>{const[x,y,w,h]=p.bounds;return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#ffdb71"/><text x="${x}" y="${y-4}" fill="white" font-size="12">${p.id}</text>`;}).join('');
await sharp('public/assets/lakeside-day.png').composite([{input:Buffer.from(`<svg width="${width}" height="${height}">${outlines}</svg>`)}]).png().toFile('docs/foliage-validation/selections.png');
await writeFile(`${directory}/export.json`,JSON.stringify(stats,null,2)+'\n');
console.log(JSON.stringify(stats));
