// The original world-calendar curve. Keeping this exact expression preserves
// bird/cottage schedules and persisted surface-weather forcing.
export function solarDeclination(dayOfYear) {
  return .4091 * Math.sin(2 * Math.PI * (dayOfYear - 80) / 365);
}
