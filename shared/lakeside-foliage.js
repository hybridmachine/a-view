// Native artwork coordinates. The offline exporter and runtime share this layout.
const selections = [
  ['oak-low', 'leaf', [680,275,54,44], 2.6, .82],
  ['oak-tip', 'leaf', [734,265,48,35], 2.8, 1],
  ['oak-east', 'leaf', [824,158,67,47], 2.5, .9],
  ['oak-inner', 'leaf', [614,252,46,37], 1.8, .62],
  ['grass-left', 'grass', [280,800,65,136], 4.5, .7],
  ['grass-path', 'grass', [453,689,62,100], 3.8, .68],
  ['grass-bank', 'grass', [758,691,61,117], 4.2, .82],
  ['grass-shore-west', 'grass', [1080,724,78,112], 5, 1],
  ['grass-shore-mid', 'grass', [1211,765,80,118], 4.6, .9],
  ['grass-shore-east', 'grass', [1333,772,100,162], 5.5, 1],
];

export const LAKESIDE_FOLIAGE = {
  version: 1, seed: 941, atlasSize: [512,512],
  assets: Object.fromEntries(['baseDay','baseNight','day','night'].map((key,i)=>[key,
    `/assets/lakeside-foliage-v1/${['base-day','base-night','foliage-day','foliage-night'][i]}.png`])),
  patches: selections.map(([id,type,bounds,maxDisplacement,exposure],i)=>({
    id,type,bounds,maxDisplacement,exposure,order:i,
    // Four texels of transparent padding on every side. No downsampling.
    rect:[(i%4)*128+8,Math.floor(i/4)*168+8,bounds[2],bounds[3]],
    anchor:[.5,type==='grass'?1:0],mesh:[6,10],
  })),
};
