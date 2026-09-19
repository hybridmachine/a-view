import { DatabaseSync } from 'node:sqlite';
import { ACTION_DURATION, SCENES, calendar, nextForage, weather } from '../shared/world.js';

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
        const state = { id: 'stillwater', version: 1, epoch: now, updatedAt: now, nest: { id: 'oak-nest-01', materials: 3, stage: 'building' }, action: { id: 'delivery-4', start, end: start + ACTION_DURATION }, revision: 1 };
        this.db.prepare('INSERT INTO world VALUES (?,?)').run('stillwater', JSON.stringify(state));
        this.db.prepare('INSERT INTO events(id,at,type,text) VALUES (?,?,?,?)').run('world-opened', now, 'world.opened', 'Our first view of Stillwater. A small nest is already taking shape in the old oak.');
      }
      this.db.exec('COMMIT');
    } catch(error) { this.db.exec('ROLLBACK'); throw error; }
  }
  advance(now = Date.now()) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const state = JSON.parse(this.db.prepare('SELECT state FROM world WHERE id=?').get('stillwater').state);
      if (state.version !== 1) throw new Error('Unsupported world version');
      let changed = false;
      while (state.action && now >= state.action.end) {
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
      if (changed) this.db.prepare('UPDATE world SET state=? WHERE id=?').run(JSON.stringify(state), 'stillwater');
      this.db.exec('COMMIT');
      return state;
    } catch(error) { this.db.exec('ROLLBACK'); throw error; }
  }
  snapshot(now = Date.now()) {
    const state = this.advance(now);
    return { serverTime: now, validUntil: now + 30_000, world: state, scenes: SCENES, calendar: calendar(state.epoch, now), weather: weather(state.epoch, now), events: this.db.prepare('SELECT * FROM events ORDER BY seq DESC LIMIT 20').all() };
  }
  close() { this.db.close(); }
}
