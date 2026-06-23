/*
 * build-favicons.js — generate a full favicon set from the brand SVG (Poké Ball).
 * Output (committed): src/assets/icons/{favicon.svg, favicon-16.png, favicon-32.png,
 * apple-touch-icon.png (180), icon-192.png, icon-512.png, favicon.ico}.
 * build-site.js copies these into dist. Run: node scripts/build-favicons.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const _p2i = require('png-to-ico');
const pngToIco = _p2i.default || _p2i;

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'src', 'assets', 'icons');
fs.mkdirSync(OUT, { recursive: true });

// Poké Ball brand mark (same as the site favicon)
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#ffcb05" stroke="#000" stroke-width="4"/><rect x="2" y="28" width="60" height="8" fill="#000"/><circle cx="32" cy="32" r="8" fill="#fff" stroke="#000" stroke-width="4"/></svg>`;
const BG = { r: 15, g: 18, b: 32, alpha: 1 }; // #0f1220

async function png(size, flatten, file) {
  let img = sharp(Buffer.from(SVG)).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });
  if (flatten) img = img.flatten({ background: BG });
  await img.png().toFile(path.join(OUT, file));
}

(async () => {
  fs.writeFileSync(path.join(OUT, 'favicon.svg'), SVG);
  await png(16, false, 'favicon-16.png');
  await png(32, false, 'favicon-32.png');
  await png(180, true, 'apple-touch-icon.png');   // iOS home screen — needs a solid bg
  await png(192, true, 'icon-192.png');            // PWA manifest
  await png(512, true, 'icon-512.png');
  const ico = await pngToIco([path.join(OUT, 'favicon-16.png'), path.join(OUT, 'favicon-32.png')]);
  fs.writeFileSync(path.join(OUT, 'favicon.ico'), ico);
  console.log('Favicons generated:', fs.readdirSync(OUT).join(', '));
})();
