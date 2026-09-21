// Optional development check: NODE_PATH=/path/to/node_modules node scripts/check-sky-browser.mjs
// Start the application against a temporary DB first. No persisted state is changed.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium }=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.env.SKY_GPU==='metal'?{args:['--enable-gpu','--use-gl=angle','--use-angle=metal']}:{}),...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
const base=process.env.SKY_PREVIEW_URL||'http://127.0.0.1:4174';
const directory=process.env.SKY_VALIDATION_DIR||'docs/sky-validation';await mkdir(directory,{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{
  const counts={texture:0,shader:0,buffer:0,program:0};window.gpuResources=counts;
  for(const [name,key]of [['Texture','texture'],['Shader','shader'],['Buffer','buffer'],['Program','program']]){
    const create=WebGLRenderingContext.prototype[`create${name}`],remove=WebGLRenderingContext.prototype[`delete${name}`];
    const live=new WeakSet();
    WebGLRenderingContext.prototype[`create${name}`]=function(...args){const value=create.apply(this,args);if(value){live.add(value);counts[key]++;}return value;};
    WebGLRenderingContext.prototype[`delete${name}`]=function(value){if(value&&live.has(value)){live.delete(value);counts[key]--;}return remove.call(this,value);};
  }
});
try{
  await page.goto(`${base}/dev/sky-study.html`);await page.waitForFunction(()=>window.skyStudy?.ready);
  await page.evaluate(async()=>{await skyStudy.painter.foliageTask;skyStudy.render();});
  const results=await page.evaluate(()=>window.skyStudy.runPixelChecks());
  const state=await page.evaluate(()=>({ready:skyStudy.painter.ready,failure:skyStudy.painter.failure}));
  console.log(`Shader checks: ${results.filter(x=>x.pass).length}/${results.length}; dynamic sky: ${state.ready}`);
  await page.evaluate(()=>{skyStudy.fixture('Thin cloud over moon');document.querySelector('aside').classList.add('hidden');});
  await page.screenshot({path:`${directory}/night-thin.png`});
  await page.evaluate(()=>skyStudy.fixture('Oak and horizon'));
  await page.screenshot({path:`${directory}/day-clouds.png`});
  const contracts=[];
  const record=(name,pass,detail)=>{contracts.push({name,pass,detail});console.log(`${pass?'PASS':'FAIL'} ${name}`);};
  const retained=await page.evaluate(()=>({...gpuResources}));
  for(let i=0;i<3;i++){
    await page.evaluate(()=>{window.lossExtension=skyStudy.painter.gl.getExtension('WEBGL_lose_context');lossExtension.loseContext();});
    await page.waitForFunction(()=>!skyStudy.painter.ready);
    record(`Context loss ${i+1} immediately hides GPU`,await page.evaluate(()=>document.querySelector('#painting').style.visibility==='hidden'));
    await page.evaluate(()=>{skyStudy.state.hour=0;skyStudy.render();});
    record('Lost-context fallback follows night conditions',await page.evaluate(()=>document.querySelector('#fallback').getAttribute('src').endsWith('lakeside-night.png')));
    await page.evaluate(()=>lossExtension.restoreContext());
    await page.waitForFunction(()=>skyStudy.painter.ready&&document.querySelector('#painting').style.visibility==='visible');
    await page.evaluate(async()=>{await skyStudy.painter.foliageTask;skyStudy.render();});
    const counts=await page.evaluate(()=>({...gpuResources}));record(`Restoration ${i+1} releases old resources`,JSON.stringify(counts)===JSON.stringify(retained),counts);
  }
  const display=await page.evaluate(async()=>{
    const {Painting}=await import('/painting.js');
    const p=new Painting(document.createElement('canvas'),document.createElement('canvas'),{fallback:document.createElement('img')});
    window.contractPainting=p;
    const snap={world:{epoch:0,nest:{materials:0},action:null}};
    await p.init();p.render(snap,1234000,'night');const first=JSON.stringify(p.cloudState),uploads=p.renderer.stats.celestialUploads;
    for(let i=0;i<20;i++)p.render(snap,1234000,'night');
    const paused=first===JSON.stringify(p.cloudState)&&uploads===p.renderer.stats.celestialUploads;
    p.motionChanged({matches:true});p.render(snap,1500000,'day');
    const held=p.lastMotion===1234;
    p.motionChanged({matches:false});p.render(snap,1500000,'day');const resumed=p.lastMotion===1500;
    const direct=JSON.stringify(p.cloudState);p.render(snap,10,'day');p.render(snap,1500000,'day');
    const directJump=direct===JSON.stringify(p.cloudState);
    p.dispose();p.dispose();return {paused,held,resumed,directJump};
  });
  for(const [key,value]of Object.entries(display))record(key,value);
  await page.evaluate(async()=>{
    const {Painting}=await import('/painting.js');window.mediaPainting=new Painting(document.createElement('canvas'),document.createElement('canvas'),{fallback:document.createElement('img')});
    mediaPainting.render({world:{epoch:0,nest:{materials:0},action:null}},1234000,'night');
  });
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>!mediaPainting.motion);
  record('Media-query changes freeze the current motion sample',await page.evaluate(()=>{mediaPainting.render({world:{epoch:0,nest:{materials:0},action:null}},2000000,'night');return mediaPainting.lastMotion===1234;}));
  await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(()=>mediaPainting.motion);
  record('Media-query changes rejoin shared time',await page.evaluate(()=>{mediaPainting.render({world:{epoch:0,nest:{materials:0},action:null}},2000000,'night');const pass=mediaPainting.lastMotion===2000;mediaPainting.dispose();return pass;}));
  const reduced=await browser.newPage({reducedMotion:'reduce'});await reduced.goto(`${base}/dev/sky-study.html`);await reduced.waitForFunction(()=>window.skyStudy?.ready);
  const initial=await reduced.evaluate(async()=>{
    const {Painting}=await import('/painting.js');const p=new Painting(document.createElement('canvas'),document.createElement('canvas'),{fallback:document.createElement('img')});
    const snap={world:{epoch:0,nest:{materials:0},action:null}};p.render(snap,9823000,'day');p.render(snap,9923000,'day');const held=p.lastMotion===9823;p.dispose();return held;
  });record('Initial reduced motion freezes current time',initial);await reduced.close();
  const noGL=await browser.newPage();await noGL.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...rest){return type==='webgl'?null:get.call(this,type,...rest);};});
  await noGL.goto(`${base}/dev/sky-study.html`);await noGL.waitForFunction(()=>window.skyStudy?.ready);
  record('No WebGL keeps coherent original painting',await noGL.evaluate(()=>!skyStudy.painter.ready&&document.querySelector('#painting').style.visibility==='hidden'));await noGL.close();
  const missing=await browser.newPage();await missing.route('**/lakeside-sky-v1/cloud-atlas.png',route=>route.abort());
  await missing.goto(`${base}/dev/sky-study.html`);await missing.waitForFunction(()=>window.skyStudy?.ready);
  record('Missing bundle keeps coherent fallback',await missing.evaluate(()=>!skyStudy.painter.ready&&!!skyStudy.painter.failure));await missing.close();
  for(const [name,script]of [
    ['Insufficient sampler budget',()=>{const get=WebGLRenderingContext.prototype.getParameter;WebGLRenderingContext.prototype.getParameter=function(key){return key===this.MAX_TEXTURE_IMAGE_UNITS?6:get.call(this,key);};}],
    ['Insufficient maximum texture size',()=>{const get=WebGLRenderingContext.prototype.getParameter;WebGLRenderingContext.prototype.getParameter=function(key){return key===this.MAX_TEXTURE_SIZE?1024:get.call(this,key);};}],
    ['Shader compilation failure',()=>{const get=WebGLRenderingContext.prototype.getShaderParameter;WebGLRenderingContext.prototype.getShaderParameter=function(shader,key){return key===this.COMPILE_STATUS?false:get.call(this,shader,key);};}],
  ]){
    const failure=await browser.newPage();await failure.addInitScript(script);await failure.goto(`${base}/dev/sky-study.html`);await failure.waitForFunction(()=>window.skyStudy?.ready);
    record(`${name} uses fallback`,await failure.evaluate(()=>!skyStudy.painter.ready&&!!skyStudy.painter.failure));await failure.close();
  }
  const mismatch=await browser.newPage();await mismatch.route('**/lakeside-sky-v1/foreground-night.png',async route=>{const response=await route.fetch({url:`${base}/assets/lakeside-day.png`});await route.fulfill({response});});
  await mismatch.goto(`${base}/dev/sky-study.html`);await mismatch.waitForFunction(()=>window.skyStudy?.ready);
  record('Different foreground alpha rejects entire bundle',await mismatch.evaluate(()=>!skyStudy.painter.ready&&skyStudy.painter.failure==='Foreground coverage mismatch'));await mismatch.close();
  const generation=await page.evaluate(async()=>{
    const {Painting}=await import('/painting.js');const p=new Painting(document.createElement('canvas'),document.createElement('canvas'),{fallback:document.createElement('img')});
    const one=p.init(),two=p.init();await Promise.all([one,two]);const ready=p.ready;p.dispose();const late=p.init();await late;return ready&&!p.ready&&!p.renderer;
  });record('Concurrent initialization and disposal retire old generations',generation);
  const twin=await browser.newPage();await twin.goto(`${base}/dev/sky-study.html`);await twin.waitForFunction(()=>window.skyStudy?.ready);
  for(const p of [page,twin])await p.evaluate(()=>{skyStudy.fixture('Cloud edge crossing');skyStudy.state.motion=12345;skyStudy.render();});
  record('Two sessions share fixed cloud state',JSON.stringify(await page.evaluate(()=>skyStudy.painter.cloudState))===JSON.stringify(await twin.evaluate(()=>skyStudy.painter.cloudState)));await twin.reload();await twin.waitForFunction(()=>window.skyStudy?.ready);
  await twin.evaluate(()=>{skyStudy.fixture('Cloud edge crossing');skyStudy.state.motion=12345;skyStudy.render();});
  record('Reload samples the same arrangement',JSON.stringify(await page.evaluate(()=>skyStudy.painter.cloudState))===JSON.stringify(await twin.evaluate(()=>skyStudy.painter.cloudState)));await twin.close();
  const matrix=[];
  for(const viewport of [{width:1920,height:1080},{width:1440,height:900},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    for(const pan of [0,1]){
      await page.evaluate(pan=>{skyStudy.fixture('Oak and horizon');skyStudy.painter.pan=pan;skyStudy.painter.updateCrop();skyStudy.render();},pan);
      const file=`view-${viewport.width}x${viewport.height}-pan${pan}.png`;await page.screenshot({path:`${directory}/${file}`});matrix.push({viewport,dpr:1,pan,fixture:'Oak and horizon',file});
    }
  }
  await page.setViewportSize({width:1440,height:900});
  for(const name of ['Clear night','Dense cloud over moon','Dawn','Dusk','Daytime overcast']){
    await page.evaluate(name=>skyStudy.fixture(name),name);const file=`fixture-${name.toLowerCase().replaceAll(' ','-')}.png`;await page.screenshot({path:`${directory}/${file}`});matrix.push({viewport:{width:1440,height:900},dpr:1,fixture:name,file});
  }
  const retina=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});await retina.goto(`${base}/dev/sky-study.html`);await retina.waitForFunction(()=>window.skyStudy?.ready);
  await retina.evaluate(()=>{skyStudy.fixture('Thin cloud over moon');skyStudy.painter.pan=1;skyStudy.painter.updateCrop();skyStudy.render();document.querySelector('aside').classList.add('hidden');});
  await retina.screenshot({path:`${directory}/portrait-dpr2.png`});
  record('Retina viewport respects 1.6 render cap',await retina.evaluate(()=>skyStudy.painter.dpr===1.6));await retina.close();
  // Isolated draw timings at matching baseline inputs. gl.finish is test-only.
  await page.setViewportSize({width:1440,height:900});
  const performanceResult=await page.evaluate(()=>{
    const p=skyStudy.painter,snap={world:{epoch:0,nest:{materials:0},action:null}},samples=[];
    for(let i=0;i<180;i++){const a=performance.now();p.render(snap,1000000+i*1000/30,'night');p.gl.finish();samples.push(performance.now()-a);}
    samples.sort((a,b)=>a-b);
    const extension=p.gl.getExtension('WEBGL_debug_renderer_info');
    return {viewport:[1440,900],dpr:1,frames:180,median:samples[90],p95:samples[171],max:samples[179],stats:{...p.renderer.stats},
      renderer:extension?p.gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):p.gl.getParameter(p.gl.RENDERER),userAgent:navigator.userAgent,resources:{...gpuResources}};
  });
  for(const motion of [120,160,180]){
    await page.evaluate(motion=>{skyStudy.fixture('Cloud edge crossing');skyStudy.state.motion=motion;skyStudy.render();},motion);
    await page.screenshot({path:`${directory}/crossing-${motion}.png`});
  }
  console.log('Performance',JSON.stringify(performanceResult));
  let crossing=null;
  if(process.env.SKY_LONG_CHECK==='1'){
    console.log('Observing a fixed cloud crossing for 60 seconds…');
    crossing=await page.evaluate(async()=>{
      skyStudy.fixture('Cloud edge crossing');skyStudy.state.playing=true;
      const start=performance.now(),intervals=[],transmission=[],width=skyStudy.painter.canvas.width,height=skyStudy.painter.canvas.height;
      let previous=0;
      skyStudy.onFrame=now=>{if(previous)intervals.push(now-previous);previous=now;};
      await new Promise(resolve=>{
        function inspect(now){
            if(transmission.length<Math.floor((now-start)/10000)+1){
              const p=skyStudy.painter,old=skyStudy.state.debug;skyStudy.state.debug=4;skyStudy.render();
              const [x,y]=p.point(skyStudy.state.moonX,skyStudy.state.moonY),value=new Uint8Array(4);
              p.gl.readPixels(Math.round(x*p.dpr),height-1-Math.round(y*p.dpr),1,1,p.gl.RGBA,p.gl.UNSIGNED_BYTE,value);
              transmission.push({elapsed:(now-start)/1000,value:value[0]/255,motion:skyStudy.state.motion});skyStudy.state.debug=old;skyStudy.render();
            }
          if(now-start>=60000){resolve();return;}requestAnimationFrame(inspect);
        }requestAnimationFrame(inspect);
      });
      skyStudy.onFrame=null;skyStudy.state.playing=false;intervals.sort((a,b)=>a-b);
      return {elapsed:performance.now()-start,frames:intervals.length,medianInterval:intervals[Math.floor(intervals.length*.5)],p95Interval:intervals[Math.floor(intervals.length*.95)],transmission,width,height};
    });console.log('Crossing',JSON.stringify(crossing));
  }
  await writeFile(`${directory}/browser-results.json`,JSON.stringify({state,results,contracts,errors,matrix,performance:performanceResult,crossing},null,2)+'\n');
  if(!state.ready||errors.length||results.some(x=>!x.pass)||contracts.some(x=>!x.pass))process.exitCode=1;
}finally{await browser.close();}
