// Offline export only; requires sharp. No image processing dependency ships to visitors.
// Usage: NODE_PATH=/path/to/node_modules node scripts/prepare-sky-assets.mjs clear-sky.png clouds.png
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const sharp = createRequire(import.meta.url)('sharp');
const [skySource = 'public/assets/lakeside-sky-v1/sky-day.png', cloudSource = 'artwork/lakeside-sky-v1/clouds-source.png'] = process.argv.slice(2);
const dir = 'public/assets/lakeside-sky-v1';
await mkdir(dir, { recursive: true });
const width = 1672, height = 941, pixels = width * height;
const raw = { width, height, channels: 3 };
const day = await sharp('public/assets/lakeside-day.png').removeAlpha().raw().toBuffer();
const night = await sharp('public/assets/lakeside-night.png').removeAlpha().raw().toBuffer();
// Transfer only low-frequency night illumination onto canonical day geometry.
// This deliberately removes the small silhouette/brushwork registration differences.
const dayLow = await sharp(day, { raw }).blur(8).raw().toBuffer();
const nightLow = await sharp(night, { raw }).blur(8).raw().toBuffer();
const sky = await sharp(skySource).resize(width, height).removeAlpha().raw().toBuffer();
await sharp(sky, { raw }).png().toFile(`${dir}/sky-day.png`);
const nightSky = Buffer.from(sky);
for (let i = 0; i < pixels; i++) {
  // Identical brush registration, subdued slate-blue palette, no baked glow.
  nightSky[i * 3] = sky[i * 3] * .22;
  nightSky[i * 3 + 1] = sky[i * 3 + 1] * .31;
  nightSky[i * 3 + 2] = sky[i * 3 + 2] * .43;
}
await sharp(nightSky, { raw }).png().toFile(`${dir}/sky-night.png`);
// Hand-traced native-resolution hill contour, snapped within 4 px to its painted edge.
const horizon = [[0,278],[488,278],[531,285],[569,286],[630,305],[675,310],[717,320],[772,313],[805,313],[839,304],[878,310],[911,316],[950,317],[992,326],[1037,333],[1074,340],[1116,342],[1163,335],[1208,337],[1245,345],[1296,350],[1335,360],[1372,357],[1408,367],[1440,365],[1471,352],[1506,348],[1539,345],[1592,348],[1637,342],[1671,342]];
// Detailed trace of the open ridge, recorded in a 2x inspection crop whose
// native origin is (800,270). This avoids snapping to interior hill brushmarks.
const openRidge=[[0,88],[82,72],[116,78],[150,77],[188,81],[219,88],[247,89],[276,85],[304,89],[333,98],[350,111],[373,124],[404,132],[425,140],[470,131],[500,133],[530,124],[562,130],[584,133],[610,148],[635,160],[670,159],[694,165],[718,173],[750,168],[791,164],[842,151],[885,145],[926,137],[968,142],[1000,141],[1045,151],[1070,151],[1105,160],[1130,170],[1160,175],[1185,172],[1213,178],[1250,188],[1300,205],[1330,209],[1360,193],[1400,184],[1440,163],[1466,158],[1490,151],[1516,149],[1540,151],[1572,148],[1607,138],[1630,135],[1650,140],[1670,139],[1700,143],[1744,143]];
horizon.splice(horizon.findIndex(([x])=>x>=800),horizon.length,...openRidge.map(([x,y])=>[800+x/2,270+y/2]));
const ridge = new Float32Array(width);
for (let x = 0, j = 1; x < width; x++) {
  while (horizon[j][0] < x) j++;
  const [x0,y0]=horizon[j-1], [x1,y1]=horizon[j];
  const y = y0 + (y1-y0)*(x-x0)/(x1-x0);
  ridge[x]=y;
}
// A continuous edge path, rather than independent column snapping, retains a
// painted contour without leaving isolated old-sky spikes on the ridge.
const backtrack=new Int16Array(width*height);
let previous=new Float64Array(height).fill(-1e9);
for(let x=480;x<width;x++){
  const next=new Float64Array(height).fill(-1e9);
  const search=x>=800?3:12;
  for(let y=Math.round(ridge[x])-search;y<=Math.round(ridge[x])+search;y++){
    let score=-1e9,best=y;
    for(let delta=-2;delta<=2;delta++){
      const value=x===480?0:previous[y+delta]-Math.abs(delta)*2;
      if(value>score){score=value;best=y+delta;}
    }
    let edge=0;
    for(let d=1;d<=3;d++){
      const above=((y-d)*width+x)*3,below=((y+d)*width+x)*3;
      edge+=(day[above]-day[below])*.5+(day[below+2]-day[below]-(day[above+2]-day[above]))*.65;
    }
    next[y]=score+edge/3-Math.abs(y-ridge[x])*.12;
    backtrack[x*height+y]=best;
  }
  previous=next;
}
let last=previous.indexOf(Math.max(...previous));
for(let x=width-1;x>=480;x--){ridge[x]=last;last=backtrack[x*height+last];}
const coverage = new Uint8Array(pixels);
const clamp = x => Math.max(0, Math.min(1, x));
// Outer oak envelope excludes warm cloud brushmarks that share leaf colors.
// This is only a search region: the color matte still preserves every inner gap.
const oakBoundary=[[0,865],[50,902],[95,930],[140,901],[180,871],[210,810],[250,796],[285,785],[320,751],[340,710]];
for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
  const i=y*width+x, r=day[i*3],g=day[i*3+1],b=day[i*3+2];
  const skyColor=clamp(Math.min((b-.55*r-.24*g+6)/16,(b-85)/40));
  const hill=clamp((y-ridge[x]-.25)/1.3);
  let boundary=0;
  for(let j=1;j<oakBoundary.length;j++)if(y>=oakBoundary[j-1][0]&&y<=oakBoundary[j][0]){
    const [y0,x0]=oakBoundary[j-1],[y1,x1]=oakBoundary[j];boundary=x0+(x1-x0)*(y-y0)/(y1-y0);break;
  }
  coverage[i]=Math.round(255*Math.max(hill,x<boundary?1-skyColor:0));
}
const fgDay = Buffer.alloc(pixels*4), fgNight = Buffer.alloc(pixels*4), mask=Buffer.alloc(pixels);
for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
  const i=y*width+x,a=coverage[i]/255; mask[i]=255-coverage[i];
  let nearest=i,best=Infinity;
  if(a<1) {
    // Extend nearby fully covered foreground colors into mixed/transparent edges.
    // No wide alpha feather: tiny branches and the ridge keep their original coverage.
    for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){
      const xx=x+dx,yy=y+dy,j=yy*width+xx,d=dx*dx+dy*dy;
      if(xx>=0&&xx<width&&yy>=0&&yy<height&&coverage[j]===255&&d<best){nearest=j;best=d;}
    }
  }
  for(let c=0;c<3;c++) {
    const edge=day[nearest*3+c];
    const color=a<1?edge:day[i*3+c];
    fgDay[i*4+c]=color;
    // Stable canonical geometry with the original night plate's regional illumination.
    fgNight[i*4+c]=Math.min(255,color*nightLow[nearest*3+c]/Math.max(1,dayLow[nearest*3+c]));
    // Authored window illumination is spatially interior, away from any sky boundary.
    if((x>=501&&x<=532&&y>=482&&y<=526)||(x>=598&&x<=622&&y>=488&&y<=525))fgNight[i*4+c]=night[i*3+c];
  }
  fgDay[i*4+3]=coverage[i];fgNight[i*4+3]=coverage[i];
}
for(const [name,data]of [['foreground-day',fgDay],['foreground-night',fgNight]])await sharp(data,{raw:{width,height,channels:4}}).png().toFile(`${dir}/${name}.png`);
await sharp(mask,{raw:{width,height,channels:1}}).toColourspace('b-w').png().toFile(`${dir}/sky-mask.png`);
// Each half is resampled independently into an interior and given four texels of
// duplicated gutters. Transparent horizontal boundaries form a genuinely periodic tile.
const source=await sharp(cloudSource).metadata();
const atlas=Buffer.alloc(2048*1024*4);
for(let layer=0;layer<2;layer++) {
  const h=Math.floor(source.height/2),band=await sharp(cloudSource).extract({left:0,top:layer*h,width:source.width,height:h}).resize(2040,504).ensureAlpha().raw().toBuffer();
  for(let y=0;y<512;y++)for(let x=0;x<2048;x++) {
    const bx=Math.max(0,Math.min(2039,x-4)),by=Math.max(0,Math.min(503,y-4)),i=(by*2040+bx)*4,j=((y+layer*512)*2048+x)*4;
    const shade=Math.round((band[i]+band[i+1]+band[i+2])/3);
    atlas[j]=atlas[j+1]=atlas[j+2]=shade||220;
    // Guard completely clear outer edges, including the atlas seam.
    atlas[j+3]=Math.round(band[i+3]*clamp(Math.min(bx,2039-bx,by,503-by)/8));
  }
}
await sharp(atlas,{raw:{width:2048,height:1024,channels:4}}).png().toFile(`${dir}/cloud-atlas.png`);
// Overview contact sheets; inspect the native exports for 100% and enlarged QA.
await mkdir('docs/sky-validation', {recursive:true});
for(const [name,background]of [['black',[0,0,0]],['white',[255,255,255]],['magenta',[255,0,255]],['sky',null]]) {
  const panels=[];
  for(const light of [0,.25,.5,.75,1]) {
    const output=Buffer.alloc(pixels*3);
    for(let i=0;i<pixels;i++)for(let c=0;c<3;c++){
      const a=coverage[i]/255,bg=background?background[c]:nightSky[i*3+c]*(1-light)+sky[i*3+c]*light;
      output[i*3+c]=(fgNight[i*4+c]*(1-light)+fgDay[i*4+c]*light)*a+bg*(1-a);
    }
    panels.push({input:await sharp(output,{raw}).resize(836,471).png().toBuffer(),left:Math.round(light*4)*836,top:0});
  }
  await sharp({create:{width:4180,height:471,channels:3,background:'#000'}}).composite(panels).png().toFile(`docs/sky-validation/edges-${name}.png`);
}
await writeFile(`${dir}/export.json`,JSON.stringify({version:1,width,height,alpha:'straight PNG; premultiplied on WebGL upload',atlas:[2048,1024],gutters:4,registration:'canonical daytime geometry with 8px low-frequency night illumination transfer; original night window interiors'},null,2)+'\n');
console.log('Exported sky v1 and edge inspection sheets.');
