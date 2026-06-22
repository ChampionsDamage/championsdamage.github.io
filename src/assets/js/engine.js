/*
 * Champions Damage Engine
 * ------------------------------------------------------------------
 * Pure, dependency-free implementation of the Pokémon damage formula
 * adapted to Pokémon Champions (level 50, SP stat system, VGC doubles).
 *
 * Mechanics modelled after the canonical Gen 9 formula used by
 * Pokémon Showdown / @smogon/calc, including the 4096-based fixed-point
 * modifier chain so that the 16 damage rolls (min..max) match a
 * reference calculator exactly.
 *
 * Champions specifics:
 *   - All Pokémon battle at level 50.
 *   - IVs are fixed at 31 (perfect) — there are no IVs to set.
 *   - Training uses Stat Points (SP): 1 SP = 8 EV, max 32 SP per stat
 *     (32 SP = 256 EV, capped to the 252 EV that actually matter),
 *     66 SP total budget per Pokémon.
 *
 * Runs in the browser (attaches to window.ChampionsEngine) and in Node
 * (module.exports) so the same code powers the UI and the test suite.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ChampionsEngine = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // --- fixed-point helpers (4096 = 1.0) ---------------------------------
  function pokeRound(x) {
    // halves round DOWN, matching the cartridge behaviour
    return x % 1 > 0.5 ? Math.ceil(x) : Math.floor(x);
  }
  function applyMod(mod, value) {
    // mod expressed in 4096ths
    return pokeRound((value * mod) / 4096);
  }
  function chainMods(mods) {
    // chain a list of 4096-based modifiers (each rounded to 4096ths)
    var m = 4096;
    for (var i = 0; i < mods.length; i++) {
      if (mods[i] !== 4096) m = ((m * mods[i] + 2048) >> 12);
    }
    return m;
  }

  // --- the 25 natures (stable, never change) ----------------------------
  // plus = stat raised (+10%), minus = stat lowered (-10%)
  var NATURES = {
    hardy:   { plus: null,  minus: null },
    lonely:  { plus: 'atk', minus: 'def' },
    brave:   { plus: 'atk', minus: 'spe' },
    adamant: { plus: 'atk', minus: 'spa' },
    naughty: { plus: 'atk', minus: 'spd' },
    bold:    { plus: 'def', minus: 'atk' },
    docile:  { plus: null,  minus: null },
    relaxed: { plus: 'def', minus: 'spe' },
    impish:  { plus: 'def', minus: 'spa' },
    lax:     { plus: 'def', minus: 'spd' },
    timid:   { plus: 'spe', minus: 'atk' },
    hasty:   { plus: 'spe', minus: 'def' },
    serious: { plus: null,  minus: null },
    jolly:   { plus: 'spe', minus: 'spa' },
    naive:   { plus: 'spe', minus: 'spd' },
    modest:  { plus: 'spa', minus: 'atk' },
    mild:    { plus: 'spa', minus: 'def' },
    quiet:   { plus: 'spa', minus: 'spe' },
    bashful: { plus: null,  minus: null },
    rash:    { plus: 'spa', minus: 'spd' },
    calm:    { plus: 'spd', minus: 'atk' },
    gentle:  { plus: 'spd', minus: 'def' },
    sassy:   { plus: 'spd', minus: 'spe' },
    careful: { plus: 'spd', minus: 'spa' },
    quirky:  { plus: null,  minus: null }
  };

  // SP -> EV. 1 SP = 8 EV; the stat formula only ever uses up to 252 EV.
  function spToEv(sp) {
    return Math.min(252, (sp || 0) * 8);
  }

  // Level-50 stat calculation (IV fixed at 31).
  function calcHP(base, sp, iv) {
    if (base === 1) return 1; // Shedinja-style
    iv = iv == null ? 31 : iv;
    var ev = spToEv(sp);
    return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * 50) / 100) + 50 + 10;
  }
  function calcStat(base, sp, natureMod, iv) {
    iv = iv == null ? 31 : iv;
    var ev = spToEv(sp);
    var n = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * 50) / 100) + 5;
    if (natureMod === 'plus') return Math.floor(n * 1.1);
    if (natureMod === 'minus') return Math.floor(n * 0.9);
    return n;
  }
  function natureModFor(natureId, stat) {
    var n = NATURES[natureId] || NATURES.hardy;
    if (n.plus === stat) return 'plus';
    if (n.minus === stat) return 'minus';
    return null;
  }
  // Compute all 6 final stats from base stats + an SP spread + nature.
  function computeStats(baseStats, spread, natureId) {
    spread = spread || {};
    return {
      hp:  calcHP(baseStats.hp, spread.hp),
      atk: calcStat(baseStats.atk, spread.atk, natureModFor(natureId, 'atk')),
      def: calcStat(baseStats.def, spread.def, natureModFor(natureId, 'def')),
      spa: calcStat(baseStats.spa, spread.spa, natureModFor(natureId, 'spa')),
      spd: calcStat(baseStats.spd, spread.spd, natureModFor(natureId, 'spd')),
      spe: calcStat(baseStats.spe, spread.spe, natureModFor(natureId, 'spe'))
    };
  }

  // stat-stage (boost/drop) multiplier, -6..+6
  function boostMultiplier(stage) {
    stage = Math.max(-6, Math.min(6, stage || 0));
    return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
  }

  // --- type chart ------------------------------------------------------
  // effChart[attackingType][defendingType] = 0 | 0.5 | 1 | 2
  // Built from Showdown's damageTaken encoding by the data pipeline and
  // injected here; a minimal fallback keeps the engine self-contained.
  var TYPE_CHART = null;
  function setTypeChart(chart) { TYPE_CHART = chart; }
  function typeEffectiveness(moveType, defenderTypes) {
    if (!TYPE_CHART || !moveType) return 1;
    var eff = 1;
    for (var i = 0; i < defenderTypes.length; i++) {
      var row = TYPE_CHART[moveType];
      if (!row) continue;
      var f = row[defenderTypes[i]];
      if (f == null) f = 1;
      eff *= f;
    }
    return eff;
  }

  /*
   * calculate(attacker, defender, move, field)
   *
   * attacker/defender: {
   *   stats: {hp,atk,def,spa,spd,spe},  // already computed final stats
   *   types: ['Fire', ...],
   *   boosts: {atk,def,spa,spd,spe},    // -6..+6  (optional)
   *   ability: 'id', item: 'id',        // optional, lowercased ids
   *   status: 'brn'|'par'|... ,         // optional
   *   curHP: number, maxHP: number,     // optional, for Multiscale etc.
   *   teraType: 'Fire'|null             // optional
   * }
   * move: { name, type, basePower, category: 'Physical'|'Special', ...flags }
   * field: {
   *   format: 'singles'|'doubles', spread: bool,
   *   weather: 'sun'|'rain'|'sand'|'snow'|null,
   *   terrain: 'electric'|'grassy'|'psychic'|'misty'|null,
   *   isCrit: bool, helpingHand: bool, friendGuard: bool,
   *   reflect: bool, lightScreen: bool, auroraVeil: bool
   * }
   *
   * returns { damage:[16], minPct, maxPct, eff, desc, koChance }
   */
  function calculate(attacker, defender, move, field) {
    field = field || {};
    var result = { damage: [], minPct: 0, maxPct: 0, eff: 1, koChance: null, notes: [] };

    if (!move || !move.basePower || move.category === 'Status') {
      result.notes.push('no-damage');
      return result;
    }

    var atkTypes = effectiveTypes(attacker);
    var defTypes = effectiveTypes(defender);
    var moveType = move.type;
    var eff = typeEffectiveness(moveType, defTypes);

    // ability-based immunities on the defender
    var immune = abilityImmunity(defender.ability, moveType);
    if (eff === 0 || immune) {
      result.eff = 0;
      result.damage = new Array(16).fill(0);
      result.notes.push(immune ? 'ability-immune' : 'type-immune');
      return result;
    }
    result.eff = eff;

    var isPhysical = move.category === 'Physical';

    // ---- attack & defense stats (with boosts, items, abilities) ----
    var atkStatKey = isPhysical ? 'atk' : 'spa';
    var defStatKey = isPhysical ? 'def' : 'spd';

    var atkStat = attacker.stats[atkStatKey];
    var defStat = defender.stats[defStatKey];

    // stat-stage boosts (a crit ignores the attacker's drops & defender's boosts)
    var atkBoost = (attacker.boosts && attacker.boosts[atkStatKey]) || 0;
    var defBoost = (defender.boosts && defender.boosts[defStatKey]) || 0;
    if (field.isCrit && atkBoost < 0) atkBoost = 0;
    if (field.isCrit && defBoost > 0) defBoost = 0;
    atkStat = Math.floor(atkStat * boostMultiplier(atkBoost));
    defStat = Math.floor(defStat * boostMultiplier(defBoost));

    // attacker stat modifiers (items / abilities, incl. defender abilities that
    // reduce the attacking stat such as Thick Fat — matches @smogon/calc order)
    atkStat = applyMod(chainMods(attackStatMods(attacker, defender, move, field, isPhysical)), atkStat);
    // defender stat modifiers (items / abilities / sand SpD for Rock)
    defStat = applyMod(chainMods(defenseStatMods(defender, move, field, isPhysical)), defStat);

    // ---- base power (with bp modifiers) ----
    var bp = move.basePower;
    bp = applyMod(chainMods(basePowerMods(attacker, defender, move, field)), bp);
    if (bp < 1) bp = 1;

    // ---- base damage ----
    var level = 50;
    var baseDamage = Math.floor(
      Math.floor((Math.floor((2 * level) / 5 + 2) * bp * atkStat) / defStat) / 50
    ) + 2;

    // spread (doubles, move hits 2+ targets)
    if (field.spread) baseDamage = pokeRound(baseDamage * 0.75);

    // weather
    var weatherMod = weatherModifier(field.weather, moveType);
    if (weatherMod !== 4096) baseDamage = applyMod(weatherMod, baseDamage);

    // critical hit
    if (field.isCrit) baseDamage = Math.floor(baseDamage * 1.5);

    // ---- 16 rolls ----
    var stab = stabModifier(attacker, moveType);
    var burnApplies = attacker.status === 'brn' && isPhysical &&
      attacker.ability !== 'guts' && move.id !== 'facade';
    var finalMod = chainMods(finalModifiers(attacker, defender, move, field, eff));

    var rolls = [];
    for (var i = 0; i < 16; i++) {
      var d = Math.floor((baseDamage * (85 + i)) / 100);
      d = applyMod(stab, d);                 // STAB
      d = Math.floor(d * eff);               // type effectiveness
      if (burnApplies) d = Math.floor(d * 0.5);
      d = applyMod(finalMod, d);             // screens, items, abilities…
      if (d < 1) d = 1;
      rolls.push(d);
    }
    result.damage = rolls;

    var maxHP = defender.stats.hp;
    result.maxHP = maxHP;
    result.minPct = +(rolls[0] / maxHP * 100).toFixed(1);
    result.maxPct = +(rolls[15] / maxHP * 100).toFixed(1);
    result.koChance = koChance(rolls, defender);
    return result;
  }

  function effectiveTypes(mon) {
    if (mon.teraType) return [mon.teraType];
    return mon.types || [];
  }

  function abilityImmunity(ability, moveType) {
    if (!ability) return false;
    var map = {
      levitate: 'Ground', voltabsorb: 'Electric', lightningrod: 'Electric',
      motordrive: 'Electric', waterabsorb: 'Water', stormdrain: 'Water',
      dryskin: 'Water', flashfire: 'Fire', sapsipper: 'Grass',
      eartheater: 'Ground', wellbakedbody: 'Fire'
    };
    return map[ability] === moveType;
  }

  function stabModifier(attacker, moveType) {
    var natural = (attacker.types || []).indexOf(moveType) !== -1;
    var teraMatch = attacker.teraType && attacker.teraType === moveType;
    if (!natural && !teraMatch) return 4096; // no STAB
    var adaptability = attacker.ability === 'adaptability';
    // Tera + originally-this-type with Adaptability = 2.25x, etc.
    if (teraMatch && natural) return adaptability ? 9216 : 8192; // 2.25 / 2.0
    if (adaptability) return 8192; // 2.0
    return 6144; // 1.5
  }

  function attackStatMods(attacker, defender, move, field, isPhysical) {
    var mods = [];
    var ab = attacker.ability, it = attacker.item;
    // defender abilities that reduce the attacking stat (applied here, not as a
    // final modifier, to match the cartridge / @smogon/calc rounding order)
    var dAb = defender.ability, mt = move.type;
    if (dAb === 'thickfat' && (mt === 'Fire' || mt === 'Ice')) mods.push(2048);
    if (dAb === 'heatproof' && mt === 'Fire') mods.push(2048);
    if (dAb === 'waterbubble' && mt === 'Fire') mods.push(2048);
    if (dAb === 'purifyingsalt' && mt === 'Ghost') mods.push(2048);
    if (isPhysical) {
      if (ab === 'hugepower' || ab === 'purepower') mods.push(8192);
      if (ab === 'hustle') mods.push(6144);
      if (ab === 'guts' && attacker.status) mods.push(6144);
      if (ab === 'gorillatactics') mods.push(6144);
      if (it === 'choiceband') mods.push(6144);
      if (it === 'thickclub' && /cubone|marowak/.test(attacker.speciesId || '')) mods.push(8192);
    } else {
      if (it === 'choicespecs') mods.push(6144);
      if (ab === 'solarpower' && field.weather === 'sun') mods.push(6144);
    }
    return mods;
  }

  function defenseStatMods(defender, move, field, isPhysical) {
    var mods = [];
    var it = defender.item, ab = defender.ability;
    if (!isPhysical && it === 'assaultvest') mods.push(6144);
    // Rock types gain 1.5x SpD in sandstorm
    if (!isPhysical && field.weather === 'sand' &&
        (defender.types || []).indexOf('Rock') !== -1) mods.push(6144);
    // Ice types gain 1.5x Def in snow
    if (isPhysical && field.weather === 'snow' &&
        (defender.types || []).indexOf('Ice') !== -1) mods.push(6144);
    if (ab === 'marvelscale' && defender.status) mods.push(isPhysical ? 6144 : 4096);
    if (ab === 'furcoat' && isPhysical) mods.push(8192);
    return mods;
  }

  function basePowerMods(attacker, defender, move, field) {
    var mods = [];
    var ab = attacker.ability;
    var moveType = move.type;
    if (field.helpingHand) mods.push(6144); // 1.5x
    if (ab === 'technician' && move.basePower <= 60) mods.push(6144);
    if (ab === 'adaptability') { /* handled in STAB */ }
    if (ab === 'ironfist' && move.flags && move.flags.punch) mods.push(4915);
    if (ab === 'strongjaw' && move.flags && move.flags.bite) mods.push(6144);
    if (ab === 'reckless' && move.flags && move.flags.recoil) mods.push(4915);
    if (ab === 'sheerforce' && move.secondary) mods.push(5325);
    if (ab === 'toughclaws' && move.flags && move.flags.contact) mods.push(5325);
    if (ab === 'sandforce' && field.weather === 'sand' &&
        ['Rock', 'Ground', 'Steel'].indexOf(moveType) !== -1) mods.push(5325);
    if (ab === 'analytic' && field.movesLast) mods.push(5325);
    // terrain boosts (grounded user, matching type)
    var grounded = (attacker.types || []).indexOf('Flying') === -1 &&
      attacker.ability !== 'levitate' && attacker.item !== 'airballoon';
    if (grounded) {
      if (field.terrain === 'electric' && moveType === 'Electric') mods.push(5325);
      if (field.terrain === 'grassy' && moveType === 'Grass') mods.push(5325);
      if (field.terrain === 'psychic' && moveType === 'Psychic') mods.push(5325);
    }
    // muscle/wise glasses etc handled as final mods to match Showdown? Showdown
    // treats Muscle Band / Wise Glasses as bpMods:
    if (attacker.item === 'muscleband' && move.category === 'Physical') mods.push(4505);
    if (attacker.item === 'wiseglasses' && move.category === 'Special') mods.push(4505);
    return mods;
  }

  function weatherModifier(weather, moveType) {
    if (weather === 'rain') {
      if (moveType === 'Water') return 6144;  // 1.5
      if (moveType === 'Fire') return 2048;   // 0.5
    } else if (weather === 'sun') {
      if (moveType === 'Fire') return 6144;
      if (moveType === 'Water') return 2048;
    }
    return 4096;
  }

  function finalModifiers(attacker, defender, move, field, eff) {
    var mods = [];
    var aAb = attacker.ability, aIt = attacker.item;
    var dAb = defender.ability, dIt = defender.item;
    var superEff = eff > 1, notVeryEff = eff < 1;

    // --- screens ---
    if (!field.isCrit && aAb !== 'infiltrator') {
      var screenUp =
        (move.category === 'Physical' && (field.reflect || field.auroraVeil)) ||
        (move.category === 'Special' && (field.lightScreen || field.auroraVeil));
      if (screenUp) mods.push(field.gameType === 'doubles' ? 2732 : 2048);
    }

    // --- defender abilities ---
    var atFull = defender.curHP == null || defender.curHP >= defender.stats.hp;
    if ((dAb === 'multiscale' || dAb === 'shadowshield') && atFull) mods.push(2048);
    if ((dAb === 'filter' || dAb === 'solidrock' || dAb === 'prismarmor') && superEff) mods.push(3072);
    if (dAb === 'fluffy' && move.flags && move.flags.contact) mods.push(2048);
    if (dAb === 'fluffy' && move.type === 'Fire') mods.push(8192);
    if (dAb === 'icescales' && move.category === 'Special') mods.push(2048);
    if (dAb === 'punkrock' && move.flags && move.flags.sound) mods.push(2048);
    if (field.friendGuard) mods.push(3072);

    // --- attacker abilities ---
    if (aAb === 'tintedlens' && notVeryEff) mods.push(8192);
    if (aAb === 'neuroforce' && superEff) mods.push(5120);
    if ((aAb === 'sniper') && field.isCrit) mods.push(6144);
    if (aAb === 'tougclaws') { /* handled in bp */ }

    // --- attacker items ---
    if (aIt === 'lifeorb') mods.push(5324);
    if (aIt === 'expertbelt' && superEff) mods.push(4915);
    if (aIt === 'metronome1') mods.push(4506);

    // --- defender berries (type-resist) ---
    if (superEff && isResistBerry(dIt, move.type)) mods.push(2048);

    return mods;
  }

  function isResistBerry(item, moveType) {
    var berries = {
      occaberry: 'Fire', passhoberry: 'Water', wacanberry: 'Electric',
      rindoberry: 'Grass', yacheberry: 'Ice', chopleberry: 'Fighting',
      kebiaberry: 'Poison', shucaberry: 'Ground', cobaberry: 'Flying',
      payapaberry: 'Psychic', tangaberry: 'Bug', chartiberry: 'Rock',
      kasibberry: 'Ghost', habanberry: 'Dragon', colburberry: 'Dark',
      babiriberry: 'Steel', roseliberry: 'Fairy', chilanberry: 'Normal'
    };
    return berries[item] === moveType;
  }

  // KO probability across the 16 equiprobable rolls.
  function koChance(rolls, defender) {
    var maxHP = defender.stats.hp;
    var curHP = defender.curHP == null ? maxHP : defender.curHP;
    var max = rolls[15];
    if (max === 0) return { text: 'no damage', n: 0, chance: 0 };
    // chance of OHKO
    var koCount = rolls.filter(function (d) { return d >= curHP; }).length;
    if (koCount === 16) return { n: 1, chance: 1, text: 'guaranteed OHKO' };
    if (koCount > 0) return { n: 1, chance: koCount / 16, text: pct(koCount / 16) + ' to OHKO' };
    // how many hits guaranteed (using min roll)
    var n = Math.ceil(curHP / rolls[0]);
    // refine the chance for nHKO using min roll guaranteed
    return { n: n, chance: 1, text: 'guaranteed ' + n + 'HKO' };
  }
  function pct(x) { return (x * 100).toFixed(1).replace(/\.0$/, '') + '%'; }

  return {
    NATURES: NATURES,
    spToEv: spToEv,
    calcHP: calcHP,
    calcStat: calcStat,
    computeStats: computeStats,
    boostMultiplier: boostMultiplier,
    setTypeChart: setTypeChart,
    typeEffectiveness: typeEffectiveness,
    calculate: calculate,
    pokeRound: pokeRound,
    applyMod: applyMod
  };
});
