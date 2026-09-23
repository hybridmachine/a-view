import {identityOf,sameCursor,sameIdentity,validCursor,validHistory,validIdentity} from '../shared/field-notes.js';

export const MEMORY_KEY='a-view:notes:lakeside-cottage';
export const SESSION_KEY=`${MEMORY_KEY}:visit`;
export const VISIT_GAP_MS=30*60_000;
const WRITE_GAP_MS=10_000;
const validObservation=v=>!!v&&validCursor(v.cursor)&&Number.isSafeInteger(v.at);
const validRecord=v=>v?.version===1&&validIdentity(v.identity)&&validObservation(v.observed)&&v.observed.at>=v.identity.epoch&&validCursor(v.read)&&
  v.read.seq<=v.observed.cursor.seq&&(v.read.seq!==v.observed.cursor.seq||sameCursor(v.read,v.observed.cursor));
const ordered=(a,b)=>a.at<=b.at&&a.cursor.seq<=b.cursor.seq&&(a.cursor.seq!==b.cursor.seq||sameCursor(a.cursor,b.cursor));
const validVisit=v=>v?.version===1&&validIdentity(v.identity)&&(v.baseline===null||validObservation(v.baseline))&&
  validObservation(v.end)&&validObservation(v.last)&&v.end.at>=v.identity.epoch&&
  (!v.baseline||v.baseline.at>=v.identity.epoch&&ordered(v.baseline,v.end))&&ordered(v.end,v.last);
const sameRecord=(a,b)=>sameIdentity(a.identity,b.identity)&&a.observed.at===b.observed.at&&sameCursor(a.observed.cursor,b.observed.cursor)&&sameCursor(a.read,b.read);
const clone=value=>structuredClone(value);
const later=(a,b)=>!a?b:!b?a:b.at>a.at&&b.cursor.seq>=a.cursor.seq?b:a;
const greater=(a,b)=>b.seq>a.seq?b:a;

// Storage is injected so privacy modes and competing tabs use the same tested path.
export class VisitMemory {
  constructor({local,session,clock=()=>performance.now()}={}) {
    this.local=local;this.session=session;this.clock=clock;this.available=!!local&&!!session;
    this.record=this.load(local,MEMORY_KEY,validRecord);
    this.visit=this.load(session,SESSION_KEY,validVisit);
    this.lastWrite=-Infinity;this.dirty=false;this.generation=0;this.replacesIdentity=null;
  }
  load(storage,key,validate) {
    try{const raw=storage?.getItem(key);if(!raw||raw.length>4096)return null;const value=JSON.parse(raw);return validate(value)?value:null;}
    catch{this.available=false;return null;}
  }
  merge(value) {
    if(!validRecord(value)||!this.record||!sameIdentity(value.identity,this.record.identity))return;
    this.record.observed=clone(later(this.record.observed,value.observed));
    this.record.read=clone(greater(this.record.read,value.read));
  }
  observe(snapshot) {
    if(!validHistory(snapshot?.notes)||snapshot.notes.epoch!==snapshot.world.epoch)return false;
    const identity=identityOf(snapshot.notes),observation={cursor:clone(snapshot.notes.head),at:snapshot.serverTime};
    const stored=this.load(this.local,MEMORY_KEY,validRecord);
    this.merge(stored);
    // Another tab may have a slightly newer accepted snapshot. Wait to catch up;
    // that is not a world reset and must not erase its forward progress.
    if(sameIdentity(this.record?.identity,identity)&&this.record.observed.at>observation.at)return false;
    const compatible=sameIdentity(this.record?.identity,identity)&&this.record.observed.at<=observation.at&&
      this.record.observed.cursor.seq<=observation.cursor.seq&&
      (this.record.observed.cursor.seq!==observation.cursor.seq||sameCursor(this.record.observed.cursor,observation.cursor));
    if(!compatible){
      // Only a displayed transition can replace the history this tab previously
      // knew. Timestamps from different worlds do not establish that authority.
      this.replacesIdentity=this.record&&!sameIdentity(this.record.identity,identity)?clone(this.record.identity):null;
      this.record={version:1,identity,observed:clone(observation),read:clone(observation.cursor)};
      this.visit=null;
    }
    if(!this.visit||!sameIdentity(this.visit.identity,identity)||observation.at-this.visit.last.at>=VISIT_GAP_MS||
      this.visit.end.at>observation.at||this.visit.end.cursor.seq>observation.cursor.seq){
      this.visit={version:1,identity,baseline:compatible?clone(this.record.observed):null,end:clone(observation),last:clone(observation)};
      this.generation++;this.lastWrite=-Infinity;
    }
    this.record.observed=clone(later(this.record.observed,observation));
    this.visit.last=clone(later(this.visit.last,observation));
    this.dirty=true;this.flush();return true;
  }
  get interval() {
    return this.visit?.baseline?{identity:clone(this.visit.identity),after:clone(this.visit.baseline.cursor),through:clone(this.visit.end.cursor)}:null;
  }
  unread(history) {
    return validHistory(history)&&sameIdentity(history,this.record?.identity)&&history.head.seq>this.record.read.seq;
  }
  read(history) {
    if(!validHistory(history)||!sameIdentity(history,this.record?.identity)||history.head.seq>this.record.observed.cursor.seq)return;
    if(history.head.seq>this.record.read.seq){this.record.read=clone(history.head);this.dirty=true;this.flush(true);}
  }
  flush(force=false) {
    if(!this.record||!this.visit||!this.dirty||!force&&this.clock()-this.lastWrite<WRITE_GAP_MS)return;
    const stored=this.load(this.local,MEMORY_KEY,validRecord);
    // A tab paused on a replaced world can still read its old notes, but must
    // not overwrite the newer world's memory established by another tab.
    if(stored&&!sameIdentity(stored.identity,this.record.identity)&&!sameIdentity(stored.identity,this.replacesIdentity)){
      this.replacesIdentity=null;
      this.lastWrite=this.clock();this.dirty=false;return;
    }
    this.merge(stored);
    try{
      if(!this.local||!this.session)throw new Error('Storage unavailable');
      this.local.setItem(MEMORY_KEY,JSON.stringify(this.record));
      this.replacesIdentity=null;
      this.session.setItem(SESSION_KEY,JSON.stringify(this.visit));
    }catch{this.available=false;}
    this.lastWrite=this.clock();this.dirty=false;
  }
  storageChanged(raw) {
    if(raw===null){this.forget(false);return;}
    let value;try{if(raw.length>4096)return;value=JSON.parse(raw);}catch{return;}
    if(!validRecord(value))return;
    if(!this.record){this.record=value;return;}
    this.merge(value);
    // Repair a losing concurrent write without changing this tab's visit baseline.
    if(sameIdentity(value.identity,this.record.identity)&&!sameRecord(value,this.record)){
      this.dirty=true;this.flush(true);
    }
  }
  reset(snapshot) {
    this.forget();this.observe(snapshot);
  }
  forget(removeLocal=true) {
    this.record=null;this.visit=null;this.dirty=false;this.generation++;this.lastWrite=-Infinity;this.replacesIdentity=null;
    try{if(removeLocal)this.local?.removeItem(MEMORY_KEY);this.session?.removeItem(SESSION_KEY);}
    catch{this.available=false;}
  }
}
