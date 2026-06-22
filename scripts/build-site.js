/*
 * build-site.js — static site generator.
 * Emits /dist with one indexable HTML page per language, shared assets,
 * data, sitemap.xml, robots.txt, manifest and a root language picker.
 *
 * Run: node scripts/build-site.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const SITE = cfg.url.replace(/\/$/, '');

const i18n = {};
const legal = {};
cfg.languages.forEach((l) => {
  i18n[l] = JSON.parse(fs.readFileSync(path.join(SRC, 'i18n', l + '.json'), 'utf8'));
  legal[l] = JSON.parse(fs.readFileSync(path.join(SRC, 'legal', l + '.json'), 'utf8'));
});

// --- fs helpers ---
function rmrf(p) { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); }
function cp(from, to) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); }
function writeFile(p, c) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// --- page template ---
function pageHTML(lang) {
  const t = i18n[lang];
  const url = SITE + '/' + lang + '/' + t.slug + '/';
  const ogImg = SITE + '/assets/og/og-' + lang + '.png';

  const hreflangs = cfg.languages.map((l) =>
    `<link rel="alternate" hreflang="${i18n[l].hreflang}" href="${SITE}/${l}/${i18n[l].slug}/">`
  ).join('\n  ');

  // JSON-LD: WebApplication + FAQPage + Breadcrumb
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        "name": t.meta.ogTitle,
        "url": url,
        "applicationCategory": "GameApplication",
        "operatingSystem": "Web",
        "inLanguage": t.hreflang,
        "description": t.meta.description,
        "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
        "isAccessibleForFree": true
      },
      {
        "@type": "FAQPage",
        "mainEntity": t.faq.map((f) => ({
          "@type": "Question", "name": f.q,
          "acceptedAnswer": { "@type": "Answer", "text": f.a.replace(/<[^>]+>/g, '') }
        }))
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": cfg.siteName, "item": SITE + '/' },
          { "@type": "ListItem", "position": 2, "name": t.h1, "item": url }
        ]
      }
    ]
  };

  // language switcher links
  const langMenu = cfg.languages.map((l) =>
    `<a href="/${l}/${i18n[l].slug}/" hreflang="${i18n[l].hreflang}"${l===lang?' aria-current="true"':''}>${i18n[l].name}</a>`
  ).join('');

  // content: faq + glossary
  const faqHTML = t.faq.map((f) => `<dt>${esc(f.q)}</dt><dd>${f.a}</dd>`).join('\n      ');
  const glossHTML = t.glossary.map((g) => `<li><b>${esc(g.t)}</b> — ${esc(g.d)}</li>`).join('\n        ');

  const I18N_JSON = JSON.stringify(t);

  return `<!doctype html>
<html lang="${t.hreflang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(t.meta.title)}</title>
<meta name="description" content="${esc(t.meta.description)}">
<link rel="canonical" href="${url}">
${hreflangs}
  <link rel="alternate" hreflang="x-default" href="${SITE}/">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(cfg.siteName)}">
<meta property="og:locale" content="${t.locale}">
<meta property="og:title" content="${esc(t.meta.ogTitle)}">
<meta property="og:description" content="${esc(t.meta.ogDescription)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${ogImg}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(t.meta.ogTitle)}">
<meta name="twitter:description" content="${esc(t.meta.ogDescription)}">
<meta name="twitter:image" content="${ogImg}">
<meta name="theme-color" content="#0f1220">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preconnect" href="${SITE}">
<link rel="preload" href="/data/pokemon.json" as="fetch" crossorigin>
<link rel="stylesheet" href="/assets/css/styles.css">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body>
<header class="site-header">
  <div class="wrap">
    <a class="brand" href="/${lang}/${t.slug}/"><span class="dot"></span> <span>Champions<b>Dmg</b></span></a>
    <div class="lang">
      <button class="lang-btn" id="langBtn" aria-haspopup="true" aria-expanded="false">🌐 ${i18n[lang].name} ▾</button>
      <nav class="lang-menu" id="langMenu" aria-label="${esc(t.footer.langLabel)}">${langMenu}</nav>
    </div>
  </div>
</header>

<main class="wrap">
  <section class="hero">
    <h1>${esc(t.h1)}</h1>
    <p class="tagline">${esc(t.tagline)}</p>
  </section>

  <section class="calc" aria-label="${esc(t.h1)}">
    <div class="sides">
      <div class="side attacker">
        <h2><span class="tag">●</span> ${esc(t.ui.attacker)}</h2>
        <div class="side-card" id="attacker-host"></div>
      </div>
      <div class="swap-col">
        <button class="swap-btn" id="swapBtn" title="${esc(t.ui.swap)}" aria-label="${esc(t.ui.swap)}">⇄</button>
      </div>
      <div class="side defender">
        <h2><span class="tag">●</span> ${esc(t.ui.defender)}</h2>
        <div class="side-card" id="defender-host"></div>
      </div>
    </div>

    <details class="adv" open style="margin-top:12px">
      <summary>${esc(t.ui.field)}</summary>
      <div id="field-host"></div>
    </details>

    <div class="result" id="result" aria-live="polite"></div>
  </section>

  <article class="content">
    <p>${t.intro}</p>

    <h2>${esc(t.sections.spTitle)}</h2>
    <p>${t.sections.spBody}</p>

    <h2>${esc(t.sections.howTitle)}</h2>
    <p>${t.sections.howBody}</p>

    <h2>${esc(t.glossaryTitle)}</h2>
    <ul class="glossary">
        ${glossHTML}
    </ul>

    <h2>${esc(t.sections.faqTitle)}</h2>
    <dl class="faq">
      ${faqHTML}
    </dl>
  </article>
</main>

<footer class="site-footer">
  <div class="wrap">
    <nav class="langs" aria-label="${esc(t.footer.langLabel)}">${langMenu}</nav>
    <p class="muted">${esc(t.footer.disclaimer)}</p>
    <p class="muted">${esc(t.footer.data)} (Reg ${esc(cfg.regulation)})</p>
    <p><a href="/${lang}/${legal[lang].slug}/">${esc(legal[lang].nav)}</a> · <a href="/${lang}/${legal[lang].slug}/#contacto">${esc(legal[lang].contactNav)}</a></p>
  </div>
</footer>

<script>window.LANG=${JSON.stringify(lang)};window.DATA_BASE="/data/";window.I18N=${I18N_JSON};</script>
<script src="/assets/js/engine.js" defer></script>
<script src="/assets/js/app.js" defer></script>
<script>
  // wire header swap button to app once loaded
  document.addEventListener('DOMContentLoaded',function(){
    var s=document.getElementById('swapBtn');
    if(s)s.addEventListener('click',function(){var b=document.getElementById('swapBtn2');if(b)b.click();});
  });
</script>
</body>
</html>`;
}

// --- legal / contact page ---
function legalHTML(lang) {
  const t = i18n[lang];
  const lg = legal[lang];
  const url = SITE + '/' + lang + '/' + lg.slug + '/';
  const hreflangs = cfg.languages.map((l) =>
    `<link rel="alternate" hreflang="${i18n[l].hreflang}" href="${SITE}/${l}/${legal[l].slug}/">`
  ).join('\n  ') + `\n  <link rel="alternate" hreflang="x-default" href="${SITE}/">`;
  const langMenu = cfg.languages.map((l) =>
    `<a href="/${l}/${legal[l].slug}/"${l===lang?' aria-current="true"':''}>${i18n[l].name}</a>`
  ).join('');
  const sections = lg.sections.map((s) => `<h2>${esc(s.h)}</h2>\n<p>${s.html}</p>`).join('\n');
  const mail = cfg.contactEmail;
  return `<!doctype html>
<html lang="${t.hreflang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(lg.title)} — ${esc(cfg.siteName)}</title>
<meta name="description" content="${esc(lg.metaDescription)}">
<link rel="canonical" href="${url}">
  ${hreflangs}
<meta name="robots" content="index,follow">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/css/styles.css">
</head>
<body>
<header class="site-header"><div class="wrap">
  <a class="brand" href="/${lang}/${t.slug}/"><span class="dot"></span> <span>Champions<b>Dmg</b></span></a>
  <div class="lang"><nav class="lang-menu open" style="position:static;display:flex;gap:6px;background:transparent;border:0;box-shadow:none;padding:0">${langMenu}</nav></div>
</div></header>
<main class="wrap content" style="max-width:760px">
  <p><a href="/${lang}/${t.slug}/">← ${esc(t.h1)}</a></p>
  <h1>${esc(lg.title)}</h1>
  <p class="muted">${esc(lg.updatedLabel)}: ${esc(cfg.lastUpdated)}</p>
  ${sections}
  <h2 id="contacto">${esc(lg.contact.h)}</h2>
  <p>${lg.contact.html} <a href="mailto:${esc(mail)}">${esc(mail)}</a></p>
</main>
<footer class="site-footer"><div class="wrap">
  <p class="muted">${esc(t.footer.disclaimer)}</p>
  <p><a href="/${lang}/${t.slug}/">${esc(t.h1)}</a></p>
</div></footer>
</body>
</html>`;
}

// --- root language picker ---
function rootHTML() {
  const links = cfg.languages.map((l) =>
    `<a href="/${l}/${i18n[l].slug}/" hreflang="${i18n[l].hreflang}">${i18n[l].name} — ${esc(i18n[l].h1)}</a>`
  ).join('\n  ');
  const hreflangs = cfg.languages.map((l) =>
    `<link rel="alternate" hreflang="${i18n[l].hreflang}" href="${SITE}/${l}/${i18n[l].slug}/">`
  ).join('\n  ') + `\n  <link rel="alternate" hreflang="x-default" href="${SITE}/">`;
  const map = {};
  cfg.languages.forEach((l) => { map[i18n[l].hreflang.split('-')[0]] = '/' + l + '/' + i18n[l].slug + '/'; });
  return `<!doctype html>
<html lang="${cfg.defaultLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(cfg.siteName)} — Pokémon Champions Damage Calculator</title>
<meta name="description" content="Calculadora de daño de Pokémon Champions en español, português, français e italiano. SP, VGC dobles, rango de daño y KO.">
<link rel="canonical" href="${SITE}/">
  ${hreflangs}
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/css/styles.css">
<script>
  (function(){
    var m=${JSON.stringify(map)};
    var langs=(navigator.languages||[navigator.language||'']);
    for(var i=0;i<langs.length;i++){var c=(langs[i]||'').slice(0,2).toLowerCase();if(m[c]){location.replace(m[c]);return;}}
  })();
</script>
</head>
<body>
<main class="wrap" style="padding:40px 16px;max-width:680px">
  <h1>Pokémon Champions — Damage Calculator</h1>
  <p class="skeleton">Elige tu idioma · Escolha o idioma · Choisissez votre langue · Scegli la lingua</p>
  <nav class="site-footer" style="border:0;background:transparent;padding:0">
    <div class="langs" style="flex-direction:column;gap:10px">
  ${links}
    </div>
  </nav>
</main>
</body>
</html>`;
}

// --- sitemap & robots ---
function urlEntry(loc, altsFor) {
  const alts = cfg.languages.map((l) =>
    `    <xhtml:link rel="alternate" hreflang="${i18n[l].hreflang}" href="${altsFor(l)}"/>`
  ).join('\n');
  return `  <url>\n    <loc>${loc}</loc>\n${alts}\n    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/"/>\n    <changefreq>weekly</changefreq>\n  </url>`;
}
function sitemap() {
  const calcSlug = (l) => SITE + '/' + l + '/' + i18n[l].slug + '/';
  const legalSlug = (l) => SITE + '/' + l + '/' + legal[l].slug + '/';
  const entries = [];
  entries.push(`  <url>\n    <loc>${SITE}/</loc>\n    <changefreq>weekly</changefreq>\n  </url>`);
  cfg.languages.forEach((l) => entries.push(urlEntry(calcSlug(l), calcSlug)));
  cfg.languages.forEach((l) => entries.push(urlEntry(legalSlug(l), legalSlug)));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join('\n')}\n</urlset>\n`;
}
function robots() {
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`;
}
function manifest() {
  return JSON.stringify({
    name: cfg.siteName + ' — Pokémon Champions Damage Calculator',
    short_name: cfg.siteName, start_url: '/', display: 'standalone',
    background_color: '#0f1220', theme_color: '#0f1220',
    icons: [{ src: '/assets/favicon.svg', sizes: 'any', type: 'image/svg+xml' }]
  });
}
function faviconSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#ffcb05" stroke="#000" stroke-width="4"/><rect x="2" y="28" width="60" height="8" fill="#000"/><circle cx="32" cy="32" r="8" fill="#fff" stroke="#000" stroke-width="4"/></svg>`;
}

// --- build ---
console.log('Building site -> dist/');
rmrf(DIST);

// pages
cfg.languages.forEach((l) => {
  writeFile(path.join(DIST, l, i18n[l].slug, 'index.html'), pageHTML(l));
  console.log('  /' + l + '/' + i18n[l].slug + '/');
  writeFile(path.join(DIST, l, legal[l].slug, 'index.html'), legalHTML(l));
  console.log('  /' + l + '/' + legal[l].slug + '/');
});
writeFile(path.join(DIST, 'index.html'), rootHTML());

// assets
['engine.js', 'app.js'].forEach((f) => cp(path.join(SRC, 'assets/js', f), path.join(DIST, 'assets/js', f)));
cp(path.join(SRC, 'assets/css/styles.css'), path.join(DIST, 'assets/css/styles.css'));
writeFile(path.join(DIST, 'assets/favicon.svg'), faviconSVG());

// og images (generated by build-og.js)
const OGDIR = path.join(SRC, 'assets/og');
if (fs.existsSync(OGDIR)) {
  fs.readdirSync(OGDIR).forEach((f) => cp(path.join(OGDIR, f), path.join(DIST, 'assets/og', f)));
}

// data
fs.readdirSync(path.join(ROOT, 'data')).forEach((f) => cp(path.join(ROOT, 'data', f), path.join(DIST, 'data', f)));

// seo files
writeFile(path.join(DIST, 'sitemap.xml'), sitemap());
writeFile(path.join(DIST, 'robots.txt'), robots());
writeFile(path.join(DIST, 'manifest.webmanifest'), manifest());
writeFile(path.join(DIST, '.nojekyll'), '');

console.log('Done. Site at dist/ — ' + cfg.languages.length + ' languages.');
