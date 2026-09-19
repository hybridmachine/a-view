import { integratedWind } from './wind.js';

const clamp = x => Math.max(0, Math.min(1, x));
const mod = (x, n) => ((x % n) + n) % n;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// These controls are monotone in cover, including the broad overcast floor.
export function cloudDensity(cover, rain, response) {
  const amount = clamp(cover);
  return {
    threshold: 1 - amount,
    softness: response.softness,
    opacity: smooth(0, response.fullAt, amount) * response.opacity,
    floor: smooth(response.overcastAt, 1, amount) * (1 - clamp(rain) * .03),
  };
}
export function cloudAlpha(baseAlpha, density) {
  const texture = smooth(density.threshold - density.softness, density.threshold + density.softness, baseAlpha);
  return Math.max(texture * density.opacity, density.floor);
}
export function sampleCloudLayers({ realSeconds, motionSeconds = realSeconds, weather, config }) {
  return config.layers.map((layer, index) => ({
    id: layer.id,
    phase: mod(layer.initialPhase + hash(config.seed + index) * layer.period + layer.speed * integratedWind(motionSeconds), layer.period),
    deformation: mod(motionSeconds / layer.deformationPeriod + hash(config.seed + index + 41) * Math.PI * 2, Math.PI * 2),
    density: cloudDensity(weather.cloud, weather.rain, layer.density),
    rain: clamp(weather.rain),
  }));
}
export function celestialPose(calendar, override = null, seed = 617) {
  const phase = mod(calendar.total / 86400000, 29.53) / 29.53;
  const angle = (calendar.hour - 12) / 24 * Math.PI * 2 - phase * Math.PI * 2;
  const elevation = Math.cos(angle);
  const moon = { x: .78 + Math.sin(angle) * .12, y: .30 - elevation * .19, radius: 9, phase, visible: elevation >= .15, ...override };
  return {
    night: 1 - clamp(calendar.light), moon,
    stars: Array.from({ length: 48 }, (_, i) => ({
      x: .58 + mod(hash(i + seed) * .53 + calendar.hour * .003, .45),
      y: .025 + hash(i + 941) * .24, radius: .35 + hash(i) * .6, opacity: .2 + hash(i + 7) * .45,
    })),
  };
}

export function skyLighting(calendar, weather) {
  const dusk = (1 - smooth(.04, .30, Math.abs(calendar.elevation))) * smooth(-.15, .04, calendar.elevation);
  return { dusk, waterTint: [(.006 + .010 * calendar.light) * (1 - weather.cloud) + dusk * .009,
    .008 * (1 - weather.cloud) * calendar.light, .013 * (1 - weather.cloud) * (1 - dusk)] };
}
