import {randomUUID} from 'node:crypto';
import {calendar} from '../shared/world.js';
import {cursorOf,sameIdentity,validInterval} from '../shared/field-notes.js';

const types=['world.opened','nest.material-delivered','bird.habit-noticed','bird.roof-noticed','cottage.light'];
const payloadOf=event=>{
  if(typeof event?.payload!=='string'||event.payload.length>8192)return null;
  try{return JSON.parse(event.payload);}catch{return null;}
};
export function initializeNotes(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS notes_by_type ON events(noteVisible,type,seq);`);
  db.prepare('INSERT OR IGNORE INTO metadata VALUES (?,?)').run('notes-history',randomUUID());
  return db.prepare('SELECT value FROM metadata WHERE key=?').get('notes-history').value;
}
export function notesHistory(id,state,head) {
  return {id,worldId:state.id,sceneId:'lakeside-cottage',epoch:state.epoch,head:cursorOf(head)};
}
export function summarizeNotes(db,history,interval) {
  if(!validInterval(interval))throw Object.assign(new Error('Invalid notes interval'),{code:'INVALID_NOTES'});
  const result={...interval,coverage:'complete',facts:[]};
  const anchor=db.prepare('SELECT id FROM events WHERE seq=? AND noteVisible=1');
  const anchored=c=>c.seq===0 || anchor.get(c.seq)?.id===c.id;
  if(!sameIdentity(history,interval.identity)||!anchored(interval.after)||!anchored(interval.through)||interval.through.seq>history.head.seq){
    return {...result,coverage:'reset'};
  }
  const {after,through}=interval;
  // A constant set of type/range seeks; event rows never leave the server en masse.
  const latest=db.prepare('SELECT * FROM events INDEXED BY notes_by_type WHERE noteVisible=1 AND type=? AND seq>? AND seq<=? ORDER BY seq DESC LIMIT 1');
  const byId=db.prepare('SELECT * FROM events WHERE id=?');
  const candidates=[];
  const add=(kind,event,supporting=[])=>candidates.push({kind,at:event.at,event:cursorOf(event),supporting:supporting.map(cursorOf)});
  const inInterval=e=>e?.noteVisible===1 && e.seq>after.seq && e.seq<=through.seq && Number.isSafeInteger(e.at);
  const nest=latest.get('nest.material-delivered',after.seq,through.seq);
  const finished=byId.get('delivery-12');
  if(inInterval(finished)&&finished.type==='nest.material-delivered')add('nest-completed',finished);
  else if(nest){
    if(/^delivery-([4-9]|1[01])$/.test(nest.id)&&Number.isSafeInteger(nest.at))add('nest-progress',nest);
    else result.coverage='partial';
  }
  for(const type of ['bird.habit-noticed','bird.roof-noticed']){
    const event=latest.get(type,after.seq,through.seq);if(!event)continue;
    const p=payloadOf(event),habit=type==='bird.habit-noticed';
    let valid=inInterval(event)&&p?.birdId==='oak-bird-01'&&p.kind==='flight'&&p.rulesVersion===1&&p.end===event.at&&
      p.to===(habit?'oak-perch':'roof-perch')&&typeof p.actionId==='string'&&p.actionId.length>0&&event.id===`${p.actionId}:${habit?'habit-noticed':'roof-noticed'}`;
    const proofs=[];
    if(habit){
      valid=valid&&Array.isArray(p?.returns)&&p.returns.length===3&&p.returns.every(r=>typeof r?.id==='string'&&Number.isSafeInteger(r.day))&&new Set(p.returns.map(r=>r.day)).size===3;
      if(valid)for(const r of p.returns){
        const e=typeof r?.id==='string'?byId.get(r.id):null,q=payloadOf(e);
        if(!e||e.type!=='bird.action-completed'||e.seq>event.seq||q?.birdId!==p.birdId||q.kind!=='flight'||q.to!=='oak-perch'||
          typeof q.actionId!=='string'||!q.actionId||e.id!==`${q.actionId}:action-completed`||
          !['oak-shelter','roof-perch'].includes(q.from)||q.end!==e.at||calendar(history.epoch,e.at).day!==r.day){valid=false;break;}
        proofs.push(e);
      }
      valid=valid&&proofs.some(e=>e.id===`${p.actionId}:action-completed`&&e.at===event.at);
    }
    if(valid)add(habit?'bird-habit':'bird-roof',event,proofs);else result.coverage='partial';
  }
  const cottage=latest.get('cottage.light',after.seq,through.seq);
  if(cottage){
    const p=payloadOf(cottage);
    if(inInterval(cottage)&&p?.room==='main'&&p.target===true&&p.end===cottage.at&&p.action===cottage.id)add('cottage-light',cottage);
    else result.coverage='partial';
  }
  // Unknown visible event types must not turn into a claim that nothing changed.
  const unknown=db.prepare(`SELECT seq FROM events WHERE noteVisible=1 AND seq>? AND seq<=? AND type NOT IN (${types.map(()=>'?').join(',')}) LIMIT 1`)
    .get(after.seq,through.seq,...types);
  if(unknown)result.coverage='partial';
  const priority=['nest-completed','bird-habit','bird-roof','nest-progress','cottage-light'];
  result.facts=candidates.sort((a,b)=>priority.indexOf(a.kind)-priority.indexOf(b.kind)).slice(0,2).sort((a,b)=>a.at-b.at||a.event.seq-b.event.seq);
  return result;
}
