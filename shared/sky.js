import { integratedWind } from './wind.js';
import { CELESTIAL_MODEL, DEG, sampleCelestial } from './celestial.js';
import { SKY_CAMERA, cameraFrame, projectBody, projectDirection } from './celestial-projection.js';

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
export function celestialPose(calendar, override = null, seed = 617,
  {model=CELESTIAL_MODEL,camera=SKY_CAMERA,width=1672,height=941,worldMs=calendar.total}={}) {
  const sky=sampleCelestial(worldMs,model,seed),frame=cameraFrame(camera,width,height);
  const night=1-clamp(calendar.light);
  const sun=projectBody(sky.sun,frame,model.sizeScale);
  const moon=projectBody(sky.moon,frame,model.sizeScale,sky.sun.direction);
  const extinction=body=>smooth(-1*DEG,6*DEG,body.apparentAltitude);
  // Also follows the live illumination when reduced motion holds a daytime pose.
  sun.opacity=extinction(sun)*smooth(-.12,.03,calendar.elevation??sky.sun.altitude);
  sun.warmth=1-smooth(3*DEG,25*DEG,sun.apparentAltitude);
  moon.opacity=extinction(moon)*(.22+night*.53);
  if(override){
    // Explicit screen-space fixtures remain available for cloud/occlusion tests.
    const phase=override.phase??moon.phase,radius=override.radius??9;
    Object.assign(moon,override,{matrix:[radius,0,0,radius],radius,extentX:radius/width,extentY:radius/height,
      inFront:true,light:[Math.sin(phase*Math.PI*2),0,-Math.cos(phase*Math.PI*2)],
      opacity:override.opacity??(.22+night*.53),illumination:(1-Math.cos(phase*Math.PI*2))/2});
  }
  const starLight=1-smooth(-16*DEG,-4*DEG,calendar.elevation??sky.sun.altitude);
  const stars=sky.stars.map(star=>{
    const point=projectDirection(star.direction,frame);
    return {...point,id:star.id,radius:star.radius,opacity:star.opacity*starLight*smooth(0,8*DEG,star.altitude),
      visible:point.inFront&&point.x>=-star.radius/width&&point.x<=1+star.radius/width&&point.y>=-star.radius/height&&point.y<=1+star.radius/height};
  });
  return {night,sun,moon,stars,frame};
}

export function skyLighting(calendar, weather) {
  const dusk = (1 - smooth(.04, .30, Math.abs(calendar.elevation))) * smooth(-.15, .04, calendar.elevation);
  return { dusk, waterTint: [(.006 + .010 * calendar.light) * (1 - weather.cloud) + dusk * .009,
    .008 * (1 - weather.cloud) * calendar.light, .013 * (1 - weather.cloud) * (1 - dusk)] };
}
