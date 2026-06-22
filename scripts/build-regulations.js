/*
 * build-regulations.js — parse the Pokémon Champions roster (Bulbapedia
 * wikitext in src/data/raw/champions-roster.wiki) into data/regulations.json.
 *
 * Output:
 *   { current, updated, regulations: { "M-B": { name, roster:[ids], legal:[ids] } },
 *     unmapped:[...] }   // ids that exist in the game but not in our Showdown dex
 *
 * roster = every species/forme available in Champions (mapped to our dex).
 * legal  = subset flagged available in the current regular roster (the "Yes" col).
 *
 * Run: node scripts/build-regulations.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const wiki = fs.readFileSync(path.join(ROOT, 'src', 'data', 'raw', 'champions-roster.wiki'), 'utf8');
const dex = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pokemon.json'), 'utf8'));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));

const toID = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const byID = dex; // keyed by showdown id

// map a base name + Bulbapedia form string to a Showdown id (best effort)
function formSuffix(form) {
  if (!form) return '';
  var f = form.toLowerCase();
  if (/primal/.test(f)) return 'primal';
  if (/paldea/.test(f)) {
    if (/combat/.test(f)) return 'paldeacombat';
    if (/blaze/.test(f)) return 'paldeablaze';
    if (/aqua/.test(f)) return 'paldeaaqua';
    return 'paldea';
  }
  if (/mega/.test(f)) {
    if (/\bx\b/.test(f)) return 'megax';   // " X" as a standalone word, not the x in a species name
    if (/\by\b/.test(f)) return 'megay';
    return 'mega';
  }
  if (/alola/.test(f)) return 'alola';
  if (/hisui/.test(f)) return 'hisui';
  if (/galar/.test(f)) return 'galar';
  return '';
}
function resolveId(name, form) {
  var base = toID(name);
  var suf = formSuffix(form);
  if (suf) {
    var combos = [base + suf, base + '-' + suf, base + suf.replace('mega', 'mega')];
    for (var i = 0; i < combos.length; i++) if (byID[toID(combos[i])]) return toID(combos[i]);
    return null; // game-only forme (e.g. Champions-exclusive mega) not in our dex
  }
  return byID[base] ? base : null;
}

// only parse the roster + forms sections, not "Untransferable"/Trivia
const cut = wiki.indexOf('==Untransferable');
const text = cut > 0 ? wiki.slice(0, cut) : wiki;
const lines = text.split('\n');

const roster = new Set();
const legal = new Set();
const unmapped = [];

function addRecord(name, form, isLegal) {
  const id = resolveId(name, form);
  if (!id) { unmapped.push(name + (form ? ' ' + form : '')); return; }
  roster.add(id);
  if (isLegal) legal.add(id);
}

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // {{gdex/Champs|dex|Name|...|Yes|version}}  (single-row entries, incl. megas with form=...)
  let m = line.match(/\{\{gdex\/Champs\|([^}]*)\}\}/);
  if (m) {
    const fields = m[1].split('|');
    const name = fields[1];
    const formField = fields.find((f) => /^form=/.test(f));
    const form = formField ? formField.replace('form=', '') : '';
    // legality flag = the Yes/No field (second to last, version is last)
    const legalField = fields.filter((f) => /^(Yes|No)$/.test(f)).pop();
    addRecord(name, form, legalField !== 'No');
    continue;
  }

  // {{MSP/Champs|dex|Name|form=-X}} (multi-form rows); legality is on a nearby line
  m = line.match(/\{\{MSP\/Champs\|[^|]*\|([^|}]*)(?:\|form=([^|}]*))?\}\}/);
  if (m) {
    const name = m[1];
    const form = m[2] || '';
    // look ahead up to 6 lines for the "| Yes/No" cell
    let isLegal = true;
    for (let j = i + 1; j < Math.min(i + 7, lines.length); j++) {
      const lm = lines[j].match(/^\|\s*(?:style="[^"]*"\s*\|\s*)?(Yes|No)\s*$/);
      if (lm) { isLegal = lm[1] !== 'No'; break; }
      if (/MSP\/Champs|gdex\/Champs/.test(lines[j])) break;
    }
    addRecord(name, form, isLegal);
    continue;
  }
}

const out = {
  current: cfg.regulation || 'M-B',
  source: 'Bulbapedia — List of Pokémon in Pokémon Champions',
  regulations: {}
};
out.regulations[cfg.regulation || 'M-B'] = {
  name: 'Regulation ' + (cfg.regulation || 'M-B'),
  roster: Array.from(roster).sort(),
  legal: Array.from(legal).sort()
};

fs.writeFileSync(path.join(ROOT, 'data', 'regulations.json'), JSON.stringify(out));
console.log('regulations.json written:');
console.log('  roster (in game, mapped to our dex): ' + roster.size);
console.log('  legal in ' + out.current + ': ' + legal.size);
console.log('  unmapped (game-only formes not in Showdown dex): ' + unmapped.length);
if (unmapped.length) console.log('   e.g. ' + unmapped.slice(0, 12).join(', '));
