// Real seconds throughout. Keep the sampler and its antiderivative together.
export const WIND_MEAN = .28;
export const WIND_TERMS = Object.freeze([
  Object.freeze({ amplitude: .13, period: 83 }),
  Object.freeze({ amplitude: .12, period: 221 }),
]);
export function sampleWind(seconds) {
  return WIND_TERMS.reduce((wind, { amplitude, period }) => wind + amplitude * Math.sin(seconds / period), WIND_MEAN);
}
export function integratedWind(seconds) {
  return WIND_TERMS.reduce((distance, { amplitude, period }) => distance + amplitude * period * (1 - Math.cos(seconds / period)), WIND_MEAN * seconds);
}
