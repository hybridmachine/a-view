import { calendar, clockLabel, viewConditions } from '/shared/world.js';
import { Painting } from './painting.js';
import { Ambience } from './sound.js';
import { WorldClient } from './world-client.js';
import { sceneText } from './scene-description.js';
import {cottageDescription} from '/shared/cottage.js';
import {birdDescription} from '/shared/bird.js';

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
const client=new WorldClient({onSnapshot:accept});
let snapshot=null,pausedSnapshot=null,pausedAt=null,study=null,lastRender=0,lastLabels=0,lastEventSeq=null,seenEventSeq=0,connection='connecting',toastTimer,quietTimer;
let followed=false;try{followed=localStorage.getItem('a-view:follow:lakeside-cottage')==='true';}catch{}
const now=()=>pausedAt??client.now();
function toast(text){clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').classList.add('show');toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3500);}
function isDialogOpen(){return [...document.querySelectorAll('dialog')].some(d=>d.open);}
function wake(){document.querySelectorAll('.chrome').forEach(e=>e.classList.remove('quiet'));clearTimeout(quietTimer);quietTimer=setTimeout(()=>{if(!isDialogOpen()&&!study&&!pausedAt&&connection==='live'&&!document.querySelector('.chrome :focus-visible'))document.querySelectorAll('.chrome').forEach(e=>e.classList.add('quiet'));},12_000);}
addEventListener('pointermove',wake,{passive:true});addEventListener('pointerdown',wake,{passive:true});addEventListener('keydown',wake);addEventListener('focusin',wake);
function openPanel(id){$(id).showModal();wake();}
$('#about-button').onclick=()=>openPanel('#about-dialog');
$('#notes-button').onclick=()=>{seenEventSeq=lastEventSeq??0;$('#note-dot').hidden=true;openPanel('#notes-dialog');};
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
$('#sound-button').onclick=async()=>{
  const button=$('#sound-button');button.disabled=true;
  try{const enabled=await audio.toggle();button.setAttribute('aria-pressed',String(enabled));button.setAttribute('aria-label',enabled?'Turn off sound':'Turn on sound');button.dataset.tip=enabled?'Sound on':'Sound off';icon($('#sound-button .icon'),enabled?'sound':'muted');toast(enabled?'A little closer to the water.':'Sound is off.');}
  catch(error){toast(error.message);}
  finally{button.disabled=false;}
};
$('#pause-button').onclick=()=>{
  if(!snapshot)return;
  audio.hold();
  if(pausedAt===null){pausedAt=now();pausedSnapshot=structuredClone(snapshot);}else{pausedAt=null;pausedSnapshot=null;}
  $('#pause-button').setAttribute('aria-pressed',String(pausedAt!==null));$('#pause-button').setAttribute('aria-label',pausedAt!==null?'Resume this view':'Pause this view');$('#pause-button').dataset.tip=pausedAt!==null?'Resume this view':'Pause this view';icon($('#pause-button .icon'),pausedAt!==null?'play':'pause');
  toast(pausedAt!==null?'Your view is paused. The world carries on.':'Back in the present.');updateLabels();wake();
};
if(!document.fullscreenEnabled)$('#fullscreen-button').hidden=true;
$('#fullscreen-button').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Fullscreen is not available in this browser.');}};
document.addEventListener('fullscreenchange',()=>{$('#fullscreen-button').setAttribute('aria-label',document.fullscreenElement?'Leave fullscreen':'Enter fullscreen');});
document.querySelectorAll('[data-light]').forEach(button=>button.onclick=()=>{if(!snapshot)return;audio.hold();study=button.dataset.light;$('#about-dialog').close();document.querySelectorAll('[data-light]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));updateLabels();wake();});
$('#return-live').onclick=()=>{study=null;document.querySelectorAll('[data-light]').forEach(b=>b.setAttribute('aria-pressed','false'));if(pausedAt!==null)$('#pause-button').click();updateLabels();wake();};

function accept(data){
  // WorldClient has checked ordering and anchored the shared clock before this callback.
  snapshot=data;connection='live';
  const eventSeq=data.events?.[0]?.seq??0;
  if(lastEventSeq===null)seenEventSeq=eventSeq;
  if($('#notes-dialog').open)seenEventSeq=eventSeq;
  $('#note-dot').hidden=eventSeq<=seenEventSeq;
  if(eventSeq!==lastEventSeq){updateNotes();lastEventSeq=eventSeq;}
  updateLabels();
}
function refresh(){return client.refresh();}
function updateNotes(){
  if(!snapshot)return;
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
  const stale=client.isExpired();
  $('#live-label').textContent=study?'Light study':pausedAt!==null?'View paused':stale?'Connection lost':connection==='live'?'A shared, living world':'Reconnecting';
  $('#live-dot').classList.toggle('offline',connection!=='live'||stale);$('#return-live').hidden=!study;
  if(stale)wake();
  $('#cottage-detail').textContent=cottageDescription(shownSnapshot.world.cottage)||'A quiet cottage beside the lake.';
  const nest=shownSnapshot.world.nest;
  $('#nest-detail').textContent=nest.stage==='built'?'A completed nest rests in the oak.':`${nest.materials} strands gathered. The work continues.`;
  $('#bird-detail').textContent=study?'The bird is omitted from this private light study.':birdDescription(shownSnapshot.world.bird,shownSnapshot.world.action,now(),{reducedMotion:!painter.motion,unavailable:!painter.birdRenderer.valid});
  const {description,announcement}=sceneText(shownSnapshot,now(),{study,paused:pausedAt!==null,disconnected:stale,staticCottage:!painter.cottageActive,reducedMotion:!painter.motion,birdUnavailable:!painter.birdRenderer.valid});
  if($('#scene-description').textContent!==description)$('#scene-description').textContent=description;
  if($('#scene-announcement').textContent!==announcement)$('#scene-announcement').textContent=announcement;
}
function frame(timestamp){
  requestAnimationFrame(frame);if(document.hidden||timestamp-lastRender<1000/30)return;
  // Retain the fractional interval so 60 Hz timestamp rounding cannot turn the
  // 30 fps cap into a recurring three-refresh (20 fps) schedule.
  lastRender=timestamp-(timestamp-lastRender)%(1000/30);
  if(snapshot){
    const displayedNow=now(),shown=pausedSnapshot??snapshot,result=painter.render(shown,displayedNow,study);
    if(result)audio.update(result.calendar.light,result.weather.rain,{bird:shown.world.bird,now:displayedNow,
      active:pausedAt===null&&!study&&!client.needsRefresh()&&painter.birdActive,
      validUntil:Math.min(shown.validUntil,shown.nextCommitAt??Infinity)});
  }
  if(timestamp-lastLabels>4000){lastLabels=timestamp;updateLabels();}
}
let dragging=false,previousX=0;
$('#world').addEventListener('pointerdown',e=>{dragging=true;previousX=e.clientX;$('#world').setPointerCapture(e.pointerId);});
$('#world').addEventListener('pointermove',e=>{if(dragging){painter.panBy(e.clientX-previousX);previousX=e.clientX;}});
$('#world').addEventListener('pointerup',()=>dragging=false);$('#world').addEventListener('pointercancel',()=>dragging=false);
document.addEventListener('visibilitychange',()=>{audio.visibility().catch(error=>console.warn('Audio visibility update failed',error));if(!document.hidden)refresh().catch(()=>{connection='reconnecting';updateLabels();});});

// Displayed conditions can select the fallback while optional sky assets load.
requestAnimationFrame(frame);
try{await Promise.all([painter.init(),refresh()]);}catch(error){console.error(error);toast('The painting is here. Reconnecting to the world…');}
const stream=new EventSource('/api/stream');
stream.onmessage=event=>{try{client.accept(JSON.parse(event.data));}catch(error){console.error('Invalid world update',error);}};
stream.onerror=()=>{connection='reconnecting';updateLabels();wake();};
setInterval(()=>{if(!document.hidden)client.recover(connection!=='live').catch(()=>{connection='reconnecting';updateLabels();});},1000);
wake();
// A bfcache suspension keeps the renderer; permanent navigation releases it.
addEventListener('pagehide',event=>{if(!event.persisted)painter.dispose();});
