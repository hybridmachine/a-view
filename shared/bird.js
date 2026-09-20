import {birdPose,calendar,weather,hash,clamp,mix} from './world.js';
import {LAKESIDE_BIRD} from './lakeside-bird.js';

export const BIRD_RULES=1,BIRD_DECISION_MS=30_000;
export const BIRD_ID='oak-bird-01',CALL_LEAD_MS=5000,CALL_DURATION_MS=600;
const {locations,routes}=LAKESIDE_BIRD;
const dayOrNull=value=>value===null||Number.isSafeInteger(value);

export function createBirdState(at,building=true){
  return {id:BIRD_ID,rulesVersion:BIRD_RULES,introducedAt:at,mode:building?'construction':'routine',
    locationId:'nest',direction:-1,settledAt:at,pending:null,nextDecisionAt:at+BIRD_DECISION_MS,routineCounter:0,
    restUntil:at,fairSince:null,roofConsideredDay:null,lastRoofDay:null,nextCallAt:at+300_000,callConsidered:false,
    familiarity:{returns:[],lastDay:null,habitNoted:false,roofNoted:false}};
}

export function validBirdState(state){
  if(!state||state.id!==BIRD_ID||state.rulesVersion!==BIRD_RULES||!Number.isSafeInteger(state.introducedAt))return false;
  const time=value=>Number.isSafeInteger(value)&&value>=state.introducedAt;
  const action=state.pending,facts=state.familiarity;
  if(!['construction','routine'].includes(state.mode)||!Object.hasOwn(locations,state.locationId)||![1,-1].includes(state.direction)||
    !time(state.settledAt)||!time(state.nextDecisionAt)||state.nextDecisionAt<=state.introducedAt||
    (state.nextDecisionAt-state.introducedAt)%BIRD_DECISION_MS!==0||!Number.isSafeInteger(state.routineCounter)||state.routineCounter<0||
    !time(state.restUntil)||!(state.fairSince===null||time(state.fairSince))||!time(state.nextCallAt)||typeof state.callConsidered!=='boolean'||
    !dayOrNull(state.roofConsideredDay)||!dayOrNull(state.lastRoofDay)||!facts||!Array.isArray(facts.returns)||facts.returns.length>3||
    !facts.returns.every(r=>typeof r?.id==='string'&&Number.isSafeInteger(r.day))||new Set(facts.returns.map(r=>r.day)).size!==facts.returns.length||
    !dayOrNull(facts.lastDay)||typeof facts.habitNoted!=='boolean'||typeof facts.roofNoted!=='boolean'||
    (facts.habitNoted&&facts.returns.length!==3))return false;
  if(state.mode==='construction'&&(state.locationId!=='nest'||action!==null))return false;
  if(action===null)return true;
  if(state.mode!=='routine'||typeof action?.id!=='string'||!action.id||action.actor!==BIRD_ID||action.rulesVersion!==BIRD_RULES||
    !time(action.start)||!time(action.end)||action.end<=action.start||action.start<state.settledAt||
    action.from!==state.locationId||!Object.hasOwn(locations,action.to)||!Number.isFinite(action.phaseSeed))return false;
  if(action.kind==='flight'){
    const route=routes[action.routeId];
    return !!route&&action.routeVersion===LAKESIDE_BIRD.version&&route.from===action.from&&route.to===action.to&&action.end-action.start===route.durationMs;
  }
  return action.kind==='call'&&action.from!=='oak-shelter'&&action.from!=='nest'&&action.from===action.to&&
    action.phrase==='oak-phrase-1'&&action.phraseStart===action.start+CALL_LEAD_MS&&action.end===action.phraseStart+CALL_DURATION_MS;
}

export const birdBoundary=state=>state?Math.min(state.nextDecisionAt,state.pending?.end??Infinity):Infinity;

function actionEvent(action,at,type,noteVisible=0,text=''){
  return {id:`${action.id}:${type}`,at,type:`bird.${type}`,text,noteVisible,
    payload:{birdId:BIRD_ID,actionId:action.id,kind:action.kind,from:action.from,to:action.to,
      routeId:action.routeId??null,routeVersion:action.routeVersion??null,phaseSeed:action.phaseSeed,
      phrase:action.phrase??null,phraseStart:action.phraseStart??null,start:action.start,end:action.end,rulesVersion:BIRD_RULES}};
}

export function decideBird(state,epoch,at,{building=false,conditions=null}={}){
  if(at!==state.nextDecisionAt)throw new Error('Off-grid bird decision');
  let next={...state,nextDecisionAt:at+BIRD_DECISION_MS};
  if(building)return {state:next,event:null};
  if(state.mode==='construction')next={...next,mode:'routine'};
  const c=conditions?.calendar??calendar(epoch,at),w=conditions?.weather??weather(epoch,at);
  const fair=w.rain<.03&&w.wind<.35;
  next.fairSince=fair?(state.fairSince??at):null;
  if(state.pending)return {state:next,event:null};
  const variation=hash(c.day+9421),awake=c.hour>=c.sunrise+1/3+variation*2/3&&c.hour<c.sunset-1/3-variation*5/12;
  const shelter=!awake||w.rain>.12||w.wind>.44;
  const canLeave=awake&&fair&&at-next.fairSince>=90_000;
  let to=null,call=false;
  // Introduction always departs the legacy nest through the approved oak link.
  if(state.locationId==='nest')to='oak-perch';
  else if(shelter&&state.locationId!=='oak-shelter')to=state.locationId==='roof-perch'?'oak-perch':'oak-shelter';
  else if(state.locationId==='roof-perch'&&at>=state.restUntil)to='oak-perch';
  else if(state.locationId==='oak-shelter'){
    if(canLeave&&at>=state.restUntil)to='oak-perch';
  }else if(!shelter){
    const roofWindow=c.hour>=c.sunset-2.5&&c.hour<c.sunset-1;
    if(roofWindow&&state.roofConsideredDay!==c.day&&at>=state.restUntil){
      next.roofConsideredDay=c.day;
      if(canLeave&&hash(c.day+613)<1/3)to='roof-perch';
    }
    if(!to&&canLeave&&!state.callConsidered&&at>=state.nextCallAt&&at-state.settledAt>=45_000){
      next.callConsidered=true;
      call=hash(state.routineCounter+253)<.65;
    }
    if(!to&&!call&&at>=state.restUntil)to='oak-shelter';
  }
  if(!to&&!call)return {state:next,event:null};
  const counter=state.routineCounter+1,routeId=to?`${state.locationId}:${to}`:null,route=routes[routeId];
  if(to&&!route)throw new Error('Bird has no continuous route');
  const action={id:`bird-v1-${BIRD_ID}-${counter}`,actor:BIRD_ID,rulesVersion:BIRD_RULES,
    kind:call?'call':'flight',from:state.locationId,to:to??state.locationId,start:at,
    end:at+(call?CALL_LEAD_MS+CALL_DURATION_MS:route.durationMs),phaseSeed:hash(counter+817)*Math.PI*2,
    ...(call?{phrase:'oak-phrase-1',phraseStart:at+CALL_LEAD_MS}:{routeId,routeVersion:LAKESIDE_BIRD.version})};
  next={...next,routineCounter:counter,pending:action};
  if(call)next.nextCallAt=at+300_000+Math.floor(hash(counter+652)*300_000);
  return {state:next,event:actionEvent(action,at,'action-started')};
}

export function completeBird(state,epoch,at){
  const action=state.pending;
  if(!action||at!==action.end)throw new Error('Invalid bird completion');
  let next={...state,pending:null};
  const events=[actionEvent(action,at,'action-completed')];
  if(action.kind==='call')return {state:next,events};
  const c=calendar(epoch,at),variation=hash(state.routineCounter+430);
  next={...next,locationId:action.to,direction:locations[action.to].point[0]>=locations[action.from].point[0]?1:-1,
    settledAt:at,restUntil:at+Math.floor(action.to==='roof-perch'?20_000+variation*40_000:300_000+variation*420_000)};
  if(action.from==='oak-shelter'||action.from==='nest')next.callConsidered=false;
  let facts={...state.familiarity};
  if(action.to==='roof-perch'){
    next.lastRoofDay=c.day;
    if(!facts.roofNoted){facts.roofNoted=true;events.push(actionEvent(action,at,'roof-noticed',1,'The bird pauses on the cottage roof.'));}
  }
  if(action.to==='oak-perch'&&action.from!=='nest'&&facts.lastDay!==c.day&&facts.returns.length<3){
    facts={...facts,lastDay:c.day,returns:[...facts.returns,{id:events[0].id,day:c.day}]};
    if(facts.returns.length===3&&!facts.habitNoted){
      facts.habitNoted=true;
      const event=actionEvent(action,at,'habit-noticed',1,'The bird has returned to the same branch on three days.');
      event.payload.returns=facts.returns;events.push(event);
    }
  }
  next.familiarity=facts;return {state:next,events};
}

function settledPose(id,direction=locations[id].direction){
  const location=locations[id];
  return {x:location.point[0]/LAKESIDE_BIRD.width,y:location.point[1]/LAKESIDE_BIRD.height,
    scale:location.scale,direction,flying:false,carrying:false,hidden:id==='oak-shelter',wingPhase:0,locationId:id};
}

export function sampleBird(state,legacyAction,now,{reducedMotion=false}={}){
  if(!validBirdState(state))return null;
  if(state.mode==='construction'){
    const pose=birdPose(reducedMotion?null:legacyAction,now);
    return {...pose,legacy:true,scale:pose.y>.5?.85:1,wingPhase:(now-(legacyAction?.start??now))/1000*37,locationId:'nest'};
  }
  const action=state.pending;
  if(!action||action.kind==='call'||reducedMotion||now<action.start)return settledPose(state.locationId,state.direction);
  // The display lease holds before end; exact endpoint sampling is still useful
  // in the art study. Only completeBird settles the authoritative location.
  const route=routes[action.routeId],t=clamp((now-action.start)/(action.end-action.start));
  const u=t*t*(3-2*t),v=1-u,p=route.points;
  const position=d=>v*v*v*p[0][d]+3*v*v*u*p[1][d]+3*v*u*u*p[2][d]+u*u*u*p[3][d];
  const from=locations[action.from],to=locations[action.to];
  return {x:position(0)/LAKESIDE_BIRD.width,y:position(1)/LAKESIDE_BIRD.height,scale:mix(from.scale,to.scale,u),
    direction:to.point[0]>=from.point[0]?1:-1,flying:t>0&&t<1,carrying:false,hidden:false,
    wingPhase:(now-action.start)/1000*37+action.phaseSeed,locationId:state.locationId};
}

export function birdDescription(state,legacyAction,now,{reducedMotion=false,unavailable=false}={}){
  if(!validBirdState(state))return '';
  if(unavailable)return 'The bird’s visual treatment is unavailable.';
  if(state.mode==='construction')return '';
  const names={'nest':'nest','oak-perch':'branch in the oak','oak-shelter':'shelter behind the oak','roof-perch':'cottage roof'};
  if(state.pending?.kind==='flight'&&now>=state.pending.start){
    return reducedMotion?`Reduced motion: the bird is shown at its last resting place while it travels to the ${names[state.pending.to]}.`
      :`The bird is flying to the ${names[state.pending.to]}.`;
  }
  if(state.locationId==='oak-shelter')return 'The bird is resting out of sight behind the oak.';
  return `The bird rests on the ${names[state.locationId]}.`;
}

// Local developer fixtures use the same validated state and route sampler.
export function birdFixture(name,at=0){
  const state=createBirdState(0,false);
  const location={'Oak perch':'oak-perch','Sheltered bird':'oak-shelter','Roof perch':'roof-perch'}[name];
  if(location){state.locationId=location;state.direction=locations[location].direction;return {state,now:at};}
  const pair={'Oak flight':['nest','oak-perch'],'Shelter flight':['oak-perch','oak-shelter'],'Roof flight':['oak-perch','roof-perch']}[name];
  if(!pair)return null;
  const routeId=pair.join(':'),route=routes[routeId];state.locationId=pair[0];
  state.pending={id:'fixture',actor:BIRD_ID,rulesVersion:BIRD_RULES,kind:'flight',from:pair[0],to:pair[1],routeId,routeVersion:1,start:0,end:route.durationMs,phaseSeed:0};
  return {state,now:at};
}
