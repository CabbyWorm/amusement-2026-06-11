/* ============================================================
   Polyglot Express — puzzle engine
   Deterministically generates a miniature constructed language
   from a seed (phonology, vowel harmony, case, agreement, word
   order, negation — and, in the bonus tiers, ergativity, prefix
   morphology, sandhi, reduplication, dual number and noun-class
   agreement), builds a "Rosetta stone" corpus that is guaranteed
   to attest every morpheme a question needs, then produces novel
   translation challenges in both directions.
   Pure logic, no DOM — also runs under Node for testing.

   NOTE ON DETERMINISM: shared seeds must keep producing identical
   puzzles. Every RNG draw on the level 1–5 path is therefore kept
   in its original order; all new feature rolls are gated behind
   feature flags that only levels 6–10 set.
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

/* ---------------- difficulty tiers ----------------
   1–5 are the original line and must never change for a given seed.
   6–10 are the bonus tiers: each adds real linguistic phenomena and a
   score multiplier. */
const LEVELS = [null,
  { name: 'Tourist',         nouns: 5, verbs: 3, adjs: 0, corpus: 6,  qs: 4, distract: 3, mult: 1, feats: {} },
  { name: 'Traveler',        nouns: 6, verbs: 4, adjs: 2, corpus: 7,  qs: 5, distract: 4, mult: 1, feats: { acc: 1, adj: 1 } },
  { name: 'Field Linguist',  nouns: 7, verbs: 4, adjs: 2, corpus: 8,  qs: 5, distract: 5, mult: 1, feats: { acc: 1, adj: 1, harmony: 1, fut: 1 } },
  { name: 'Decipherer',      nouns: 8, verbs: 5, adjs: 3, corpus: 9,  qs: 6, distract: 6, mult: 1, feats: { acc: 1, adj: 1, harmony: 1, fut: 1, agr: 1, neg: 1 } },
  { name: 'Oracle of Babel', nouns: 9, verbs: 6, adjs: 3, corpus: 10, qs: 6, distract: 7, mult: 1, feats: { acc: 1, adj: 1, harmony: 1, fut: 1, agr: 1, neg: 1, wild: 1 } },
  { name: 'Ergative Frontier', nouns: 9,  verbs: 6, adjs: 3, corpus: 11, qs: 6, distract: 8,  mult: 2,  dense: 1, strict: 1,
    feats: { acc: 1, adj: 1, harmony: 1, fut: 1, agr: 1, neg: 1, wild: 1, erg: 'always', affixmix: 1 } },
  { name: 'Mutation Marsh',    nouns: 10, verbs: 6, adjs: 3, corpus: 12, qs: 7, distract: 9,  mult: 3,  dense: 1, strict: 1,
    feats: { acc: 1, adj: 1, harmony: 1, fut: 1, agr: 1, neg: 1, wild: 1, erg: 'maybe', affixmix: 1, sandhi: 1, redup: 1, trap: 1 } },
  { name: 'Twin Moon Pass',    nouns: 10, verbs: 7, adjs: 4, corpus: 12, qs: 7, distract: 10, mult: 5,  dense: 1, strict: 1,
    feats: { acc: 1, adj: 1, harmony: 1, fut: 1, agr: 1, neg: 1, wild: 1, erg: 'maybe', affixmix: 1, sandhi: 1, redup: 1, trap: 1, dual: 1 } },
  { name: 'Vault of Tongues',  nouns: 11, verbs: 7, adjs: 4, corpus: 13, qs: 8, distract: 11, mult: 7,  dense: 1, strict: 1,
    feats: { acc: 1, adj: 1, harmony: 1, fut: 1, agr: 1, neg: 1, wild2: 1, erg: 'maybe', affixmix: 1, sandhi: 1, redup: 1, trap: 1, dual: 1, classAgr: 1 } },
  { name: 'The Last Speaker',  nouns: 12, verbs: 8, adjs: 5, corpus: 13, qs: 8, distract: 12, mult: 10, dense: 1, strict: 1,
    feats: { acc: 1, adj: 1, harmony: 1, fut: 1, agr: 1, neg: 1, wild2: 1, erg: 'maybe', affixmix: 1, sandhi: 1, redup: 1, trap: 1, dual: 1, classAgr: 1, e2cOnly: 1 } },
];

/* ---------------- English morphology ---------------- */
function eng3sg(base) {
  if (/(ch|sh|s|x|z)$/.test(base)) return base + 'es';
  if (/[^aeiou]y$/.test(base)) return base.slice(0, -1) + 'ies';
  return base + 's';
}
function engNP(x) {
  const toks = ['the'];
  if (x.num === 'du') toks.push('two');
  if (x.adj) toks.push(x.adj);
  toks.push(x.num === 'sg' ? x.n.sg : x.n.pl);
  return toks;
}
function engVP(m) {
  const v = m.v, pl = m.s.num !== 'sg';
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
const VOWEL_RE = /[aeiouäöü]/;

function genLanguage(rand, cfg) {
  const feats = Object.assign({ pl: 1, past: 1 }, cfg.feats);

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

  // Harmony: map each back vowel to its front counterpart inside affixes.
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

  const orderPool = feats.wild2 ? ['SOV', 'SVO', 'VSO', 'OVS', 'OSV', 'VOS']
    : feats.wild ? ['SOV', 'SVO', 'VSO', 'OVS']
    : (feats.fut ? ['SOV', 'SVO', 'VSO'] : ['SOV', 'SVO']);
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
      du: feats.dual ? makeSuffix() : null,
      neg: null,
      cls: null,
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

  /* --- bonus-tier rolls (all gated; levels 1–5 never reach these) --- */
  L.align = feats.acc
    ? (feats.erg === 'always' ? 'erg'
      : feats.erg === 'maybe' ? (rand.chance(0.5) ? 'erg' : 'acc')
      : 'acc')
    : null;
  L.pos = { num: 'suf', case: 'suf', tense: 'suf' };
  if (feats.affixmix) {
    for (const slot of ['num', 'case', 'tense']) {
      if (rand.chance(0.3)) L.pos[slot] = 'pre';
    }
  }
  L.plType = 'suf';
  if (feats.redup && rand.chance(0.35)) { L.plType = 'redup'; L.pos.num = 'suf'; }
  L.sandhi = !!(feats.sandhi && rand.chance(0.6));
  if (feats.classAgr) L.sfx.cls = { a: makeSuffix(), i: makeSuffix() };

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
/* Sandhi: when a vowel-final piece meets a vowel-initial piece,
   the first vowel drops. Only active in languages that rolled it. */
function joinParts(L, parts) {
  let out = '';
  for (const p of parts) {
    if (!p) continue;
    if (L.sandhi && out && VOWEL_RE.test(out[out.length - 1]) && VOWEL_RE.test(p[0])) {
      out = out.slice(0, -1);
    }
    out += p;
  }
  return out;
}
function redupPrefix(stem) {
  const m = stem.match(/^(.*?[aeiouäöü])/);
  return m ? m[1] : stem[0];
}

/* opts: { num:'sg'|'du'|'pl', role:'S'|'A'|'O'|null, cls: harmony-class override } */
function nounForm(L, n, opts) {
  const cls = opts.cls || L.stemCls[n.id];
  const stem = L.stems[n.id];
  const parts = [stem];
  const gloss = [n.id];
  const attach = (pos, formStr, g) => {
    if (pos === 'pre') { parts.unshift(formStr); gloss.unshift(g); }
    else { parts.push(formStr); gloss.push(g); }
  };
  if (opts.num === 'pl') {
    if (L.plType === 'redup') attach('pre', redupPrefix(stem), 'PL');
    else attach(L.pos.num, sfx(L, L.sfx.pl, cls), 'PL');
  } else if (opts.num === 'du') {
    attach(L.pos.num, sfx(L, L.sfx.du, cls), 'DU');
  }
  const marked = L.sfx.acc && opts.role &&
    (L.align === 'erg' ? opts.role === 'A' : opts.role === 'O');
  if (marked) attach(L.pos.case, sfx(L, L.sfx.acc, cls), L.align === 'erg' ? 'ERG' : 'ACC');
  return { form: joinParts(L, parts), gloss };
}
function verbForm(L, m, clsOverride) {
  const v = m.v, cls = clsOverride || L.stemCls[v.id];
  const parts = [L.stems[v.id]];
  const gloss = [v.id];
  const attach = (pos, formStr, g) => {
    if (pos === 'pre') { parts.unshift(formStr); gloss.unshift(g); }
    else { parts.push(formStr); gloss.push(g); }
  };
  if (m.neg && L.negType === 'affix') attach('suf', sfx(L, L.sfx.neg, cls), 'NEG');
  if (m.tense === 'past') attach(L.pos.tense, sfx(L, L.sfx.past, cls), 'PAST');
  else if (m.tense === 'fut') attach(L.pos.tense, sfx(L, L.sfx.fut, cls), 'FUT');
  if (L.sfx.agr && m.s.num !== 'sg') attach('suf', sfx(L, L.sfx.agr, cls), 'PL.SUBJ');
  return { form: joinParts(L, parts), gloss };
}
function adjForm(L, a, nounAnim, clsOverride) {
  const cls = clsOverride || L.stemCls['adj:' + a];
  const parts = [L.stems['adj:' + a]];
  const gloss = [a];
  if (L.sfx.cls) {
    parts.push(sfx(L, L.sfx.cls[nounAnim ? 'a' : 'i'], cls));
    gloss.push(nounAnim ? 'AN' : 'INAN');
  }
  return { form: joinParts(L, parts), gloss };
}
function conNP(L, x, role) {
  const noun = nounForm(L, x.n, { num: x.num, role });
  const toks = [{ form: noun.form, gloss: noun.gloss, eng: x.num === 'sg' ? x.n.sg : x.n.pl }];
  if (x.adj) {
    const af = adjForm(L, x.adj, !!x.n.anim);
    const a = { form: af.form, gloss: af.gloss, eng: x.adj };
    L.adjAfter ? toks.push(a) : toks.unshift(a);
  }
  return toks;
}
function renderCon(L, m) {
  const S = conNP(L, m.s, m.o ? 'A' : 'S');
  const O = m.o ? conNP(L, m.o, 'O') : null;
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
  const np = x => x ? `${x.n.id}.${x.num}.${x.adj || ''}` : '';
  return `${np(m.s)}|${m.v.id}|${m.tense}|${m.neg ? 1 : 0}|${np(m.o)}`;
}
function cloneMeaning(m) {
  return {
    v: m.v, tense: m.tense, neg: m.neg,
    s: { n: m.s.n, num: m.s.num, adj: m.s.adj },
    o: m.o ? { n: m.o.n, num: m.o.num, adj: m.o.adj } : null,
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
const NUM_W_SUBJ = ['sg', 'sg', 'sg', 'pl', 'pl', 'du'];
const NUM_W_OBJ = ['sg', 'sg', 'sg', 'sg', 'pl', 'du'];
function sampleMeaning(rand, P, force) {
  force = force || {};
  const { lex, tenses, feats } = P;
  let v = force.v || null;
  if (!v && force.intr) v = rand.pick(lex.verbs.filter(x => !x.tr));
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
    s: {
      n: sN,
      num: force.num != null ? force.num
        : (feats.dual ? rand.pick(NUM_W_SUBJ) : (rand.chance(0.35) ? 'pl' : 'sg')),
      adj: null,
    },
    o: null,
    tense: force.tense || rand.pick(tenses),
    neg: feats.neg ? (force.neg != null ? force.neg : rand.chance(0.18)) : false,
  };
  if (v.tr) {
    const pool = objPool(lex, v, sN);
    const oN = force.oN && pool.includes(force.oN) ? force.oN : rand.pick(pool);
    m.o = {
      n: oN,
      num: feats.dual ? rand.pick(NUM_W_OBJ) : (rand.chance(0.3) ? 'pl' : 'sg'),
      adj: null,
    };
  }
  if (feats.adj && lex.adjs.length) {
    const want = force.adj != null ? force.adj : rand.chance(0.3);
    if (want) {
      const a = typeof force.adj === 'string' ? force.adj : rand.pick(lex.adjs);
      if (force.adjOn) {
        if (force.adjOn === 'o' && m.o) m.o.adj = a; else m.s.adj = a;
      } else if (m.o && rand.chance(0.5)) m.o.adj = a;
      else m.s.adj = a;
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

/* All inflected forms a player could ever meet must be pairwise distinct
   across lexemes (and, in strict mode — bonus tiers, where sandhi and
   reduplication can merge surfaces — across ALL cells, so that every
   surface form has exactly one analysis). Colliding languages are
   rejected and regenerated. */
function formsCollide(L, lex, strict) {
  const seen = new Map();
  const add = (form, owner) => {
    if (seen.has(form)) {
      if (strict || seen.get(form) !== owner) return true;
    } else {
      seen.set(form, owner);
    }
    return false;
  };
  const nums = L.sfx.du ? ['sg', 'du', 'pl'] : ['sg', 'pl'];
  const markedRole = L.align === 'erg' ? 'A' : 'O';
  for (const n of lex.nouns) {
    for (const marked of [0, 1]) {
      if (marked && !L.sfx.acc) continue;
      for (const num of nums) {
        if (add(nounForm(L, n, { num, role: marked ? markedRole : null }).form, 'n:' + n.id)) return true;
      }
    }
  }
  const tenses = ['pres', 'past'].concat(L.sfx.fut ? ['fut'] : []);
  for (const v of lex.verbs) {
    for (const t of tenses) for (const agr of [0, 1]) for (const ng of [0, 1]) {
      if (agr && !L.sfx.agr) continue;
      if (ng && L.negType !== 'affix') continue;
      const fake = { v, tense: t, neg: !!ng, s: { num: agr ? 'pl' : 'sg' } };
      if (add(verbForm(L, fake).form, 'v:' + v.id)) return true;
    }
  }
  for (const a of lex.adjs) {
    if (L.sfx.cls) {
      if (add(adjForm(L, a, true).form, 'a:' + a)) return true;
      if (add(adjForm(L, a, false).form, 'a:' + a)) return true;
    } else if (add(L.stems['adj:' + a], 'a:' + a)) return true;
  }
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
  const coveredA = () => new Set(out.flatMap(r =>
    [r.m.s.adj, r.m.o && r.m.o.adj].filter(Boolean)));
  const anim = lex.nouns.filter(n => n.anim);

  // one sentence per verb, steering toward unused subject and object nouns
  // (and, in dense mode, sweeping adjectives up along the way)
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
    if (cfg.dense && feats.adj) {
      const seenA = coveredA();
      const uA = lex.adjs.filter(a => !seenA.has(a));
      if (uA.length && rand.chance(0.6)) {
        force.adj = rand.pick(uA);
        force.adjOn = v.tr && rand.chance(0.5) ? 'o' : 's';
      }
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
  const sg = out.find(r => r.m.s.num === 'sg');
  if (sg) { const c = cloneMeaning(sg.m); c.s.num = 'pl'; push(c); }
  else if (out.length) { const c = cloneMeaning(out[0].m); c.s.num = 'sg'; push(c); }
  // …every tense in the pool, on an already-seen verb
  for (const t of tenses) {
    if (!out.some(r => r.m.tense === t)) {
      const c = cloneMeaning(rand.pick(out).m); c.tense = t; push(c);
    }
  }
  // …case: accusative languages show the same noun in subject and object
  // role; ergative languages show a transitive subject also used unmarked
  // (as an intransitive subject), isolating the case affix either way
  if (feats.acc && L.align !== 'erg') {
    const subjAnims = anim.filter(n => out.some(r => r.m.s.n.id === n.id));
    const target = subjAnims.find(n =>
      !out.some(r => r.m.o && r.m.o.n.id === n.id));
    if (target) {
      const vs = lex.verbs.filter(v => v.tr && objPool(lex, v, null).includes(target) &&
        (v.obj === 'any' || v.obj === 'anim'));
      if (vs.length) push(sampleMeaning(rand, P, { v: rand.pick(vs), oN: target }));
    }
  }
  if (L.align === 'erg' && lex.verbs.some(v => !v.tr)) {
    const target = anim.find(n =>
      out.some(r => r.m.o && r.m.s.n.id === n.id) &&        // attested as marked A
      !out.some(r => !r.m.o && r.m.s.n.id === n.id));       // never as bare S
    if (target) pushRetry({ sN: target, intr: true });
  }
  // …negation attested
  if (feats.neg && !out.some(r => r.m.neg)) {
    const c = cloneMeaning(rand.pick(out).m); c.neg = true; push(c);
  }
  // …a non-singular subject so agreement is visible
  if (feats.agr && !out.some(r => r.m.s.num !== 'sg')) {
    const c = cloneMeaning(out[0].m); c.s.num = 'pl'; push(c);
  }
  // …dual attested on a noun already seen in another number
  if (feats.dual && !out.some(r => r.m.s.num === 'du' || (r.m.o && r.m.o.num === 'du'))) {
    const c = cloneMeaning(rand.pick(out).m); c.s.num = 'du'; push(c);
  }
  // …noun-class agreement: an adjective on a living thing and on a thing
  if (L.sfx.cls && lex.adjs.length) {
    const hasAn = out.some(r => (r.m.s.adj && r.m.s.n.anim) || (r.m.o && r.m.o.adj && r.m.o.n.anim));
    const hasIn = out.some(r => (r.m.s.adj && !r.m.s.n.anim) || (r.m.o && r.m.o.adj && !r.m.o.n.anim));
    if (!hasAn) pushRetry({ adj: true, adjOn: 's' });
    if (!hasIn) {
      const inanNouns = lex.nouns.filter(n => !n.anim);
      const vs = lex.verbs.filter(v => v.tr && inanNouns.some(n => objPool(lex, v, null).includes(n)));
      if (inanNouns.length && vs.length) {
        const v = rand.pick(vs);
        const oN = rand.pick(inanNouns.filter(n => objPool(lex, v, null).includes(n)));
        pushRetry({ v, oN, adj: true, adjOn: 'o' });
      }
    }
  }
  // pad to the minimum corpus size with fresh sentences
  let guard = 0;
  while (out.length < cfg.corpus && guard++ < 80) push(sampleMeaning(rand, P, {}));
  return { corpus: rand.shuffle(out), keys };
}

/* English is the one language we don't generate, and it has quirks of its
   own — "fish" is its own plural. A prompt is unfair in the English→conlang
   direction if some number change leaves the English unchanged but alters
   the expected conlang answer: the player then can't deduce the number. */
function engNumberAmbiguous(L, m) {
  const base = sentenceRecord(L, m);
  const nums = L.sfx.du ? ['sg', 'du', 'pl'] : ['sg', 'pl'];
  for (const k of ['s', 'o']) {
    if (!m[k]) continue;
    for (const num of nums) {
      if (num === m[k].num) continue;
      const f = cloneMeaning(m);
      f[k].num = num;
      const r = sentenceRecord(L, f);
      if (r.engStr === base.engStr && r.conStr !== base.conStr) return true;
    }
  }
  return false;
}

function buildQuestions(rand, P, corpusKeys) {
  const { feats, cfg, L } = P;
  const forces = [{ tense: 'past' }, { num: 'pl' }, { tr: feats.acc ? true : undefined }];
  if (feats.adj) forces.push({ adj: true });
  if (feats.fut) forces.push({ tense: 'fut' });
  if (feats.neg) forces.push({ neg: true });
  if (feats.dual) forces.push({ num: 'du' });
  if (L.align === 'erg' && P.lex.verbs.some(v => !v.tr)) forces.push({ intr: true });
  if (L.sfx.cls) forces.push({ adj: true, tr: true });
  while (forces.length < cfg.qs) forces.push({});
  const plan = rand.shuffle(forces).slice(0, cfg.qs);

  const qs = [];
  const used = new Set();
  let dir = feats.e2cOnly ? 'e2c' : (rand.chance(0.5) ? 'c2e' : 'e2c');
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
    if (!feats.e2cOnly) dir = dir === 'c2e' ? 'e2c' : 'c2e';
    qs.push(rec);
  }
  return qs;
}

/* Distractor tiles: plausible wrong inflections (conlang) or wrong forms
   (English). In trap mode, wrong-harmony allomorphs of the answer's own
   words are guaranteed a seat. Never equal to any correct token. */
function buildTiles(rand, P, q) {
  const { L, lex, feats } = P;
  const correct = q.dir === 'c2e' ? q.eng.slice() : q.con.map(t => t.form);
  const correctSet = new Set(correct);
  const cand = new Set();
  if (q.dir === 'c2e') {
    for (const n of lex.nouns) { cand.add(n.sg); cand.add(n.pl); }
    for (const v of lex.verbs) { cand.add(v.base); cand.add(v.past); cand.add(eng3sg(v.base)); }
    for (const a of lex.adjs) cand.add(a);
    ['not', 'will', 'do', 'does', 'did'].forEach(w => cand.add(w));
    if (feats.dual) cand.add('two');
  } else {
    const nums = L.sfx.du ? ['sg', 'du', 'pl'] : ['sg', 'pl'];
    const markedRole = L.align === 'erg' ? 'A' : 'O';
    for (const n of lex.nouns) {
      for (const marked of [false, true]) {
        if (marked && !L.sfx.acc) continue;
        for (const num of nums) {
          cand.add(nounForm(L, n, { num, role: marked ? markedRole : null }).form);
        }
      }
    }
    const tenses = ['pres', 'past'].concat(L.sfx.fut ? ['fut'] : []);
    const fakeVerb = (v, t, agr, ng, cls) =>
      verbForm(L, { v, tense: t, neg: ng, s: { num: agr ? 'pl' : 'sg' } }, cls).form;
    for (const v of lex.verbs) for (const t of tenses) {
      cand.add(fakeVerb(v, t, false, false));
      if (L.sfx.agr) cand.add(fakeVerb(v, t, true, false));
      if (L.negType === 'affix') cand.add(fakeVerb(v, t, false, true));
    }
    for (const a of lex.adjs) {
      if (L.sfx.cls) { cand.add(adjForm(L, a, true).form); cand.add(adjForm(L, a, false).form); }
      else cand.add(L.stems['adj:' + a]);
    }
    if (L.negWord) cand.add(L.negWord);
  }

  // trap tiles: same words as the answer, wrong harmony class
  const traps = [];
  if (q.dir === 'e2c' && feats.trap && L.harmony) {
    const flip = (id) => (L.stemCls[id] === 'b' ? 'f' : 'b');
    const m = q.m;
    for (const k of ['s', 'o']) {
      if (!m[k]) continue;
      traps.push(nounForm(L, m[k].n, {
        num: m[k].num,
        role: k === 'o' ? 'O' : (m.o ? 'A' : 'S'),
        cls: flip(m[k].n.id),
      }).form);
      if (m[k].adj) traps.push(adjForm(L, m[k].adj, !!m[k].n.anim, flip('adj:' + m[k].adj)).form);
    }
    traps.push(verbForm(L, m, flip(m.v.id)).form);
  }
  const trapPicks = [...new Set(traps)].filter(w => !correctSet.has(w)).slice(0, 3);

  const pool = [...cand].filter(w => !correctSet.has(w) && !trapPicks.includes(w));
  const nFill = Math.max(1, Math.min(P.cfg.distract - trapPicks.length, pool.length));
  const distractors = trapPicks.concat(rand.pickN(pool, nFill));
  let id = 0;
  q.correct = correct;
  q.tiles = rand.shuffle(correct.concat(distractors)).map(t => ({ id: id++, t }));
}

/* ---------------- human-readable dossier ---------------- */
function affixDesc(L, slot, s) {
  if (!s) return null;
  const both = L.harmony && s.b !== s.f;
  if (L.pos[slot] === 'pre') return both ? `prefix ${s.b}- / ${s.f}-` : `prefix ${s.b}-`;
  return both ? `suffix -${s.b} / -${s.f}` : `suffix -${s.b}`;
}
function grammarNotes(P) {
  const { L, feats, lex } = P;
  const orderName = {
    SOV: 'Subject–Object–Verb', SVO: 'Subject–Verb–Object', VSO: 'Verb–Subject–Object',
    OVS: 'Object–Verb–Subject', OSV: 'Object–Subject–Verb', VOS: 'Verb–Object–Subject',
  };
  const notes = [];
  notes.push(['Word order', orderName[L.order]]);
  if (feats.adj) notes.push(['Adjectives', L.adjAfter ? 'follow their noun' : 'precede their noun']);
  if (L.plType === 'redup') {
    const n = lex.nouns[0];
    notes.push(['Plural', `the first syllable is doubled (${L.stems[n.id]} → ${nounForm(L, n, { num: 'pl' }).form})`]);
  } else {
    notes.push(['Plural', affixDesc(L, 'num', L.sfx.pl)]);
  }
  if (L.sfx.du) notes.push(['Dual', `${affixDesc(L, 'num', L.sfx.du)} marks exactly two`]);
  if (L.sfx.acc) {
    notes.push([L.align === 'erg' ? 'Ergative case' : 'Object case',
      L.align === 'erg'
        ? `${affixDesc(L, 'case', L.sfx.acc)} marks the subject of a transitive verb only — intransitive subjects and objects stay bare`
        : `${affixDesc(L, 'case', L.sfx.acc)} marks the object`]);
  }
  notes.push(['Present tense', 'unmarked']);
  notes.push(['Past tense', affixDesc(L, 'tense', L.sfx.past)]);
  if (L.sfx.fut) notes.push(['Future tense', affixDesc(L, 'tense', L.sfx.fut)]);
  if (L.sfx.agr) {
    const v = (L.harmony && L.sfx.agr.b !== L.sfx.agr.f) ? `${L.sfx.agr.b} / -${L.sfx.agr.f}` : L.sfx.agr.b;
    notes.push(['Agreement', `verb takes suffix -${v} when the subject is more than one`]);
  }
  if (feats.neg) {
    notes.push(['Negation', L.negType === 'particle'
      ? `particle “${L.negWord}” ${L.negBefore ? 'before' : 'after'} the verb`
      : `verb suffix -${L.harmony && L.sfx.neg.b !== L.sfx.neg.f ? L.sfx.neg.b + ' / -' + L.sfx.neg.f : L.sfx.neg.b} (before tense)`]);
  }
  if (L.sfx.cls) {
    notes.push(['Noun classes', `adjectives take -${L.sfx.cls.a.b} with living things, -${L.sfx.cls.i.b} with everything else (harmony applies)`]);
  }
  if (L.sandhi) notes.push(['Sandhi', 'when two vowels meet at a morpheme boundary, the first one drops']);
  if (L.harmony) {
    notes.push(['Vowel harmony', `affixes echo the stem: back vowels (a o u) vs front vowels (${L.frontV.join(' ')})`]);
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
  const attempts = level >= 6 ? 200 : 50;
  let L = null, lex = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    L = genLanguage(rand, cfg);
    lex = pickLexicon(rand, cfg, L);
    if (!formsCollide(L, lex, !!cfg.strict)) break;
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
  P.mult = cfg.mult || 1;
  return P;
}

root.PX = { genPuzzle, LEVELS, Rand, sentenceRecord, cloneMeaning, formsCollide, version: '2.0.0' };
})(typeof globalThis !== 'undefined' ? globalThis : this);
