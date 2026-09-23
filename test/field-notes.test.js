import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WorldStore} from '../src/store.js';
import {cursorOf,identityOf,recapText,validSummary} from '../shared/field-notes.js';
import {VisitMemory,MEMORY_KEY,SESSION_KEY,VISIT_GAP_MS} from '../public/visit-memory.js';
import {FieldNotes} from '../public/field-notes.js';
import {WorldClient} from '../public/world-client.js';

const epoch=1_800_000_000_000;
const interval=(start,end)=>({identity:identityOf(end.notes),after:start.notes.head,through:end.notes.head});
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
function snapshots(){const store=new WorldStore(':memory:',epoch);const a=store.snapshot(epoch),b=store.snapshot(epoch+28_000),c=store.snapshot(epoch+86_400_000);store.close();return {a,b,c};}

test('long-absence recap finds milestones outside latest 20 notes and never advances the world',()=>{
  const store=new WorldStore(':memory:',epoch);
  try{
    const first=store.snapshot(epoch),last=store.snapshot(epoch+30*86_400_000),request=interval(first,last);
    assert.equal(last.events.length,20);assert.ok(last.events.every(e=>e.type==='cottage.light'));
    const before=store.db.prepare('SELECT state FROM world').get().state,count=store.db.prepare('SELECT count(*) n FROM events').get().n;
    const result=store.notes(request);
    assert.equal(result.coverage,'complete');assert.equal(validSummary(result,request),true);
    assert.deepEqual(result.facts.map(f=>f.kind),['nest-completed','bird-habit']);
    assert.equal(result.facts[1].supporting.length,3);
    assert.equal(recapText(result),'The nest was finished. The bird returned to the same branch on three days.');
    assert.deepEqual(store.notes(request),result);
    assert.equal(store.db.prepare('SELECT state FROM world').get().state,before);
    assert.equal(store.db.prepare('SELECT count(*) n FROM events').get().n,count);
  }finally{store.close();}
});

test('intervals exclude the start, include the end, allow equal timestamps and hidden sequence gaps',()=>{
  const store=new WorldStore(':memory:',epoch);
  try{
    const first=store.snapshot(epoch),insert=store.db.prepare('INSERT INTO events(id,at,type,text,payload,noteVisible) VALUES (?,?,?,?,?,?)');
    insert.run('delivery-4',epoch,'nest.material-delivered','untrusted display text',null,1);
    insert.run('hidden',epoch,'bird.action-started','',null,0);
    insert.run('light',epoch,'cottage.light','',JSON.stringify({action:'light',room:'main',target:true,end:epoch}),1);
    const last=store.snapshot(epoch),rows=store.db.prepare('SELECT * FROM events ORDER BY seq').all();
    const request=interval(first,last);request.after=cursorOf(rows[1]);
    assert.deepEqual(store.notes(request).facts.map(f=>f.kind),['cottage-light']);
    request.after=request.through;
    assert.equal(recapText(store.notes(request)),'No new field notes since your last visit.');
    request.after=last.notes.head;request.through=first.notes.head;
    assert.throws(()=>store.notes(request),{code:'INVALID_NOTES'});
  }finally{store.close();}
});

test('replacement, missing anchors, truncated restore and forged cursors reset instead of inventing history',()=>{
  const store=new WorldStore(':memory:',epoch),other=new WorldStore(':memory:',epoch);
  try{
    const a=store.snapshot(epoch),b=store.snapshot(epoch+28_000),q=interval(a,b);
    assert.equal(other.notes(q).coverage,'reset');
    assert.equal(store.notes({...q,after:{...q.after,id:'wrong'}}).coverage,'reset');
    assert.equal(store.notes({...q,through:{seq:999999,id:'future'}}).coverage,'reset');
    store.db.prepare('DELETE FROM events WHERE seq=?').run(q.through.seq);
    assert.equal(store.notes(q).coverage,'reset');
  }finally{store.close();other.close();}
});

test('unknown facts, invalid payloads, and missing habit evidence are explicitly partial',()=>{
  const store=new WorldStore(':memory:',epoch);
  try{
    const a=store.snapshot(epoch),b=store.snapshot(epoch+86_400_000),q=interval(a,b);
    store.db.prepare("UPDATE events SET payload='{}' WHERE type='bird.habit-noticed'").run();
    const result=store.notes(q);
    assert.equal(result.coverage,'partial');assert.ok(!result.facts.some(f=>f.kind==='bird-habit'));
    const broken={birdId:'oak-bird-01',kind:'flight',rulesVersion:1,to:'oak-perch',actionId:'broken',returns:[null,{},{}]};
    store.db.prepare("UPDATE events SET id='broken:habit-noticed',payload=json_set(?, '$.end', at) WHERE type='bird.habit-noticed'").run(JSON.stringify(broken));
    assert.doesNotThrow(()=>store.notes(q));
    store.db.prepare("INSERT INTO events(id,at,type,text,noteVisible) VALUES ('unknown',?,'new.future-fact','imagined',1)").run(b.serverTime);
    const c=store.snapshot(b.serverTime);
    const unknown=store.notes(interval(b,c));assert.equal(unknown.coverage,'partial');assert.equal(unknown.facts.length,0);
    assert.equal(recapText(unknown),'Some earlier notes are unavailable.');
  }finally{store.close();}
});

test('notes metadata persists across restart without changing simulation version',()=>{
  const directory=mkdtempSync(join(tmpdir(),'a-view-notes-')),file=join(directory,'world.sqlite');
  try{
    let store=new WorldStore(file,epoch);const a=store.snapshot(epoch);store.close();
    store=new WorldStore(file,epoch+1);const b=store.snapshot(epoch);store.close();
    assert.deepEqual(a,b);assert.equal(b.world.version,4);
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('habit evidence must identify the completion of its own action',()=>{
  const store=new WorldStore(':memory:',epoch);
  try{
    const a=store.snapshot(epoch),b=store.snapshot(epoch+86_400_000),q=interval(a,b);
    const valid=store.notes(q),habit=valid.facts.find(f=>f.kind==='bird-habit');
    assert.ok(habit);assert.equal(valid.coverage,'complete');
    const proof=store.db.prepare('SELECT * FROM events WHERE id=?').get(habit.supporting[0].id);
    const payload=JSON.parse(proof.payload);
    for(const actionId of ['another-action','',null]){
      store.db.prepare('UPDATE events SET payload=? WHERE id=?').run(JSON.stringify({...payload,actionId}),proof.id);
      const result=store.notes(q);
      assert.equal(result.coverage,'partial');assert.ok(!result.facts.some(f=>f.kind==='bird-habit'));
    }
    store.db.prepare('UPDATE events SET payload=? WHERE id=?').run(proof.payload,proof.id);
    assert.deepEqual(store.notes(q),valid);
  }finally{store.close();}
});

test('first visit is quiet; a new tab recalls the previous view and reload freezes its interval',()=>{
  const {a,b,c}=snapshots(),local=storage(),firstSession=storage();let time=0;
  const first=new VisitMemory({local,session:firstSession,clock:()=>time});
  first.observe(a);assert.equal(first.interval,null);assert.equal(first.unread(a.notes),false);
  time+=11_000;first.observe(b);assert.equal(first.unread(b.notes),true);assert.equal(first.interval,null);
  const session=storage(),second=new VisitMemory({local,session,clock:()=>time});
  second.observe(c);const expected=interval(b,c);assert.deepEqual(second.interval,expected);
  assert.equal(second.unread(c.notes),true);
  second.read(c.notes);assert.equal(second.unread(c.notes),false);
  const reloaded=new VisitMemory({local,session,clock:()=>time});reloaded.observe(c);
  assert.deepEqual(reloaded.interval,expected);assert.equal(reloaded.unread(c.notes),false);
});

test('long tab absence starts a visit from its last live observation; writes are coalesced',()=>{
  const {a,b}=snapshots(),local=storage(),session=storage();let time=0,writes=0;
  const set=local.setItem;local.setItem=(...args)=>{writes++;set(...args);};
  const memory=new VisitMemory({local,session,clock:()=>time});memory.observe(a);memory.observe(b);
  assert.equal(writes,1);time=11_000;memory.flush();assert.equal(writes,2);
  const later={...b,serverTime:b.serverTime+VISIT_GAP_MS};memory.observe(later);
  assert.deepEqual(memory.interval,interval(b,later));assert.equal(writes,3);
});

test('competing tab writes converge forward without changing active baselines',()=>{
  const {a,b,c}=snapshots(),local=storage();let time=0;
  const x=new VisitMemory({local,session:storage(),clock:()=>time});x.observe(a);
  const y=new VisitMemory({local,session:storage(),clock:()=>time});y.observe(b);const baseline=y.interval;
  time=12_000;x.observe(c);x.read(c.notes);const newest=local.getItem(MEMORY_KEY);
  y.observe(b);assert.deepEqual(y.interval,baseline);assert.equal(y.record.observed.at,c.serverTime);
  // Deliver a stale storage event after the newer record: it must repair, not regress.
  const stale={...JSON.parse(newest),observed:{cursor:b.notes.head,at:b.serverTime},read:a.notes.head};
  local.setItem(MEMORY_KEY,JSON.stringify(stale));y.storageChanged(JSON.stringify(stale));
  assert.equal(JSON.parse(local.getItem(MEMORY_KEY)).read.seq,c.notes.head.seq);
  assert.deepEqual(y.interval,baseline);
});

test('corrupt/blocked storage degrades quietly and forgetting memory preserves Follow',()=>{
  const {a}=snapshots(),local=storage(),session=storage();
  local.setItem(MEMORY_KEY,'bad json');local.setItem('a-view:follow:lakeside-cottage','true');
  const memory=new VisitMemory({local,session});memory.observe(a);assert.equal(memory.interval,null);
  memory.forget();assert.equal(local.getItem(MEMORY_KEY),null);assert.equal(session.getItem(SESSION_KEY),null);
  assert.equal(local.getItem('a-view:follow:lakeside-cottage'),'true');
  const blocked={getItem(){throw new Error();},setItem(){throw new Error();},removeItem(){throw new Error();}};
  const ephemeral=new VisitMemory({local:blocked,session:blocked});ephemeral.observe(a);
  assert.equal(ephemeral.available,false);assert.ok(ephemeral.visit);ephemeral.forget();
});

test('a paused tab cannot overwrite replacement-world memory with either clock ordering',()=>{
  const {a,b}=snapshots();
  for(const offset of [-2*86_400_000,2*86_400_000]){
    const local=storage();
    const older=new VisitMemory({local,session:storage()});older.observe(a);older.observe(b);older.flush(true);
    const replacement=new WorldStore(':memory:',epoch+offset);
    try{
      const newer=new VisitMemory({local,session:storage()}),snapshot=replacement.snapshot(epoch+offset);
      newer.observe(snapshot);
      assert.equal(JSON.parse(local.getItem(MEMORY_KEY)).identity.id,snapshot.notes.id,'a displayed replacement can take over');
      older.read(b.notes);
      assert.equal(JSON.parse(local.getItem(MEMORY_KEY)).identity.id,snapshot.notes.id,'reading the paused old view cannot take over');
      older.observe({...b,serverTime:b.serverTime+10_000});older.flush(true);
      assert.equal(JSON.parse(local.getItem(MEMORY_KEY)).identity.id,snapshot.notes.id,'another old-history observation cannot take over');
      older.observe(snapshot);older.flush(true);
      assert.equal(older.record.identity.id,snapshot.notes.id,'the old tab can join the replacement history');
    }finally{replacement.close();}
  }
});

test('an observed replacement cannot overwrite a third history that superseded its predecessor',()=>{
  const {a}=snapshots(),local=storage(),tab=new VisitMemory({local,session:storage()});tab.observe(a);
  const second=new WorldStore(':memory:',epoch-100_000),third=new WorldStore(':memory:',epoch-200_000);
  try{
    const incoming=second.snapshot(epoch-100_000),other=new VisitMemory({local,session:storage()}),latest=third.snapshot(epoch-200_000);
    other.observe(latest);tab.observe(incoming);
    assert.equal(JSON.parse(local.getItem(MEMORY_KEY)).identity.id,latest.notes.id);
  }finally{second.close();third.close();}
});

function fakeRoot(){
  const elements=new Map();
  const element=()=>({textContent:'',hidden:false,open:false,children:[],addEventListener(){},replaceChildren(){this.children=[];},append(...v){this.children.push(...v);}});
  return {querySelector(key){if(!elements.has(key))elements.set(key,element());return elements.get(key);},createElement:element};
}
test('panel never observes hidden, paused, study, or invalid frames; pending/late replies never read newer notes',async()=>{
  const {a,b,c}=snapshots(),memory=new VisitMemory({local:storage(),session:storage()}),root=fakeRoot();
  memory.observe(a);memory.flush(true);
  const session=storage(),returning=new VisitMemory({local:memory.local,session});
  let resolve;const panel=new FieldNotes({root,memory:returning,request:()=>new Promise(r=>{resolve=r;})});
  for(const options of [{live:false,study:true},{live:false,paused:true},{live:true,visible:false},{live:true,valid:false}]){
    panel.update(b,{valid:true,...options});assert.equal(returning.visit,null);
  }
  panel.update(b,{live:true,valid:true});assert.deepEqual(returning.interval,interval(a,b));
  root.querySelector('#notes-dialog').open=true;panel.open();
  assert.equal(returning.unread(b.notes),true);
  const old=returning.interval;
  panel.update(b,{paused:true,valid:true});panel.cancel();
  resolve({...old,coverage:'complete',facts:[]});await new Promise(r=>setImmediate(r));
  assert.equal(panel.summary,null);assert.equal(returning.unread(b.notes),true);
  panel.update(c,{live:true,valid:true});panel.cancel();
  assert.equal(returning.unread(c.notes),true);
});

test('client accepts a newer replacement world but rejects malformed notes identity',()=>{
  const one=new WorldStore(':memory:',epoch),two=new WorldStore(':memory:',epoch+100_000);
  try{
    const client=new WorldClient({clock:()=>0}),a=one.snapshot(epoch+28_000),b=two.snapshot(epoch+100_000);
    assert.ok(client.accept(a));assert.ok(client.accept(b));assert.equal(client.snapshot.world.epoch,epoch+100_000);
    assert.equal(client.accept({...b,serverTime:b.serverTime+1,notes:{...b.notes,epoch:0}}),false);
  }finally{one.close();two.close();}
});
