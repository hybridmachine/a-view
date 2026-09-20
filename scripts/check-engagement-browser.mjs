// Optional development-only Playwright. A separate checkout can supply the baseline.
import {createRequire} from 'node:module';
import {mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=resolve(process.env.ENGAGEMENT_ROOT||'.'),directory=resolve('docs/engagement-validation');
const {WorldStore}=await import(pathToFileURL(join(root,'src/store.js')));
const {WORLD_DAY,RATE}=await import(pathToFileURL(join(root,'shared/world.js')));
const duration=Math.ceil(WORLD_DAY/RATE),epoch=1_800_000_000_000;
async function saveReport(name,report){
  // One checkpoint per line keeps the retained evidence practical to review.
  const {samples,realtime,...summary}=report;
  const output={...summary,...(!report.recording?{samples:'__samples__'}:{}),
    realtime:realtime?{...realtime,observations:'__observations__'}:null};
  const rows=(values,indent)=>'[\n'+values.map(value=>' '.repeat(indent+2)+JSON.stringify(value)).join(',\n')+'\n'+' '.repeat(indent)+']';
  const text=JSON.stringify(output,null,2).replace('"__samples__"',rows(samples,2))
    .replace('"__observations__"',rows(realtime?.observations??[],4));
  await writeFile(join(directory,name),text+'\n');
}
await mkdir(directory,{recursive:true});
const temporary=await mkdtemp(join(tmpdir(),'a-view-engagement-'));
const child=spawn(process.execPath,['src/server.js'],{cwd:root,env:{...process.env,PORT:'0',A_VIEW_DB:join(temporary,'world.sqlite')},stdio:['ignore','pipe','pipe']});
let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);
let browser;
try{
  const base=await new Promise((yes,no)=>{
    const timer=setTimeout(()=>no(new Error(stderr||'Server startup timed out')),10000);let text='';
    child.once('error',error=>{clearTimeout(timer);no(error);});
    child.stdout.on('data',chunk=>{text+=chunk;const url=text.match(/http:\/\/127\.0\.0\.1:\d+/);if(url){clearTimeout(timer);yes(url[0]);}});
  });
  browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE,...(process.env.SKY_GPU==='metal'?{args:['--enable-gpu','--use-gl=angle','--use-angle=metal']}:{} )});
  const page=await browser.newPage({viewport:{width:1000,height:563}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/dev/sky-study.html');await page.waitForFunction(()=>window.skyStudy?.ready);
  await page.evaluate(async()=>{await Promise.all([skyStudy.painter.foliageTask,skyStudy.painter.weatherTask,skyStudy.painter.cottageTask]);skyStudy.onFrame=()=>{};document.querySelector('aside').classList.add('hidden');});
  const store=new WorldStore(':memory:',epoch),samples=[];
  for(let elapsed=0;elapsed<=duration;elapsed+=10000)samples.push(store.snapshot(epoch+elapsed));
  const events=store.db.prepare('SELECT * FROM events ORDER BY seq').all();store.close();
  const choose=(name,score)=>({name,snapshot:samples.reduce((best,s)=>score(s)<score(best)?s:best)});
  const selected=[choose('afternoon',s=>Math.abs(s.calendar.hour-15)),choose('rain',s=>-s.weather.rain),
    choose('after-rain',s=>s.weather.rain>.01?10:-s.world.environment.pathWetness),
    choose('dusk',s=>Math.abs(s.calendar.hour-s.calendar.sunset)),choose('night',s=>Math.abs(s.calendar.hour-1)),
    choose('dawn',s=>Math.abs(s.calendar.hour-s.calendar.sunrise))];
  for(const {name,snapshot} of selected){
    await page.evaluate(s=>{skyStudy.state.playing=false;skyStudy.render=()=>skyStudy.painter.render(s,s.serverTime);skyStudy.onFrame=()=>skyStudy.render();skyStudy.render();},snapshot);
    await page.screenshot({path:join(directory,`${name}.png`)});
  }
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:join(directory,'portrait.png')});
  const report={baselineRoot:root,worldDayRealMs:duration,sampleCount:samples.length,errors,
    eventsByType:Object.fromEntries([...new Set(events.map(e=>e.type))].map(type=>[type,events.filter(e=>e.type===type).length])),
    samples:samples.map(s=>({at:s.serverTime,hour:s.calendar.hour,light:s.calendar.light,rain:s.weather.rain,wetness:s.world.environment.pathWetness,rooms:s.world.cottage.rooms,hearth:s.world.cottage.hearth.on,casement:s.world.cottage.casement})),
    realtime:null};
  const reportName=process.env.ENGAGEMENT_REPORT||'results.json';
  if(process.env.ENGAGEMENT_RECORD==='1'){
    const recorded=await browser.newPage({viewport:{width:1000,height:563},recordVideo:{dir:directory,size:{width:1000,height:563}}});
    recorded.on('pageerror',error=>errors.push(error.message));
    await recorded.goto(base+'/dev/sky-study.html');await recorded.waitForFunction(()=>window.skyStudy?.ready);
    await recorded.evaluate(async()=>{await Promise.all([skyStudy.painter.foliageTask,skyStudy.painter.weatherTask,skyStudy.painter.cottageTask]);document.querySelector('aside').classList.add('hidden');});
    for(const name of ['afternoon','dusk','after-rain']){
      const start=selected.find(s=>s.name===name).snapshot.serverTime,world=new WorldStore(':memory:',epoch),sequence=[];
      for(let offset=0;offset<=12000;offset+=2000)sequence.push(world.snapshot(start+offset));world.close();
      await recorded.evaluate(async sequence=>{
        const {WorldClient}=await import('/world-client.js'),began=performance.now(),client=new WorldClient();let index=-1;
        skyStudy.onFrame=()=>{
          const next=Math.min(sequence.length-1,Math.floor((performance.now()-began)/2000));
          if(next!==index){client.accept(sequence[next]);index=next;}
          skyStudy.painter.render(client.snapshot,client.now());
        };
      },sequence);
      await new Promise(resolve=>setTimeout(resolve,12000));
    }
    const video=recorded.video();await recorded.close();await video.saveAs(join(directory,'combined.webm'));await video.delete();
    report.recording={fixtures:['afternoon','dusk','after-rain'],secondsPerFixture:12};
  }
  await saveReport(reportName,report);
  console.log(`Sampled a full world day: ${samples.length} checkpoints; ${JSON.stringify(report.eventsByType)}`);
  if(process.env.ENGAGEMENT_REALTIME==='1'){
    await page.setViewportSize({width:800,height:450});await page.goto(base);await page.waitForSelector('#painting.ready');
    const start=Date.now(),observations=[];
    while(Date.now()-start<duration){
      const snapshot=await (await page.request.get(base+'/api/world')).json();
      observations.push({elapsed:Date.now()-start,at:snapshot.serverTime,hour:snapshot.calendar.hour,rain:snapshot.weather.rain,revision:snapshot.world.revision});
      if(observations.length%60===1)await page.screenshot({path:join(directory,`realtime-${Math.floor((Date.now()-start)/1000)}.png`)});
      await new Promise(resolve=>setTimeout(resolve,10000));
    }
    const gaps=observations.slice(1).map((s,i)=>s.elapsed-observations[i].elapsed);
    report.realtime={startedAt:start,elapsedMs:Date.now()-start,maxObservationGapMs:Math.max(0,...gaps),observations};
    await saveReport(reportName,report);
    console.log(`Elapsed world-day review completed in ${report.realtime.elapsedMs} ms; largest observation gap ${report.realtime.maxObservationGapMs} ms; ${errors.length} browser errors.`);
  }
  if(errors.length)throw new Error(errors.join('\n'));
}finally{
  await browser?.close();if(child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}
  await rm(temporary,{recursive:true,force:true});
}
