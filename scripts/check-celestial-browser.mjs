// Optional browser validation, using the same Playwright/runtime setup as the
// existing sky checks. Start the server against a temporary database first.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const {chromium}=createRequire(import.meta.url)('playwright');
const directory=process.env.SKY_VALIDATION_DIR||'docs/celestial-validation';await mkdir(directory,{recursive:true});
const base=process.env.SKY_PREVIEW_URL||'http://127.0.0.1:4174';
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{}),
  ...(process.env.SKY_GPU==='metal'?{args:['--enable-gpu','--use-gl=angle','--use-angle=metal']}: {})});
const results=[],errors=[];
const check=(name,pass,detail)=>{results.push({name,pass,detail});console.log(`${pass?'PASS':'FAIL'} ${name}`);};
try{
  const page=await browser.newPage({viewport:{width:1672,height:941},deviceScaleFactor:1});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${base}/dev/sky-study.html`);await page.waitForFunction(()=>window.skyStudy?.ready);
  await page.evaluate(async()=>{await skyStudy.painter.foliageTask;await skyStudy.painter.weatherTask;await skyStudy.painter.cottageTask;skyStudy.render();});
  const shader=await page.evaluate(()=>skyStudy.runPixelChecks());for(const result of shader)check(result.name,result.pass);
  const geometry=await page.evaluate(()=>{
    const s=skyStudy;s.fixture('Equinox sunrise');s.state.cover=0;s.render();const start=s.painter.celestialState.sun;
    s.state.hour+=1/60;s.render();const later=s.painter.celestialState.sun;
    return {start:[start.x,start.y],later:[later.x,later.y],moving:later.x>start.x&&later.y<start.y};
  });check('Sun climbs and moves across the real painting',geometry.moving,geometry);

  // Measure disk coverage against the ACTUAL foreground silhouette throughout
  // each rise. Rendering/compositing is additionally checked in GPU pixel tests.
  const crossings=await page.evaluate(()=>{
    const s=skyStudy,p=s.painter,canvas=document.createElement('canvas');canvas.width=p.scene.width;canvas.height=p.scene.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(p.intactForeground[0],0,0);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    const sequences=[];
    for(const [fixture,name,begin,end]of [['Equinox sunrise','sun',6.25,6.85],['Full moon rising','moon',19.25,19.9],['Moonset · southwest view','moon',3.5,4.3]]){
      s.fixture(fixture);s.state.cover=0;const frames=[];
      for(let hour=begin;hour<end;hour+=.005){s.state.hour=hour;s.render();const b=p.celestialState[name];let visible=0,total=0;
        for(let y=-1;y<=1;y+=.08)for(let x=-1;x<=1;x+=.08)if(x*x+y*y<=1){
          const xx=Math.round(b.x*canvas.width+b.matrix[0]*x+b.matrix[2]*y),yy=Math.round(b.y*canvas.height+b.matrix[1]*x+b.matrix[3]*y);
          if(xx>=0&&xx<canvas.width&&yy>=0&&yy<canvas.height)visible+=1-pixels[(yy*canvas.width+xx)*4+3]/255;total++;
        }
        frames.push({hour,x:b.x,y:b.y,coverage:visible/total});
      }
      sequences.push({name:fixture,frames,hidden:frames.some(f=>f.coverage<.01),partial:frames.filter(f=>f.coverage>.05&&f.coverage<.95).length,
        clear:frames.some(f=>f.coverage>.99),maxStep:Math.max(...frames.slice(1).map((f,i)=>Math.abs(f.coverage-frames[i].coverage)))});
    }
    return sequences;
  });
  for(const crossing of crossings)check(`${crossing.name} crosses the painted ridge progressively`,crossing.hidden&&crossing.partial>=3&&crossing.clear&&crossing.maxStep<.3,
    {partialFrames:crossing.partial,maxCoverageStep:crossing.maxStep});
  await writeFile(`${directory}/ridge-crossings.json`,JSON.stringify(crossings,null,2)+'\n');

  const pixels=await page.evaluate(()=>{
    const s=skyStudy,p=s.painter;s.fixture('Daytime quarter moon');s.state.cover=0;s.render();
    const moon=p.celestialState.moon,ctx=p.renderer.celestialContext;
    const width=p.scene.width,height=p.scene.height;
    const alpha=ctx.getImageData(Math.round(moon.x*width)-12,Math.round(moon.y*height)-12,24,24).data;
    const daylight=moon.visible&&s.conditions().calendar.light===1&&alpha.some((v,i)=>i%4===3&&v>15);
    s.fixture('Clear night');s.state.fixed=false;s.render();
    const calendar=s.conditions().calendar,r=p.renderer;
    r.updateCelestial(calendar,{visible:false});
    const star=p.celestialState.stars.find(x=>x.visible&&x.opacity>.2&&
      ctx.getImageData(Math.round(x.x*width),Math.round(x.y*height),1,1).data[3]>0);
    const starAlpha=()=>ctx.getImageData(Math.round(star.x*width),Math.round(star.y*height),1,1).data[3];
    const baseline=starAlpha(),fixture={x:star.x,y:star.y,phase:.5,visible:true};
    r.updateCelestial(calendar,{...fixture,opacity:0});const hidden=starAlpha();
    r.updateCelestial(calendar,{...fixture,opacity:.001});const subByte=starAlpha();
    // A new moon is unlit, but its nonzero opacity still covers the star.
    r.updateCelestial(calendar,{...fixture,phase:0,opacity:.75});const shadow=starAlpha();
    return {daylight,baseline,hidden,subByte,shadow};
  });check('Quarter moon remains visible in full daylight',pixels.daylight);
  check('Zero-opacity moon leaves underlying stars intact',pixels.baseline>0&&pixels.hidden===pixels.baseline,pixels);
  check('Moon opacity rounded to zero leaves underlying stars intact',pixels.subByte===pixels.baseline,pixels);
  check('Unlit lunar disk conceals underlying stars',pixels.shadow===0,pixels.shadow);
  const haze=await page.evaluate(()=>{
    const s=skyStudy;s.fixture('Winter sunrise');s.state.cover=0;s.render();const r=s.painter.renderer,b=s.painter.celestialState.moon;
    const x=Math.round(b.x*s.painter.scene.width),y=Math.round(b.y*s.painter.scene.height);
    const withMoon=r.celestialContext.getImageData(x,y,1,1).data[3];
    r.updateCelestial(s.conditions().calendar,{visible:false});
    return {withMoon,withoutMoon:r.celestialContext.getImageData(x,y,1,1).data[3]};
  });check('Dark moon does not cut a hole in atmospheric sunlight',haze.withMoon>=haze.withoutMoon-1,haze);

  const heldSun=await page.evaluate(async()=>{
    const {Painting}=await import('/painting.js'),{realTime,SCENES}=await import('/shared/world.js');
    // This deterministic catalog places star 175 within the morning sun's disk.
    const scene={...SCENES[0],sky:{...SCENES[0].sky,seed:566000}};
    const p=new Painting(document.createElement('canvas'),document.createElement('canvas'),{scene,fallback:document.createElement('img')});
    try{
      await p.init();const snap={world:{epoch:0,nest:{materials:0},action:null}};
      p.render(snap,realTime(0,80.3*86400000));const day=p.celestialState.sun;
      p.motionChanged({matches:true});p.render(snap,realTime(0,81*86400000));
      const {sun,stars}=p.celestialState,star=stars.find(s=>s.id===175),[a,b,c,d]=sun.matrix;
      const x=(star.x-sun.x)*scene.width,y=(star.y-sun.y)*scene.height,det=a*d-b*c;
      const starInside=((d*x-c*y)/det)**2+((-b*x+a*y)/det)**2<.25;
      const alpha=p.renderer.celestialContext.getImageData(Math.round(star.x*scene.width),Math.round(star.y*scene.height),1,1).data[3];
      return {dayOpacity:day.opacity,nightOpacity:sun.opacity,held:day.x===sun.x&&day.y===sun.y,starInside,alpha};
    }finally{p.dispose();}
  });check('Reduced-motion sun fades at night without erasing a star',heldSun.dayOpacity>0&&heldSun.nightOpacity===0&&heldSun.held&&heldSun.starInside&&heldSun.alpha>0,heldSun);

  const controls=await page.evaluate(async()=>{
    const {Painting}=await import('/painting.js'),{realTime}=await import('/shared/world.js');
    const p=new Painting(document.createElement('canvas'),document.createElement('canvas'),{fallback:document.createElement('img')});
    await p.init();const snap={world:{epoch:0,nest:{materials:0},action:null}},at=realTime(0,80.28*86400000);
    p.render(snap,at);const pose=JSON.stringify(p.celestialState),uploads=p.renderer.stats.celestialUploads;
    p.render(snap,at);const paused=pose===JSON.stringify(p.celestialState)&&uploads===p.renderer.stats.celestialUploads;
    p.motionChanged({matches:true});p.render(snap,at+50000);
    const held=JSON.stringify(p.celestialState.sun.direction)===JSON.stringify(JSON.parse(pose).sun.direction);
    const heldTime=p.lastCelestial;
    p.render(snap,at+50000,'night');const study=p.lastCelestial!==heldTime&&Math.abs((p.lastCelestial/3600000)%24-.5)<1e-8;
    p.motionChanged({matches:false});p.render(snap,at+50000);const rejoined=p.lastCelestial>80.28*86400000;
    p.dispose();return {paused,held,study,rejoined};
  });for(const [name,pass]of Object.entries(controls))check(`Celestial controls: ${name}`,pass);
  await page.evaluate(()=>{skyStudy.fixture('Equinox sunrise');skyStudy.state.calendarRate=720;skyStudy.sync();});
  await page.locator('#calendarPlay').click();await page.waitForTimeout(300);await page.locator('#calendarPlay').click();
  check('Sky playback advances calendar time with physical moon enabled',await page.evaluate(()=>skyStudy.state.hour>6.48&&!skyStudy.state.fixed));

  const shots=[];
  await page.evaluate(()=>document.querySelector('aside').classList.add('hidden'));
  for(const [name,fixture,hour]of [['sun-rise','Equinox sunrise',6.48],['sun-climbing','Equinox sunrise',7.35],['moon-rise','Full moon rising',19.52],
    ['moon-climbing','Full moon rising',19.95],['daytime-moon','Daytime quarter moon',14],['summer','Summer sunrise',5.2],['winter','Winter sunrise',8.6],['moonset','Moonset · southwest view',3.8]]){
    await page.evaluate(({fixture,hour})=>{skyStudy.fixture(fixture);skyStudy.state.hour=hour;skyStudy.render();},{fixture,hour});
    await page.screenshot({path:`${directory}/${name}.png`});shots.push({name,fixture,hour});
  }
  // Both mobile pan extremes sample the same celestial coordinates.
  await page.setViewportSize({width:390,height:844});
  const poses=[];
  for(const pan of [0,1]){poses.push(await page.evaluate(pan=>{skyStudy.fixture('Full moon rising');skyStudy.state.hour=19.8;
    skyStudy.painter.pan=pan;skyStudy.painter.updateCrop();skyStudy.render();return skyStudy.painter.celestialState.moon;},pan));
    await page.screenshot({path:`${directory}/portrait-pan-${pan}.png`});}
  check('Mobile pan changes the crop, not the moon trajectory',JSON.stringify(poses[0])===JSON.stringify(poses[1]));
  await page.setViewportSize({width:1440,height:900});
  const performanceResult=await page.evaluate(async()=>{
    const {realTime,RATE}=await import('/shared/world.js'),p=skyStudy.painter,snap={world:{epoch:0,nest:{materials:0},action:null}};
    const samples=[],start=realTime(0,132.82*86400000),before={...p.renderer.stats};
    for(let i=0;i<300;i++){const then=performance.now();p.render(snap,start+i*1000/30);p.gl.finish();samples.push(performance.now()-then);}
    samples.sort((a,b)=>a-b);return {frames:300,realSeconds:10,worldSeconds:10*RATE,medianMs:samples[150],p95Ms:samples[285],
      celestialUploads:p.renderer.stats.celestialUploads-before.celestialUploads,uploadMs:p.renderer.stats.uploadMs-before.uploadMs};
  });console.log('Moving-sky performance',JSON.stringify(performanceResult));
  check('Moving sky reuses its raster between subpixel changes',performanceResult.celestialUploads<300,performanceResult);
  // Optional recordings. Frame intermediates can live outside the repository.
  if(process.env.CELESTIAL_RECORD==='1'){
    const frameDirectory=process.env.CELESTIAL_FRAME_DIR||`${directory}/frames`;
    await mkdir(frameDirectory,{recursive:true});
    for(let i=0;i<240;i++){
      await page.evaluate(i=>{skyStudy.fixture(i<120?'Equinox sunrise':'Full moon rising');
        skyStudy.state.hour=i<120?5.8+i/40:19.15+(i-120)/75;skyStudy.render();},i);
      await page.screenshot({path:`${frameDirectory}/${String(i).padStart(3,'0')}.png`});
    }
    execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate','24','-i',`${frameDirectory}/%03d.png`,
      '-c:v','libx264','-crf','22','-pix_fmt','yuv420p','-movflags','+faststart',`${directory}/rises-timelapse.mp4`]);
    const context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:frameDirectory,size:{width:1440,height:900}}});
    const live=await context.newPage();await live.goto(`${base}/dev/sky-study.html`);await live.waitForFunction(()=>window.skyStudy?.ready);
    await live.evaluate(()=>{skyStudy.fixture('Full moon rising');skyStudy.state.hour=19.8;skyStudy.state.calendarRate=365/30;
      skyStudy.state.calendarPlaying=true;document.querySelector('aside').classList.add('hidden');
      window.liveFrames=[];skyStudy.onFrame=t=>liveFrames.push(t);});
    await live.waitForTimeout(15000);
    const timing=await live.evaluate(()=>({frames:liveFrames.length,elapsedMs:liveFrames.at(-1)-liveFrames[0],worldHour:skyStudy.state.hour}));
    check('Real-speed sky sustains at least 25 frames per second',timing.frames/(timing.elapsedMs/1000)>25,timing);
    const video=live.video();await context.close();
    const videoPath=await video.path();
    execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',videoPath,'-ss','1','-c:v','libx264','-crf','22','-pix_fmt','yuv420p',
      '-movflags','+faststart',`${directory}/moon-real-speed.mp4`]);
  }
  await writeFile(`${directory}/celestial-browser-results.json`,JSON.stringify({results,errors,shots,performance:performanceResult},null,2)+'\n');
  if(results.some(r=>!r.pass)||errors.length)process.exitCode=1;
}finally{await browser.close();}
