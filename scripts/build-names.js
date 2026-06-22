/*
 * build-names.js — build localized display-name maps per language.
 * Source: PokeAPI/veekun CSVs (data/v2/csv) in src/data/raw/csv.
 * Output: data/names-<lang>.json = { pokemon, move, item, ability, type, nature }
 *   each keyed by toID(English name) -> localized name.
 * The app looks names up by toID(Showdown English name) and falls back to
 * English when a localized name is missing.
 *
 * Run: node scripts/build-names.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CSV = path.join(ROOT, 'src', 'data', 'raw', 'csv');
const OUT = path.join(ROOT, 'data');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));

// PokeAPI language ids
const LANG_ID = { es: 7, fr: 5, it: 8, pt: 13 };
const EN = 9;

const toID = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

// minimal RFC-ish CSV parser (handles quoted fields with commas/quotes)
function parseCSV(text) {
  const rows = []; let row = [], field = '', i = 0, q = false;
  while (i < text.length) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
    i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Build { id -> { langId -> name } } then key by toID(English name)
function buildMap(file, idCol) {
  const rows = parseCSV(fs.readFileSync(path.join(CSV, file), 'utf8'));
  const header = rows[0];
  const ci = (n) => header.indexOf(n);
  const idIdx = ci(idCol), langIdx = ci('local_language_id'), nameIdx = ci('name');
  const byId = {};
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]; if (!row || row.length <= nameIdx) continue;
    const id = row[idIdx], lang = parseInt(row[langIdx], 10), name = row[nameIdx];
    if (!byId[id]) byId[id] = {};
    byId[id][lang] = name;
  }
  // produce per-language: toID(enName) -> localizedName
  const out = {}; cfg.languages.forEach((l) => { out[l] = {}; });
  Object.values(byId).forEach((names) => {
    const en = names[EN]; if (!en) return;
    const key = toID(en);
    cfg.languages.forEach((l) => {
      const local = names[LANG_ID[l]];
      if (local && local !== en) out[l][key] = local;
    });
  });
  return out;
}

console.log('Building localized name maps…');
const sources = {
  pokemon: ['pokemon_species_names.csv', 'pokemon_species_id'],
  move: ['move_names.csv', 'move_id'],
  item: ['item_names.csv', 'item_id'],
  ability: ['ability_names.csv', 'ability_id'],
  type: ['type_names.csv', 'type_id'],
  nature: ['nature_names.csv', 'nature_id']
};

const perLang = {}; cfg.languages.forEach((l) => { perLang[l] = {}; });
for (const [kind, [file, idCol]] of Object.entries(sources)) {
  const m = buildMap(file, idCol);
  cfg.languages.forEach((l) => { perLang[l][kind] = m[l]; });
}

// Fallback: PokeAPI lacks pt-br type names — fill them with community-standard PT-BR.
const PT_TYPES = {
  normal: 'Normal', fire: 'Fogo', water: 'Água', electric: 'Elétrico', grass: 'Planta',
  ice: 'Gelo', fighting: 'Lutador', poison: 'Veneno', ground: 'Terra', flying: 'Voador',
  psychic: 'Psíquico', bug: 'Inseto', rock: 'Pedra', ghost: 'Fantasma', dragon: 'Dragão',
  dark: 'Sombrio', steel: 'Aço', fairy: 'Fada'
};
if (perLang.pt) {
  perLang.pt.type = Object.assign({}, PT_TYPES, perLang.pt.type);
}

cfg.languages.forEach((l) => {
  const counts = Object.fromEntries(Object.entries(perLang[l]).map(([k, v]) => [k, Object.keys(v).length]));
  fs.writeFileSync(path.join(OUT, 'names-' + l + '.json'), JSON.stringify(perLang[l]));
  const kb = (fs.statSync(path.join(OUT, 'names-' + l + '.json')).size / 1024).toFixed(1);
  console.log('  names-' + l + '.json -> ' + kb + ' KB  ' + JSON.stringify(counts));
});
console.log('Done.');
