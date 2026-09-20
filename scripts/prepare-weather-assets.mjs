// Offline registered extraction. Generated color reference never replaces geometry.
import {createRequire} from 'node:module';
import {mkdir, writeFile} from 'node:fs/promises';
import {LAKESIDE_WEATHER as config} from '../shared/lakeside-weather.js';
const sharp = createRequire(import.meta.url)('sharp');
const width = 1672, height = 941;
const directory = 'public/assets/lakeside-weather-v1';
await mkdir(directory, {recursive: true});
await mkdir('docs/weather-validation', {recursive: true});
const sources = await Promise.all(['day', 'night'].map(light => sharp(`public/assets/lakeside-sky-v1/foreground-${light}.png`).ensureAlpha().raw().toBuffer()));
const raw = {width, height, channels: 4};
const dayLow = await sharp(sources[0], {raw}).blur(8).raw().toBuffer();
const nightLow = await sharp(sources[1], {raw}).blur(8).raw().toBuffer();
const reference = await sharp('artwork/lakeside-weather-v1/wet-source.png').resize(width, height).ensureAlpha().blur(8).raw().toBuffer();
const [aw, ah] = config.atlasSize;
const atlases = [Buffer.alloc(aw * ah * 4), Buffer.alloc(aw * ah * 4)];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
for (const patch of config.patches) {
  const [left, top, w, h] = patch.bounds, [ax, ay] = patch.rect;
  const svg = `<svg width="${w}" height="${h}"><polygon fill="white" points="${patch.polygon.map(p => p.join(',')).join(' ')}"/></svg>`;
  const mask = await sharp(Buffer.from(svg)).blur(1.4).ensureAlpha().raw().toBuffer();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = ((top + y) * width + left + x) * 4, j = ((ay + y) * aw + ax + x) * 4;
    const edge = clamp(Math.min(x, y, w - 1 - x, h - 1 - y) / 3, 0, 1);
    let alpha = mask[(y * w + x) * 4 + 3] / 255 * edge;
    if (patch.id === 'puddle') alpha *= clamp(1 - Math.hypot((x - w / 2) / (w / 2), (y - h / 2) / (h / 2)), 0, 1);
    for (let light = 0; light < 2; light++) {
      const target = atlases[light]; target[j + 3] = Math.round(alpha * 255);
      for (let c = 0; c < 3; c++) {
        // Retain original brush detail. Transfer only bounded low-frequency color.
        const ratio = clamp(reference[i + c] / Math.max(1, dayLow[i + c]), .73, .94);
        let value = sources[light][i + c] * ratio;
        if (patch.id === 'puddle') {
          const sky = [156, 166, 163][c] * (light ? clamp(nightLow[i+c] / Math.max(1, dayLow[i+c]), .15, .5) : 1);
          value = value * .35 + sky * .65;
        }
        target[j + c] = Math.round(clamp(value, 0, 255));
      }
    }
  }
}
for (const [i, light] of ['day', 'night'].entries()) {
  await sharp(atlases[i], {raw: {width: aw, height: ah, channels: 4}}).png().toFile(`${directory}/wet-${light}.png`);
}
const outlines = config.patches.map(p => `<polygon points="${p.polygon.map(([x,y]) => `${x+p.bounds[0]},${y+p.bounds[1]}`).join(' ')}" fill="none" stroke="#f2c86b" stroke-width="2"/>`).join('');
await sharp('public/assets/lakeside-day.png').composite([{input: Buffer.from(`<svg width="${width}" height="${height}">${outlines}</svg>`)}]).png().toFile('docs/weather-validation/selections.png');
await writeFile(`${directory}/export.json`, JSON.stringify({version: 1, atlas: config.atlasSize, patches: config.patches.length,
  source: 'Generated wet-source color reference; canonical foreground brush geometry', alpha: 'matching straight-alpha PNG pair'}, null, 2) + '\n');
