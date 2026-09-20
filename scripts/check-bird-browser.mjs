import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {WorldStore} from '../src/store.js';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{}),...(process.env.SKY_GPU==='metal'?{args:['--enable-gpu','--use-gl=angle','--use-angle=metal']}:{} )});
const base=process.env.SKY_PREVIEW_URL||'http://127.0.0.1:4174',directory='docs/bird-validation';
await mkdir(directory,{recursive:true});const results=[],errors=[];
const check=(name,pass,detail)=>{results.push({name,pass,detail});console.log(`${pass?'PASS':'FAIL'} ${name}`);};
async function page(options={}){const p=await browser.newPage(options);p.on('pageerror',error=>errors.push(error.message));return p;}
async function ready(p){await p.goto(`${base}/dev/sky-study.html`);await p.waitForFunction(()=>window.skyStudy?.ready);await p.evaluate(async()=>{await Promise.all([skyStudy.painter.cottageTask,skyStudy.painter.weatherTask,skyStudy.painter.foliageTask]);document.querySelector('aside').classList.add('hidden');skyStudy.render();});}
try{
  const p=await page({viewport:{width:1672,height:941},deviceScaleFactor:1});await ready(p);
  const matrix=await p.evaluate(()=>{
    let count=0;
    for(const fixture of ['Oak perch','Sheltered bird','Roof perch','Oak flight','Shelter flight','Roof flight'])for(const hour of [0,5,15.5,19.5])for(const phase of [0,1,2,3,4,5,6,7,8,9]){
      skyStudy.fixture(fixture);Object.assign(skyStudy.state,{hour,birdTime:phase});skyStudy.render();count++;
      const painter=skyStudy.painter;
      if(!painter.birdPose||painter.birdActive===painter.birdPose.hidden||painter.gl.getError()!==0)return {pass:false,count,fixture,hour,phase};
    }
    return {pass:true,count};
  });check('All bird routes and perches render through day/night',matrix.pass,matrix);
  const activity=await p.evaluate(async()=>{
    const {createBirdState}=await import('/shared/bird.js'),painter=skyStudy.painter;
    const snapshot={world:{epoch:0,nest:{materials:6},action:null,bird:createBirdState(0)}};
    const draw=(hour,options={})=>{
      skyStudy.state.hour=hour;
      painter.render(snapshot,1000,'preview',{conditions:skyStudy.conditions(),bird:{state:snapshot.world.bird,now:1000},...options});
      return painter.birdActive;
    };
    const daytime=draw(12),nighttime=draw(0);
    draw(12);const debug=draw(12,{debug:1});
    draw(12);const study=draw(12,{bird:null});
    skyStudy.fixture('Sheltered bird');const sheltered=painter.birdActive;
    skyStudy.fixture('Oak perch');const returned=painter.birdActive;
    return {daytime,nighttime,debug,study,sheltered,returned};
  });check('Skipped bird frames clear activity across night, debug, study, and shelter',activity.daytime&&!activity.nighttime&&!activity.debug&&!activity.study&&!activity.sheltered&&activity.returned,activity);
  for(const fixture of ['Oak perch','Sheltered bird','Roof perch']){
    await p.evaluate(name=>skyStudy.fixture(name),fixture);await p.screenshot({path:`${directory}/${fixture.toLowerCase().replaceAll(' ','-')}.png`});
  }
  await p.evaluate(()=>{skyStudy.fixture('Oak perch');skyStudy.state.birdGuides=true;skyStudy.render();});
  await p.screenshot({path:`${directory}/routes.png`});
  await p.evaluate(()=>{skyStudy.state.birdGuides=false;skyStudy.render();});
  const modes=await p.evaluate(()=>{
    const painter=skyStudy.painter;skyStudy.fixture('Roof flight');skyStudy.state.birdTime=4;skyStudy.render();
    const moving=JSON.stringify(painter.birdPose);skyStudy.render();const pause=moving===JSON.stringify(painter.birdPose);
    painter.motionChanged({matches:true});skyStudy.render();const reduced=!painter.birdPose.flying&&painter.birdPose.locationId==='oak-perch';
    painter.motionChanged({matches:false});skyStudy.render();const resume=moving===JSON.stringify(painter.birdPose);
    const valid=painter.birdRenderer.valid;painter.birdRenderer.valid=false;skyStudy.render();
    const fallback=!painter.birdActive&&painter.ready&&!!painter.cottageRenderer&&!!painter.foliageRenderer&&!!painter.weatherRenderer;
    painter.birdRenderer.valid=valid;skyStudy.render();return {pause,reduced,resume,fallback};
  });for(const [name,pass]of Object.entries(modes))check(`Bird display: ${name}`,pass);
  const restoration=await p.evaluate(async()=>{
    const painter=skyStudy.painter,extension=painter.gl.getExtension('WEBGL_lose_context');skyStudy.fixture('Roof perch');
    extension.loseContext();await new Promise(resolve=>setTimeout(resolve,100));skyStudy.render();
    const fallback=painter.birdActive&&!painter.ready;
    extension.restoreContext();for(let i=0;i<200&&!painter.ready;i++)await new Promise(resolve=>setTimeout(resolve,25));
    await Promise.all([painter.cottageTask,painter.weatherTask,painter.foliageTask]);skyStudy.render();
    return {fallback,restored:painter.ready&&painter.birdActive&&painter.gl.getError()===0};
  });check('Bird survives original-painting fallback and GPU restoration',restoration.fallback&&restoration.restored,restoration);
  const mask=await p.evaluate(async()=>{
    const {BirdRenderer}=await import('/bird-renderer.js'),{sampleBird,birdFixture}=await import('/shared/bird.js');
    const target=document.createElement('canvas');target.width=1672;target.height=941;const ctx=target.getContext('2d'),renderer=new BirdRenderer();
    const fixture=birdFixture('Shelter flight',6000),pose=sampleBird(fixture.state,null,fixture.now);
    renderer.draw(ctx,pose,1,(x,y)=>[x*1672,y*941],1);
    const hidden=ctx.getImageData(0,0,1672,941).data.every(v=>v===0);
    const mid=sampleBird(fixture.state,null,2500);renderer.draw(ctx,mid,1,(x,y)=>[x*1672,y*941],1);
    return {hidden,visible:ctx.getImageData(0,0,1672,941).data.some(v=>v!==0)};
  });check('Fixed bark fully hides shelter arrival but preserves approach',mask.hidden&&mask.visible,mask);
  for(const width of [390,800]){
    await p.setViewportSize({width,height:844});await p.evaluate(()=>{skyStudy.fixture('Roof perch');skyStudy.painter.pan=.38;skyStudy.painter.updateCrop();skyStudy.render();});
    await p.screenshot({path:`${directory}/portrait-${width}.png`});
  }
  await p.setViewportSize({width:390,height:844});
  for(const pan of [0,1]){
    await p.evaluate(pan=>{skyStudy.fixture('Oak perch');skyStudy.painter.pan=pan;skyStudy.painter.updateCrop();skyStudy.render();},pan);
    await p.screenshot({path:`${directory}/portrait-pan-${pan}.png`});
  }
  await p.setViewportSize({width:800,height:844});
  const perf=await p.evaluate(async()=>{
    skyStudy.fixture('Roof flight');skyStudy.state.birdTime=4;
    async function measure(bird){
      skyStudy.state.bird=bird;const samples=[];
      for(let i=0;i<45;i++){await new Promise(requestAnimationFrame);const start=performance.now();skyStudy.render();skyStudy.painter.gl.finish();samples.push(performance.now()-start);}
      samples.sort((a,b)=>a-b);return {median:samples[22],p95:samples[42]};
    }
    return {baseline:await measure(null),bird:await measure('Roof flight'),scratchBytes:96*96*4};
  });check('Bird scene stays within 30 fps draw budget',perf.bird.p95<33.34,perf);
  // Two visitor pages receive identical committed snapshots at an injected,
  // stationary display clock. No fixture is written to the shared server.
  const store=new WorldStore(':memory:',1_800_000_000_000);
  let seed=store.snapshot(1_800_000_000_000);
  while(seed.world.bird.pending?.kind!=='flight')seed=store.snapshot(seed.nextCommitAt);
  const action=seed.world.bird.pending;seed=store.snapshot(action.start+2000);
  const after=store.snapshot(action.end+1000);store.close();
  const a=await page(),b=await page();let response=seed;
  for(const visitor of [a,b]){
    await visitor.addInitScript(()=>Object.defineProperty(performance,'now',{value:()=>10000}));
    await visitor.route('**/api/world',route=>route.fulfill({json:response}));await visitor.route('**/api/stream',route=>route.abort());
    await visitor.goto(base);await visitor.waitForSelector('#painting.ready');
    await visitor.waitForFunction(()=>document.querySelector('#bird-detail').textContent.includes('flying'));
  }
  const pixels=visitor=>visitor.locator('#life').evaluate(canvas=>canvas.toDataURL());
  check('Two visitors draw identical committed bird and life pixels',await pixels(a)===await pixels(b));
  await a.locator('#pause-button').click();const paused=await pixels(a),description=await a.locator('#bird-detail').textContent();
  response=after;await a.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await a.waitForTimeout(200);
  check('Paused bird pixels and description survive a newer committed snapshot',paused===await pixels(a)&&description===await a.locator('#bird-detail').textContent());
  check('Routine bird commits do not light the unread note dot',await a.locator('#note-dot').isHidden());
  await a.locator('#pause-button').click();await a.waitForFunction(()=>document.querySelector('#bird-detail').textContent.includes('bird rests'));
  await a.waitForFunction(before=>document.querySelector('#life').toDataURL()!==before,paused);
  check('Resume shows the newly committed resting place',await pixels(a)!==paused);
  await a.locator('#about-button').click();await a.locator('[data-light="day"]').click();
  check('Private studies omit bird observations',/omitted/.test(await a.locator('#bird-detail').textContent()));
  await a.locator('#return-live').click();check('Return to live restores the shared bird observation',/bird rests/.test(await a.locator('#bird-detail').textContent()));
  await a.emulateMedia({reducedMotion:'reduce'});response=seed;
  // Reload rather than trying to rewind the existing client's shared clock.
  await a.reload();await a.waitForFunction(()=>document.querySelector('#bird-detail').textContent.includes('Reduced motion'));
  check('Reduced-motion visitor text explains the held resting pose',/last resting place/.test(await a.locator('#bird-detail').textContent()));
  await a.close();await b.close();
  const nativeAudio=await p.evaluate(async()=>{
    const {Ambience}=await import('/sound.js'),{createBirdState,BIRD_ID}=await import('/shared/bird.js');
    const bird=createBirdState(0,false);bird.locationId='oak-perch';
    bird.pending={id:'audio-browser',actor:BIRD_ID,rulesVersion:1,kind:'call',from:'oak-perch',to:'oak-perch',start:1000,phraseStart:6000,end:6600,phaseSeed:0,phrase:'oak-phrase-1'};
    const starts=[];const audio=new Ambience({createContext:()=>{
      const ctx=new AudioContext(),create=ctx.createOscillator.bind(ctx);
      ctx.createOscillator=()=>{const osc=create(),start=osc.start.bind(osc);osc.start=at=>{starts.push(at);start(at);};return osc;};return ctx;
    }});
    try{
      await audio.toggle();const before=audio.context.currentTime;
      audio.update(1,0,{bird,now:5800,active:true,validUntil:6600});
      const voices=[...audio.phraseNodes],size=voices.length,offset=(starts[0]-before)*1000;
      audio.hold();const canceled=audio.phraseNodes.size===0&&voices.every(({osc})=>osc.onended===null);
      audio.update(1,0,{bird,now:5900,active:true,validUntil:6600});
      // Allow canceled native oscillators to dispatch any queued ended events.
      await new Promise(resolve=>setTimeout(resolve,700));
      return {scheduled:size===3,canceled,deduplicated:starts.length===3,offsetMs:offset};
    }finally{if(audio.enabled)await audio.toggle();await audio.context?.close();}
  });check('Native Web Audio schedules and cancels the shared phrase',nativeAudio.scheduled&&nativeAudio.canceled&&nativeAudio.deduplicated&&Math.abs(nativeAudio.offsetMs-200)<100,nativeAudio);
  if(process.env.BIRD_RECORD==='1'){
    const recorded=await page({viewport:{width:1000,height:563},recordVideo:{dir:directory,size:{width:1000,height:563}}});await ready(recorded);
    for(const fixture of ['Oak flight','Shelter flight','Roof flight']){
      await recorded.evaluate(name=>{skyStudy.fixture(name);skyStudy.state.playing=true;},fixture);
      await new Promise(resolve=>setTimeout(resolve,10_000));
      await recorded.evaluate(()=>skyStudy.state.playing=false);
    }
    const video=recorded.video();await recorded.close();await video.saveAs(`${directory}/routes.webm`);await video.delete();
  }
  await p.close();check('No uncaught browser errors',errors.length===0,errors);
  await writeFile(`${directory}/browser-results.json`,JSON.stringify({results},null,2)+'\n');
  if(results.some(result=>!result.pass))process.exitCode=1;
}finally{await browser.close();}
