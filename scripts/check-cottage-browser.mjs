import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{}),...(process.env.SKY_GPU==='metal'?{args:['--enable-gpu','--use-gl=angle','--use-angle=metal']}:{} )});
const base=process.env.SKY_PREVIEW_URL||'http://127.0.0.1:4174',directory='docs/cottage-validation';
await mkdir(directory,{recursive:true});const results=[],errors=[];
const check=(name,pass,detail)=>{results.push({name,pass,detail});console.log(`${pass?'PASS':'FAIL'} ${name}`);};
async function page(options={}){const p=await browser.newPage(options);p.on('pageerror',error=>errors.push(error.message));return p;}
async function ready(p){await p.goto(`${base}/dev/sky-study.html`);await p.waitForFunction(()=>window.skyStudy?.ready);await p.evaluate(async()=>{await Promise.all([skyStudy.painter.cottageTask,skyStudy.painter.weatherTask,skyStudy.painter.foliageTask]);skyStudy.render();});}
try{
  const p=await page({viewport:{width:1672,height:941},deviceScaleFactor:1});await ready(p);
  check('Complete optional cottage bundle',await p.evaluate(()=>skyStudy.painter.cottageActive&&!skyStudy.painter.cottageFailure));
  const pixels=await p.evaluate(()=>{
    const p=skyStudy.painter;p.motion=false;skyStudy.fixture('Cottage dark');
    function capture(main,second,opening=0){Object.assign(skyStudy.state,{mainLight:main,secondLight:second,opening});skyStudy.render();const bytes=new Uint8Array(p.canvas.width*p.canvas.height*4);p.gl.readPixels(0,0,p.canvas.width,p.canvas.height,p.gl.RGBA,p.gl.UNSIGNED_BYTE,bytes);return bytes;}
    const renderer=p.cottageRenderer;p.cottageRenderer=null;const baked=capture(0,0);p.cottageRenderer=renderer;
    const dark=capture(0,0),main=capture(1,0),second=capture(0,1),both=capture(1,1),opened=capture(0,0,1);
    const at=(data,x,y,c=0)=>data[((p.canvas.height-1-y)*p.canvas.width+x)*4+c];
    function mean(data,x,y,w,h){let sum=0;for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)sum+=at(data,xx,yy);return sum/(w*h);}
    let mainOutside=0,secondOutside=0,openingOutside=0,openingInside=0;
    for(let y=0;y<941;y++)for(let x=0;x<1672;x++){
      const inRoom=index=>{const [left,top,w,h]=p.scene.cottageLife.rooms[index].bounds;return x>=left-1&&x<=left+w+1&&y>=top-1&&y<=top+h+1;};
      if(at(main,x,y)!==at(dark,x,y)&&!inRoom(0))mainOutside++;
      if(at(second,x,y)!==at(dark,x,y)&&!inRoom(1))secondOutside++;
      if(at(opened,x,y)!==at(dark,x,y)){if(inRoom(0))openingInside++;else openingOutside++;}
    }
    return {bakedMain:mean(baked,507,491,14,27),darkMain:mean(dark,507,491,14,27),litMain:mean(main,507,491,14,27),
      bakedSecond:mean(baked,604,493,10,25),darkSecond:mean(dark,604,493,10,25),litSecond:mean(second,604,493,10,25),
      mainOutside,secondOutside,openingOutside,openingInside,both:mean(both,507,491,14,27)};
  });
  check('Both unlit rooms remove baked night emission',pixels.darkMain<pixels.bakedMain*.6&&pixels.darkSecond<pixels.bakedSecond*.6,pixels);
  check('Room lights are independent and local',pixels.litMain>pixels.darkMain+30&&pixels.litSecond>pixels.darkSecond+30&&pixels.mainOutside===0&&pixels.secondOutside===0,pixels);
  check('Casement reveals interior only inside its authored envelope',pixels.openingInside>30&&pixels.openingOutside===0,pixels);
  await p.evaluate(()=>document.querySelector('aside').classList.add('hidden'));
  for(const fixture of ['Cottage dark','Main room','Second room','Both rooms','Open casement','Half-open casement']){
    await p.evaluate(name=>skyStudy.fixture(name),fixture);await p.screenshot({path:`${directory}/${fixture.toLowerCase().replaceAll(' ','-')}.png`});
  }
  const matrix=await p.evaluate(async()=>{
    const {viewConditions}=await import('/shared/world.js'),p=skyStudy.painter,conditions=viewConditions(0,0,'day');let draws=0;
    for(const light of [0,.25,.5,.75,1])for(const rain of [0,.8])for(const main of [0,1])for(const second of [0,1])for(const open of [0,.5,1]){
      p.render({world:{epoch:0,nest:{materials:0},action:null}},0,'preview',{conditions:{calendar:{...conditions.calendar,light},weather:{...conditions.weather,rain}},cottagePose:{main,second,open}});draws++;
      if(p.gl.getError()!==0||!p.cottageActive)return {draws,pass:false};
    }
    return {draws,pass:true};
  });check('Lighting, weather, room, and casement matrix',matrix.pass,matrix);
  const invalid=await p.evaluate(async()=>{
    const {loadCottageAssets,validateCottageConfig}=await import('/cottage-renderer.js'),scene=structuredClone(skyStudy.painter.scene),failures=[];
    const bad=structuredClone(scene.cottageLife);bad.casement.bounds[0]=0;
    try{validateCottageConfig(bad,scene);failures.push(false);}catch{failures.push(true);}
    const image=new Image();image.src=scene.cottageLife.assets.day;await image.decode();
    const canvas=document.createElement('canvas');[canvas.width,canvas.height]=scene.cottageLife.atlasSize;
    const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);ctx.clearRect(...scene.cottageLife.rooms[0].rect);
    scene.cottageLife.assets={day:canvas.toDataURL(),night:canvas.toDataURL()};
    try{await loadCottageAssets(scene);failures.push(false);}catch{failures.push(true);}
    return failures.every(Boolean);
  });check('Invalid hinge geometry or missing repair coverage rejects the whole bundle',invalid);
  const clocks=await p.evaluate(async()=>{
    const {Painting}=await import('/painting.js'),{createCottageState}=await import('/shared/cottage.js');
    const p=new Painting(document.createElement('canvas'),document.createElement('canvas'),{fallback:document.createElement('img')});await p.init();await p.cottageTask;
    const cottage=createCottageState(0,0);cottage.pending={id:'fixture',actor:cottage.residentId,kind:'casement',room:'main',target:1,from:0,start:0,motionStart:8000,end:12000};
    const snapshot={world:{epoch:0,nest:{materials:0},action:null,cottage}},before=JSON.stringify(snapshot);
    p.render(snapshot,10_000);const pose=JSON.stringify(p.cottagePose);p.render(snapshot,10_000);const pause=pose===JSON.stringify(p.cottagePose);
    p.motionChanged({matches:true});p.render(snapshot,10_000);const reduced=p.cottagePose.open===0;
    p.motionChanged({matches:false});p.render(snapshot,10_000,'night');const study=p.cottagePose.main===1&&JSON.stringify(snapshot)===before;
    p.render(snapshot,10_000);const live=JSON.stringify(p.cottagePose)===pose;
    cottage.pending=null;cottage.hearth={on:true,since:0,lastBurn:null};p.render(snapshot,30_000);
    const pixels=()=>p.ctx.getImageData(0,0,p.lifeCanvas.width,p.lifeCanvas.height).data;
    const smoke=pixels();cottage.hearth.on=false;p.render(snapshot,30_000);const clear=pixels();
    const hearth=smoke.some((value,i)=>value!==clear[i]);
    cottage.hearth.on=true;p.motionChanged({matches:true});p.render(snapshot,30_000);const reducedPixels=pixels();
    cottage.hearth.on=false;p.render(snapshot,30_000);const reducedWithoutFire=pixels();
    const smokeReduced=reducedPixels.every((value,i)=>value===reducedWithoutFire[i]);
    p.dispose();return {pause,reduced,study,live,hearth,smokeReduced};
  });for(const [name,pass]of Object.entries(clocks))check(`Cottage display: ${name}`,pass);
  for(const width of [390,800]){
    await p.setViewportSize({width,height:844});await p.evaluate(()=>{skyStudy.fixture('Main room');skyStudy.painter.pan=.38;skyStudy.painter.updateCrop();skyStudy.render();});
    await p.screenshot({path:`${directory}/portrait-${width}.png`});
  }
  const restoration=await p.evaluate(async()=>{
    const p=skyStudy.painter,extension=p.gl.getExtension('WEBGL_lose_context');extension.loseContext();await new Promise(r=>setTimeout(r,100));const cleared=!p.cottageRenderer&&!p.cottageActive;
    extension.restoreContext();for(let i=0;i<200&&!p.ready;i++)await new Promise(r=>setTimeout(r,25));
    await Promise.all([p.cottageTask,p.weatherTask,p.foliageTask]);skyStudy.render();return cleared&&p.cottageActive&&p.gl.getError()===0;
  });check('Context restoration rebuilds the complete cottage',restoration);
  const perf=await p.evaluate(async()=>{
    const p=skyStudy.painter,renderer=p.cottageRenderer;
    async function measure(enabled){p.cottageRenderer=enabled?renderer:null;const samples=[];for(let i=0;i<45;i++){await new Promise(requestAnimationFrame);const start=performance.now();skyStudy.render();p.gl.finish();samples.push(performance.now()-start);}samples.sort((a,b)=>a-b);return {median:samples[22],p95:samples[42]};}
    return {baseline:await measure(false),cottage:await measure(true),textureBytes:2*256*256*4};
  });check('Cottage stays within 30 fps draw budget',perf.cottage.p95<33.34,perf);
  for(const failure of ['missing','corrupt','dispose','reinitialize','context-loss']){
    const isolated=await page();let release;const gate=new Promise(resolve=>release=resolve);
    await isolated.route('**/lakeside-cottage-v1/*.png',async route=>{
      if(failure==='missing')return route.abort();if(failure==='corrupt')return route.fulfill({contentType:'image/png',body:Buffer.from('bad')});
      await gate;await route.continue();
    });
    await isolated.goto(`${base}/dev/sky-study.html`,{waitUntil:'domcontentloaded'});await isolated.waitForFunction(()=>window.skyStudy?.ready&&skyStudy.painter.ready);
    check(`Sky is independent of cottage load (${failure})`,await isolated.evaluate(()=>skyStudy.painter.ready&&!skyStudy.painter.cottageActive));
    if(['missing','corrupt'].includes(failure)){
      await isolated.evaluate(async()=>{await skyStudy.painter.cottageTask;await skyStudy.painter.foliageTask;skyStudy.render();});
      check(`Complete cottage fallback (${failure})`,await isolated.evaluate(()=>!skyStudy.painter.cottageRenderer&&!!skyStudy.painter.cottageFailure&&!!skyStudy.painter.foliageRenderer));
    }else{
      await isolated.evaluate(()=>window.oldCottageTask=skyStudy.painter.cottageTask);
      if(failure==='dispose')await isolated.evaluate(()=>skyStudy.painter.dispose());
      if(failure==='reinitialize')await isolated.evaluate(async()=>{skyStudy.painter.scene={...skyStudy.painter.scene,cottageLife:undefined};await skyStudy.painter.init();});
      if(failure==='context-loss'){await isolated.evaluate(()=>skyStudy.painter.gl.getExtension('WEBGL_lose_context').loseContext());await isolated.waitForFunction(()=>!skyStudy.painter.ready);}
      release();await isolated.evaluate(()=>window.oldCottageTask);
      check(`Stale cottage load cannot attach after ${failure}`,await isolated.evaluate(()=>!skyStudy.painter.cottageRenderer&&!skyStudy.painter.pendingCottage));
    }
    await isolated.close();
  }
  const failureFrame=await p.evaluate(()=>{
    const painter=skyStudy.painter;painter.cottageRenderer.draw=()=>{throw new Error('injected draw failure');};skyStudy.render();
    return !painter.cottageRenderer&&!painter.cottageActive&&painter.ready&&!!painter.weatherRenderer&&!!painter.foliageRenderer&&painter.gl.getError()===0;
  });check('Partial draw failure restores the base and surviving layers',failureFrame);
  const visitor=await page();await visitor.route('**/lakeside-cottage-v1/*.png',route=>route.abort());await visitor.goto(base);
  await visitor.waitForFunction(()=>document.querySelector('#scene-description').textContent.includes('static painting'));
  check('Accessible description identifies the static cottage fallback',(await visitor.locator('#scene-description').textContent()).includes('static painting. Shared cottage state: '));await visitor.close();
  const pausedVisitor=await page(),seed=await (await pausedVisitor.request.get(`${base}/api/world`)).json();
  const nextDecisionAt=seed.world.cottage.introducedAt+(Math.ceil((seed.serverTime-seed.world.cottage.introducedAt)/30_000)+10)*30_000;
  seed.nextCommitAt=nextDecisionAt;seed.validUntil=nextDecisionAt;seed.world.action=null;
  if(seed.world.bird)seed.world.bird.nextDecisionAt=seed.world.bird.introducedAt+Math.ceil((nextDecisionAt-seed.world.bird.introducedAt)/30_000)*30_000;
  Object.assign(seed.world.cottage,{pending:null,nextDecisionAt,rooms:{main:false,second:false}});
  let response=structuredClone(seed);
  await pausedVisitor.route('**/api/world',route=>route.fulfill({json:response}));await pausedVisitor.route('**/api/stream',route=>route.abort());
  await pausedVisitor.goto(base);await pausedVisitor.waitForSelector('#painting.ready');
  await pausedVisitor.waitForFunction(()=>document.querySelector('#cottage-detail').textContent.includes('windows are dark'));
  await pausedVisitor.locator('#pause-button').click();const pausedText=await pausedVisitor.locator('#cottage-detail').textContent();
  response={...seed,serverTime:seed.serverTime+60_000,world:{...seed.world,revision:seed.world.revision+1,cottage:{...seed.world.cottage,rooms:{main:true,second:false}}},
    events:[{seq:(seed.events[0]?.seq??0)+1,id:'pause-test',at:seed.serverTime+60_000,type:'test',text:'A committed pause-test observation.'},...seed.events]};
  await pausedVisitor.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await pausedVisitor.waitForFunction(()=>!document.querySelector('#note-dot').hidden);
  check('Paused cottage observation holds while a newer snapshot is accepted',(await pausedVisitor.locator('#cottage-detail').textContent())===pausedText);
  await pausedVisitor.locator('#pause-button').click();
  check('Resuming cottage observation rejoins the current shared room state',(await pausedVisitor.locator('#cottage-detail').textContent()).includes('main room'));
  await pausedVisitor.close();
  if(process.env.COTTAGE_RECORD==='1'){
    const {WorldStore}=await import('../src/store.js'),store=new WorldStore(':memory:',1_800_000_000_000);
    let before,after,fire;
    try{
      let snapshot=store.snapshot(1_800_000_000_000);
      for(let i=0;i<4000;i++){
        const action=snapshot.world.cottage.pending;
        if(!before&&action?.kind==='casement'&&action.target===1){before=snapshot;after=store.snapshot(action.end);snapshot=after;}
        if(before&&snapshot.world.cottage.hearth.on){fire=store.snapshot(snapshot.serverTime+32_000);break;}
        snapshot=store.snapshot(snapshot.nextCommitAt);
      }
    }finally{store.close();}
    if(!before||!fire)throw new Error('No routine found for recording');
    const recorded=await page({viewport:{width:1672,height:941},recordVideo:{dir:directory,size:{width:1672,height:941}}});await ready(recorded);
    const duration=after.serverTime-before.serverTime+3000;
    await recorded.evaluate(({before,after})=>{
      document.querySelector('aside').classList.add('hidden');
      const p=skyStudy.painter,render=p.render.bind(p),start=performance.now();
      window.routineRender=render;
      p.render=()=>{const now=before.serverTime+performance.now()-start;render(now<after.serverTime?before:after,Math.min(now,after.serverTime+3000));};
    },{before,after});
    await recorded.waitForTimeout(duration);
    await recorded.evaluate(snapshot=>{skyStudy.painter.render=()=>window.routineRender(snapshot,snapshot.serverTime);skyStudy.render();},fire);
    await recorded.screenshot({path:`${directory}/hearth-smoke.png`});await recorded.waitForTimeout(2000);
    const video=recorded.video();await recorded.close();await video.saveAs(`${directory}/routine.webm`);
    check('Real-time committed casement and hearth recording',true,{action:before.world.cottage.pending,durationMs:duration,video:'routine.webm'});
  }
  check('No page errors on any test page',errors.length===0,errors);
}finally{await browser.close();await writeFile(`${directory}/browser-results.json`,JSON.stringify(results,null,2)+'\n');}
if(results.some(result=>!result.pass))process.exitCode=1;
