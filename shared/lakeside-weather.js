// Small fixed surfaces, clear of the authored moving foliage envelopes.
export const LAKESIDE_WEATHER = {
  version: 1, atlasSize: [512, 512],
  assets: {day: '/assets/lakeside-weather-v1/wet-day.png', night: '/assets/lakeside-weather-v1/wet-night.png'},
  patches: [
    {id: 'lower-path', store: 'pathWetness', bounds: [585, 760, 180, 181], rect: [8, 8, 180, 181],
      polygon: [[57,12],[93,15],[82,42],[105,62],[95,88],[124,120],[172,179],[5,179],[46,140],[73,111],[58,86],[31,68],[62,44]]},
    {id: 'path-stone', store: 'stoneWetness', bounds: [995, 838, 77, 48], rect: [208, 8, 77, 48],
      polygon: [[5,40],[19,21],[61,4],[74,7],[66,18],[45,28],[20,44]]},
    {id: 'puddle', store: 'puddleStorage', bounds: [631, 815, 66, 22], rect: [304, 8, 66, 22],
      polygon: [[2,13],[10,6],[28,3],[47,5],[61,11],[56,16],[36,19],[17,16]]},
  ],
  // Short falls below low foliage into the shaded ground; no impact rings over grass.
  drips: [{x: 349, y: 606, fall: 40, seed: 37}, {x: 310, y: 577, fall: 48, seed: 111}],
};
