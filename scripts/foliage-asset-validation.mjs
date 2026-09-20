// Pure byte-level export checks; no Sharp or browser dependency in unit tests.
export function assertMatchingCoverage(day,night,pixels,label){
  if(day.length!==pixels*4||night.length!==pixels*4)throw new Error(`${label}: invalid RGBA dimensions`);
  for(let i=3;i<day.length;i+=4)if(day[i]!==night[i])throw new Error(`${label}: day/night coverage mismatch at pixel ${(i-3)/4}`);
}

export function verifyFoliageExport({sources,bases,atlases,width,height,config}){
  const pixels=width*height,[aw,ah]=config.atlasSize;
  assertMatchingCoverage(...sources,pixels,'Source foreground');
  assertMatchingCoverage(...bases,pixels,'Repaired foreground');
  assertMatchingCoverage(...atlases,aw*ah,'Foliage atlas');
  // A lookup permits checking unchanged pixels as well as the selected patches.
  const lookup=new Int32Array(pixels).fill(-1);
  for(const {bounds:[left,top,w,h],rect:[ax,ay]}of config.patches){
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)lookup[(top+y)*width+left+x]=((ay+y)*aw+ax+x)*4;
  }
  return sources.map((source,light)=>{
    const base=bases[light],atlas=atlases[light],rest=Buffer.alloc(source.length);
    let maxError=0,totalError=0,maxAlphaError=0;
    for(let pixel=0;pixel<pixels;pixel++){
      const i=pixel*4,j=lookup[pixel],a=j<0?0:atlas[j+3]/255,b=base[i+3]/255,outA=a+b*(1-a);
      rest[i+3]=Math.round(outA*255);maxAlphaError=Math.max(maxAlphaError,Math.abs(outA*255-source[i+3]));
      for(let c=0;c<3;c++){
        const premult=(j<0?0:atlas[j+c]*a)+base[i+c]*b*(1-a);
        rest[i+c]=outA?Math.round(premult/outA):0;
        const difference=Math.abs(premult-source[i+c]*source[i+3]/255);
        maxError=Math.max(maxError,difference);totalError+=difference;
      }
    }
    if(maxError>1||maxAlphaError>1)throw new Error(`${light?'Night':'Day'} rest reconstruction exceeded one channel value: color ${maxError}, alpha ${maxAlphaError}`);
    return {rest,maxError,meanError:totalError/(pixels*3),maxAlphaError};
  });
}
