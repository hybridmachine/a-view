// Extra visitor-clock and UI contracts. Same optional Playwright setup as check-sky-browser.
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.env.SKY_GPU==='metal'?{args:['--enable-gpu','--use-gl=angle','--use-angle=metal']}:{}),...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
const base=process.env.SKY_PREVIEW_URL||'http://127.0.0.1:4174',results=[],errors=[];
const check=(name,pass,detail)=>{results.push({name,pass,detail});console.log(`${pass?'PASS':'FAIL'} ${name}`);};
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));
  // Avoid third-party font delivery in an otherwise local integration check.
  await page.route('https://fonts.googleapis.com/**',route=>route.abort());
  await page.goto(base);await page.waitForSelector('#painting.ready');
  await page.locator('#pause-button').click();
  // The control updates immediately; a slower GPU may still show the last live
  // frame. Observe the next real draw before capturing the paused baseline.
  await page.evaluate(()=>new Promise(resolve=>{
    const gl=document.querySelector('#painting').getContext('webgl'),draw=gl.drawArrays;
    gl.drawArrays=function(...args){draw.apply(this,args);gl.drawArrays=draw;requestAnimationFrame(()=>resolve());};
  }));
  // Locator screenshots include elements above the canvas. Connection status
  // and toasts may change during a local pause; compare only the painted scene.
  const capture={animations:'disabled',style:'.chrome, #toast, #welcome { visibility: hidden !important; }'};
  const pausedA=await page.locator('#painting').screenshot(capture);
  await page.waitForTimeout(600);
  const pausedB=await page.locator('#painting').screenshot(capture);
  check('Visitor pause freezes painting pixels',pausedA.equals(pausedB));
  await page.locator('#pause-button').click();await page.waitForTimeout(600);
  const resumed=await page.locator('#painting').screenshot(capture);
  check('Visitor resume samples moving present',!resumed.equals(pausedB));
  for(const study of ['dawn','day','dusk','night','rain']){
    await page.locator('#about-button').click();await page.locator(`[data-light="${study}"]`).click();
    check(`Visitor ${study} study renders`,await page.locator('#return-live').isVisible()&&await page.locator('#painting').evaluate(c=>c.classList.contains('ready')));
  }
  await page.locator('#return-live').click();check('Return to live clears study',await page.locator('#return-live').isHidden());
  // Integrate WorldClient with the real Painting and renderer, using an injected
  // client clock, exactly as app.js supplies bounded displayed time.
  const clocks=await page.evaluate(async()=>{
    const {WorldClient}=await import('/world-client.js'),{Painting}=await import('/painting.js');
    let elapsed=0;const client=new WorldClient({clock:()=>elapsed}),p=new Painting(document.createElement('canvas'),document.createElement('canvas'),{fallback:document.createElement('img')});
    const snapshot={serverTime:1000000,validUntil:1010000,world:{epoch:0,revision:1,nest:{materials:0},action:{start:990000,end:1005000}}};
    await p.init();client.accept(snapshot);elapsed=6000;p.render(snapshot,client.now(),'night');const action=JSON.stringify(p.cloudState),actionTime=p.lastMotion;
    // A nanosecond tolerance allows numeric rounding but still catches a 1 ms boundary error.
    elapsed=9000;p.render(snapshot,client.now(),'night');const heldAction=action===JSON.stringify(p.cloudState)&&Math.abs(actionTime-1004.999)<1e-9;
    client.accept({...snapshot,serverTime:1010000,validUntil:1020000,world:{...snapshot.world,revision:2,action:null}});elapsed+=20000;p.render(client.snapshot,client.now(),'night');const expired=JSON.stringify(p.cloudState);
    elapsed+=40000;p.render(client.snapshot,client.now(),'night');const heldExpired=expired===JSON.stringify(p.cloudState)&&p.lastMotion===1020;
    client.accept({...snapshot,serverTime:1100000,validUntil:1110000,world:{...snapshot.world,revision:3,action:null}});p.render(client.snapshot,client.now(),'night');const restored=p.lastMotion===1100;
    p.dispose();return {heldAction,heldExpired,restored};
  });for(const [name,pass]of Object.entries(clocks))check(name,pass);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Page.setWebLifecycleState',{state:'frozen'});await page.waitForTimeout(300);
  await cdp.send('Page.setWebLifecycleState',{state:'active'});await page.waitForTimeout(500);
  check('Tab suspension returns to a complete frame',await page.locator('#painting').evaluate(c=>c.classList.contains('ready')&&c.style.visibility==='visible'));
  await page.close();
  await writeFile('docs/sky-validation/display-results.json',JSON.stringify({results,errors},null,2)+'\n');
  if(results.some(x=>!x.pass)||errors.length)process.exitCode=1;
}finally{await browser.close();}
