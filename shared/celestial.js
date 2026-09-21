import { solarDeclination } from './solar.js';

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;
export const CELESTIAL_DAY = 86400000;
export const CELESTIAL_MODEL = Object.freeze({
  version: 1, latitude: 49 * DEG, obliquity: .4091, yearDays: 365,
  synodicDays: 29.53059, phaseAtEpoch: 0, inclination: 5.145 * DEG,
  nodeAtEpoch: 125 * DEG, nodePeriodDays: -6793.48,
  sunDiameter: .533 * DEG, moonDiameter: .518 * DEG,
  sizeScale: 1.5, starCount: 320,
});
export const mod = (x, n) => ((x % n) + n) % n;
export const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
export const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
export const normalize = v => { const length = Math.hypot(...v); return v.map(x => x / length); };
const clamp = x => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => { const t=clamp((x-a)/(b-a));return t*t*(3-2*t); };
const hash = n => { const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v); };

// Local frame is east, north, up. Azimuth is clockwise from north, in radians.
export function horizontalDirection(azimuth, altitude) {
  return [Math.cos(altitude)*Math.sin(azimuth), Math.cos(altitude)*Math.cos(azimuth), Math.sin(altitude)];
}
function horizontal(rightAscension, declination, siderealAngle, latitude) {
  const h=siderealAngle-rightAscension, cosD=Math.cos(declination), sinD=Math.sin(declination);
  const direction=[-cosD*Math.sin(h), sinD*Math.cos(latitude)-cosD*Math.cos(h)*Math.sin(latitude),
    sinD*Math.sin(latitude)+cosD*Math.cos(h)*Math.cos(latitude)];
  const altitude=Math.asin(Math.max(-1,Math.min(1,direction[2])));
  return {direction,altitude,azimuth:mod(Math.atan2(direction[0],direction[1]),TAU)};
}
// Bounded Bennett approximation, tapered below the horizon. Terrain occlusion
// is independent; refraction never acts as a visibility switch.
export function refraction(altitude) {
  const degrees=altitude/DEG, h=Math.max(-1,degrees);
  return Math.max(0,1.02/Math.tan((h+10.3/(h+5.11))*DEG)/60)*DEG*
    smooth(-2,-1,degrees)*(1-smooth(85,90,degrees));
}
function apparent(body, diameter) {
  const apparentAltitude=body.altitude+refraction(body.altitude);
  return {...body,apparentAltitude,apparentDirection:horizontalDirection(body.azimuth,apparentAltitude),angularDiameter:diameter};
}
function equatorial(longitude, latitude, obliquity) {
  const x=Math.cos(latitude)*Math.cos(longitude), y=Math.cos(latitude)*Math.sin(longitude), z=Math.sin(latitude);
  return {rightAscension:Math.atan2(y*Math.cos(obliquity)-z*Math.sin(obliquity),x),
    declination:Math.asin(y*Math.sin(obliquity)+z*Math.cos(obliquity))};
}
const catalogs=new Map();
function starCatalog(seed, count) {
  const key=`${seed}:${count}`;
  if(!catalogs.has(key)){
    if(catalogs.size>=8)catalogs.delete(catalogs.keys().next().value);
    catalogs.set(key,Array.from({length:count},(_,id)=>({id,rightAscension:TAU*hash(seed+id*3),
      declination:Math.asin(hash(seed+id*3+1)*2-1),radius:.35+hash(seed+id*3+2)*.65,
      opacity:.22+hash(seed+id*3+7)*.48})));
  }
  return catalogs.get(key);
}

// An idealized Earth-like sky for a 365-day fictional year, not an Earth-date
// ephemeris. Orbital longitude advances continuously; no hourly/daily resets.
export function sampleCelestial(worldMs, model = CELESTIAL_MODEL, seed = 617) {
  const day=worldMs/CELESTIAL_DAY, season=mod(day,model.yearDays);
  const longitude=TAU*(season-80)/model.yearDays;
  const solarRA=equatorial(longitude,0,model.obliquity).rightAscension;
  const hourAngle=(mod(day,1)-.5)*TAU, siderealAngle=solarRA+hourAngle;
  // Continuous seasonal sampling of the same curve the legacy calendar uses
  // at integer days. The calendar's existing light/scheduling values stay exact.
  const sun=apparent(horizontal(solarRA,solarDeclination(season),siderealAngle,model.latitude),model.sunDiameter);
  const phase=mod(day/model.synodicDays+model.phaseAtEpoch,1);
  const lunarLongitude=longitude+phase*TAU;
  const node=model.nodeAtEpoch+TAU*mod(day/model.nodePeriodDays,1);
  const lunarLatitude=Math.asin(Math.sin(model.inclination)*Math.sin(lunarLongitude-node));
  const lunar=equatorial(lunarLongitude,lunarLatitude,model.obliquity);
  const moon=apparent(horizontal(lunar.rightAscension,lunar.declination,siderealAngle,model.latitude),model.moonDiameter);
  moon.phase=phase;moon.illumination=clamp((1-dot(sun.direction,moon.direction))/2);
  const stars=starCatalog(seed,model.starCount).map(star=>({...star,
    ...horizontal(star.rightAscension,star.declination,siderealAngle,model.latitude)}));
  return {sun,moon,stars,siderealAngle};
}
