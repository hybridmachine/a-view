import { DatabaseSync } from 'node:sqlite';
import { ACTION_DURATION, SCENES, calendar, nextForage, weather } from '../shared/world.js';
import { advanceSurface, createSurfaceState, surfaceTime, validSurfaceState, MAX_SURFACE_TICKS, SURFACE_TICK_MS } from '../shared/surface-weather.js';
import {createCottageState, validCottageState, cottageBoundary, decideCottage, completeCottage} from '../shared/cottage.js';

export const MAX_WORLD_BOUNDARIES=120_000;
export const nextCommitAt=state=>Math.min(state.action?.end??Infinity,cottageBoundary(state.cottage));

export class WorldStore {
  constructor(path, now = Date.now()) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS world (id TEXT PRIMARY KEY, state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, at INTEGER NOT NULL, type TEXT NOT NULL, text TEXT NOT NULL);`);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (!this.db.prepare('SELECT id FROM world WHERE id=?').get('stillwater')) {
        const start = now + 12_000;
        const state = { id: 'stillwater', version: 3, epoch: now, updatedAt: now, environment: createSurfaceState(now), cottage:createCottageState(now,now), nest: { id: 'oak-nest-01', materials: 3, stage: 'building' }, action: { id: 'delivery-4', start, end: start + ACTION_DURATION }, revision: 1 };
        this.db.prepare('INSERT INTO world VALUES (?,?)').run('stillwater', JSON.stringify(state));
        this.db.prepare('INSERT INTO events(id,at,type,text) VALUES (?,?,?,?)').run('world-opened', now, 'world.opened', 'Our first view of Stillwater. A small nest is already taking shape in the old oak.');
      }
      const current = JSON.parse(this.db.prepare('SELECT state FROM world WHERE id=?').get('stillwater').state);
      if (current.version === 1) {
        current.version = 2;
        current.environment = createSurfaceState(Math.max(now, current.updatedAt));
        current.revision++;
      }
      if (current.version === 2) {
        current.version=3;current.cottage=createCottageState(current.epoch,Math.max(now,current.updatedAt));current.revision++;
      }
      if (current.version !== 3 || !validSurfaceState(current.environment) || !validCottageState(current.cottage)) {
        throw new Error('Unsupported world version or environment');
      }
      const columns=this.db.prepare('PRAGMA table_info(events)').all().map(column=>column.name);
      if(!columns.includes('payload'))this.db.exec('ALTER TABLE events ADD COLUMN payload TEXT');
      if(!columns.includes('noteVisible'))this.db.exec('ALTER TABLE events ADD COLUMN noteVisible INTEGER NOT NULL DEFAULT 1');
      this.db.exec('CREATE INDEX IF NOT EXISTS visible_notes ON events(noteVisible,seq)');
      this.db.prepare('UPDATE world SET state=? WHERE id=?').run(JSON.stringify(current),'stillwater');
      this.db.exec('COMMIT');
    } catch(error) { this.db.exec('ROLLBACK'); this.db.close(); throw error; }
  }
  advance(now = Date.now()) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const state = JSON.parse(this.db.prepare('SELECT state FROM world WHERE id=?').get('stillwater').state);
      if (state.version !== 3) throw new Error('Unsupported world version');
      let changed = false;
      const target=Math.min(now,surfaceTime(state.environment)+MAX_SURFACE_TICKS*SURFACE_TICK_MS);
      let processed=0,lastBoundary=state.updatedAt;
      const advanceEnvironment=at=>{
        const environment=advanceSurface(state.environment,state.epoch,at);
        if(environment.ticks){state.environment=environment.state;state.revision+=environment.ticks;state.updatedAt=Math.max(state.updatedAt,surfaceTime(state.environment));changed=true;}
      };
      // Canonical tie order: environment, bird delivery, cottage completion,
      // cottage decision. No subsystem runs ahead of another during catch-up.
      while (nextCommitAt(state)<=target && processed<MAX_WORLD_BOUNDARIES) {
        const at=nextCommitAt(state);advanceEnvironment(at);lastBoundary=at;processed++;
        if(state.action&&state.action.end===at){
          const action = state.action;
          state.nest.materials += 1;
          this.db.prepare('INSERT OR IGNORE INTO events(id,at,type,text) VALUES (?,?,?,?)').run(action.id, action.end, 'nest.material-delivered', state.nest.materials === 12 ? 'The last strand is tucked into place. The nest is ready.' : 'A bird returned to the oak with another strand for its nest.');
          if (state.nest.materials >= 12) {
            state.nest.stage = 'built'; state.action = null;
          } else {
            const start = nextForage(state.epoch, action.end);
            state.action = { id: `delivery-${state.nest.materials + 1}`, start, end: start + ACTION_DURATION };
          }
          state.updatedAt = action.end; state.revision += 1; changed = true;
        }
        if(state.cottage.pending?.end===at){
          const result=completeCottage(state.cottage,state.epoch,at);state.cottage=result.state;
          const event=result.event;
          this.db.prepare('INSERT INTO events(id,at,type,text,payload,noteVisible) VALUES (?,?,?,?,?,?)').run(event.id,event.at,event.type,event.text,JSON.stringify(event.payload),event.noteVisible);
          state.revision++;changed=true;
        }
        if(state.cottage.nextDecisionAt===at){state.cottage=decideCottage(state.cottage,state.epoch,at);state.revision++;changed=true;}
        state.updatedAt=Math.max(state.updatedAt,at);
      }
      advanceEnvironment(nextCommitAt(state)<=target?lastBoundary:target);
      if (changed) this.db.prepare('UPDATE world SET state=? WHERE id=?').run(JSON.stringify(state), 'stillwater');
      this.db.exec('COMMIT');
      return state;
    } catch(error) { this.db.exec('ROLLBACK'); throw error; }
  }
  snapshot(now = Date.now()) {
    const state = this.advance(now);
    if (now - surfaceTime(state.environment) >= SURFACE_TICK_MS || nextCommitAt(state)<=now) {
      const error = new Error('World is catching up'); error.code = 'WORLD_CATCHING_UP'; throw error;
    }
    return { serverTime: now, validUntil: now + 30_000, nextCommitAt:nextCommitAt(state), world: state, scenes: SCENES, calendar: calendar(state.epoch, now), weather: weather(state.epoch, now), events: this.db.prepare('SELECT * FROM events WHERE noteVisible=1 ORDER BY seq DESC LIMIT 20').all() };
  }
  close() { this.db.close(); }
}
