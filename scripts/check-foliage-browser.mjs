// Optional local browser validation. Use an isolated server/database.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.env.SKY_GPU==='metal'?{args:['--enable-gpu','--use-gl=angle','--use-angle=metal']}:{}),...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
const base=process.env.SKY_PREVIEW_URL||'http://127.0.0.1:4174',directory='docs/foliage-validation';
await mkdir(directory,{recursive:true});
const results=[],errors=[];
const check=(name,pass,detail)=>{results.push({name,pass,detail});console.log(`${pass?'PASS':'FAIL'} ${name}`);};
async function settled(page){await page.evaluate(async()=>{await skyStudy.painter.foliageTask;skyStudy.render();});}
async function ready(page){await page.goto(`${base}/dev/sky-study.html`);await page.waitForFunction(()=>window.skyStudy?.ready);await settled(page);}
try{
  const page=await browser.newPage({viewport:{width:1672,height:941},deviceScaleFactor:1});page.on('pageerror',e=>errors.push(e.message));
  await ready(page);
  const active=await page.evaluate(()=>({active:!!skyStudy.painter.foliageRenderer,skyFailure:skyStudy.painter.failure,foliageFailure:skyStudy.painter.foliageFailure}));
  check('Complete foliage bundle active',active.active&&!active.foliageFailure,active);
  if(!active.active)throw new Error(`Initial foliage activation failed: ${JSON.stringify(active)}`);
  for(const result of await page.evaluate(()=>skyStudy.runFoliagePixelChecks()))check(result.name,result.pass,result);
  await page.evaluate(()=>document.querySelector('aside').classList.add('hidden'));
  for(const fixture of ['Foliage pilot','Foliage calm','Foliage breeze','Foliage gust','Dawn','Dusk','Clear night']){
    await page.evaluate(name=>skyStudy.fixture(name),fixture);
    await page.screenshot({path:`${directory}/${fixture.toLowerCase().replaceAll(' ','-')}.png`});
  }
  // Fixed sky/time, changing only foliage amplitude: pixels outside the small
  // authored movement envelopes must not move or change color.
  const locality=await page.evaluate(()=>{
    const p=skyStudy.painter;skyStudy.fixture('Foliage gust');
    const capture=wind=>{skyStudy.state.foliageWind=wind;skyStudy.render();const pixels=new Uint8Array(p.canvas.width*p.canvas.height*4);p.gl.readPixels(0,0,p.canvas.width,p.canvas.height,p.gl.RGBA,p.gl.UNSIGNED_BYTE,pixels);return pixels;};
    const a=capture(0),b=capture(1);let inside=0,outside=0;
    for(let y=0;y<p.canvas.height;y++)for(let x=0;x<p.canvas.width;x++){
      const i=(y*p.canvas.width+x)*4;if(a[i]===b[i]&&a[i+1]===b[i+1]&&a[i+2]===b[i+2])continue;
      const sceneX=(x/p.canvas.width*p.crop[0]+p.offset[0])*p.scene.width,sceneY=((1-(y+.5)/p.canvas.height)*p.crop[1]+p.offset[1])*p.scene.height;
      const selected=p.scene.foliage.patches.some(({bounds:[left,top,w,h],maxDisplacement:d})=>sceneX>=left-d-2&&sceneX<=left+w+d+2&&sceneY>=top-d-2&&sceneY<=top+h+d+2);
      if(selected)inside++;else outside++;
    }
    return {inside,outside};
  });check('Only selected foliage changes',locality.inside>100&&locality.outside===0,locality);
  const poses=await page.evaluate(async()=>{
    const {Painting}=await import('/painting.js');const p=new Painting(document.createElement('canvas'),document.createElement('canvas'),{fallback:document.createElement('img')});await p.init();await p.foliageTask;
    const snapshot={world:{epoch:0,nest:{materials:0},action:null}};
    const pose=()=>JSON.stringify(p.foliageState);
    p.render(snapshot,12000,'day');const first=pose();p.render(snapshot,12000,'day');const pause=first===pose();
    p.motionChanged({matches:true});p.render(snapshot,9000000,'night');const held=first===pose();
    p.motionChanged({matches:false});p.render(snapshot,9000000,'night');const resumed=first!==pose();const future=pose();
    p.render(snapshot,1,'day');p.render(snapshot,9000000,'day');const jump=future===pose();p.dispose();
    return {pause,held,resumed,jump};
  });for(const [name,pass]of Object.entries(poses))check(`Foliage clock: ${name}`,pass);
  const initial=await page.evaluate(()=>JSON.stringify(skyStudy.painter.foliageState));
  await page.reload();await page.waitForFunction(()=>window.skyStudy?.ready);await settled(page);
  await page.evaluate(()=>{skyStudy.fixture('Foliage gust');skyStudy.state.foliageWind=1;skyStudy.render();});
  check('Reload reconstructs identical foliage',initial===await page.evaluate(()=>JSON.stringify(skyStudy.painter.foliageState)));
  const restored=await page.evaluate(async()=>{
    const p=skyStudy.painter,stats=JSON.stringify(p.foliageRenderer.stats),ext=p.gl.getExtension('WEBGL_lose_context');
    for(let i=0;i<3;i++){
      ext.loseContext();await new Promise(r=>setTimeout(r,60));
      if(p.foliageRenderer||p.ready)return false;ext.restoreContext();
      for(let n=0;n<200&&!p.ready;n++)await new Promise(r=>setTimeout(r,25));
      await p.foliageTask;skyStudy.render();
      if(!p.foliageRenderer||JSON.stringify(p.foliageRenderer.stats)!==stats)return false;
    }return true;
  });check('Three context restores rebuild the complete foliage bundle',restored);
  // Hold actual optional HTTP requests open. These checks fail if init waits
  // for foliage or if an obsolete completion can install repaired artwork.
  for(const outcome of ['success','failure','dispose','reinitialize','context-loss']){
    const delayed=await browser.newPage();let release,requests=0;
    const gate=new Promise(resolve=>{release=resolve;});
    await delayed.route('**/lakeside-foliage-v1/*.png',async route=>{requests++;await gate;if(outcome==='failure')await route.abort();else await route.continue();});
    try{
      await delayed.goto(`${base}/dev/sky-study.html`,{waitUntil:'domcontentloaded'});
      await delayed.waitForFunction(()=>window.skyStudy?.ready&&skyStudy.painter.ready&&skyStudy.painter.canvas.style.visibility==='visible',{},{timeout:5000});
      const pending=await delayed.evaluate(()=>{
        const p=skyStudy.painter;skyStudy.fixture('Cloud edge crossing');const before=JSON.stringify(p.cloudState);
        skyStudy.state.motion+=20;skyStudy.render();window.oldFoliageTask=p.foliageTask;
        return {visible:p.canvas.style.visibility==='visible',intact:!p.foliageRenderer&&!p.pendingFoliage,moving:before!==JSON.stringify(p.cloudState)};
      });
      check(`Sky renders while foliage is pending (${outcome})`,requests===4&&pending.visible&&pending.intact&&pending.moving,pending);
      if(outcome==='dispose')await delayed.evaluate(()=>skyStudy.painter.dispose());
      if(outcome==='reinitialize')await delayed.evaluate(async()=>{
        const p=skyStudy.painter;p.scene={...p.scene,foliage:undefined};await p.init();skyStudy.render();
      });
      if(outcome==='context-loss'){
        await delayed.evaluate(()=>{window.pendingLoss=skyStudy.painter.gl.getExtension('WEBGL_lose_context');pendingLoss.loseContext();});
        await delayed.waitForFunction(()=>!skyStudy.painter.ready);
      }
      release();await delayed.evaluate(()=>window.oldFoliageTask);
      if(outcome==='success'){
        await settled(delayed);check('Late foliage activates as a complete frame',await delayed.evaluate(()=>!!skyStudy.painter.foliageRenderer&&skyStudy.painter.completeFrame&&skyStudy.painter.gl.getError()===0));
      }else if(outcome==='failure'){
        check('Delayed foliage failure leaves the dynamic sky visible',await delayed.evaluate(()=>skyStudy.painter.ready&&!skyStudy.painter.foliageRenderer&&!!skyStudy.painter.foliageFailure));
      }else{
        check(`Stale foliage cannot attach after ${outcome}`,await delayed.evaluate(()=>!skyStudy.painter.pendingFoliage&&!skyStudy.painter.foliageRenderer));
      }
      if(outcome==='context-loss'){
        await delayed.evaluate(()=>pendingLoss.restoreContext());await delayed.waitForFunction(()=>skyStudy.painter.ready);await settled(delayed);
        check('Restoration loads fresh foliage after an obsolete pending request',await delayed.evaluate(()=>!!skyStudy.painter.foliageRenderer&&skyStudy.painter.completeFrame));
      }
    }finally{release();await delayed.close();}
  }
  // Each optional asset failure must retain a dynamic sky with intact leaves.
  for(const asset of ['base-day','base-night','foliage-day','foliage-night']){
    const failure=await browser.newPage();await failure.route(`**/lakeside-foliage-v1/${asset}.png`,route=>route.abort());await ready(failure);
    check(`Missing ${asset} retains intact dynamic sky`,await failure.evaluate(()=>skyStudy.painter.ready&&!skyStudy.painter.foliageRenderer&&!!skyStudy.painter.foliageFailure));await failure.close();
  }
  for(const [asset,replacement]of [['foliage-night','/assets/lakeside-day.png'],['base-night','/assets/lakeside-sky-v1/sky-mask.png']]){
    const failure=await browser.newPage();await failure.route(`**/lakeside-foliage-v1/${asset}.png`,async route=>{const response=await route.fetch({url:base+replacement});await route.fulfill({response});});await ready(failure);
    check(`Invalid ${asset} dimensions or alpha retain dynamic sky`,await failure.evaluate(()=>skyStudy.painter.ready&&!skyStudy.painter.foliageRenderer&&!!skyStudy.painter.foliageFailure));await failure.close();
  }
  const invalid=await browser.newPage();
  // Inject malformed metadata through a standalone Painting, without depending
  // on a particular image decoder's handling of broken PNG bytes.
  await ready(invalid);
  const bad=await invalid.evaluate(async()=>{
    const {Painting}=await import('/painting.js');const scene=structuredClone(skyStudy.painter.scene);scene.foliage.patches[0].rect[0]=0;
    const p=new Painting(document.createElement('canvas'),document.createElement('canvas'),{scene,fallback:document.createElement('img')});await p.init();await p.foliageTask;
    const result=p.ready&&!p.foliageRenderer&&!!p.foliageFailure;p.dispose();return result;
  });check('Invalid patch metadata retains intact dynamic sky',bad);await invalid.close();
  const runtimeFailure=await page.evaluate(()=>{
    const p=skyStudy.painter;skyStudy.fixture('Thin cloud over moon');skyStudy.state.far=false;skyStudy.state.near=false;
    p.foliageRenderer.draw=()=>{throw new Error('Injected foliage draw failure');};skyStudy.render();
    const capture=()=>{const pixels=new Uint8Array(p.canvas.width*p.canvas.height*4);p.gl.readPixels(0,0,p.canvas.width,p.canvas.height,p.gl.RGBA,p.gl.UNSIGNED_BYTE,pixels);return pixels;};
    const failed=capture();skyStudy.render();const next=capture();
    return {restored:p.ready&&!p.foliageRenderer&&p.foliageFailure==='Injected foliage draw failure'&&p.canvas.style.visibility==='visible'&&p.gl.getError()===p.gl.NO_ERROR,
      sameOptions:failed.every((value,i)=>value===next[i])};
  });check('Draw failure restores intact foreground before showing frame',runtimeFailure.restored);
  check('Fallback preserves disabled cloud layers in the failure frame',runtimeFailure.sameOptions);
  await page.reload();await page.waitForFunction(()=>window.skyStudy?.ready);await settled(page);
  for(const viewport of [{width:1920,height:1080},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    for(const pan of [0,1]){
      await page.evaluate(pan=>{skyStudy.fixture('Foliage gust');skyStudy.painter.pan=pan;skyStudy.painter.updateCrop();skyStudy.render();document.querySelector('aside').classList.add('hidden');},pan);
      await page.screenshot({path:`${directory}/view-${viewport.width}-pan-${pan}.png`});
    }
  }
  await page.setViewportSize({width:1440,height:900});
  const performance=await page.evaluate(async()=>{
    const p=skyStudy.painter;skyStudy.fixture('Foliage breeze');skyStudy.state.playing=true;
    const intervals=[];let previous=0;skyStudy.onFrame=now=>{if(previous)intervals.push(now-previous);previous=now;};
    await new Promise(r=>setTimeout(r,10000));skyStudy.onFrame=null;skyStudy.state.playing=false;intervals.sort((a,b)=>a-b);
    const {Painting}=await import('/painting.js'),scene=structuredClone(p.scene);delete scene.foliage;
    const baseline=new Painting(document.createElement('canvas'),document.createElement('canvas'),{scene,fallback:document.createElement('img')});await baseline.init();
    const snapshot={world:{epoch:0,nest:{materials:0},action:null}};
    const submission=painter=>{
      const samples=[];
      for(let i=0;i<200;i++){const start=performance.now();painter.render(snapshot,1000000+i*1000/30,'day');painter.gl.finish();if(i>=20)samples.push(performance.now()-start);}
      samples.sort((a,b)=>a-b);return {median:samples[90],p95:samples[171]};
    };
    const before=submission(baseline),after=submission(p);baseline.dispose();
    const extension=p.gl.getExtension('WEBGL_debug_renderer_info');
    return {frames:intervals.length,medianInterval:intervals[Math.floor(intervals.length*.5)],p95Interval:intervals[Math.floor(intervals.length*.95)],stats:p.foliageRenderer.stats,
      submissionMs:{before,after},renderer:extension?p.gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):p.gl.getParameter(p.gl.RENDERER),userAgent:navigator.userAgent};
  });check('Preview sustains its 30 fps target on this GPU',performance.frames>=280&&performance.p95Interval<40,performance);
  await writeFile(`${directory}/browser-results.json`,JSON.stringify({results,errors,performance},null,2)+'\n');
  if(errors.length||results.some(x=>!x.pass))process.exitCode=1;
}finally{await browser.close();}
