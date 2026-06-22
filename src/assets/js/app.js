/* Champions Damage Calculator — UI controller (no framework) */
(function () {
  'use strict';
  var E = window.ChampionsEngine;
  var T = window.I18N;                 // injected per-page strings
  var LANG = window.LANG || 'es';
  var DATA = {};                       // loaded JSON
  var STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  var TYPE_COLORS = {
    Normal:'#9099a1',Fire:'#ff6b3d',Water:'#4d8fef',Electric:'#f7cf3a',Grass:'#5dbd5a',
    Ice:'#73cec0',Fighting:'#e0395a',Poison:'#a45dc4',Ground:'#dcb14a',Flying:'#8fa9f0',
    Psychic:'#ff6f97',Bug:'#9bbb2e',Rock:'#c7b67c',Ghost:'#6a6ab8',Dragon:'#5a72e0',
    Dark:'#5a5366',Steel:'#8ba9bd',Fairy:'#ef9bd6'
  };

  function $(s, r) { return (r || document).querySelector(s); }
  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (html != null) e.innerHTML = html;
    return e;
  }
  function toID(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,''); }

  // localized display name (falls back to the English name when none exists)
  function localName(kind, english) {
    var n = DATA.names && DATA.names[kind];
    if (!n) return english;
    return n[toID(english)] || english;
  }
  // localized name for a species, handling formes (e.g. "Charizard-Mega-X")
  function pkmnName(p) {
    var direct = localName('pokemon', p.name);
    if (direct !== p.name) return direct;
    if (p.baseSpecies && p.baseSpecies !== p.name) {
      var baseLocal = localName('pokemon', p.baseSpecies);
      if (baseLocal !== p.baseSpecies) return p.name.replace(p.baseSpecies, baseLocal);
    }
    return p.name;
  }
  function typeName(t) { return localName('type', t); }

  // ---- per-side UI state ----
  function newSide(role) {
    return { role: role, id: null, nature: 'hardy', ability: '', item: '', _champOnly: true,
      sp: {hp:0,atk:0,def:0,spa:0,spd:0,spe:0},
      boosts: {atk:0,def:0,spa:0,spd:0,spe:0}, status: 'none', tera: '', curHP: null };
  }
  var state = {
    attacker: newSide('attacker'), defender: newSide('defender'), move: null,
    field: { format:'doubles', spread:false, isCrit:false, helpingHand:false,
      reflect:false, lightScreen:false, auroraVeil:false, friendGuard:false,
      weather:'none', terrain:'none' }
  };

  // ---------------------------------------------------------------- load
  function loadData() {
    var base = window.DATA_BASE || '/data/';
    var files = ['pokemon','moves','abilities','items','natures','typechart','meta'];
    var all = files.concat(['names-' + LANG, 'regulations']);
    return Promise.all(all.map(function (f) {
      return fetch(base + f + '.json').then(function (r) { return r.json(); }).catch(function () { return {}; });
    })).then(function (res) {
      files.forEach(function (f, i) { DATA[f] = res[i]; });
      DATA.names = res[files.length] || {};
      DATA.regulations = res[files.length + 1] || {};
      // build the set of Champions-legal species ids for the current regulation
      DATA.championsSet = null;
      var reg = DATA.regulations.regulations && DATA.regulations.regulations[DATA.regulations.current];
      if (reg && reg.roster) DATA.championsSet = new Set(reg.roster);
      E.setTypeChart(DATA.typechart);
      DATA.pokemonList = Object.values(DATA.pokemon).sort(function (a, b) {
        return a.name.localeCompare(b.name);
      });
      DATA.moveList = Object.values(DATA.moves)
        .filter(function (m) { return m.cat !== 'Status'; })
        .sort(function (a, b) { return a.name.localeCompare(b.name); });
      DATA.itemList = Object.keys(DATA.items).map(function (id) {
        return { id: id, name: DATA.items[id] };
      }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    });
  }

  // ------------------------------------------------------- combobox
  function combobox(opts) {
    // opts: { placeholder, getItems(query)->[{id,name,sub,types}], onPick(item), value }
    var wrap = el('div', { class: 'combo' });
    var input = el('input', { type: 'search', placeholder: opts.placeholder, autocomplete: 'off', spellcheck: 'false' });
    var list = el('div', { class: 'combo-list', role: 'listbox' });
    wrap.appendChild(input); wrap.appendChild(list);
    var active = -1, current = [];

    function render(items) {
      current = items; active = -1; list.innerHTML = '';
      items.slice(0, 60).forEach(function (it, idx) {
        var o = el('div', { class: 'opt', role: 'option' });
        var label = el('span', null, it.name);
        o.appendChild(label);
        if (it.types) {
          var tw = el('span', null, '');
          it.types.forEach(function (t) {
            tw.appendChild(el('span', { class: 'type', style: 'background:' + (TYPE_COLORS[t]||'#888') }, typeName(t)));
          });
          tw.style.marginLeft = 'auto'; tw.style.display = 'flex'; tw.style.gap = '4px';
          o.appendChild(tw);
        } else if (it.sub) { o.appendChild(el('small', null, it.sub)); }
        o.addEventListener('mousedown', function (e) { e.preventDefault(); pick(idx); });
        list.appendChild(o);
      });
      list.classList.toggle('open', items.length > 0);
    }
    function pick(idx) {
      var it = current[idx]; if (!it) return;
      input.value = it.name; list.classList.remove('open');
      opts.onPick(it);
    }
    input.addEventListener('input', function () { render(opts.getItems(input.value)); });
    input.addEventListener('focus', function () { render(opts.getItems(input.value)); });
    input.addEventListener('blur', function () { setTimeout(function(){ list.classList.remove('open'); }, 120); });
    input.addEventListener('keydown', function (e) {
      var optsEls = list.querySelectorAll('.opt');
      if (e.key === 'ArrowDown') { active = Math.min(active + 1, optsEls.length - 1); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); e.preventDefault(); }
      else if (e.key === 'Enter') { if (active >= 0) { pick(active); e.preventDefault(); } return; }
      else return;
      optsEls.forEach(function (o, i) { o.classList.toggle('active', i === active); });
      if (optsEls[active]) optsEls[active].scrollIntoView({ block: 'nearest' });
    });
    wrap.setValue = function (txt) { input.value = txt; };
    return wrap;
  }

  // ------------------------------------------------------- side panel
  function buildSide(side, host) {
    host.innerHTML = '';
    // roster filter (only on attacker host once; we put on both for symmetry)
    var filterWrap = el('div', { class: 'roster-filter' });
    var bAll = el('button', { type:'button', 'aria-pressed': side._champOnly ? 'false':'true' }, T.ui.showAll);
    var bChamp = el('button', { type:'button', 'aria-pressed': side._champOnly ? 'true':'false' }, T.ui.championsOnly);
    bAll.onclick = function(){ side._champOnly=false; bAll.setAttribute('aria-pressed','true'); bChamp.setAttribute('aria-pressed','false'); };
    bChamp.onclick = function(){ side._champOnly=true; bChamp.setAttribute('aria-pressed','true'); bAll.setAttribute('aria-pressed','false'); };
    filterWrap.appendChild(bAll); filterWrap.appendChild(bChamp);
    host.appendChild(filterWrap);

    // pokemon combobox
    var cb = combobox({
      placeholder: T.ui.searchPokemon,
      getItems: function (q) {
        q = toID(q);
        var arr = DATA.pokemonList.filter(function (p) {
          if (side._champOnly) {
            if (DATA.championsSet) { if (!DATA.championsSet.has(p.id)) return false; }
            else if (p.evo || p.mega) return false;   // fallback heuristic
          }
          return !q || toID(p.name).indexOf(q) !== -1 || toID(pkmnName(p)).indexOf(q) !== -1;
        });
        return arr.map(function (p) { return { id: p.id, name: pkmnName(p), types: p.types }; });
      },
      onPick: function (it) { setSpecies(side, it.id); }
    });
    side._cb = cb;
    host.appendChild(label(T.ui[side.role]));
    host.appendChild(cb);

    side._detail = el('div');
    host.appendChild(side._detail);
    if (side.id) renderSideDetail(side);
  }

  function label(txt){ return el('label', null, txt); }

  function renderSideDetail(side) {
    var p = DATA.pokemon[side.id];
    var d = side._detail; d.innerHTML = '';
    if (!p) return;

    // types
    var tw = el('div', { class: 'types' });
    p.types.forEach(function (t) { tw.appendChild(el('span', { class:'type', style:'background:'+(TYPE_COLORS[t]||'#888') }, typeName(t))); });
    d.appendChild(tw);

    // move (attacker only)
    if (side.role === 'attacker') {
      d.appendChild(label(T.ui.move));
      var mcb = combobox({
        placeholder: T.ui.selectMove,
        getItems: function (q) {
          q = toID(q);
          return DATA.moveList.filter(function (m) {
            return !q || toID(m.name).indexOf(q) !== -1 || toID(localName('move', m.name)).indexOf(q) !== -1;
          }).map(function (m) { return { id: m.id, name: localName('move', m.name) + ' · ' + m.bp, types: [m.type], _m: m }; });
        },
        onPick: function (it) { state.move = DATA.moves[it.id]; autoSpread(); recalc(); }
      });
      if (state.move) mcb.setValue(localName('move', state.move.name) + ' · ' + state.move.bp);
      d.appendChild(mcb);
    }

    // nature + ability
    var row1 = el('div', { class: 'field-row' });
    row1.appendChild(sel(T.ui.nature, natureOptions(), side.nature, function (v) { side.nature = v; recalc(); }));
    row1.appendChild(sel(T.ui.ability, abilityOptions(p), side.ability, function (v) { side.ability = v; recalc(); }));
    d.appendChild(row1);

    // item + status
    var row2 = el('div', { class: 'field-row' });
    row2.appendChild(sel(T.ui.item, itemOptions(), side.item, function (v) { side.item = v; recalc(); }));
    row2.appendChild(sel(T.ui.status, statusOptions(), side.status, function (v) { side.status = v; recalc(); }));
    d.appendChild(row2);

    // SP sliders
    d.appendChild(buildSP(side, p));

    // advanced: boosts + tera
    var adv = el('details', { class: 'adv' });
    adv.appendChild(el('summary', null, T.ui.boosts + ' · ' + T.ui.teraType));
    var boostStats = side.role === 'attacker' ? ['atk','spa','spe'] : ['def','spd','spe'];
    var brow = el('div', { class:'field-row-3' });
    boostStats.forEach(function (k) {
      brow.appendChild(sel(T.stats[k], boostOptions(), String(side.boosts[k]||0), function (v) { side.boosts[k] = parseInt(v,10); recalc(); }));
    });
    adv.appendChild(brow);
    adv.appendChild(sel(T.ui.teraType, teraOptions(), side.tera, function (v) { side.tera = v; recalc(); }));
    if (side.role === 'defender') {
      adv.appendChild(label(T.ui.currentHP));
      var hpIn = el('input', { type:'number', min:'1', placeholder: 'PS' });
      hpIn.value = side.curHP || '';
      hpIn.addEventListener('input', function(){ side.curHP = hpIn.value ? parseInt(hpIn.value,10) : null; recalc(); });
      adv.appendChild(hpIn);
    }
    d.appendChild(adv);
  }

  function buildSP(side, p) {
    var wrap = el('div', { class: 'sp' });
    var head = el('div', { class:'sp-head' });
    head.appendChild(el('span', null, T.ui.statPoints));
    var rem = el('span', { class:'sp-rem' });
    head.appendChild(rem); wrap.appendChild(head);
    var grid = el('div', { class:'sp-grid' });

    function totalSP(){ return STAT_KEYS.reduce(function(s,k){ return s + (side.sp[k]||0); },0); }
    function updateRem(){
      var t = totalSP();
      rem.innerHTML = T.ui.spRemaining + ': <b>' + (66 - t) + '</b> / 66';
    }
    STAT_KEYS.forEach(function (k) {
      var row = el('div', { class:'sp-row' });
      row.appendChild(el('span', { class:'nm' }, T.stats[k]));
      var range = el('input', { type:'range', min:'0', max:'32', step:'1' });
      range.value = side.sp[k] || 0;
      var finalEl = el('span', { class:'final' });
      var spEl = el('span', { class:'spv' });
      function refresh(){
        var stats = E.computeStats(p.base, side.sp, side.nature);
        finalEl.textContent = stats[k];
        spEl.textContent = (side.sp[k]||0) + ' SP';
      }
      range.addEventListener('input', function(){
        var v = parseInt(range.value,10);
        var others = totalSP() - (side.sp[k]||0);
        if (others + v > 66) { v = 66 - others; range.value = v; }
        side.sp[k] = v; updateRem();
        // refresh all finals (nature affects all)
        grid.querySelectorAll('.sp-row').forEach(function(r,i){
          var sk = STAT_KEYS[i];
          var st = E.computeStats(p.base, side.sp, side.nature);
          r.querySelector('.final').textContent = st[sk];
          r.querySelector('.spv').textContent = (side.sp[sk]||0)+' SP';
        });
        recalc();
      });
      row.appendChild(range); row.appendChild(finalEl); row.appendChild(spEl);
      grid.appendChild(row); refresh();
    });
    wrap.appendChild(grid); updateRem();
    return wrap;
  }

  // ---- option builders ----
  function sel(labelTxt, options, value, onChange) {
    var w = el('div');
    w.appendChild(label(labelTxt));
    var s = el('select');
    options.forEach(function (o) {
      var opt = el('option', { value: o.v }, o.t);
      if (String(o.v) === String(value)) opt.selected = true;
      s.appendChild(opt);
    });
    s.addEventListener('change', function () { onChange(s.value); });
    w.appendChild(s); return w;
  }
  function natureOptions() {
    return Object.keys(DATA.natures).map(function (id) {
      var n = DATA.natures[id]; var suffix = '';
      if (n.plus && n.minus) suffix = ' (+' + T.stats[n.plus] + ' / −' + T.stats[n.minus] + ')';
      return { v: id, t: localName('nature', cap(id)) + suffix };
    });
  }
  function abilityOptions(p) {
    var opts = [{ v:'', t: T.ui.none }];
    (p.ab || []).forEach(function (name) { opts.push({ v: toID(name), t: localName('ability', name) }); });
    return opts;
  }
  function itemOptions() {
    var opts = [{ v:'', t: T.ui.none }];
    DATA.itemList.forEach(function (it) { opts.push({ v: it.id, t: localName('item', it.name) }); });
    return opts;
  }
  function statusOptions() {
    return Object.keys(T.statusOpts).map(function (k) { return { v:k, t: T.statusOpts[k] }; });
  }
  function boostOptions() {
    var a = []; for (var i=6;i>=-6;i--) a.push({ v:String(i), t:(i>0?'+':'')+i }); return a;
  }
  function teraOptions() {
    var a = [{ v:'', t: T.ui.none }];
    DATA.meta.types.forEach(function (t) { a.push({ v:t, t:typeName(t) }); });
    return a;
  }
  function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

  function setSpecies(side, id) {
    side.id = id;
    var p = DATA.pokemon[id];
    // sensible defaults: max offensive + speed
    side.sp = {hp:0,atk:0,def:0,spa:0,spd:0,spe:0};
    if (side.role === 'attacker') {
      var physical = p.base.atk >= p.base.spa;
      side.sp[physical?'atk':'spa'] = 32; side.sp.spe = 32;
      side.nature = physical ? 'adamant' : 'modest';
    } else {
      side.sp.hp = 32; side.sp.def = 32; side.nature = 'bold';
    }
    side.ability = p.ab && p.ab.length ? toID(p.ab[0]) : '';
    side.curHP = null;
    side._cb.setValue(pkmnName(p));
    renderSideDetail(side);
    recalc();
  }

  function autoSpread() {
    // auto-set spread flag when a spread move is picked in doubles
    if (!state.move) return;
    var spread = state.move.target === 'allAdjacentFoes' || state.move.target === 'allAdjacent';
    state.field.spread = state.field.format === 'doubles' && spread;
    var box = $('#f_spread'); if (box) box.checked = state.field.spread;
  }

  // ------------------------------------------------------- field UI
  function buildField(host) {
    host.innerHTML = '';
    var row = el('div', { class:'field-row' });
    row.appendChild(sel(T.ui.format, [
      { v:'doubles', t:T.ui.doubles }, { v:'singles', t:T.ui.singles }
    ], state.field.format, function (v) { state.field.format = v; autoSpread(); recalc(); }));
    row.appendChild(sel(T.ui.weather, weatherOptions(), state.field.weather, function (v){ state.field.weather=v; recalc(); }));
    host.appendChild(row);
    var row2 = el('div', { class:'field-row' });
    row2.appendChild(sel(T.ui.terrain, terrainOptions(), state.field.terrain, function (v){ state.field.terrain=v; recalc(); }));
    host.appendChild(row2);

    var checks = el('div', { class:'checks' });
    [['spread',T.ui.spreadMove],['isCrit',T.ui.criticalHit],['helpingHand',T.ui.helpingHand],
     ['reflect',T.ui.reflect],['lightScreen',T.ui.lightScreen],['auroraVeil',T.ui.auroraVeil],
     ['friendGuard',T.ui.friendGuard]].forEach(function (c) {
      var lab = el('label', { class:'check' });
      var cbx = el('input', { type:'checkbox', id:'f_'+c[0] });
      cbx.checked = !!state.field[c[0]];
      cbx.addEventListener('change', function(){ state.field[c[0]] = cbx.checked; recalc(); });
      lab.appendChild(cbx); lab.appendChild(document.createTextNode(' ' + c[1]));
      checks.appendChild(lab);
    });
    host.appendChild(checks);
  }
  function weatherOptions(){ return Object.keys(T.weatherOpts).map(function(k){return {v:k,t:T.weatherOpts[k]};}); }
  function terrainOptions(){ return Object.keys(T.terrainOpts).map(function(k){return {v:k,t:T.terrainOpts[k]};}); }

  // ------------------------------------------------------- calculate
  function sideToEngine(side) {
    var p = DATA.pokemon[side.id];
    var stats = E.computeStats(p.base, side.sp, side.nature);
    return {
      speciesId: side.id, stats: stats, types: p.types.slice(),
      boosts: side.boosts, ability: side.ability, item: side.item,
      status: side.status === 'none' ? null : side.status,
      teraType: side.tera || null,
      curHP: side.curHP
    };
  }

  function toEngineMove(m) {
    if (!m) return null;
    return { id: m.id, name: m.name, type: m.type, category: m.cat,
      basePower: m.bp, flags: m.flags || {}, secondary: m.secondary, target: m.target };
  }

  function recalc() {
    var out = $('#result'); if (!out) return;
    if (!state.attacker.id || !state.defender.id || !state.move) {
      out.innerHTML = '<p class="skeleton">' + (T.ui.selectPokemon) + ' · ' + T.ui.selectMove + '</p>';
      return;
    }
    var att = sideToEngine(state.attacker);
    var def = sideToEngine(state.defender);
    var f = {
      gameType: state.field.format, spread: state.field.spread,
      weather: state.field.weather === 'none' ? null : state.field.weather,
      terrain: state.field.terrain === 'none' ? null : state.field.terrain,
      isCrit: state.field.isCrit, helpingHand: state.field.helpingHand,
      reflect: state.field.reflect, lightScreen: state.field.lightScreen,
      auroraVeil: state.field.auroraVeil, friendGuard: state.field.friendGuard
    };
    var r = E.calculate(att, def, toEngineMove(state.move), f);
    renderResult(r, att, def);
    saveURL();
  }

  function effLabel(eff) {
    if (eff === 0) return { t: T.effectiveness.x0, c: 'var(--muted)' };
    if (eff >= 4) return { t: T.effectiveness.x4, c: 'var(--good)' };
    if (eff >= 2) return { t: T.effectiveness.x2, c: 'var(--good)' };
    if (eff <= 0.25) return { t: T.effectiveness.x025, c: 'var(--warn)' };
    if (eff < 1) return { t: T.effectiveness.x05, c: 'var(--warn)' };
    return { t: T.effectiveness.x1, c: 'var(--muted)' };
  }

  function renderResult(r, att, def) {
    var out = $('#result');
    var p = DATA.pokemon[state.attacker.id], dp = DATA.pokemon[state.defender.id];
    if (r.eff === 0) {
      out.innerHTML = '<div class="eff" style="color:var(--muted)">' + T.ui.immune + '</div>';
      return;
    }
    var ef = effLabel(r.eff);
    var maxHP = def.stats.hp;
    var minD = r.damage[0], maxD = r.damage[15];
    var minPct = (minD/maxHP*100), maxPct = (maxD/maxHP*100);
    var ko = r.koChance;
    var koTxt = '', koClass = 'bad';
    if (ko) {
      if (ko.text.indexOf('OHKO') !== -1 && ko.chance === 1) { koTxt = T.ko.guaranteedOHKO; koClass='good'; }
      else if (ko.text.indexOf('OHKO') !== -1) { koTxt = T.ko.chanceOHKO.replace('{pct}', (ko.chance*100).toFixed(1).replace(/\.0$/,'')+'%'); koClass='warn'; }
      else { koTxt = T.ko.guaranteedNHKO.replace('{n}', ko.n); koClass = ko.n<=2?'warn':'bad'; }
    }
    var html = '';
    html += '<div class="eff" style="color:'+ef.c+'">'+ef.t+'</div>';
    html += '<div class="headline">'+pkmnName(p)+' → '+pkmnName(dp)+'</div>';
    html += '<div class="range">'+minD+'–'+maxD+' '+T.stats.hp+'  ('+minPct.toFixed(1)+'% – '+maxPct.toFixed(1)+'%)</div>';
    html += '<div class="bar"><span style="width:'+Math.min(100,maxPct)+'%"></span><i class="min" style="left:'+Math.min(100,minPct)+'%;width:2px"></i></div>';
    html += '<div class="ko '+koClass+'">'+koTxt+'</div>';
    html += '<div class="result-actions">'+
      '<button class="btn primary" id="shareBtn">'+T.ui.share+'</button>'+
      '<button class="btn" id="swapBtn2">⇅ '+T.ui.swap+'</button>'+
      '</div>';
    out.innerHTML = html;
    $('#shareBtn').onclick = share;
    $('#swapBtn2').onclick = swapSides;
  }

  // ------------------------------------------------------- share/URL
  function encodeState() {
    var s = state, q = {};
    function side(p, x){ if(!x.id) return; q[p]=x.id; q[p+'n']=x.nature; if(x.ability)q[p+'a']=x.ability; if(x.item)q[p+'i']=x.item;
      q[p+'s']=STAT_KEYS.map(function(k){return x.sp[k];}).join('.');
      var b=['atk','def','spa','spd','spe'].map(function(k){return x.boosts[k]||0;}).join('.'); if(b!=='0.0.0.0.0')q[p+'b']=b;
      if(x.status&&x.status!=='none')q[p+'st']=x.status; if(x.tera)q[p+'t']=x.tera; if(x.curHP)q[p+'h']=x.curHP;
    }
    side('A', s.attacker); side('D', s.defender);
    if (s.move) q.m = s.move.id;
    q.f = s.field.format;
    var flags=['spread','isCrit','helpingHand','reflect','lightScreen','auroraVeil','friendGuard']
      .filter(function(k){return s.field[k];}).join('-'); if(flags)q.x=flags;
    if(s.field.weather!=='none')q.w=s.field.weather;
    if(s.field.terrain!=='none')q.tr=s.field.terrain;
    return q;
  }
  function saveURL() {
    var q = encodeState();
    var qs = Object.keys(q).map(function(k){return k+'='+encodeURIComponent(q[k]);}).join('&');
    history.replaceState(null, '', location.pathname + (qs?'?'+qs:''));
  }
  function decodeURL() {
    var params = new URLSearchParams(location.search);
    if (![...params.keys()].length) return false;
    function side(p, x){
      var id = params.get(p); if(!id||!DATA.pokemon[id]) return;
      x.id=id; x.nature=params.get(p+'n')||'hardy'; x.ability=params.get(p+'a')||''; x.item=params.get(p+'i')||'';
      var sp=params.get(p+'s'); if(sp){ sp.split('.').forEach(function(v,i){ x.sp[STAT_KEYS[i]]=parseInt(v,10)||0; }); }
      var b=params.get(p+'b'); if(b){ ['atk','def','spa','spd','spe'].forEach(function(k,i){ x.boosts[k]=parseInt(b.split('.')[i],10)||0; }); }
      x.status=params.get(p+'st')||'none'; x.tera=params.get(p+'t')||''; var h=params.get(p+'h'); x.curHP=h?parseInt(h,10):null;
    }
    side('A', state.attacker); side('D', state.defender);
    var m=params.get('m'); if(m&&DATA.moves[m]) state.move=DATA.moves[m];
    state.field.format=params.get('f')||'doubles';
    var x=params.get('x'); if(x){ x.split('-').forEach(function(k){ state.field[k]=true; }); }
    state.field.weather=params.get('w')||'none'; state.field.terrain=params.get('tr')||'none';
    return true;
  }
  function share() {
    saveURL();
    var url = location.href;
    if (navigator.share) { navigator.share({ title: document.title, url: url }).catch(function(){}); return; }
    navigator.clipboard.writeText(url).then(function () {
      var b = $('#shareBtn'); if(!b) return; var old=b.textContent; b.textContent=T.ui.copied;
      setTimeout(function(){ b.textContent=old; }, 1600);
    });
  }

  function swapSides() {
    var a = state.attacker, d = state.defender;
    a.role='defender'; d.role='attacker';
    state.attacker = d; state.defender = a;
    buildSide(state.attacker, $('#attacker-host'));
    buildSide(state.defender, $('#defender-host'));
    recalc();
  }

  // ------------------------------------------------------- lang menu
  function initLangMenu() {
    var btn = $('#langBtn'), menu = $('#langMenu');
    if (!btn) return;
    btn.addEventListener('click', function(e){ e.stopPropagation(); menu.classList.toggle('open'); });
    document.addEventListener('click', function(){ menu.classList.remove('open'); });
  }

  // ------------------------------------------------------- boot
  function boot() {
    initLangMenu();
    var res = $('#result'); if (res) res.innerHTML = '<p class="skeleton">…</p>';
    loadData().then(function () {
      buildSide(state.attacker, $('#attacker-host'));
      buildSide(state.defender, $('#defender-host'));
      buildField($('#field-host'));
      if (decodeURL()) {
        // re-render with restored state
        if (state.attacker.id) { state.attacker._cb.setValue(pkmnName(DATA.pokemon[state.attacker.id])); renderSideDetail(state.attacker); }
        if (state.defender.id) { state.defender._cb.setValue(pkmnName(DATA.pokemon[state.defender.id])); renderSideDetail(state.defender); }
        buildField($('#field-host'));
        recalc();
      } else {
        recalc();
      }
    }).catch(function (e) {
      if (res) res.innerHTML = '<p class="skeleton">⚠️ ' + e.message + '</p>';
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
