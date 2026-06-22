/*
 * test-engine.js
 * Validates the Champions damage engine against @smogon/calc (the de-facto
 * reference used by Pokémon Showdown) AND against hand-computed stat values.
 *
 * Strategy: for each scenario we build the matchup in @smogon/calc, read its
 * 16 damage rolls, then feed @smogon/calc's OWN final stats into our engine
 * so the stat computation is not a confounding variable — we are testing the
 * damage formula's rounding chain. Separately we unit-test computeStats().
 *
 * Run: node scripts/test-engine.js
 */
const calc = require('@smogon/calc');
const { Generations, Pokemon, Move, Field } = calc;
const calculate = calc.calculate;
const gen = Generations.get(9);

const engine = require('../src/assets/js/engine.js');
const typechart = require('../data/typechart.json');
const movesData = require('../data/moves.json');
engine.setTypeChart(typechart);

const toID = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');

let pass = 0, fail = 0;
const failures = [];

function arr(d) { return Array.isArray(d) ? d : [d]; }

// Map a @smogon/calc Pokemon + Move + Field into our engine inputs, run our
// engine, and compare the 16-roll array against the oracle.
function compareScenario(name, oracle, sAtk, sDef, sMove, sField, opts) {
  opts = opts || {};
  const expected = arr(oracle.damage);
  // pad oracle damage to 16 if it returns a single number
  let exp16 = expected;
  if (expected.length === 1) exp16 = new Array(16).fill(expected[0]);

  const moveId = toID(sMove.name);
  const md = movesData[moveId] || {};
  const move = {
    id: moveId,
    name: sMove.name,
    type: sMove.type,
    category: sMove.category,
    basePower: sMove.bp,
    flags: md.flags || {},
    secondary: md.secondary
  };

  const att = {
    speciesId: toID(sAtk.name),
    stats: { hp: sAtk.stats.hp, atk: sAtk.stats.atk, def: sAtk.stats.def,
             spa: sAtk.stats.spa, spd: sAtk.stats.spd, spe: sAtk.stats.spe },
    types: sAtk.teraType && sAtk.teraType !== '???' ? sAtk.types : sAtk.types.slice(),
    boosts: sAtk.boosts || {},
    ability: toID(sAtk.ability || ''),
    item: toID(sAtk.item || ''),
    status: sAtk.status ? toID(sAtk.status) : null,
    teraType: (sAtk.teraType && sAtk.teraType !== '???') ? sAtk.teraType : null
  };
  const def = {
    speciesId: toID(sDef.name),
    stats: { hp: sDef.stats.hp, atk: sDef.stats.atk, def: sDef.stats.def,
             spa: sDef.stats.spa, spd: sDef.stats.spd, spe: sDef.stats.spe },
    types: sDef.types.slice(),
    boosts: sDef.boosts || {},
    ability: toID(sDef.ability || ''),
    item: toID(sDef.item || ''),
    status: sDef.status ? toID(sDef.status) : null,
    curHP: sDef.curHP ? sDef.curHP() : undefined
  };

  const f = {
    gameType: sField.gameType === 'Doubles' ? 'doubles' : 'singles',
    spread: opts.spread || false,
    weather: mapWeather(sField.weather),
    terrain: mapTerrain(sField.terrain),
    isCrit: !!sField.isCritical,
    helpingHand: !!(sField.attackerSide && sField.attackerSide.isHelpingHand),
    friendGuard: !!(sField.defenderSide && sField.defenderSide.isFriendGuard),
    reflect: !!(sField.defenderSide && sField.defenderSide.isReflect),
    lightScreen: !!(sField.defenderSide && sField.defenderSide.isLightScreen),
    auroraVeil: !!(sField.defenderSide && sField.defenderSide.isAuroraVeil)
  };

  const got = engine.calculate(att, def, move, f).damage;
  const ok = got.length === exp16.length && got.every((v, i) => v === exp16[i]);
  if (ok) { pass++; }
  else {
    fail++;
    failures.push({ name, expected: exp16, got });
  }
}

function mapWeather(w) {
  if (!w) return null;
  if (/Rain|Heavy Rain/.test(w)) return 'rain';
  if (/Sun|Harsh/.test(w)) return 'sun';
  if (/Sand/.test(w)) return 'sand';
  if (/Snow|Hail/.test(w)) return 'snow';
  return null;
}
function mapTerrain(t) {
  if (!t) return null;
  return t.replace(/ Terrain/, '').toLowerCase();
}

function P(name, opts) { return new Pokemon(gen, name, Object.assign({ level: 50 }, opts)); }
function M(name) { return new Move(gen, name); }

function run(name, atkName, atkOpts, defName, defOpts, moveName, fieldOpts, cmpOpts) {
  const a = P(atkName, atkOpts), d = P(defName, defOpts), m = M(moveName);
  const field = new Field(fieldOpts || {});
  const oracle = calculate(gen, a, d, m, field);
  compareScenario(name, oracle, a, d, m, field, cmpOpts);
}

// ---------------------------------------------------------------------------
// DAMAGE FORMULA SCENARIOS (vs @smogon/calc oracle)
// ---------------------------------------------------------------------------
const neutral = { ability: 'Pressure' }; // Pressure doesn't affect damage

// 1. basic neutral STAB
run('STAB neutral: Garchomp Dragon Claw -> Salamence',
  'Garchomp', { nature: 'Adamant', evs: { atk: 252 }, ability: 'Sand Veil' },
  'Salamence', { nature: 'Bold', evs: { hp: 252, def: 252 }, ability: 'Intimidate' },
  'Dragon Claw', {});

// 2. super effective + STAB
run('SE + STAB: Garchomp Earthquake -> Heatran',
  'Garchomp', { nature: 'Adamant', evs: { atk: 252 }, ability: 'Rough Skin' },
  'Heatran', { nature: 'Calm', evs: { hp: 252, spd: 252 }, ability: 'Flash Fire' },
  'Earthquake', {});

// 3. resisted
run('Resisted: Pikachu Thunderbolt -> Garchomp (Ground resists? no, immune-ish via 0.5*?)',
  'Pikachu', { nature: 'Modest', evs: { spa: 252 }, ability: 'Static' },
  'Gyarados', { nature: 'Careful', evs: { hp: 252, spd: 252 }, ability: 'Intimidate' },
  'Thunderbolt', {});

// 4. spread move in doubles (0.75)
run('Spread doubles: Landorus EQ spread -> Tyranitar',
  'Landorus-Therian', { nature: 'Adamant', evs: { atk: 252 }, ability: 'Intimidate' },
  'Tyranitar', { nature: 'Careful', evs: { hp: 252, spd: 252 }, ability: 'Sand Stream' },
  'Earthquake', { gameType: 'Doubles' }, { spread: true });

// 5. rain-boosted Water
run('Rain Water: Kingdra Surf -> Garchomp',
  'Kingdra', { nature: 'Modest', evs: { spa: 252 }, ability: 'Swift Swim' },
  'Garchomp', { nature: 'Jolly', evs: { hp: 4, spe: 252 }, ability: 'Rough Skin' },
  'Surf', { weather: 'Rain' });

// 6. sun-weakened Water + sun-boosted nothing
run('Sun weak Water: Blastoise Surf -> Charizard',
  'Blastoise', { nature: 'Modest', evs: { spa: 252 }, ability: 'Torrent' },
  'Charizard', { nature: 'Timid', evs: { hp: 4, spe: 252 }, ability: 'Blaze' },
  'Surf', { weather: 'Sun' });

// 7. critical hit
run('Crit: Garchomp Earthquake -> Heatran (crit)',
  'Garchomp', { nature: 'Adamant', evs: { atk: 252 }, ability: 'Rough Skin' },
  'Heatran', { nature: 'Bold', evs: { hp: 252, def: 252 }, ability: 'Flash Fire' },
  'Earthquake', { isCritical: true });

// 8. Life Orb
run('Life Orb: Garchomp Earthquake -> Heatran',
  'Garchomp', { nature: 'Adamant', evs: { atk: 252 }, item: 'Life Orb', ability: 'Rough Skin' },
  'Heatran', { nature: 'Calm', evs: { hp: 252, spd: 252 }, ability: 'Flash Fire' },
  'Earthquake', {});

// 9. Choice Band
run('Choice Band: Garchomp Dragon Claw -> Salamence',
  'Garchomp', { nature: 'Adamant', evs: { atk: 252 }, item: 'Choice Band', ability: 'Rough Skin' },
  'Salamence', { nature: 'Bold', evs: { hp: 252, def: 252 }, ability: 'Intimidate' },
  'Dragon Claw', {});

// 10. Light Screen singles
run('Light Screen: Pikachu Thunderbolt -> Snorlax',
  'Pikachu', { nature: 'Modest', evs: { spa: 252 }, ability: 'Static' },
  'Snorlax', { nature: 'Careful', evs: { hp: 252, spd: 252 }, ability: 'Thick Fat' },
  'Thunderbolt', { defenderSide: { isLightScreen: true } });

// 11. Reflect doubles (0.667)
run('Reflect doubles: Garchomp EQ -> Heatran',
  'Garchomp', { nature: 'Adamant', evs: { atk: 252 }, ability: 'Rough Skin' },
  'Heatran', { nature: 'Calm', evs: { hp: 252, spd: 252 }, ability: 'Flash Fire' },
  'Earthquake', { gameType: 'Doubles', defenderSide: { isReflect: true } }, { spread: true });

// 12. burn halves physical
run('Burn: Garchomp(burned) Earthquake -> Heatran',
  'Garchomp', { nature: 'Adamant', evs: { atk: 252 }, status: 'brn', ability: 'Rough Skin' },
  'Heatran', { nature: 'Calm', evs: { hp: 252, spd: 252 }, ability: 'Flash Fire' },
  'Earthquake', {});

// 13. +2 attack boost
run('+2 Atk: Garchomp Earthquake -> Heatran',
  'Garchomp', { nature: 'Adamant', evs: { atk: 252 }, boosts: { atk: 2 }, ability: 'Rough Skin' },
  'Heatran', { nature: 'Calm', evs: { hp: 252, spd: 252 }, ability: 'Flash Fire' },
  'Earthquake', {});

// 14. Adaptability STAB 2x
run('Adaptability: Dragapult(Adapt) Dragon Darts -> Salamence',
  'Dragapult', { nature: 'Jolly', evs: { atk: 252 }, ability: 'Adaptability' },
  'Salamence', { nature: 'Bold', evs: { hp: 252, def: 252 }, ability: 'Intimidate' },
  'Dragon Claw', {});

// 15. Thick Fat (defender halves Fire/Ice)
run('Thick Fat: Charizard Flamethrower -> Snorlax(Thick Fat)',
  'Charizard', { nature: 'Timid', evs: { spa: 252 }, ability: 'Blaze' },
  'Snorlax', { nature: 'Careful', evs: { hp: 252, spd: 252 }, ability: 'Thick Fat' },
  'Flamethrower', {});

// 16. Multiscale (full HP halves)
run('Multiscale: Garchomp Outrage -> Dragonite(full HP)',
  'Garchomp', { nature: 'Adamant', evs: { atk: 252 }, ability: 'Rough Skin' },
  'Dragonite', { nature: 'Impish', evs: { hp: 252, def: 252 }, ability: 'Multiscale' },
  'Outrage', {});

// 17. Tinted Lens (not very effective doubled)
run('Tinted Lens: Venomoth Bug Buzz -> Heatran(resists? no) -> use vs Aegislash',
  'Venomoth', { nature: 'Modest', evs: { spa: 252 }, ability: 'Tinted Lens' },
  'Gholdengo', { nature: 'Calm', evs: { hp: 252, spd: 252 }, ability: 'Good as Gold' },
  'Bug Buzz', {});

// 18. Assault Vest (defender 1.5 SpD)
run('Assault Vest: Pikachu Thunderbolt -> Tyranitar(AV)',
  'Pikachu', { nature: 'Modest', evs: { spa: 252 }, ability: 'Static' },
  'Tyranitar', { nature: 'Careful', evs: { hp: 252, spd: 252 }, item: 'Assault Vest', ability: 'Sand Stream' },
  'Thunderbolt', {});

// 19. Helping Hand
run('Helping Hand: Garchomp EQ -> Heatran',
  'Garchomp', { nature: 'Adamant', evs: { atk: 252 }, ability: 'Rough Skin' },
  'Heatran', { nature: 'Calm', evs: { hp: 252, spd: 252 }, ability: 'Flash Fire' },
  'Earthquake', { attackerSide: { isHelpingHand: true } });

// 20. Electric Terrain boost
run('Electric Terrain: Pikachu Thunderbolt -> Snorlax',
  'Pikachu', { nature: 'Modest', evs: { spa: 252 }, ability: 'Static' },
  'Snorlax', { nature: 'Careful', evs: { hp: 252, spd: 252 }, ability: 'Immunity' },
  'Thunderbolt', { terrain: 'Electric' });

// ---------------------------------------------------------------------------
// STAT CALC UNIT TESTS (hand-verified canonical values)
// ---------------------------------------------------------------------------
function statTest(name, got, exp) {
  if (got === exp) pass++;
  else { fail++; failures.push({ name, expected: [exp], got: [got] }); }
}
const garStats = engine.computeStats(
  { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 },
  { atk: 32 }, 'adamant');
statTest('Garchomp Atk 32SP Adamant = 200', garStats.atk, 200);
const garHP = engine.computeStats(
  { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 },
  { hp: 32 }, 'adamant');
statTest('Garchomp HP 32SP = 215', garHP.hp, 215);
const garSpe = engine.computeStats(
  { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 },
  { spe: 32 }, 'jolly');
statTest('Garchomp Spe 32SP Jolly = 169', garSpe.spe, 169);
// neutral nature, 0 SP base
const pikaBase = engine.computeStats(
  { hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90 }, {}, 'hardy');
statTest('Pikachu Spe 0SP neutral = 110', pikaBase.spe, 110);
// SP cap: 32 SP == 252 EV (not 256)
statTest('spToEv(32) caps at 252', engine.spToEv(32), 252);
statTest('spToEv(31) = 248', engine.spToEv(31), 248);

// ---------------------------------------------------------------------------
console.log('\n================ ENGINE VALIDATION ================');
console.log('PASS: ' + pass + '   FAIL: ' + fail);
if (failures.length) {
  console.log('\n--- FAILURES ---');
  failures.forEach((f) => {
    console.log('✗ ' + f.name);
    console.log('   expected: [' + f.expected.join(',') + ']');
    console.log('   got:      [' + f.got.join(',') + ']');
  });
  process.exit(1);
} else {
  console.log('✓ All scenarios match the @smogon/calc reference.');
}
