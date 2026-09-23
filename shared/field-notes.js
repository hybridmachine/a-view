export const NOTES_SCENE = 'lakeside-cottage';
export const EMPTY_CURSOR = Object.freeze({seq:0,id:''});
export const NOTE_COPY = Object.freeze({
  'nest-completed':'The nest was finished.',
  'bird-habit':'The bird returned to the same branch on three days.',
  'bird-roof':'The bird paused on the cottage roof.',
  'nest-progress':'The bird brought another strand to the nest.',
  'cottage-light':'The main-room light came on.',
});
export const cursorOf = event => event ? {seq:event.seq,id:event.id} : {...EMPTY_CURSOR};
export const sameCursor = (a,b) => a?.seq===b?.seq && a?.id===b?.id;
export function validCursor(value) {
  return !!value && Number.isSafeInteger(value.seq) && value.seq>=0 && typeof value.id==='string' &&
    (value.seq===0 ? value.id==='' : value.id.length>0 && value.id.length<=200);
}
export function validIdentity(value) {
  return !!value && typeof value.id==='string' && /^[a-f0-9-]{36}$/.test(value.id) &&
    value.worldId==='stillwater' && value.sceneId===NOTES_SCENE && Number.isSafeInteger(value.epoch);
}
export const identityOf = ({id,worldId,sceneId,epoch}) => ({id,worldId,sceneId,epoch});
export const sameIdentity = (a,b) => !!a && !!b && a.id===b.id && a.worldId===b.worldId && a.sceneId===b.sceneId && a.epoch===b.epoch;
export const validHistory = value => validIdentity(value) && validCursor(value.head);
export function validInterval(value) {
  return validIdentity(value?.identity) && validCursor(value.after) && validCursor(value.through) &&
    value.after.seq<=value.through.seq && (value.after.seq!==value.through.seq || sameCursor(value.after,value.through));
}
export function sameInterval(a,b) {
  return !!a && !!b && sameIdentity(a.identity,b.identity) && sameCursor(a.after,b.after) && sameCursor(a.through,b.through);
}
export function validSummary(value,interval) {
  return !!value && sameInterval(value,interval) && ['complete','partial','reset'].includes(value.coverage) &&
    Array.isArray(value.facts) && value.facts.length<=2 && new Set(value.facts.map(f=>f?.kind)).size===value.facts.length &&
    value.facts.every(f=>Object.hasOwn(NOTE_COPY,f?.kind) && Number.isSafeInteger(f.at) && validCursor(f.event) &&
      f.event.seq>interval.after.seq && f.event.seq<=interval.through.seq && Array.isArray(f.supporting) &&
      f.supporting.length<=3 && f.supporting.every(c=>validCursor(c) && c.seq>0 && c.seq<=f.event.seq)) &&
    (value.coverage!=='reset' || value.facts.length===0);
}
export function recapText(summary) {
  const text=summary.facts.map(f=>NOTE_COPY[f.kind]).join(' ');
  if(summary.coverage==='partial')return text ? `${text} Some earlier notes are unavailable.` : 'Some earlier notes are unavailable.';
  return text || 'No new field notes since your last visit.';
}
