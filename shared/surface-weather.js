import {calendar, clamp, hash, smooth, weather} from './world.js';

// Model v1: normalized artistic reservoirs, rates per REAL second. Not hydrology.
export const SURFACE_RULES = 1;
export const SURFACE_TICK_MS = 10_000;
export const SURFACE_KEYS = ['pathWetness', 'stoneWetness', 'puddleStorage', 'canopyStorage'];
export const MAX_SURFACE_TICKS = 300_000; // Bound a server advance to ~35 real days.

export function createSurfaceState(at) {
  return {rulesVersion: SURFACE_RULES, introducedAt: at, tickOrigin: at, tickIndex: 0,
    pathWetness: 0, stoneWetness: 0, puddleStorage: 0, canopyStorage: 0};
}

export function validSurfaceState(state) {
  return state?.rulesVersion === SURFACE_RULES && Number.isFinite(state.introducedAt) &&
    Number.isFinite(state.tickOrigin) && state.tickOrigin === state.introducedAt &&
    Number.isSafeInteger(state.tickIndex) && state.tickIndex >= 0 &&
    SURFACE_KEYS.every(key => Number.isFinite(state[key]) && state[key] >= 0 && state[key] <= 1);
}

export const surfaceTime = state => state.tickOrigin + state.tickIndex * SURFACE_TICK_MS;

function reservoir(value, input, loss, seconds) {
  const rate = input + loss;
  return rate === 0 ? value : clamp(input / rate + (value - input / rate) * Math.exp(-rate * seconds));
}

// All coefficients depend on the START of a canonical tick, including coupling.
export function surfaceStep(state, seconds, conditions) {
  const {rain, wind, light} = conditions;
  const drying = .45 + .55 * light + .35 * wind;
  return {...state,
    pathWetness: reservoir(state.pathWetness, rain / 95, drying / 410, seconds),
    stoneWetness: reservoir(state.stoneWetness, rain / 65, drying / 300, seconds),
    puddleStorage: reservoir(state.puddleStorage, rain * smooth(.32, .75, state.pathWetness) / 160, (.4 + drying) / 1250, seconds),
    canopyStorage: reservoir(state.canopyStorage, rain / 25, 1 / 48, seconds),
  };
}

function forcing(epoch, at) {
  return {...weather(epoch, at), light: calendar(epoch, at).light};
}

export function advanceSurface(state, epoch, now, limit = MAX_SURFACE_TICKS) {
  if (!validSurfaceState(state) || !Number.isFinite(now) || !Number.isFinite(epoch) ||
      !Number.isSafeInteger(limit) || limit < 0) throw new Error('Unsupported or invalid surface state');
  const target = Math.max(state.tickIndex, Math.floor((now - state.tickOrigin) / SURFACE_TICK_MS));
  let result = {...state};
  const end = Math.min(target, state.tickIndex + limit);
  while (result.tickIndex < end) {
    result = surfaceStep(result, SURFACE_TICK_MS / 1000, forcing(epoch, surfaceTime(result)));
    result.tickIndex++;
  }
  return {state: result, ticks: end - state.tickIndex, complete: end === target};
}

// Display-only partial ticks NEVER become persisted checkpoints. A stale client
// is deliberately unable to replay an unbounded amount of history per frame.
export function sampleSurface(state, epoch, now) {
  if (!validSurfaceState(state) || !Number.isFinite(epoch) || !Number.isFinite(now)) return null;
  if (now < surfaceTime(state) || now - surfaceTime(state) > 60_000) return null;
  const advanced = advanceSurface(state, epoch, now, 6);
  if (!advanced.complete) return null;
  const at = surfaceTime(advanced.state);
  return surfaceStep(advanced.state, (now - at) / 1000, forcing(epoch, at));
}

export function surfaceFixture(name) {
  const values = name === 'rain' || name === 'wet' ? [.85, .9, .7, .6]
    : name === 'drying' ? [.38, .23, .35, .05] : [0, 0, 0, 0];
  return Object.fromEntries(SURFACE_KEYS.map((key, index) => [key, values[index]]));
}

export function surfaceDescription(surface) {
  if (!surface) return '';
  if (surface.puddleStorage > .22) return 'Water rests in a shallow hollow on the path.';
  if (surface.pathWetness > .25) return 'The path is still damp.';
  return '';
}

// Stable opportunities, at most one short falling drop per source at a time.
export function dripPose(seconds, source, storage, rain) {
  const cycle = Math.floor(seconds / 5), phase = seconds - cycle * 5;
  const chance = clamp(storage * (1 - smooth(.05, .3, rain)) * .85);
  if (hash(cycle + source.seed) >= chance || phase > .65) return null;
  const t = phase / .65;
  return {x: source.x + 2 * t, y: source.y + source.fall * t * t, alpha: Math.sin(Math.PI * t) * .38};
}
