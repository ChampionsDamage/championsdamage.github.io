/*
 * build-data.js
 * Transforms the canonical Pokémon Showdown datasets (src/data/raw/*)
 * into slim, client-ready JSON in /data:
 *   - pokemon.json   : selectable species (num, name, types, baseStats, abilities, weight)
 *   - moves.json     : damaging + status moves (type, category, power, flags, target)
 *   - typechart.json : effChart[AtkType][DefType] = multiplier
 *   - abilities.json : { id: name }
 *   - items.json     : { id: name }  (subset relevant to damage calc)
 *   - natures.json   : the 25 natures with +/- stats
 *   - meta.json      : type list, build timestamp passed in via argv
 *
 * Run: node scripts/build-data.js
 */
const fs = require('fs');
const path = require('path');

const RAW = path.join(__dirname, '..', 'src', 'data', 'raw');
const OUT = path.join(__dirname, '..', 'data');
fs.mkdirSync(OUT, { recursive: true });

const read = (f) => JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8'));
const write = (f, obj) => {
  fs.writeFileSync(path.join(OUT, f), JSON.stringify(obj));
  console.log('  ' + f, '->', (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(1) + ' KB');
};

const TYPES = ['Normal','Fire','Water','Electric','Grass','Ice','Fighting','Poison',
  'Ground','Flying','Psychic','Bug','Rock','Ghost','Dragon','Dark','Steel','Fairy'];

// --- type chart -------------------------------------------------------
function buildTypeChart() {
  const raw = read('typechart.json'); // keys lowercase; damageTaken sub-keys Capitalized
  const code = { 0: 1, 1: 2, 2: 0.5, 3: 0 };
  const chart = {};
  TYPES.forEach((atk) => { chart[atk] = {}; });
  TYPES.forEach((def) => {
    const entry = raw[def.toLowerCase()];
    if (!entry) return;
    TYPES.forEach((atk) => {
      const v = entry.damageTaken[atk];
      chart[atk][def] = code[v] != null ? code[v] : 1;
    });
  });
  return chart;
}

// --- pokemon ----------------------------------------------------------
function buildPokemon() {
  const dex = read('pokedex.json');
  const out = {};
  for (const id in dex) {
    const p = dex[id];
    if (!p.num || p.num < 1) continue;                 // skip missingno/CAP-negatives
    if (p.isNonstandard === 'CAP' || p.isNonstandard === 'Custom') continue;
    // NOTE: do NOT filter tier==='Illegal' / isNonstandard==='Past'. Showdown flags
    // pre-Gen-9 species (Beedrill, Pidgeot, Mega Evolutions…) that way because they
    // aren't in Scarlet/Violet, but many ARE in Pokémon Champions and their base
    // stats are valid. Legality is defined separately in data/regulations.json.
    if (/-(Gmax|Totem|Starter)$/.test(p.name)) continue;   // cosmetic / irrelevant formes
    out[id] = {
      id: id,
      num: p.num,
      name: p.name,
      types: p.types,
      base: p.baseStats,
      ab: dedupeAbilities(p.abilities),
      w: p.weightkg || 0,
      mega: !!(p.forme && /Mega|Primal/.test(p.forme)) || !!p.requiredItem && /ite$/.test((p.requiredItem||'').toLowerCase()),
      baseSpecies: p.baseSpecies || p.name,
      prevo: p.prevo || null,
      evo: !!p.evos   // can still evolve -> not a final form (excluded from Champions filter)
    };
  }
  return out;
}
function dedupeAbilities(ab) {
  if (!ab) return [];
  const seen = new Set(); const list = [];
  ['0', '1', 'H', 'S'].forEach((k) => {
    if (ab[k] && !seen.has(ab[k])) { seen.add(ab[k]); list.push(ab[k]); }
  });
  return list;
}

// --- moves ------------------------------------------------------------
function buildMoves() {
  const moves = read('moves.json');
  const out = {};
  for (const id in moves) {
    const m = moves[id];
    if (!m.num || m.num < 1) continue;
    if (m.isNonstandard === 'CAP' || m.isNonstandard === 'Custom') continue;
    if (m.isMax || m.isZ) continue;
    if (id === 'hiddenpower' && m.basePower === 0) continue;
    const flags = {};
    if (m.flags) {
      if (m.flags.contact) flags.contact = 1;
      if (m.flags.punch) flags.punch = 1;
      if (m.flags.bite) flags.bite = 1;
      if (m.flags.sound) flags.sound = 1;
      if (m.flags.bullet) flags.bullet = 1;
      if (m.flags.powder) flags.powder = 1;
    }
    if (m.recoil) flags.recoil = 1;
    out[id] = {
      id: id,
      name: m.name,
      type: m.type,
      cat: m.category,            // Physical | Special | Status
      bp: m.basePower || 0,
      acc: m.accuracy === true ? 100 : m.accuracy,
      pri: m.priority || 0,
      target: m.target,           // normal | allAdjacentFoes (spread) | self ...
      flags: flags,
      secondary: !!(m.secondary || m.secondaries) || undefined,
      multihit: m.multihit || undefined,
      drain: m.drain ? 1 : undefined
    };
  }
  return out;
}

// --- abilities & items (id -> display name) ---------------------------
function buildNamed(file, key) {
  const raw = read(file);
  const out = {};
  for (const id in raw) {
    const e = raw[id];
    if (e.isNonstandard === 'CAP' || e.isNonstandard === 'Custom') continue;
    out[id] = e.name;
  }
  return out;
}
function buildItems() {
  const raw = read('items.json');
  const out = {};
  for (const id in raw) {
    const e = raw[id];
    if (e.isNonstandard === 'CAP') continue;
    if (e.isPokeball) continue;
    out[id] = e.name;
  }
  return out;
}

// --- natures ----------------------------------------------------------
function buildNatures() {
  const engine = require('../src/assets/js/engine.js');
  return engine.NATURES;
}

console.log('Building client data…');
const typechart = buildTypeChart();
write('typechart.json', typechart);
const pokemon = buildPokemon();
write('pokemon.json', pokemon);
const moves = buildMoves();
write('moves.json', moves);
write('abilities.json', buildNamed('abilities.json'));
write('items.json', buildItems());
write('natures.json', buildNatures());
write('meta.json', { types: TYPES, species: Object.keys(pokemon).length, moves: Object.keys(moves).length });

console.log('Done. ' + Object.keys(pokemon).length + ' species, ' +
  Object.keys(moves).length + ' moves.');
