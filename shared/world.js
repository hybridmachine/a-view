import { sampleWind, WIND_MEAN } from './wind.js';
import { LAKESIDE_FOLIAGE } from './lakeside-foliage.js';
import { LAKESIDE_WEATHER } from './lakeside-weather.js';
import { LAKESIDE_COTTAGE } from './lakeside-cottage.js';
// All durable actions use server milliseconds. Calendar progress is a separate domain.
export const RATE = 365 / 30;
export const WORLD_DAY = 86_400_000;
export const INITIAL_WORLD_MS = (135 + 15.5 / 24) * WORLD_DAY;
export const ACTION_DURATION = 16_000;
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const mix = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const mod = (x, n) => ((x % n) + n) % n;
export function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

const lakesideWidth = 1672;
export const SCENES = [{
  id: 'lakeside-cottage', regionId: 'stillwater', title: 'The Lakeside Cottage',
  region: 'Stillwater Valley', number: '01', width: lakesideWidth, height: 941,
  description: 'An old cottage at the edge of the water. A path worn by years of coming and going. In the oak, a small beginning.',
  assets: { day: '/assets/lakeside-day.png', night: '/assets/lakeside-night.png' },
  foliage: LAKESIDE_FOLIAGE,
  surfaceWeather: LAKESIDE_WEATHER,
  cottageLife: LAKESIDE_COTTAGE,
  sky: {
    version: 1, seed: 617, atlasSize: [2048, 1024],
    assets: {
      day: '/assets/lakeside-sky-v1/sky-day.png', night: '/assets/lakeside-sky-v1/sky-night.png',
      foregroundDay: '/assets/lakeside-sky-v1/foreground-day.png', foregroundNight: '/assets/lakeside-sky-v1/foreground-night.png',
      clouds: '/assets/lakeside-sky-v1/cloud-atlas.png',
    },
    layers: [
      { id: 'distant', rect: [4, 4, 2040, 504], period: 1.6, top: -.13, height: .50, initialPhase: .26,
        speed: .32 / (lakesideWidth * WIND_MEAN), deformationPeriod: 173, deformationAmount: .006,
        density: { softness: .24, opacity: .76, fullAt: .65, overcastAt: .62 },
        dayTint: [1, .99, .95], nightTint: [.25, .32, .42] },
      { id: 'near', rect: [4, 516, 2040, 504], period: 1.25, top: -.09, height: .48, initialPhase: .68,
        speed: .72 / (lakesideWidth * WIND_MEAN), deformationPeriod: 127, deformationAmount: .009,
        density: { softness: .20, opacity: 1, fullAt: .76, overcastAt: .70 },
        dayTint: [1, .98, .92], nightTint: [.28, .34, .43] },
    ],
  },
  nest: { id: 'oak-nest-01', x: 0.234, y: 0.245 },
  cottage: { door: [0.338, 0.582], chimney: [0.242, 0.36] },
}];

export function worldTime(epoch, now) {
  return INITIAL_WORLD_MS + (now - epoch) * RATE;
}
export function realTime(epoch, worldMs) {
  return epoch + (worldMs - INITIAL_WORLD_MS) / RATE;
}
export function calendar(epoch, now) {
  const total = worldTime(epoch, now);
  const day = Math.floor(total / WORLD_DAY);
  const dayOfYear = mod(day, 365);
  const hour = mod(total / 3_600_000, 24);
  const season = dayOfYear < 79 || dayOfYear >= 355 ? 'Winter' : dayOfYear < 172 ? 'Spring' : dayOfYear < 265 ? 'Summer' : 'Autumn';
  // Low-cost solar model for a fictional location at 49 degrees north.
  const declination = .4091 * Math.sin(2 * Math.PI * (dayOfYear - 80) / 365);
  const latitude = 49 * Math.PI / 180;
  const hourAngle = (hour - 12) * Math.PI / 12;
  const elevation = Math.asin(Math.sin(latitude) * Math.sin(declination) + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle));
  const daylightHours = 24 / Math.PI * Math.acos(clamp(-Math.tan(latitude) * Math.tan(declination), -1, 1));
  const sunrise = 12 - daylightHours / 2;
  const sunset = 12 + daylightHours / 2;
  const light = smooth(-.15, .23, elevation);
  const period = elevation < -.12 ? 'Night' : hour < 12 && elevation < .13 ? 'Dawn' : hour >= 12 && elevation < .13 ? 'Dusk' : hour < 12 ? 'Morning' : 'Afternoon';
  return { total, day, dayOfYear, year: Math.floor(day / 365) + 1, hour, season, elevation, light, sunrise, sunset, period };
}
export function weather(epoch, now) {
  // Continuously changing conditions with stable values across all visitors.
  const elapsed = (now - epoch) / 1000;
  const cloud = clamp(.28 + .3 * Math.sin(elapsed / 470 - 1) + .21 * Math.sin(elapsed / 1100));
  const rain = smooth(.60, .78, cloud);
  const wind = sampleWind(elapsed);
  return { cloud, rain, wind, name: rain > .12 ? 'Passing rain' : cloud > .5 ? 'Cloudy skies' : cloud > .2 ? 'Soft clouds' : 'Clear skies' };
}
export function viewConditions(epoch, now, study = null) {
  let c = calendar(epoch, now), w = weather(epoch, now);
  if (study) {
    const hour = study === 'dawn' ? c.sunrise + .15 : study === 'dusk' ? c.sunset + .15 : study === 'night' ? .5 : 15.5;
    c = calendar(epoch, realTime(epoch, c.day * WORLD_DAY + hour * 3_600_000));
    w = study === 'rain' ? { ...w, cloud: .9, rain: .8, name: 'Passing rain' } : { ...w, cloud: .18, rain: 0, name: 'Clear skies' };
  }
  return { calendar: c, weather: w };
}
export function nextForage(epoch, after) {
  // A finite nest-building study: 12 delivered pieces, no invented eggs or hatchlings.
  let start = after + 60_000 + hash(Math.floor(after / 1000)) * 90_000;
  const c = calendar(epoch, start);
  if (c.hour < c.sunrise + .5) start = realTime(epoch, c.day * WORLD_DAY + (c.sunrise + .5) * 3_600_000);
  if (c.hour > c.sunset - .5) {
    const tomorrow = calendar(epoch, realTime(epoch, (c.day + 1) * WORLD_DAY + 12 * 3_600_000));
    start = realTime(epoch, (c.day + 1) * WORLD_DAY + (tomorrow.sunrise + .5) * 3_600_000);
  }
  return Math.ceil(start);
}
export function birdPose(action, now) {
  const perch = SCENES[0].nest;
  if (!action || now < action.start || now >= action.end) return { x: perch.x, y: perch.y - .005, flying: false, carrying: false, direction: -1 };
  const t = clamp((now - action.start) / (action.end - action.start));
  // A continuous out-and-back trip. The bird collects material on the bank.
  const points = [[perch.x, perch.y - .005], [.34, .36], [.46, .51], [.49, .62], [.49, .62], [.44, .44], [.30, .26], [perch.x, perch.y - .005]];
  const pick = t < .44 ? t / .44 * 3 : t < .57 ? 3 : 4 + (t - .57) / .43 * 3;
  const i = Math.min(6, Math.floor(pick));
  const u = pick - i;
  const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(7, i + 2)];
  const catmull = d => .5 * (2 * p1[d] + (-p0[d] + p2[d]) * u + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * u * u + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * u * u * u);
  return { x: catmull(0), y: catmull(1), flying: !(t >= .44 && t <= .57), carrying: t > .57, direction: t < .5 ? 1 : -1 };
}
export function clockLabel(hour) {
  const totalMinutes = mod(Math.floor(hour * 60 + 1e-6), 1440);
  const h = Math.floor(totalMinutes / 60); const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
