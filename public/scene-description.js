import { clockLabel, viewConditions } from '../shared/world.js';
import {sampleSurface, surfaceDescription, surfaceFixture} from '../shared/surface-weather.js';

export function sceneText(snapshot, now, { study = null, paused = false, disconnected = false } = {}) {
  const { calendar, weather } = viewConditions(snapshot.world.epoch, now, study);
  const nest = snapshot.world.nest.stage === 'built'
    ? 'A completed nest rests in the oak.'
    : `A bird is building a nest in the oak. ${snapshot.world.nest.materials} strands gathered.`;
  const prefix = study ? 'Private light study. ' : '';
  const conditions = `${calendar.season}. ${calendar.period}. ${weather.name}. ${nest}`;
  const surface = surfaceDescription(study ? surfaceFixture(study) : sampleSurface(snapshot.world.environment, snapshot.world.epoch, now));
  return {
    description: `${prefix}Year ${calendar.year}, day ${calendar.dayOfYear + 1}, ${clockLabel(calendar.hour)}. ${conditions}${surface ? ` ${surface}` : ''}${paused ? ' This view is paused.' : ''}`,
    // Keep the exact clock available for inspection without announcing every minute.
    announcement: `${prefix}${conditions}${disconnected ? ' Connection lost; holding the last consistent view.' : ''}`,
  };
}
