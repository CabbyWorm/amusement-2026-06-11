/* Invariant tests for the Polyglot Express engine.
   Run: node test/test.js [nSeeds]
   Every puzzle must be deterministic, novel, and — crucially — FAIR:
   each question must be solvable using only morphemes and lexemes
   attested in the corpus, and (English→conlang) the English prompt
   must uniquely determine the answer. Levels 1–5 are additionally
   frozen byte-for-byte so shared seed links never change. */
'use strict';
const crypto = require('crypto');
require('../engine.js');
const { genPuzzle, LEVELS, sentenceRecord, cloneMeaning, formsCollide } = globalThis.PX;

const N = parseInt(process.argv[2] || '120', 10);
const MAXLVL = LEVELS.length - 1;
let checked = 0;
const fail = (seed, level, msg) => {
  console.error(`FAIL seed=${seed} level=${level}: ${msg}`);
  process.exitCode = 1;
};

function meaningLexemes(m) {
  const ids = [m.s.n.id, m.v.id];
  if (m.s.adj) ids.push('adj:' + m.s.adj);
  if (m.o) { ids.push(m.o.n.id); if (m.o.adj) ids.push('adj:' + m.o.adj); }
  return ids;
}
function strip(P) {
  return JSON.stringify(P, (k, v) => (typeof v === 'function' ? undefined : v));
}
function playerView(P) {
  return JSON.stringify({
    c: P.corpus.map(r => [r.conStr, r.engStr]),
    q: P.questions.map(q => [q.dir, q.conStr, q.engStr, q.correct, q.tiles.map(t => t.t)]),
    n: P.langName, lx: P.lexTable,
  });
}
function checkAmbiguity(P, q, qi, seed, level) {
  const nums = P.L.sfx.du ? ['sg', 'du', 'pl'] : ['sg', 'pl'];
  for (const k of ['s', 'o']) {
    if (!q.m[k]) continue;
    for (const num of nums) {
      if (num === q.m[k].num) continue;
      const f = cloneMeaning(q.m);
      f[k].num = num;
      const r = sentenceRecord(P.L, f);
      if (r.engStr === q.engStr && r.conStr !== q.conStr)
        fail(seed, level, `q${qi} number-ambiguous prompt "${q.engStr}"`);
    }
  }
}

for (let s = 0; s < N; s++) {
  for (let level = 1; level <= MAXLVL; level++) {
    const seed = 'test' + s.toString(36);
    const P = genPuzzle(seed, level);
    const cfg = LEVELS[level];
    checked++;

    // determinism
    if (strip(P) !== strip(genPuzzle(seed, level)))
      fail(seed, level, 'non-deterministic generation');

    // structure
    if (P.corpus.length < cfg.corpus)
      fail(seed, level, `corpus too small: ${P.corpus.length} < ${cfg.corpus}`);
    if (P.questions.length !== cfg.qs)
      fail(seed, level, `expected ${cfg.qs} questions, got ${P.questions.length}`);

    // every surface form has exactly one analysis (bonus tiers: sandhi and
    // reduplication can merge surfaces, so the strict global check applies)
    if (formsCollide(P.L, P.lex, !!cfg.strict))
      fail(seed, level, 'colliding word forms slipped through generation');

    // corpus facts
    const corpusKeys = new Set(P.corpus.map(r => r.conStr));
    const corpusLex = new Set(P.corpus.flatMap(r => meaningLexemes(r.m)));
    const corpusTenses = new Set(P.corpus.map(r => r.m.tense));
    const nps = (m) => [m.s].concat(m.o ? [m.o] : []);
    const hasNum = (num) => P.corpus.some(r => nps(r.m).some(x => x.num === num));
    const hasNeg = P.corpus.some(r => r.m.neg);
    const hasTr = P.corpus.some(r => r.m.o);
    const hasPlSubj = P.corpus.some(r => r.m.s.num !== 'sg');
    const hasAdjOn = (anim) => P.corpus.some(r =>
      nps(r.m).some(x => x.adj && !!x.n.anim === anim));

    // stems pairwise distinct
    const stems = P.lexTable.map(r => r[0]);
    if (new Set(stems).size !== stems.length)
      fail(seed, level, 'duplicate stems in lexicon');

    for (const [qi, q] of P.questions.entries()) {
      // novelty
      if (corpusKeys.has(q.conStr))
        fail(seed, level, `q${qi} duplicates a corpus sentence`);

      // fairness: lexeme coverage
      for (const id of meaningLexemes(q.m))
        if (!corpusLex.has(id))
          fail(seed, level, `q${qi} uses unattested lexeme "${id}"`);

      // fairness: feature coverage
      if (!corpusTenses.has(q.m.tense))
        fail(seed, level, `q${qi} uses unattested tense ${q.m.tense}`);
      for (const num of ['pl', 'du'])
        if (nps(q.m).some(x => x.num === num) && !hasNum(num))
          fail(seed, level, `q${qi} uses unattested number "${num}"`);
      if (q.m.neg && !hasNeg)
        fail(seed, level, `q${qi} uses unattested negation`);
      if (q.m.o && !hasTr)
        fail(seed, level, `q${qi} transitive but corpus has no transitive sentence`);
      if (q.m.s.num !== 'sg' && P.L.sfx.agr && !hasPlSubj)
        fail(seed, level, `q${qi} needs agreement never attested`);
      if (P.L.sfx.cls) {
        for (const x of nps(q.m))
          if (x.adj && !hasAdjOn(!!x.n.anim))
            fail(seed, level, `q${qi} uses unattested noun-class agreement (${x.n.anim ? 'AN' : 'INAN'})`);
      }

      // production-only tier
      if (cfg.feats.e2cOnly && q.dir !== 'e2c')
        fail(seed, level, `q${qi} should be e2c-only at this level`);

      // tiles: must contain the full correct multiset, plus distractors
      const bank = q.tiles.map(t => t.t);
      const count = (arr, w) => arr.filter(x => x === w).length;
      for (const w of new Set(q.correct))
        if (count(bank, w) < count(q.correct, w))
          fail(seed, level, `q${qi} bank missing tile "${w}"`);
      if (bank.length - q.correct.length < 1)
        fail(seed, level, `q${qi} has no distractors`);
      for (const w of bank)
        if (!w || /undefined|null/.test(w))
          fail(seed, level, `q${qi} bad tile "${w}"`);

      // renders sane
      if (/undefined/.test(q.engStr) || /undefined/.test(q.conStr))
        fail(seed, level, `q${qi} broken render: ${q.engStr} / ${q.conStr}`);

      // fairness: an English→conlang prompt must uniquely determine number
      if (q.dir === 'e2c') checkAmbiguity(P, q, qi, seed, level);
    }

    for (const r of P.corpus)
      if (/undefined/.test(r.engStr) || /undefined/.test(r.conStr))
        fail(seed, level, `corpus broken render: ${r.engStr} / ${r.conStr}`);
  }
}

// Regression: the round from the original "fish" bug report.
{
  const P = genPuzzle('b9x6sg', 3);
  checked++;
  for (const [qi, q] of P.questions.entries())
    if (q.dir === 'e2c') checkAmbiguity(P, q, qi, 'b9x6sg', 3);
}

// Stability: levels 1–5 are frozen. A changed hash means shared seed links
// (and the difficulty calibration of the original tiers) silently broke.
const FROZEN = {
  'demo7.1': '5661683ecb8f00c7', 'demo7.2': '967a6656a35cd0b6', 'demo7.3': '77e6d536c0e08e89',
  'demo7.4': 'bf2c733134e89df9', 'demo7.5': '98b1c7326d175447',
  'b9x6sg.1': '8f232aca716e0d6a', 'b9x6sg.2': 'b7ff00cb5fc97535', 'b9x6sg.3': 'ab5e4ea14d904eb2',
  'b9x6sg.4': '531fcb5015f50c81', 'b9x6sg.5': '25ded7a9f858b62c',
  'abc123.1': '339f2b6255fb0c42', 'abc123.2': 'a82c3422f5bc4734', 'abc123.3': '26ee30e2d887e2c0',
  'abc123.4': '323c61c3dcf5108e', 'abc123.5': '9704510fb0c0a17c',
  'snapA.1': '62e534aa5e918a9c', 'snapA.2': '8f9ccdb1e78bd89a', 'snapA.3': '55c7396655cb451a',
  'snapA.4': '1439a54e55f3bace', 'snapA.5': '38ebbfca0d428bb8',
  'snapB.1': '4494eea2918ee459', 'snapB.2': '949ca1fb5db2b9bf', 'snapB.3': 'a1bb050b1b5e1502',
  'snapB.4': '0bd882a03ad04025', 'snapB.5': '605b05b0daf98a63',
  'snapC.1': '7b1d6cf0b8e066d5', 'snapC.2': '43e6296b687ce91c', 'snapC.3': 'eaeb988441a8e7b6',
  'snapC.4': 'd055a3e04009e577', 'snapC.5': '299ef235bd76d923',
};
for (const key of Object.keys(FROZEN)) {
  const [seed, lvl] = key.split('.');
  checked++;
  const h = crypto.createHash('sha256').update(playerView(genPuzzle(seed, +lvl))).digest('hex').slice(0, 16);
  if (h !== FROZEN[key]) fail(seed, lvl, `frozen level-${lvl} output changed (hash ${h})`);
}

if (process.exitCode) {
  console.error(`\n${checked} puzzles checked — FAILURES FOUND`);
} else {
  console.log(`OK — ${checked} puzzles checked across ${N} seeds × ${MAXLVL} levels, all invariants hold`);
}
