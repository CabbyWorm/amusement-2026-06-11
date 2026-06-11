/* ============================================================
   Polyglot Express — puzzle engine
   Deterministically generates a miniature constructed language
   from a seed (phonology, vowel harmony, case, agreement, word
   order, negation), builds a "Rosetta stone" corpus that is
   guaranteed to attest every morpheme a question needs, then
   produces novel translation challenges in both directions.
   Pure logic, no DOM — also runs under Node for testing.
   ============================================================ */
(function (root) {
'use strict';

/* ---------------- seeded RNG ---------------- */
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function Rand(seedStr) {
  const r = mulberry32(xmur3(seedStr)());
  return {
    next: r,
    int: (a, b) => a + Math.floor(r() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    chance: (p) => r() < p,
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    pickN(arr, n) { return this.shuffle(arr).slice(0, n); },
  };
}

/* ---------------- semantic micro-world ---------------- */
const NOUNS = [
  { id: 'man',      sg: 'man',      pl: 'men',       anim: 1 },
  { id: 'woman',    sg: 'woman',    pl: 'women',     anim: 1 },
  { id: 'child',    sg: 'child',    pl: 'children',  anim: 1, port: 1 },
  { id: 'dog',      sg: 'dog',      pl: 'dogs',      anim: 1, port: 1 },
  { id: 'cat',      sg: 'cat',      pl: 'cats',      anim: 1, port: 1 },
  { id: 'bird',     sg: 'bird',     pl: 'birds',     anim: 1, port: 1 },
  { id: 'fish',     sg: 'fish',     pl: 'fish',      anim: 1, food: 1, port: 1 },
  { id: 'wolf',     sg: 'wolf',     pl: 'wolves',    anim: 1 },
  { id: 'horse',    sg: 'horse',    pl: 'horses',    anim: 1 },
  { id: 'bear',     sg: 'bear',     pl: 'bears',     anim: 1 },
  { id: 'hunter',   sg: 'hunter',   pl: 'hunters',   anim: 1 },
  { id: 'king',     sg: 'king',     pl: 'kings',     anim: 1 },
  { id: 'friend',   sg: 'friend',   pl: 'friends',   anim: 1 },
  { id: 'apple',    sg: 'apple',    pl: 'apples',    food: 1, port: 1 },
  { id: 'egg',      sg: 'egg',      pl: 'eggs',      food: 1, port: 1 },
  { id: 'house',    sg: 'house',    pl: 'houses' },
  { id: 'boat',     sg: 'boat',     pl: 'boats' },
  { id: 'river',    sg: 'river',    pl: 'rivers' },
  { id: 'tree',     sg: 'tree',     pl: 'trees' },
  { id: 'stone',    sg: 'stone',    pl: 'stones',    port: 1 },
  { id: 'mountain', sg: 'mountain', pl: 'mountains' },
  { id: 'moon',     sg: 'moon',     pl: 'moons' },
  { id: 'star',     sg: 'star',     pl: 'stars' },
];
const VERBS = [
  { id: 'sleep',  base: 'sleep',  past: 'slept' },
  { id: 'run',    base: 'run',    past: 'ran' },
  { id: 'sing',   base: 'sing',   past: 'sang' },
  { id: 'swim',   base: 'swim',   past: 'swam' },
  { id: 'laugh',  base: 'laugh',  past: 'laughed' },
  { id: 'dance',  base: 'dance',  past: 'danced' },
  { id: 'jump',   base: 'jump',   past: 'jumped' },
  { id: 'see',    base: 'see',    past: 'saw',      tr: 1, obj: 'any' },
  { id: 'eat',    base: 'eat',    past: 'ate',      tr: 1, obj: 'food' },
  { id: 'love',   base: 'love',   past: 'loved',    tr: 1, obj: 'any' },
  { id: 'chase',  base: 'chase',  past: 'chased',   tr: 1, obj: 'anim' },
  { id: 'find',   base: 'find',   past: 'found',    tr: 1, obj: 'any' },
  { id: 'carry',  base: 'carry',  past: 'carried',  tr: 1, obj: 'port' },
  { id: 'watch',  base: 'watch',  past: 'watched',  tr: 1, obj: 'any' },
  { id: 'follow', base: 'follow', past: 'followed', tr: 1, obj: 'anim' },
  { id: 'fear',   base: 'fear',   past: 'feared',   tr: 1, obj: 'any' },
];
const ADJS = ['big', 'small', 'old', 'young', 'black', 'white', 'red', 'happy', 'brave', 'quiet'];

/* ---------------- difficulty tiers ---------------- */
const LEVELS = [null,
  { name: 'Tourist',         nouns: 5, verbs: 3, adjs: 0, corpus: 6,  qs: 4, distract: 3, feats: {} },
  { name: 'Traveler',        nouns: 6, verbs: 4, adjs: 2, corpus: 7,  qs: 5, distract: 4, feats: { acc: 1, adj: 1 } },
  { name: 'Field Linguist',  nouns: 7, verbs: 4, adjs: 2, corpus: 8,  qs: 5, distract: 5, feats: { acc: 1, adj: 1, harmony: 1, fut: 1 } },
  { name: 'Decipherer',      nouns: 8, verbs: 5, adjs: 3, corpus: 9,  qs: 6, distract: 6, feats: { acc: 1, adj: 1, harmony: 1, fut: 1, agr: 1, neg: 1 } },
  { name: 'Oracle of Babel', nouns: 9, verbs: 6, adjs: 3, corpus: 10, qs: 6, distract: 7, feats: { acc: 1, adj: 1, harmony: 1, fut: 1, agr: 1, neg: 1, wild: 1 } },
];

/* ---------------- English morphology ---------------- */
function eng3sg(base) {
  if (/(ch|sh|s|x|z)$/.test(base)) return base + 'es';
  if (/[^aeiou]y$/.test(base)) return base.slice(0, -1) + 'ies';
  return base + 's';
}
function engNP(x) {
  const toks = ['the'];
  if (x.adj) toks.push(x.adj);
  toks.push(x.pl ? x.n.pl : x.n.sg);
  return toks;
}
function engVP(m) {
  const v = m.v, pl = m.s.pl;
  if (m.tense === 'fut') return m.neg ? ['will', 'not', v.base] : ['will', v.base];
  if (m.tense === 'past') return m.neg ? ['did', 'not', v.base] : [v.past];
  if (m.neg) return [pl ? 'do' : 'does', 'not', v.base];
  return [pl ? v.base : eng3sg(v.base)];
}
function renderEnglish(m) {
  let toks = engNP(m.s).concat(engVP(m));
  if (m.o) toks = toks.concat(engNP(m.o));
  return toks;
}

/* ---------------- conlang generation ---------------- */
const FRONT_STYLES = [['e', 'i', 'i'], ['ä', 'ö', 'ü'], ['e', 'ö', 'ü'], ['i', 'e', 'ü']];
const BACK_V = ['a', 'o', 'u'];

function genLanguage(rand, cfg) {
  const feats = Object.assign({ pl: 1, past: 1 }, cfg.feats);
  const wild = !!feats.wild;

  const C_ALL = ['p', 't', 'k', 'b', 'd', 'g', 'm', 'n', 's', 'l', 'r', 'v', 'z', 'h', 'f', 'j', 'w', 'sh', 'ch', 'th', 'ng', 'ts', 'kh'];
  const cons = rand.pickN(C_ALL, rand.int(8, 11));
  const codaPool = cons.filter(c => ['n', 'm', 'r', 'l', 's', 'k', 't', 'sh', 'ng'].includes(c));
  const codas = codaPool.length && rand.chance(0.8) ? rand.pickN(codaPool, Math.min(codaPool.length, rand.int(2, 4))) : [];

  const harmony = !!feats.harmony;
  const frontV = harmony ? rand.pick(FRONT_STYLES) : null;
  const plainV = harmony ? null : rand.pickN(['a', 'e', 'i', 'o', 'u'], rand.int(4, 5));

  function vowel(cls) {
    if (!harmony) return rand.pick(plainV);
    const i = rand.int(0, BACK_V.length - 1);
    return cls === 'f' ? frontV[i] : BACK_V[i];
  }
  function syllable(cls, allowCoda) {
    let s = rand.pick(cons) + vowel(cls);
    if (allowCoda && codas.length && rand.chance(0.3)) s += rand.pick(codas);
    return s;
  }
  const taken = new Set();
  function makeStem(cls) {
    for (let t = 0; t < 200; t++) {
      let w;
      if (rand.chance(0.2)) {
        w = syllable(cls, false) + (codas.length ? rand.pick(codas) : '');
        if (w.length < 3) continue;
      } else {
        w = syllable(cls, false) + syllable(cls, true);
      }
      if (!taken.has(w)) { taken.add(w); return w; }
    }
    // pathological inventory: extend with an extra syllable
    let w = syllable(cls, false) + syllable(cls, false) + syllable(cls, true);
    taken.add(w);
    return w;
  }

  // Harmony: map each back vowel to its front counterpart inside suffixes.
  function toFront(s) {
    return s.replace(/[aou]/g, ch => frontV[BACK_V.indexOf(ch)]);
  }
  const suffixForms = new Set();
  function makeSuffix() {
    for (let t = 0; t < 300; t++) {
      const shape = rand.pick(['VC', 'CV', 'VC', 'CV', 'CVC']);
      let s = '';
      for (const ch of shape) {
        if (ch === 'V') s += harmony ? rand.pick(BACK_V) : rand.pick(plainV);
        else s += (ch === 'C' && s === '' ? rand.pick(cons) : rand.pick(codas.length ? codas : cons));
      }
      const f = harmony ? toFront(s) : s;
      if (!suffixForms.has(s) && !suffixForms.has(f)) {
        suffixForms.add(s); suffixForms.add(f);
        return { b: s, f: f };
      }
    }
    const s = 'a' + rand.pick(cons) + 'u';
    return { b: s, f: harmony ? toFront(s) : s };
  }

  const orderPool = wild ? ['SOV', 'SVO', 'VSO', 'OVS'] : (feats.fut ? ['SOV', 'SVO', 'VSO'] : ['SOV', 'SVO']);
  const L = {
    feats, harmony, frontV,
    order: rand.pick(orderPool),
    adjAfter: feats.adj ? rand.chance(0.45) : false,
    sfx: {
      pl: makeSuffix(),
      acc: feats.acc ? makeSuffix() : null,
      past: makeSuffix(),
      fut: feats.fut ? makeSuffix() : null,
      agr: feats.agr ? makeSuffix() : null,
      neg: null,
    },
    negType: null, negWord: null, negBefore: true,
    stems: {},
    stemCls: {},
  };
  if (feats.neg) {
    L.negType = rand.chance(0.5) ? 'particle' : 'affix';
    if (L.negType === 'particle') {
      L.negWord = makeStem(rand.chance(0.5) ? 'b' : 'f');
      L.negBefore = rand.chance(0.7);
    } else {
      L.sfx.neg = makeSuffix();
    }
  }
  L._makeStem = (id) => {
    const cls = harmony ? (rand.chance(0.5) ? 'b' : 'f') : 'b';
    L.stems[id] = makeStem(cls);
    L.stemCls[id] = cls;
  };
  return L;
}

function sfx(L, suffix, cls) {
  if (!suffix) return '';
  return (L.harmony && cls === 'f') ? suffix.f : suffix.b;
}
function nounForm(L, n, opts) {
  const cls = L.stemCls[n.id];
  let form = L.stems[n.id];
  const gloss = [n.id];
  if (opts.pl) { form += sfx(L, L.sfx.pl, cls); gloss.push('PL'); }
  if (opts.acc && L.sfx.acc) { form += sfx(L, L.sfx.acc, cls); gloss.push('ACC'); }
  return { form, gloss };
}
function verbForm(L, m) {
  const v = m.v, cls = L.stemCls[v.id];
  let form = L.stems[v.id];
  const gloss = [v.id];
  if (m.neg && L.negType === 'affix') { form += sfx(L, L.sfx.neg, cls); gloss.push('NEG'); }
  if (m.tense === 'past') { form += sfx(L, L.sfx.past, cls); gloss.push('PAST'); }
  else if (m.tense === 'fut') { form += sfx(L, L.sfx.fut, cls); gloss.push('FUT'); }
  if (L.sfx.agr && m.s.pl) { form += sfx(L, L.sfx.agr, cls); gloss.push('PL.SUBJ'); }
  return { form, gloss };
}
function conNP(L, x, isObj) {
  const noun = nounForm(L, x.n, { pl: x.pl, acc: isObj });
  const toks = [{ form: noun.form, gloss: noun.gloss, eng: x.pl ? x.n.pl : x.n.sg }];
  if (x.adj) {
    const a = { form: L.stems['adj:' + x.adj], gloss: [x.adj], eng: x.adj };
    L.adjAfter ? toks.push(a) : toks.unshift(a);
  }
  return toks;
}
function renderCon(L, m) {
  const S = conNP(L, m.s, false);
  const O = m.o ? conNP(L, m.o, true) : null;
  const vf = verbForm(L, m);
  let V = [{ form: vf.form, gloss: vf.gloss, eng: m.v.base }];
  if (m.neg && L.negType === 'particle') {
    const negTok = { form: L.negWord, gloss: ['NEG'], eng: 'not' };
    V = L.negBefore ? [negTok].concat(V) : V.concat([negTok]);
  }
  const parts = { S, O, V };
  const toks = [];
  for (const role of L.order) {
    if (role === 'O' && !O) continue;
    toks.push(...parts[role]);
  }
  return toks;
}

/* ---------------- meaning sampling ---------------- */
function meaningKey(m) {
  const np = x => x ? `${x.n.id}.${x.pl ? 1 : 0}.${x.adj || ''}` : '';
  return `${np(m.s)}|${m.v.id}|${m.tense}|${m.neg ? 1 : 0}|${np(m.o)}`;
}
function cloneMeaning(m) {
  return {
    v: m.v, tense: m.tense, neg: m.neg,
    s: { n: m.s.n, pl: m.s.pl, adj: m.s.adj },
    o: m.o ? { n: m.o.n, pl: m.o.pl, adj: m.o.adj } : null,
  };
}
function objPool(lex, v, subjN) {
  return lex.nouns.filter(n => n !== subjN &&
    (v.obj === 'any' || (v.obj === 'anim' && n.anim) ||
     (v.obj === 'food' && n.food) || (v.obj === 'port' && n.port)));
}
function verbUsable(lex, v) {
  if (!v.tr) return true;
  return lex.nouns.some(sn => sn.anim && objPool(lex, v, sn).length > 0);
}
function sampleMeaning(rand, P, force) {
  force = force || {};
  const { lex, tenses, feats } = P;
  let v = force.v || null;
  if (!v && force.tr) v = rand.pick(lex.verbs.filter(x => x.tr && verbUsable(lex, x)));
  if (!v) v = rand.pick(lex.verbs.filter(x => verbUsable(lex, x)));
  const anim = lex.nouns.filter(n => n.anim);
  let sN = force.sN || null;
  if (!sN) {
    const ok = v.tr ? anim.filter(n => objPool(lex, v, n).length) : anim;
    sN = rand.pick(ok);
  }
  const m = {
    v,
    s: { n: sN, pl: force.spl != null ? force.spl : rand.chance(0.35), adj: null },
    o: null,
    tense: force.tense || rand.pick(tenses),
    neg: feats.neg ? (force.neg != null ? force.neg : rand.chance(0.18)) : false,
  };
  if (v.tr) {
    const pool = objPool(lex, v, sN);
    const oN = force.oN && pool.includes(force.oN) ? force.oN : rand.pick(pool);
    m.o = { n: oN, pl: rand.chance(0.3), adj: null };
  }
  if (feats.adj && lex.adjs.length) {
    const want = force.adj != null ? force.adj : rand.chance(0.3);
    if (want) {
      const a = typeof force.adj === 'string' ? force.adj : rand.pick(lex.adjs);
      if (m.o && rand.chance(0.5)) m.o.adj = a; else m.s.adj = a;
    }
  }
  return m;
}

/* ---------------- puzzle assembly ---------------- */
function pickLexicon(rand, cfg, L) {
  const anim = rand.shuffle(NOUNS.filter(n => n.anim));
  const food = rand.shuffle(NOUNS.filter(n => n.food && !n.anim));
  const inan = rand.shuffle(NOUNS.filter(n => !n.anim && !n.food));
  const nAnim = Math.max(3, Math.round(cfg.nouns * 0.6));
  let nouns = anim.slice(0, nAnim);
  const rest = [];
  if (cfg.nouns - nouns.length > 0 && food.length) rest.push(food[0]);
  let k = 0;
  while (nouns.length + rest.length < cfg.nouns) rest.push(inan[k++]);
  nouns = nouns.concat(rest.slice(0, cfg.nouns - nouns.length));

  const tr = rand.shuffle(VERBS.filter(v => v.tr && verbUsable({ nouns }, v)));
  const it = rand.shuffle(VERBS.filter(v => !v.tr));
  const nTr = Math.min(tr.length, Math.max(1, Math.round(cfg.verbs * 0.55)));
  const verbs = tr.slice(0, nTr).concat(it.slice(0, cfg.verbs - nTr));

  // a non-animate noun only ever appears as an object; if no chosen verb
  // can govern it, swap it for a fresh animate noun so it stays attestable
  const spareAnim = anim.slice(nAnim);
  const kept = [];
  for (const n of nouns) {
    if (n.anim || verbs.some(v => v.tr && objPool({ nouns: [n] }, v, null).length)) {
      kept.push(n);
    } else {
      const sub = spareAnim.shift();
      if (sub) kept.push(sub);
    }
  }
  nouns = kept;

  const adjs = rand.pickN(ADJS, cfg.adjs);
  for (const n of nouns) L._makeStem(n.id);
  for (const v of verbs) L._makeStem(v.id);
  for (const a of adjs) L._makeStem('adj:' + a);
  return { nouns, verbs, adjs };
}

// All inflected forms a player could ever meet must be pairwise distinct
// across lexemes, or the language is rejected and regenerated.
function formsCollide(L, lex) {
  const seen = new Map();
  const add = (form, owner) => {
    if (seen.has(form) && seen.get(form) !== owner) return true;
    seen.set(form, owner);
    return false;
  };
  for (const n of lex.nouns) {
    for (const pl of [0, 1]) for (const acc of [0, 1]) {
      if (acc && !L.sfx.acc) continue;
      if (add(nounForm(L, n, { pl, acc }).form, 'n:' + n.id)) return true;
    }
  }
  const tenses = ['pres', 'past'].concat(L.sfx.fut ? ['fut'] : []);
  for (const v of lex.verbs) {
    for (const t of tenses) for (const agr of [0, 1]) for (const ng of [0, 1]) {
      if (agr && !L.sfx.agr) continue;
      if (ng && L.negType !== 'affix') continue;
      const fake = { v, tense: t, neg: !!ng, s: { pl: !!agr } };
      if (add(verbForm(L, fake).form, 'v:' + v.id)) return true;
    }
  }
  for (const a of lex.adjs) if (add(L.stems['adj:' + a], 'a:' + a)) return true;
  if (L.negWord && add(L.negWord, 'neg')) return true;
  return false;
}

function sentenceRecord(L, m) {
  const con = renderCon(L, m);
  const eng = renderEnglish(m);
  return { m, con, eng, conStr: con.map(t => t.form).join(' '), engStr: eng.join(' ') };
}

function buildCorpus(rand, P) {
  const { lex, L, feats, tenses, cfg } = P;
  const out = [];
  const keys = new Set();
  const push = (m) => {
    const rec = sentenceRecord(L, m);
    if (keys.has(rec.conStr)) return false;
    keys.add(rec.conStr);
    out.push(rec);
    return true;
  };
  const pushRetry = (force, tries) => {
    for (let t = 0; t < (tries || 15); t++) {
      if (push(sampleMeaning(rand, P, force))) return true;
    }
    return false;
  };
  const coveredN = () => new Set(out.flatMap(r => [r.m.s.n.id].concat(r.m.o ? [r.m.o.n.id] : [])));
  const anim = lex.nouns.filter(n => n.anim);

  // one sentence per verb, steering toward unused subject and object nouns
  for (const v of rand.shuffle(lex.verbs)) {
    const seen = coveredN();
    const unused = anim.filter(n => !seen.has(n.id) &&
      (!v.tr || objPool(lex, v, n).length));
    const force = { v };
    if (unused.length) force.sN = rand.pick(unused);
    if (v.tr) {
      const oPool = objPool(lex, v, force.sN || null).filter(n => !seen.has(n.id) && n !== force.sN);
      if (oPool.length) force.oN = rand.pick(oPool);
    }
    push(sampleMeaning(rand, P, force));
  }
  // sweep up any noun still unattested
  for (const n of lex.nouns) {
    if (coveredN().has(n.id)) continue;
    if (n.anim) {
      pushRetry({ sN: n });
    } else {
      const vs = lex.verbs.filter(v => v.tr && objPool({ nouns: [n] }, v, null).length);
      if (vs.length) pushRetry({ v: rand.pick(vs), oN: n });
    }
  }
  // every adjective attested at least once
  for (const a of lex.adjs) {
    if (!out.some(r => r.m.s.adj === a || (r.m.o && r.m.o.adj === a))) {
      pushRetry({ adj: a });
    }
  }
  // minimal-pair contrasts: number on the same noun…
  const sg = out.find(r => !r.m.s.pl);
  if (sg) { const c = cloneMeaning(sg.m); c.s.pl = true; push(c); }
  else if (out.length) { const c = cloneMeaning(out[0].m); c.s.pl = false; push(c); }
  // …every tense in the pool, on an already-seen verb
  for (const t of tenses) {
    if (!out.some(r => r.m.tense === t)) {
      const c = cloneMeaning(rand.pick(out).m); c.tense = t; push(c);
    }
  }
  // …same noun in subject and object role, to expose the case suffix
  if (feats.acc) {
    const subjAnims = anim.filter(n => out.some(r => r.m.s.n.id === n.id));
    const target = subjAnims.find(n =>
      !out.some(r => r.m.o && r.m.o.n.id === n.id));
    if (target) {
      const vs = lex.verbs.filter(v => v.tr && objPool(lex, v, null).includes(target) &&
        (v.obj === 'any' || v.obj === 'anim'));
      if (vs.length) push(sampleMeaning(rand, P, { v: rand.pick(vs), oN: target }));
    }
  }
  // …negation attested
  if (feats.neg && !out.some(r => r.m.neg)) {
    const c = cloneMeaning(rand.pick(out).m); c.neg = true; push(c);
  }
  // …a plural subject so agreement is visible
  if (feats.agr && !out.some(r => r.m.s.pl)) {
    const c = cloneMeaning(out[0].m); c.s.pl = true; push(c);
  }
  // pad to the minimum corpus size with fresh sentences
  let guard = 0;
  while (out.length < cfg.corpus && guard++ < 80) push(sampleMeaning(rand, P, {}));
  return { corpus: rand.shuffle(out), keys };
}

/* English is the one language we don't generate, and it has quirks of its
   own — "fish" is its own plural. A prompt is unfair in the English→conlang
   direction if some number flip leaves the English unchanged but alters the
   expected conlang answer: the player then can't deduce the right number. */
function engNumberAmbiguous(L, m) {
  const base = sentenceRecord(L, m);
  const flips = [cloneMeaning(m)];
  flips[0].s.pl = !flips[0].s.pl;
  if (m.o) {
    const f = cloneMeaning(m);
    f.o.pl = !f.o.pl;
    flips.push(f);
  }
  return flips.some((f) => {
    const r = sentenceRecord(L, f);
    return r.engStr === base.engStr && r.conStr !== base.conStr;
  });
}

function buildQuestions(rand, P, corpusKeys) {
  const { feats, cfg, L } = P;
  const forces = [{ tense: 'past' }, { spl: true }, { tr: feats.acc ? true : undefined }];
  if (feats.adj) forces.push({ adj: true });
  if (feats.fut) forces.push({ tense: 'fut' });
  if (feats.neg) forces.push({ neg: true });
  while (forces.length < cfg.qs) forces.push({});
  const plan = rand.shuffle(forces).slice(0, cfg.qs);

  const qs = [];
  const used = new Set();
  let dir = rand.chance(0.5) ? 'c2e' : 'e2c';
  for (const force of plan) {
    let rec = null;
    for (let t = 0; t < 300 && !rec; t++) {
      const f = t < 150 ? force : {}; // relax the constraint if we keep colliding
      const cand = sentenceRecord(L, sampleMeaning(rand, P, f));
      if (corpusKeys.has(cand.conStr) || used.has(cand.conStr)) continue;
      if (dir === 'e2c' && engNumberAmbiguous(L, cand.m)) continue;
      rec = cand;
    }
    if (!rec) continue;
    used.add(rec.conStr);
    rec.dir = dir;
    dir = dir === 'c2e' ? 'e2c' : 'c2e';
    qs.push(rec);
  }
  return qs;
}

/* Distractor tiles: plausible wrong inflections (conlang) or
   wrong forms (English). Never equal to any correct token. */
function buildTiles(rand, P, q) {
  const { L, lex } = P;
  const correct = q.dir === 'c2e' ? q.eng.slice() : q.con.map(t => t.form);
  const correctSet = new Set(correct);
  const cand = new Set();
  if (q.dir === 'c2e') {
    for (const n of lex.nouns) { cand.add(n.sg); cand.add(n.pl); }
    for (const v of lex.verbs) { cand.add(v.base); cand.add(v.past); cand.add(eng3sg(v.base)); }
    for (const a of lex.adjs) cand.add(a);
    ['not', 'will', 'do', 'does', 'did'].forEach(w => cand.add(w));
  } else {
    const fakeVerb = (v, t, agr, ng) =>
      verbForm(L, { v, tense: t, neg: ng, s: { pl: agr } }).form;
    for (const n of lex.nouns) {
      cand.add(nounForm(L, n, { pl: 0, acc: 0 }).form);
      cand.add(nounForm(L, n, { pl: 1, acc: 0 }).form);
      if (L.sfx.acc) {
        cand.add(nounForm(L, n, { pl: 0, acc: 1 }).form);
        cand.add(nounForm(L, n, { pl: 1, acc: 1 }).form);
      }
    }
    const tenses = ['pres', 'past'].concat(L.sfx.fut ? ['fut'] : []);
    for (const v of lex.verbs) for (const t of tenses) {
      cand.add(fakeVerb(v, t, false, false));
      if (L.sfx.agr) cand.add(fakeVerb(v, t, true, false));
      if (L.negType === 'affix') cand.add(fakeVerb(v, t, false, true));
    }
    for (const a of lex.adjs) cand.add(L.stems['adj:' + a]);
    if (L.negWord) cand.add(L.negWord);
  }
  const pool = [...cand].filter(w => !correctSet.has(w));
  const distractors = rand.pickN(pool, Math.min(P.cfg.distract, pool.length));
  let id = 0;
  q.correct = correct;
  q.tiles = rand.shuffle(correct.concat(distractors)).map(t => ({ id: id++, t }));
}

/* ---------------- human-readable dossier ---------------- */
function suffixDesc(L, s) {
  if (!s) return null;
  return L.harmony && s.b !== s.f ? `-${s.b} / -${s.f}` : `-${s.b}`;
}
function grammarNotes(P) {
  const { L, feats } = P;
  const orderName = { SOV: 'Subject–Object–Verb', SVO: 'Subject–Verb–Object', VSO: 'Verb–Subject–Object', OVS: 'Object–Verb–Subject' };
  const notes = [];
  notes.push(['Word order', orderName[L.order]]);
  if (feats.adj) notes.push(['Adjectives', L.adjAfter ? 'follow their noun' : 'precede their noun']);
  notes.push(['Plural', `suffix ${suffixDesc(L, L.sfx.pl)}`]);
  if (L.sfx.acc) notes.push(['Object case', `suffix ${suffixDesc(L, L.sfx.acc)} (after the plural)`]);
  notes.push(['Present tense', 'unmarked']);
  notes.push(['Past tense', `suffix ${suffixDesc(L, L.sfx.past)}`]);
  if (L.sfx.fut) notes.push(['Future tense', `suffix ${suffixDesc(L, L.sfx.fut)}`]);
  if (L.sfx.agr) notes.push(['Agreement', `verb takes ${suffixDesc(L, L.sfx.agr)} when the subject is plural`]);
  if (feats.neg) {
    notes.push(['Negation', L.negType === 'particle'
      ? `particle “${L.negWord}” ${L.negBefore ? 'before' : 'after'} the verb`
      : `verb suffix ${suffixDesc(L, L.sfx.neg)} (before tense)`]);
  }
  if (L.harmony) {
    notes.push(['Vowel harmony', `suffixes echo the stem: back vowels (a o u) vs front vowels (${L.frontV.join(' ')})`]);
  }
  return notes;
}
function lexiconTable(P) {
  const { L, lex } = P;
  const rows = [];
  for (const n of lex.nouns) rows.push([L.stems[n.id], n.sg, 'noun']);
  for (const v of lex.verbs) rows.push([L.stems[v.id], 'to ' + v.base, 'verb']);
  for (const a of lex.adjs) rows.push([L.stems['adj:' + a], a, 'adjective']);
  rows.sort((x, y) => x[0] < y[0] ? -1 : 1);
  return rows;
}

/* ---------------- language naming (pure flavour) ---------------- */
function languageName(rand, L) {
  // a 2–3 syllable word in the language's own phonology, capitalised
  const ids = Object.keys(L.stems);
  const base = L.stems[ids[rand.int(0, ids.length - 1)]];
  const name = base.charAt(0).toUpperCase() + base.slice(1);
  const tags = ['', '', '', 'ic', 'ese', 'ish', 'an'];
  return name + rand.pick(tags);
}

/* ---------------- entry point ---------------- */
function genPuzzle(seedStr, level) {
  const cfg = LEVELS[level];
  const rand = Rand(seedStr + '␟' + level);
  let L = null, lex = null;
  for (let attempt = 0; attempt < 50; attempt++) {
    L = genLanguage(rand, cfg);
    lex = pickLexicon(rand, cfg, L);
    if (!formsCollide(L, lex)) break;
    L = null;
  }
  if (!L) { // astronomically unlikely; fall back to last attempt
    L = genLanguage(rand, cfg);
    lex = pickLexicon(rand, cfg, L);
  }
  const tenses = ['pres', 'past'].concat(cfg.feats.fut ? ['fut'] : []);
  const P = { L, lex, cfg, feats: L.feats, tenses, seed: seedStr, level };
  const { corpus, keys } = buildCorpus(rand, P);
  P.corpus = corpus;
  P.questions = buildQuestions(rand, P, keys);
  for (const q of P.questions) buildTiles(rand, P, q);
  P.notes = grammarNotes(P);
  P.lexTable = lexiconTable(P);
  P.langName = languageName(rand, L);
  P.maxScore = P.questions.length * 100;
  return P;
}

root.PX = { genPuzzle, LEVELS, Rand, sentenceRecord, cloneMeaning, version: '1.0.1' };
})(typeof globalThis !== 'undefined' ? globalThis : this);
