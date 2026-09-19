import { calendar, clockLabel, viewConditions } from '/shared/world.js';
import { Painting } from './painting.js';
import { Ambience } from './sound.js';

const $=selector=>document.querySelector(selector);
const icons={
 bookmark:'<path d="M6 3h12v18l-6-4-6 4Z"/>',
 book:'<path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Z"/><path d="M12 5v15"/>',
 sound:'<path d="m11 4-5 4H3v8h3l5 4Z"/><path d="M15 9c2 2 2 4 0 6m3-9c4 3 4 9 0 12"/>',
 muted:'<path d="m11 4-5 4H3v8h3l5 4Z"/><path d="m16 9 5 6m0-6-5 6"/>',
 pause:'<path d="M8 5v14M16 5v14"/>',play:'<path d="m8 4 12 8-12 8Z"/>',
 expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
 close:'<path d="m6 6 12 12M18 6 6 18"/>',check:'<path d="m4 12 5 5L20 6"/>'
};
function icon(element,name){element.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;}
document.querySelectorAll('[data-icon]').forEach(element=>icon(element,element.dataset.icon));
icon($('#sound-button .icon'),'muted');
const painter=new Painting($('#painting'),$('#life')),audio=new Ambience();
let snapshot=null,pausedSnapshot=null,anchorServer=0,anchorPerformance=performance.now(),pausedAt=null,study=null,lastRender=0,lastLabels=0,lastRevision=0,connection='connecting',toastTimer,quietTimer;
let followed=false;try{followed=localStorage.getItem('a-view:follow:lakeside-cottage')==='true';}catch{}
const now=()=>pausedAt??Math.min(anchorServer+(performance.now()-anchorPerformance),snapshot?.validUntil??Infinity);
function toast(text){clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').classList.add('show');toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3500);}
function isDialogOpen(){return [...document.querySelectorAll('dialog')].some(d=>d.open);}
function wake(){document.querySelectorAll('.chrome').forEach(e=>e.classList.remove('quiet'));clearTimeout(quietTimer);quietTimer=setTimeout(()=>{if(!isDialogOpen()&&!study&&!pausedAt&&connection==='live'&&!document.querySelector('.chrome :focus-visible'))document.querySelectorAll('.chrome').forEach(e=>e.classList.add('quiet'));},12_000);}
addEventListener('pointermove',wake,{passive:true});addEventListener('pointerdown',wake,{passive:true});addEventListener('keydown',wake);addEventListener('focusin',wake);
function openPanel(id){$(id).showModal();wake();}
$('#about-button').onclick=()=>openPanel('#about-dialog');
$('#notes-button').onclick=()=>{$('#note-dot').hidden=true;openPanel('#notes-dialog');};
$('#explore-button').onclick=()=>openPanel('#explore-dialog');
$('#current-place').onclick=()=>$('#explore-dialog').close();
document.querySelectorAll('dialog').forEach(dialog=>{
  dialog.querySelector('.close-panel').onclick=()=>dialog.close();dialog.addEventListener('close',wake);
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
});
function updateFollow(){
  $('#follow-button').setAttribute('aria-pressed',String(followed));$('#follow-button').setAttribute('aria-label',followed?'Unfollow this place':'Follow this place');$('#follow-button').dataset.tip=followed?'Following this place':'Follow this place';
  $('#follow-button .tool-label').textContent=followed?'Following':'Follow';icon($('#follow-button .icon'),followed?'check':'bookmark');
  $('#follow-status').textContent=followed?'Saved among your places on this device.':'Follow a place to keep it close.';
}
$('#follow-button').onclick=()=>{followed=!followed;try{localStorage.setItem('a-view:follow:lakeside-cottage',String(followed));}catch{toast('Following for this visit. Storage is unavailable.');updateFollow();return;}updateFollow();toast(followed?'A place to return to. Saved on this device.':'This place has been unfollowed.');};updateFollow();
$('#sound-button').onclick=async()=>{try{const enabled=await audio.toggle();$('#sound-button').setAttribute('aria-pressed',String(enabled));$('#sound-button').setAttribute('aria-label',enabled?'Turn off sound':'Turn on sound');$('#sound-button').dataset.tip=enabled?'Sound on':'Sound off';icon($('#sound-button .icon'),enabled?'sound':'muted');toast(enabled?'A little closer to the water.':'Sound is off.');}catch(error){toast(error.message);}};
$('#pause-button').onclick=()=>{
  if(!snapshot)return;
  if(pausedAt===null){pausedAt=now();pausedSnapshot=structuredClone(snapshot);}else{pausedAt=null;pausedSnapshot=null;}
  $('#pause-button').setAttribute('aria-pressed',String(pausedAt!==null));$('#pause-button').setAttribute('aria-label',pausedAt!==null?'Resume this view':'Pause this view');$('#pause-button').dataset.tip=pausedAt!==null?'Resume this view':'Pause this view';icon($('#pause-button .icon'),pausedAt!==null?'play':'pause');
  toast(pausedAt!==null?'Your view is paused. The world carries on.':'Back in the present.');updateLabels();wake();
};
if(!document.fullscreenEnabled)$('#fullscreen-button').hidden=true;
$('#fullscreen-button').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Fullscreen is not available in this browser.');}};
document.addEventListener('fullscreenchange',()=>{$('#fullscreen-button').setAttribute('aria-label',document.fullscreenElement?'Leave fullscreen':'Enter fullscreen');});
document.querySelectorAll('[data-light]').forEach(button=>button.onclick=()=>{if(!snapshot)return;study=button.dataset.light;$('#about-dialog').close();document.querySelectorAll('[data-light]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));updateLabels();wake();});
$('#return-live').onclick=()=>{study=null;document.querySelectorAll('[data-light]').forEach(b=>b.setAttribute('aria-pressed','false'));if(pausedAt!==null)$('#pause-button').click();updateLabels();wake();};

function accept(data){
  // Snapshot timestamps, never the visitor's local date, anchor the shared clock.
  snapshot=data;anchorServer=data.serverTime;anchorPerformance=performance.now();connection='live';
  if(lastRevision&&data.world.revision>lastRevision)$('#note-dot').hidden=false;
  if(data.world.revision!==lastRevision){updateNotes();lastRevision=data.world.revision;}
  updateLabels();
}
async function refresh(){const response=await fetch('/api/world',{cache:'no-store'});if(!response.ok)throw new Error('World is unavailable');accept(await response.json());}
function updateNotes(){
  if(!snapshot)return;
  const nest=snapshot.world.nest;$('#nest-detail').textContent=nest.stage==='built'?'A woven shelter, ready for what comes next.':`${nest.materials} strands gathered. The work continues.`;
  const list=$('#event-list');list.replaceChildren();
  for(const event of snapshot.events){
    const li=document.createElement('li'),time=document.createElement('time'),text=document.createElement('p');
    const c=calendar(snapshot.world.epoch,event.at);time.textContent=`YEAR ${c.year} · DAY ${c.dayOfYear+1} · ${clockLabel(c.hour)}`;time.dateTime=new Date(event.at).toISOString();text.textContent=event.text;li.append(time,text);list.appendChild(li);
  }
}
function updateLabels(){
  if(!snapshot)return;
  const shownSnapshot=pausedSnapshot??snapshot;
  const {calendar:c,weather:w}=viewConditions(shownSnapshot.world.epoch,now(),study);
  $('#season').textContent=c.dayOfYear>=120&&c.dayOfYear<172?'Late spring':c.season;
  $('#weather').textContent=study?{dawn:'First light',day:'Afternoon light',dusk:'The last light',night:'Under the night sky',rain:'Passing rain'}[study]:w.name;
  $('#world-time').textContent=clockLabel(c.hour);$('#world-time').setAttribute('aria-label',`World time ${clockLabel(c.hour)}`);
  const stale=anchorServer+(performance.now()-anchorPerformance)>snapshot.validUntil;
  $('#live-label').textContent=study?'Light study':pausedAt!==null?'View paused':stale?'Connection lost':connection==='live'?'A shared, living world':'Reconnecting';
  $('#live-dot').classList.toggle('offline',connection!=='live'||stale);$('#return-live').hidden=!study;
  if(stale)wake();
  const description=`${study?'Private light study. ':''}${c.season}, year ${c.year}, day ${c.dayOfYear+1}. ${c.period}, ${clockLabel(c.hour)}. ${w.name}. ${shownSnapshot.world.nest.stage==='built'?'A completed nest rests in the oak.':'A bird is building a nest in the oak.'}${pausedAt!==null?' This view is paused.':''}`;
  // Avoid announcing an unchanged scene on every streamed snapshot.
  if($('#scene-description').textContent!==description)$('#scene-description').textContent=description;
}
function frame(timestamp){
  requestAnimationFrame(frame);if(document.hidden||timestamp-lastRender<1000/30)return;lastRender=timestamp;
  if(snapshot){const result=painter.render(pausedSnapshot??snapshot,now(),study);if(result)audio.update(result.calendar.light,result.weather.rain);}
  if(timestamp-lastLabels>4000){lastLabels=timestamp;updateLabels();}
}
let dragging=false,previousX=0;
$('#world').addEventListener('pointerdown',e=>{dragging=true;previousX=e.clientX;$('#world').setPointerCapture(e.pointerId);});
$('#world').addEventListener('pointermove',e=>{if(dragging){painter.panBy(e.clientX-previousX);previousX=e.clientX;}});
$('#world').addEventListener('pointerup',()=>dragging=false);$('#world').addEventListener('pointercancel',()=>dragging=false);
document.addEventListener('visibilitychange',()=>{audio.visibility();if(!document.hidden)refresh().catch(()=>{connection='reconnecting';updateLabels();});});

try{await Promise.all([painter.init(),refresh()]);}catch(error){console.error(error);toast('The painting is here. Reconnecting to the world…');}
const stream=new EventSource('/api/stream');
stream.onmessage=event=>{try{accept(JSON.parse(event.data));}catch(error){console.error('Invalid world update',error);}};
stream.onerror=()=>{connection='reconnecting';updateLabels();wake();};
setInterval(()=>{if(connection!=='live'&&!document.hidden)refresh().catch(()=>{});},10_000);
requestAnimationFrame(frame);wake();
