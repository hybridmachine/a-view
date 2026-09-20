import { clockLabel, viewConditions } from '../shared/world.js';
import {sampleSurface, surfaceDescription, surfaceFixture} from '../shared/surface-weather.js';
import {cottageDescription} from '../shared/cottage.js';
import {birdDescription} from '../shared/bird.js';

export function sceneText(snapshot, now, { study = null, paused = false, disconnected = false, staticCottage = false, reducedMotion = false, birdUnavailable = false } = {}) {
  const { calendar, weather } = viewConditions(snapshot.world.epoch, now, study);
  const nest = snapshot.world.nest.stage === 'built'
    ? 'A completed nest rests in the oak.'
    : `A bird is building a nest in the oak. ${snapshot.world.nest.materials} strands gathered.`;
  const prefix = study ? 'Private light study. ' : '';
  const conditions = `${calendar.season}. ${calendar.period}. ${weather.name}. ${nest}`;
  const surface = surfaceDescription(study ? surfaceFixture(study) : sampleSurface(snapshot.world.environment, snapshot.world.epoch, now));
  const cottage=study?'':cottageDescription(snapshot.world.cottage);
  const cottageText=cottage?`${staticCottage?' The cottage is shown as a static painting. Shared cottage state: ':' '}${cottage}`:'';
  const bird=study?'':birdDescription(snapshot.world.bird,snapshot.world.action,now,{reducedMotion,unavailable:birdUnavailable});
  return {
    description: `${prefix}Year ${calendar.year}, day ${calendar.dayOfYear + 1}, ${clockLabel(calendar.hour)}. ${conditions}${surface ? ` ${surface}` : ''}${cottageText}${bird?` ${bird}`:''}${paused ? ' This view is paused.' : ''}`,
    // Keep the exact clock available for inspection without announcing every minute.
    announcement: `${prefix}${conditions}${disconnected ? ' Connection lost; holding the last consistent view.' : ''}`,
  };
}
