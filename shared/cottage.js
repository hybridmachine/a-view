import {calendar, clamp, hash, smooth, weather} from './world.js';
import {integratedWind} from './wind.js';

export const COTTAGE_RULES=1, DECISION_MS=30_000, SMOKE_LIFETIME=64_000;
const residentId='lakeside-resident-01';

export function createCottageState(epoch,at){
  const dark=calendar(epoch,at).light<.3;
  return {id:'lakeside-home',rulesVersion:COTTAGE_RULES,introducedAt:at,residentId,
    residentLocation:'main-room',rooms:{main:dark,second:dark},casement:0,
    hearth:{on:false,since:at,lastBurn:null},pending:null,nextDecisionAt:at+DECISION_MS,
    routineCounter:0,lastCasementAt:at,lastLightAt:{main:at,second:at},lastHearthAt:at,lastNoteDay:null};
}

export function validCottageState(state){
  if(!state||!Number.isFinite(state.introducedAt))return false;
  const validTime=time=>Number.isFinite(time)&&time>=state.introducedAt;
  const action=state.pending,burn=state.hearth?.lastBurn;
  return state.id==='lakeside-home' && state.rulesVersion===COTTAGE_RULES && state.residentId===residentId &&
    ['main-room','second-room','moving-between-rooms'].includes(state.residentLocation) &&
    validTime(state.nextDecisionAt) && state.nextDecisionAt>state.introducedAt &&
    (state.nextDecisionAt-state.introducedAt)%DECISION_MS===0 &&
    Number.isSafeInteger(state.routineCounter) && state.routineCounter>=0 &&
    ['main','second'].every(key=>typeof state.rooms?.[key]==='boolean'&&validTime(state.lastLightAt?.[key])) &&
    (state.casement===0||state.casement===1) && typeof state.hearth?.on==='boolean' &&
    validTime(state.lastCasementAt) && validTime(state.lastHearthAt) && validTime(state.hearth.since) &&
    (burn===null||(validTime(burn?.start)&&validTime(burn?.end)&&burn.end>burn.start)) &&
    (state.lastNoteDay===null||Number.isSafeInteger(state.lastNoteDay)) &&
    (action===null||(typeof action?.id==='string'&&action.id.length>0&&action.actor===residentId&&
      ['light','casement','hearth'].includes(action.kind)&&['main','second'].includes(action.room)&&
      (action.from===0||action.from===1)&&
      (action.kind==='casement'?(action.target===0||action.target===1):typeof action.target==='boolean')&&
      validTime(action.start)&&validTime(action.motionStart)&&validTime(action.end)&&
      action.motionStart>=action.start&&action.motionStart<action.end&&action.end>action.start));
}

export function cottageBoundary(state){return Math.min(state.nextDecisionAt,state.pending?.end??Infinity);}

export function cottageIntent(state,epoch,at,conditions=null){
  const c=conditions?.calendar??calendar(epoch,at),w=conditions?.weather??weather(epoch,at);
  const variation=hash(c.day+1901)*.5-.25;
  const desiredMain=c.hour>=c.sunset-.3+variation&&c.hour<22.15+variation;
  const desiredSecond=c.hour>=Math.max(20,c.sunset+.45)+variation&&c.hour<23.3+variation;
  const safe=w.rain<.03&&w.wind<.35&&c.light>.65&&c.hour>Math.max(10,c.sunrise+1)&&c.hour<Math.min(17,c.sunset-1);
  const close=w.rain>.12||w.wind>.44||c.hour>=Math.min(17.5,c.sunset-.6)||c.light<.4;
  // Closing for weather has priority over a dwell or an interior light task.
  if(state.casement&&close)return {kind:'casement',target:0,room:'main'};
  for(const [room,target]of [['main',desiredMain],['second',desiredSecond]]){
    if(state.rooms[room]!==target&&at-state.lastLightAt[room]>=180_000)return {kind:'light',target,room};
  }
  if(!state.casement&&safe&&at-state.lastCasementAt>=180_000)return {kind:'casement',target:1,room:'main'};
  const fire=(c.hour>c.sunrise+.15&&c.hour<c.sunrise+1.3)||(c.hour>Math.max(16,c.sunset-1)&&c.hour<21.5);
  if(state.hearth.on!==fire&&at-state.lastHearthAt>=300_000)return {kind:'hearth',target:fire,room:'main'};
  return null;
}

// Called only on the introduction-aligned decision grid, never on browser arrival.
export function decideCottage(state,epoch,at){
  if(at!==state.nextDecisionAt)throw new Error('Off-grid cottage decision');
  let result={...state,nextDecisionAt:at+DECISION_MS};
  if(state.hearth.lastBurn&&at-state.hearth.lastBurn.end>SMOKE_LIFETIME)result.hearth={...state.hearth,lastBurn:null};
  if(state.pending)return result;
  const intent=cottageIntent(state,epoch,at);
  if(!intent)return result;
  const counter=state.routineCounter+1,duration=8000+Math.floor(hash(counter+781)*12000);
  const from=intent.kind==='light'?+state.rooms[intent.room]:intent.kind==='casement'?state.casement:+state.hearth.on;
  const end=at+duration;
  return {...result,routineCounter:counter,residentLocation:'moving-between-rooms',
    pending:{id:`cottage-v1-${state.residentId}-${counter}`,actor:state.residentId,...intent,from,start:at,
      motionStart:end-(intent.kind==='casement'?4000:1000),end}};
}

export function completeCottage(state,epoch,at){
  const action=state.pending;
  if(!action||at!==action.end)throw new Error('Invalid cottage completion');
  const result={...state,pending:null,residentLocation:`${action.room}-room`};
  if(action.kind==='light'){
    result.rooms={...state.rooms,[action.room]:action.target};
    result.lastLightAt={...state.lastLightAt,[action.room]:at};
  }else if(action.kind==='casement'){
    result.casement=action.target;result.lastCasementAt=at;
  }else{
    result.hearth={on:action.target,since:at,lastBurn:action.target?state.hearth.lastBurn:{start:state.hearth.since,end:at}};
    result.lastHearthAt=at;
  }
  const c=calendar(epoch,at);
  const note=action.kind==='light'&&action.target&&action.room==='main'&&state.lastNoteDay!==c.day;
  if(note)result.lastNoteDay=c.day;
  const text=action.kind==='light'?`The ${action.room==='main'?'main':'second'} room light ${action.target?'comes on':'goes out'}.`
    :action.kind==='casement'?`The cottage casement ${action.target?'opens':'closes'}.`
    :`The cottage hearth ${action.target?'is lit':'goes out'}.`;
  return {state:result,event:{id:action.id,at,type:`cottage.${action.kind}`,text,noteVisible:+note,
    payload:{actor:action.actor,action:action.id,room:action.room,target:action.target,start:action.start,end:at}}};
}

export function sampleCottage(state,now,{reducedMotion=false}={}){
  if(!validCottageState(state))return null;
  const pose={main:+state.rooms.main,second:+state.rooms.second,open:state.casement};
  const a=state.pending;
  if(a){
    const t=smooth(a.motionStart,a.end,now),value=a.from+(+a.target-a.from)*t;
    if(a.kind==='light')pose[a.room]=value;
    if(a.kind==='casement'&&!reducedMotion)pose.open=value;
  }
  return pose;
}

export function cottageFixture(name){
  return name==='night'?{main:1,second:.65,open:0}:name==='dusk'?{main:1,second:0,open:0}
    :name==='open'?{main:0,second:0,open:1}:{main:0,second:0,open:0};
}

export function cottageDescription(state){
  if(!validCottageState(state))return '';
  const light=state.rooms.main&&state.rooms.second?'Both cottage rooms are lit.':state.rooms.main?'A light is on in the main room.':state.rooms.second?'A light is on in the second room.':'The cottage windows are dark.';
  return `${light}${state.casement?' One casement stands open.':''}`;
}

export function smokePuffs(state,epoch,now){
  if(!validCottageState(state))return [];
  const {hearth}=state,latest=Math.floor(now/4000)*4000,puffs=[];
  for(let i=0;i<16;i++){
    const emitted=latest-i*4000,age=(now-emitted)/SMOKE_LIFETIME;
    const burning=(hearth.on&&emitted>=hearth.since)||(hearth.lastBurn&&emitted>=hearth.lastBurn.start&&emitted<hearth.lastBurn.end);
    if(!burning||age<0||age>=1)continue;
    const drift=integratedWind((now-epoch)/1000)-integratedWind((emitted-epoch)/1000);
    puffs.push({x:drift*.8+Math.sin(age*5)*2,y:-age*70,r:4+age*12,alpha:Math.sin(Math.PI*clamp(age))*.09});
  }
  return puffs;
}
