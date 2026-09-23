import {calendar,clockLabel} from '../shared/world.js';
import {recapText,sameIdentity,sameInterval,validHistory,validSummary} from '../shared/field-notes.js';
import {VisitMemory,MEMORY_KEY,SESSION_KEY} from './visit-memory.js';

export async function fetchNotes(interval,signal) {
  const response=await fetch(`/api/notes?${new URLSearchParams({interval:JSON.stringify(interval)})}`,{
    cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(10_000)]),
  });
  if(!response.ok)throw new Error('Notes unavailable');
  const value=await response.json();
  if(!validSummary(value,interval))throw new Error('Invalid notes response');
  return value;
}

// Owns only the notes panel. The caller supplies the snapshot actually displayed.
export class FieldNotes {
  constructor({root=document,memory,request=fetchNotes}={}) {
    this.root=root;this.request=request;
    if(!memory){
      let local,session;try{local=localStorage;session=sessionStorage;}catch{}
      try{if(performance.getEntriesByType('navigation')[0]?.type==='navigate')session?.removeItem(SESSION_KEY);}catch{}
      memory=new VisitMemory({local,session});
    }
    this.memory=memory;this.serial=0;this.summary=null;this.error=false;this.forgot=false;this.resetNotice=false;this.readHistory=null;
    this.$=selector=>root.querySelector(selector);
    this.$('#forget-visits').onclick=()=>{
      this.cancel();this.memory.forget();this.summary=null;this.error=false;this.forgot=true;
      this.render();
    };
    this.$('#retry-notes').onclick=()=>{this.error=false;this.render();this.load();};
    this.$('#notes-dialog').addEventListener('close',()=>{this.cancel();this.readHistory=null;});
  }
  cancel() {this.serial++;this.pending?.abort();this.pending=null;}
  storageChanged(event) {
    if(event.key!==MEMORY_KEY&&event.key!==null)return;
    this.memory.storageChanged(event.newValue);
    if(event.newValue===null){this.cancel();this.summary=null;this.error=false;}
    this.render();
  }
  update(snapshot,{live=false,valid=false,study=false,paused=false,visible=true}={}) {
    const mode=`${study}:${paused}:${visible}:${valid}`;
    if(mode!==this.mode){this.cancel();this.mode=mode;}
    const changed=this.snapshot!==snapshot;
    this.snapshot=snapshot;this.study=study;this.paused=paused;this.visible=visible;this.valid=valid;
    const generation=this.memory.generation;
    if(live&&valid&&visible&&(snapshot!==this.observedSnapshot||!this.memory.visit)){
      this.memory.observe(snapshot);this.observedSnapshot=snapshot;
    }
    if(generation!==this.memory.generation){this.cancel();this.summary=null;this.error=false;this.forgot=false;this.resetNotice=false;}
    if(changed||mode!==this.renderedMode||generation!==this.memory.generation){
      this.renderedMode=mode;this.render();
    }
    if(this.$('#notes-dialog').open&&visible){this.captureReadHistory();this.load();this.acknowledge();}
  }
  captureReadHistory() {
    // Hold the history presented on opening (or its first loaded snapshot).
    // A later stream update must not extend what a pending recap acknowledges.
    if(!this.readHistory&&validHistory(this.snapshot?.notes))this.readHistory=structuredClone(this.snapshot.notes);
  }
  open() {this.readHistory=null;this.captureReadHistory();this.render();this.load();this.acknowledge();}
  async load() {
    const interval=this.memory.interval;
    if(!this.$('#notes-dialog').open||!this.visible||!interval||!validHistory(this.snapshot?.notes)||
      !sameIdentity(this.snapshot.notes,interval.identity)||this.pending||this.error||sameInterval(this.summary,interval))return;
    const serial=++this.serial,controller=new AbortController();this.pending=controller;this.render();
    try{
      const value=await this.request(interval,controller.signal);
      if(serial!==this.serial||!sameInterval(interval,this.memory.interval))return;
      if(!validSummary(value,interval))throw new Error('Invalid notes response');
      if(value.coverage==='reset'){
        // Keep reset handling local. A paused/study snapshot must never become an observation.
        this.memory.forget();this.summary=null;this.forgot=false;
        this.resetNotice=true;
      }else this.summary=value;
      this.error=false;
    }catch(error){if(serial===this.serial&&error.name!=='AbortError')this.error=true;}
    finally{if(serial===this.serial){this.pending=null;this.render();this.acknowledge();}}
  }
  acknowledge() {
    if(!this.visible||!this.$('#notes-dialog').open||!this.snapshot)return;
    // A failed/pending recap cannot consume unread history.
    if(this.memory.interval&&(!sameInterval(this.summary,this.memory.interval)||this.summary.coverage!=='complete'))return;
    if(this.pending||this.error)return;
    this.memory.read(this.readHistory);this.dot();
  }
  dot() {this.$('#note-dot').hidden=!this.memory.unread(this.snapshot?.notes);}
  render() {
    if(!this.snapshot)return;
    const history=validHistory(this.snapshot.notes),interval=this.memory.interval;
    let text;
    if(!history)text='Visit history is unavailable. Recent notes are below.';
    else if(this.summary&&sameInterval(this.summary,interval))text=recapText(this.summary);
    else if(this.error)text='Earlier field notes could not be loaded.';
    else if(interval)text='Looking back through the field notes…';
    else if(this.resetNotice)text='The earlier visit could not be matched to this history. A new visit will be remembered here.';
    else if(this.forgot)text='Visit memory has been cleared. Your next live view will be remembered here.';
    else text='This browser will remember your visit. Small changes will be gathered here when you return.';
    this.$('#recap-heading').textContent=interval?'Since you were here':'A place to return to';
    this.$('#recap-text').textContent=text;
    this.$('#retry-notes').hidden=!this.error;
    this.$('#notes-mode').textContent=this.study?'Shared-world history · This light study is private.':this.paused?'Notes held with your paused view.':!this.valid?'Showing the last available history.':'';
    this.$('#notes-mode').hidden=!this.$('#notes-mode').textContent;
    this.$('#visit-storage').textContent=this.memory.available?'Visit memory stays in this browser.':'Visits cannot be remembered on this browser. These notes are available for this visit.';
    const key=`${this.snapshot.notes?.id}:${this.snapshot.events?.[0]?.seq??0}:${this.snapshot.world.epoch}`;
    if(key!==this.listKey){
      this.listKey=key;const list=this.$('#event-list');list.replaceChildren();
      for(const event of this.snapshot.events??[]){
        const li=this.root.createElement('li'),time=this.root.createElement('time'),p=this.root.createElement('p');
        const c=calendar(this.snapshot.world.epoch,event.at);
        time.textContent=`YEAR ${c.year} · DAY ${c.dayOfYear+1} · ${clockLabel(c.hour)}`;
        time.dateTime=new Date(event.at).toISOString();p.textContent=event.text;li.append(time,p);list.append(li);
      }
    }
    this.dot();
  }
}
