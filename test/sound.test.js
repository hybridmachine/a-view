import test from 'node:test';
import assert from 'node:assert/strict';
import { Ambience } from '../public/sound.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function audioHarness() {
  const timers = new Map();
  let id = 0, hidden = false;
  const gain = {
    value: .09, events: [], targets: 0,
    cancelScheduledValues(time) { this.events = this.events.filter(event => event.time < time); this.value = 0; },
    setValueAtTime(value, time) { this.value = value; this.events.push({ type: 'value', value, time }); },
    setTargetAtTime(value, time) { this.targets++; this.events.push({ type: 'target', value, time }); },
  };
  const node = () => ({ connect() {}, start() {} });
  const context = {
    state: 'suspended', currentTime: 0, sampleRate: 10, destination: {},
    createGain: () => ({ gain, connect() {} }),
    createBuffer: (_channels, length) => ({ getChannelData: () => new Float32Array(length) }),
    createBufferSource: node,
    createBiquadFilter: () => ({ ...node(), frequency: { value: 0 } }),
    async resume() { this.state = 'running'; },
    async suspend() { this.state = 'suspended'; },
  };
  const audio = new Ambience({
    createContext: () => context,
    schedule: callback => { timers.set(++id, callback); return id; },
    cancel: timer => timers.delete(timer),
    isHidden: () => hidden,
  });
  return { audio, context, gain, timers, setHidden: value => { hidden = value; } };
}

test('concurrent enable and disable requests never leak a bird timer', async () => {
  const { audio, context, timers } = audioHarness();
  const resumed = deferred();
  context.resume = async () => { await resumed.promise; context.state = 'running'; };
  const first = audio.toggle(), second = audio.toggle();
  assert.equal(first, second);
  assert.equal(timers.size, 0);
  resumed.resolve();
  assert.equal(await first, true);
  assert.equal(timers.size, 1);
  const stopped = deferred();
  context.suspend = async () => { await stopped.promise; context.state = 'suspended'; };
  const off = audio.toggle();
  assert.equal(audio.toggle(), off);
  stopped.resolve();
  assert.equal(await off, false);
  assert.equal(timers.size, 0);
  assert.equal(await audio.toggle(), true);
  assert.equal(timers.size, 1);
  await audio.toggle();
  assert.equal(timers.size, 0);
});

test('default timer calls retain the browser global receiver', async t => {
  const { context } = audioHarness();
  let active = false;
  t.mock.method(globalThis, 'setInterval', function () {
    assert.equal(this, globalThis);
    active = true;
    return 123;
  });
  t.mock.method(globalThis, 'clearInterval', function (timer) {
    assert.equal(this, globalThis);
    assert.equal(timer, 123);
    active = false;
  });
  const audio = new Ambience({ createContext: () => context, isHidden: () => false });
  await audio.toggle();
  assert.equal(active, true);
  await audio.toggle();
  assert.equal(active, false);
});

test('a rejected resume releases the transition and does not start a timer', async () => {
  const { audio, context, timers } = audioHarness();
  context.resume = async () => { throw new Error('Audio was blocked'); };
  await assert.rejects(audio.toggle(), /blocked/);
  assert.equal(audio.enabled, false);
  assert.equal(timers.size, 0);
  context.resume = async () => { context.state = 'running'; };
  assert.equal(await audio.toggle(), true);
  assert.equal(timers.size, 1);
  await audio.toggle();
});

test('master gain replaces old automation and rate-limits changing weather updates', async () => {
  const { audio, context, gain } = audioHarness();
  await audio.toggle();
  gain.value = .08;
  audio.update(1, 0);
  assert.equal(gain.events[0].value, .08, 'the current audible gain survives cancellation');
  const firstTargets = gain.targets;
  for (let frame = 1; frame <= 1800; frame++) {
    context.currentTime = frame / 30;
    audio.update(1, (Math.sin(frame / 80) + 1) / 2);
    assert.ok(gain.events.length <= 2, 'automation history stays bounded');
  }
  assert.ok(gain.targets - firstTargets <= 120, 'no more than two targets per second');
  await audio.toggle();
});

test('unchanged weather and suspended audio add no repeated automation events', async () => {
  const { audio, context, gain, setHidden } = audioHarness();
  await audio.toggle();
  audio.update(1, .5);
  for (let second = 1; second <= 60; second++) { context.currentTime = second; audio.update(1, .5); }
  assert.equal(gain.targets, 1);
  setHidden(true);
  await audio.visibility();
  for (let frame = 0; frame < 1000; frame++) audio.update(1, frame % 2);
  assert.equal(gain.targets, 1, 'frozen AudioContext time must not collect events');
  setHidden(false);
  await audio.visibility();
  context.currentTime++;
  audio.update(1, 1);
  assert.equal(gain.targets, 2);
  await audio.toggle();
  context.currentTime++;
  audio.update(1, 0);
  assert.equal(gain.targets, 2);
});

test('hiding the page during resume suspends audio after the pending toggle', async () => {
  const { audio, context, setHidden, timers } = audioHarness();
  const resumed = deferred();
  context.resume = async () => { await resumed.promise; context.state = 'running'; };
  const enabling = audio.toggle();
  setHidden(true);
  const visibility = audio.visibility();
  resumed.resolve();
  await Promise.all([enabling, visibility]);
  assert.equal(context.state, 'suspended');
  assert.equal(timers.size, 1);
  await audio.toggle();
  assert.equal(timers.size, 0);
});
