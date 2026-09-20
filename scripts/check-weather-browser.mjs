import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{}),args:['--enable-gpu','--use-gl=angle','--use-angle=metal']});
const base=process.env.SKY_PREVIEW_URL||'http://127.0.0.1:4174',directory='docs/weather-validation';
await mkdir(directory,{recursive:true});
const results=[],errors=[];
function check(name,pass,detail){results.push({name,pass,detail});console.log(`${pass?'PASS':'FAIL'} ${name}`);}
async function ready(page){
  await page.goto(`${base}/dev/sky-study.html`);
  await page.waitForFunction(()=>window.skyStudy?.ready);
  await page.evaluate(async()=>{await skyStudy.painter.foliageTask;await skyStudy.painter.weatherTask;skyStudy.render();});
}
try{
  const page=await browser.newPage({viewport:{width:1672,height:941},deviceScaleFactor:1});
  page.on('pageerror',error=>errors.push(error.message));await ready(page);
  check('Complete optional bundle',await page.evaluate(()=>!!skyStudy.painter.weatherRenderer&&!skyStudy.painter.weatherFailure));
  const locality=await page.evaluate(()=>{
    const p=skyStudy.painter;skyStudy.fixture('After rain');p.motion=false;
    const capture=surface=>{skyStudy.state.surface=surface;skyStudy.render();const data=new Uint8Array(p.canvas.width*p.canvas.height*4);p.gl.readPixels(0,0,p.canvas.width,p.canvas.height,p.gl.RGBA,p.gl.UNSIGNED_BYTE,data);return data;};
    const dry=capture('dry'),wet=capture('wet');let inside=0,outside=0;
    for(let y=0;y<p.canvas.height;y++)for(let x=0;x<p.canvas.width;x++){
      const i=(y*p.canvas.width+x)*4;if(dry[i]===wet[i]&&dry[i+1]===wet[i+1]&&dry[i+2]===wet[i+2])continue;
      const yy=p.canvas.height-1-y;
      if(p.scene.surfaceWeather.patches.some(({bounds:[left,top,w,h]})=>x>=left-1&&x<=left+w+1&&yy>=top-1&&yy<=top+h+1))inside++;else outside++;
    }
    return {inside,outside};
  });check('Wetness changes only authored surfaces',locality.inside>100&&locality.outside===0,locality);
  await page.evaluate(()=>document.querySelector('aside').classList.add('hidden'));
  for(const [name,hour,surface]of [['after-rain',15.5,'wet'],['drying',15.5,'drying'],['night',0,'wet'],['dry',15.5,'dry']]){
    await page.evaluate(({hour,surface})=>{skyStudy.state.hour=hour;skyStudy.state.surface=surface;skyStudy.render();},{hour,surface});
    await page.screenshot({path:`${directory}/${name}.png`});
  }
  for(const width of [390,800]){
    await page.setViewportSize({width,height:844});
    await page.evaluate(()=>{skyStudy.fixture('After rain');skyStudy.painter.pan=.38;skyStudy.painter.updateCrop();skyStudy.render();});
    await page.screenshot({path:`${directory}/view-${width}.png`});
  }
  check('No GL error after viewport changes',await page.evaluate(()=>skyStudy.painter.gl.getError()===0));
  const blends=await page.evaluate(async()=>{
    const {viewConditions}=await import('/shared/world.js'),{surfaceFixture}=await import('/shared/surface-weather.js');
    const p=skyStudy.painter,conditions=viewConditions(0,0,'day');
    for(const light of [0,.25,.5,.75,1]){
      p.render({world:{epoch:0,nest:{materials:0},action:null}},0,'preview',{conditions:{...conditions,calendar:{...conditions.calendar,light}},surface:surfaceFixture('wet')});
      if(p.gl.getError()!==0)return false;
    }
    return true;
  });check('Five illumination blends draw cleanly',blends);
  const performanceResult=await page.evaluate(async()=>{
    const p=skyStudy.painter,renderer=p.weatherRenderer;skyStudy.fixture('After rain');
    async function measure(enabled){
      p.weatherRenderer=enabled?renderer:null;const samples=[];
      for(let i=0;i<45;i++){await new Promise(requestAnimationFrame);const start=performance.now();skyStudy.render();p.gl.finish();samples.push(performance.now()-start);}
      samples.sort((a,b)=>a-b);return {median:samples[22],p95:samples[42]};
    }
    const baseline=await measure(false),enabled=await measure(true);return {baseline,enabled,textureBytes:2*512*512*4};
  });check('Weather rendering stays within 30 fps frame budget',performanceResult.enabled.p95<33.34,performanceResult);
  const timing=await page.evaluate(async()=>{
    const {Painting}=await import('/painting.js');const {createSurfaceState,advanceSurface}=await import('/shared/surface-weather.js');
    const p=new Painting(document.createElement('canvas'),document.createElement('canvas'),{fallback:document.createElement('img')});await p.init();await p.weatherTask;
    const at=900_000,environment=advanceSurface(createSurfaceState(0),0,at).state;
    const snapshot={world:{epoch:0,environment,nest:{materials:0},action:null}},before=JSON.stringify(snapshot);
    p.render(snapshot,at+1234);const a=JSON.stringify(p.surfaceState);p.render(snapshot,at+1234);const pause=a===JSON.stringify(p.surfaceState);
    p.render(snapshot,at+1234,'rain');const wet=p.surfaceState.pathWetness>.8;
    p.render(snapshot,at+1234);const restored=a===JSON.stringify(p.surfaceState)&&before===JSON.stringify(snapshot);
    p.motionChanged({matches:true});p.render(snapshot,at+2234);const held=p.lastMotion===at/1000+1.234;
    p.dispose();return{pause,wet,restored,held};
  });for(const [name,pass]of Object.entries(timing))check(`Display contract: ${name}`,pass);
  const restore=await page.evaluate(async()=>{
    const p=skyStudy.painter,ext=p.gl.getExtension('WEBGL_lose_context');ext.loseContext();await new Promise(r=>setTimeout(r,100));
    const removed=!p.weatherRenderer&&!p.pendingWeather;ext.restoreContext();
    for(let i=0;i<200&&!p.ready;i++)await new Promise(r=>setTimeout(r,25));
    await p.weatherTask;await p.foliageTask;skyStudy.render();return removed&&!!p.weatherRenderer&&p.gl.getError()===0;
  });check('Context restoration reconstructs the bundle',restore);
  for(const failure of ['missing','mismatch','delayed-dispose']){
    const isolated=await browser.newPage();let release;const gate=new Promise(resolve=>release=resolve);
    await isolated.route('**/lakeside-weather-v1/*.png',async route=>{
      if(failure==='delayed-dispose'){await gate;await route.continue();}
      else if(failure==='missing')await route.abort();
      else await route.fulfill({status:200,contentType:'image/png',body:Buffer.from('invalid')});
    });
    await isolated.goto(`${base}/dev/sky-study.html`,{waitUntil:'domcontentloaded'});
    await isolated.waitForFunction(()=>window.skyStudy?.ready&&skyStudy.painter.ready);
    if(failure==='delayed-dispose'){
      await isolated.evaluate(()=>{window.pending=skyStudy.painter.weatherTask;skyStudy.painter.dispose();});release();await isolated.evaluate(()=>window.pending);
      check('Late assets cannot revive disposed renderer',await isolated.evaluate(()=>!skyStudy.painter.weatherRenderer&&!skyStudy.painter.pendingWeather));
    }else{
      await isolated.evaluate(async()=>{await skyStudy.painter.weatherTask;await skyStudy.painter.foliageTask;skyStudy.render();});
      check(`Weather ${failure} preserves sky and foliage`,await isolated.evaluate(()=>skyStudy.painter.ready&&!!skyStudy.painter.foliageRenderer&&!skyStudy.painter.weatherRenderer&&!!skyStudy.painter.weatherFailure));
    }
    await isolated.close();
  }
  const visitor=await browser.newPage();
  const seed=await (await visitor.request.get(`${base}/api/world`)).json();
  let response=structuredClone(seed);
  await visitor.route('**/api/world',route=>route.fulfill({json:response}));
  await visitor.route('**/api/stream',route=>route.abort());
  await visitor.goto(base);await visitor.waitForFunction(()=>document.querySelector('#scene-description').textContent.includes('Year'));
  response={...seed,serverTime:seed.serverTime+1000,validUntil:seed.serverTime+31_000,
    world:{...seed.world,revision:seed.world.revision+1,environment:{...seed.world.environment,pathWetness:.9,puddleStorage:.7}}};
  await visitor.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await visitor.waitForFunction(()=>document.querySelector('#scene-description').textContent.includes('shallow hollow'));
  check('Environmental revisions keep field notes quiet',await visitor.locator('#note-dot').evaluate(node=>node.hidden));
  response={...response,serverTime:response.serverTime+1000,events:[{seq:999,id:'test-note',at:response.serverTime,type:'test',text:'A committed observation.'},...response.events]};
  await visitor.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await visitor.waitForFunction(()=>!document.querySelector('#note-dot').hidden);
  await visitor.locator('#notes-button').click();
  check('Committed notes mark unread and opening notes clears it',await visitor.locator('#note-dot').evaluate(node=>node.hidden));
  await visitor.close();
  check('No page errors',errors.length===0,errors);
}finally{await browser.close();await writeFile(`${directory}/browser-results.json`,JSON.stringify(results,null,2)+'\n');}
if(results.some(result=>!result.pass))process.exitCode=1;
