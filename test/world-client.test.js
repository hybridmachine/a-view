import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldClient } from '../public/world-client.js';
import { sceneText } from '../public/scene-description.js';
import { WorldStore } from '../src/store.js';
import { birdPose } from '../shared/world.js';

const epoch = 1_800_000_000_000;
const snapshot = (time, revision = 1, action = null) => ({
  serverTime: time, validUntil: time + 30_000,
  world: { id: 'stillwater', epoch, revision, action },
});
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('older timestamps, duplicate messages, and regressed revisions cannot replace the present', () => {
  let elapsed = 0, accepted = 0;
  const client = new WorldClient({ clock: () => elapsed, onSnapshot: () => accepted++ });
  const current = snapshot(epoch + 1000, 3);
  client.accept(current);
  elapsed = 1000;
  const before = client.now();
  assert.equal(client.accept(snapshot(epoch, 3)), false);
  assert.equal(client.accept(current), false);
  assert.equal(client.accept(snapshot(epoch + 1500, 2)), false);
  assert.equal(client.snapshot, current);
  assert.equal(client.now(), before);
  assert.equal(accepted, 1);
});

test('increased response latency cannot move an already rendered clock backward', () => {
  let elapsed = 0;
  const client = new WorldClient({ clock: () => elapsed });
  client.accept(snapshot(epoch));
  elapsed = 2000;
  assert.equal(client.now(), epoch + 2000);
  assert.equal(client.accept(snapshot(epoch + 1500)), true);
  assert.equal(client.now(), epoch + 2000);
  elapsed = 2400;
  assert.equal(client.now(), epoch + 2000);
  elapsed = 2600;
  assert.equal(client.now(), epoch + 2100);
});

test('an HTTP refresh arriving after a newer streamed message cannot undo a delivery', async () => {
  let elapsed = 0;
  const response = deferred();
  const client = new WorldClient({ clock: () => elapsed, request: () => response.promise });
  client.accept(snapshot(epoch, 1));
  const refresh = client.refresh();
  elapsed = 2000;
  const committed = snapshot(epoch + 2000, 2);
  client.accept(committed);
  response.resolve(snapshot(epoch + 1000, 1));
  assert.equal(await refresh, false);
  assert.equal(client.snapshot, committed);
  assert.equal(client.now(), epoch + 2000);
});

test('an expired snapshot triggers recovery even while the stream is still marked live', async () => {
  let elapsed = 0, requests = 0;
  const client = new WorldClient({ clock: () => elapsed, request: async () => { requests++; return snapshot(epoch + elapsed); } });
  client.accept(snapshot(epoch));
  elapsed = 29_999;
  assert.equal(await client.recover(false), false);
  elapsed = 30_001;
  assert.equal(client.now(), epoch + 30_000);
  assert.equal(client.isExpired(), true);
  assert.equal(await client.recover(false), true);
  assert.equal(requests, 1);
  assert.equal(client.isExpired(), false);
  assert.equal(client.now(), epoch + elapsed);
});

test('reconnect and visibility refreshes share one request, and failed retries are throttled', async () => {
  let elapsed = 0, requests = 0;
  const response = deferred();
  const client = new WorldClient({ clock: () => elapsed, request: () => { requests++; return response.promise; } });
  const first = client.refresh(), second = client.refresh();
  assert.equal(first, second);
  elapsed = 10_000;
  assert.equal(client.recover(true), first);
  await Promise.resolve();
  assert.equal(requests, 1);
  response.reject(new Error('Request timed out'));
  await assert.rejects(first, /timed out/);
  client.request = async () => { requests++; throw new Error('Offline'); };
  await assert.rejects(client.recover(true), /Offline/);
  elapsed = 14_999;
  assert.equal(await client.recover(true), false);
  assert.equal(requests, 2);
  client.request = async () => { requests++; return snapshot(epoch + elapsed); };
  elapsed = 15_000;
  assert.equal(await client.recover(true), true);
  assert.equal(requests, 3);
});

test('the bird cannot finish a delivery until the same snapshot contains its consequences', async () => {
  let elapsed = 0;
  const store = new WorldStore(':memory:', epoch);
  try {
    const client = new WorldClient({ clock: () => elapsed, request: async () => store.snapshot(epoch + elapsed) });
    client.accept(store.snapshot(epoch));
    const action = client.snapshot.world.action;
    elapsed = action.end - epoch + 1;
    assert.equal(client.isExpired(), false, 'the transport lease has not yet expired');
    assert.equal(client.needsRefresh(), true, 'the pending action boundary requires fresh state');
    assert.equal(client.now(), action.end - 1);
    assert.equal(birdPose(action, client.now()).carrying, true);
    assert.equal(client.snapshot.world.nest.materials, 3);
    assert.equal(await client.recover(false), true);
    assert.equal(client.snapshot.world.nest.materials, 4);
    assert.equal(birdPose(client.snapshot.world.action, client.now()).carrying, false);
    assert.ok(client.now() >= action.end);
  } finally { store.close(); }
});

test('precise time remains readable without a live announcement on every clock update', () => {
  const store = new WorldStore(':memory:', epoch);
  try {
    const data = store.snapshot(epoch);
    const first = sceneText(data, epoch), later = sceneText(data, epoch + 20_000);
    assert.notEqual(later.description, first.description);
    assert.equal(later.announcement, first.announcement);
    const committed = store.snapshot(data.world.action.end);
    const delivered = sceneText(committed, committed.serverTime);
    assert.notEqual(delivered.announcement, first.announcement);
    assert.match(delivered.announcement, /4 strands gathered/);
    const night = sceneText(committed, committed.serverTime, { study: 'night' });
    assert.match(night.announcement, /Night/);
    assert.doesNotMatch(night.announcement, /\d\d:\d\d/);
  } finally { store.close(); }
});
