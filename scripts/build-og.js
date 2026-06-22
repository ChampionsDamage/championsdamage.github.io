/*
 * build-og.js — generate 1200x630 Open Graph PNGs per language.
 * Rasterizes a branded SVG with sharp. Output -> src/assets/og/og-<lang>.png
 * (copied into dist by build-site.js — run build-og BEFORE build-site, or use
 *  the `build` npm script which chains them).
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const OUT = path.join(ROOT, 'src', 'assets', 'og');
fs.mkdirSync(OUT, { recursive: true });

function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// crude word-wrap for the headline
function wrap(text, max) {
  const words = text.split(' ');
  const lines = []; let cur = '';
  words.forEach((w) => {
    if ((cur + ' ' + w).trim().length > max) { lines.push(cur.trim()); cur = w; }
    else cur += ' ' + w;
  });
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}

function svg(t) {
  const titleLines = wrap(t.h1, 22);
  const ty = 250 - (titleLines.length - 1) * 34;
  const titleTspans = titleLines.map((l, i) =>
    `<text x="80" y="${ty + i * 78}" font-size="66" font-weight="800" fill="#ffffff" font-family="Arial, sans-serif">${esc(l)}</text>`
  ).join('');
  const chips = ['VGC', 'Nivel 50', 'SP', t.ui.doubles].slice(0, 4);
  const chipsSvg = chips.map((c, i) =>
    `<g transform="translate(${80 + i * 170},${ty + titleLines.length * 78 + 36})">
       <rect rx="20" ry="20" width="155" height="44" fill="#262c47" stroke="#3b6cff"/>
       <text x="77" y="29" font-size="22" font-weight="700" fill="#cfd6ff" text-anchor="middle" font-family="Arial, sans-serif">${esc(c)}</text>
     </g>`
  ).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="g" cx="50%" cy="0%" r="90%">
      <stop offset="0%" stop-color="#1b2140"/><stop offset="60%" stop-color="#0f1220"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <rect x="0" y="0" width="1200" height="8" fill="#ffcb05"/>
  <!-- pokeball motif -->
  <g transform="translate(940,315)" opacity="0.9">
    <circle r="230" fill="none" stroke="#262c47" stroke-width="30"/>
    <path d="M -230 0 A 230 230 0 0 1 230 0" fill="#ff5b6e" opacity="0.18"/>
    <line x1="-230" y1="0" x2="-70" y2="0" stroke="#262c47" stroke-width="30"/>
    <line x1="70" y1="0" x2="230" y2="0" stroke="#262c47" stroke-width="30"/>
    <circle r="64" fill="#0f1220" stroke="#ffcb05" stroke-width="14"/>
  </g>
  <!-- brand -->
  <g transform="translate(80,90)">
    <circle cx="22" cy="14" r="22" fill="#ffcb05" stroke="#000" stroke-width="4"/>
    <rect x="0" y="11" width="44" height="6" fill="#000"/>
    <text x="62" y="24" font-size="30" font-weight="800" fill="#ffcb05" font-family="Arial, sans-serif">ChampionsDmg</text>
  </g>
  ${titleTspans}
  <text x="80" y="${ty + titleLines.length * 78 - 6}" font-size="28" fill="#9aa3c7" font-family="Arial, sans-serif">${esc(t.tagline.slice(0, 64))}</text>
  ${chipsSvg}
</svg>`;
}

(async () => {
  for (const lang of cfg.languages) {
    const t = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'i18n', lang + '.json'), 'utf8'));
    const buf = Buffer.from(svg(t));
    await sharp(buf).png().toFile(path.join(OUT, 'og-' + lang + '.png'));
    console.log('  og-' + lang + '.png');
  }
  console.log('OG images done.');
})();
