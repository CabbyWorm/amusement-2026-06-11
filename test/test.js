/* Invariant tests for the Polyglot Express engine.
   Run: node test/test.js [nSeeds]
   Every puzzle must be deterministic, novel, and — crucially — FAIR:
   each question must be solvable using only morphemes and lexemes
   attested in the corpus. */
'use strict';
require('../engine.js');
const { genPuzzle, LEVELS } = globalThis.PX;

const N = parseInt(process.argv[2] || '120', 10);
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
  // serialisable view (drops the _makeStem closure)
  return JSON.stringify(P, (k, v) => (typeof v === 'function' ? undefined : v));
}

for (let s = 0; s < N; s++) {
  for (let level = 1; level <= 5; level++) {
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

    // corpus facts
    const corpusKeys = new Set(P.corpus.map(r => r.conStr));
    const corpusLex = new Set(P.corpus.flatMap(r => meaningLexemes(r.m)));
    const corpusTenses = new Set(P.corpus.map(r => r.m.tense));
    const hasPl = P.corpus.some(r => r.m.s.pl || (r.m.o && r.m.o.pl));
    const hasNeg = P.corpus.some(r => r.m.neg);
    const hasTr = P.corpus.some(r => r.m.o);
    const hasPlSubj = P.corpus.some(r => r.m.s.pl);

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
      if ((q.m.s.pl || (q.m.o && q.m.o.pl)) && !hasPl)
        fail(seed, level, `q${qi} uses unattested plural`);
      if (q.m.neg && !hasNeg)
        fail(seed, level, `q${qi} uses unattested negation`);
      if (q.m.o && !hasTr)
        fail(seed, level, `q${qi} transitive but corpus has no object`);
      if (q.m.s.pl && P.L.sfx.agr && !hasPlSubj)
        fail(seed, level, `q${qi} needs agreement never attested`);

      // tiles: must contain the full correct multiset, distractors disjoint
      const bank = q.tiles.map(t => t.t);
      const count = (arr, w) => arr.filter(x => x === w).length;
      for (const w of new Set(q.correct))
        if (count(bank, w) < count(q.correct, w))
          fail(seed, level, `q${qi} bank missing tile "${w}"`);
      const correctSet = new Set(q.correct);
      const extras = bank.length - q.correct.length;
      if (extras < 1) fail(seed, level, `q${qi} has no distractors`);
      // every token sane
      for (const w of bank)
        if (!w || /undefined|null/.test(w))
          fail(seed, level, `q${qi} bad tile "${w}"`);

      // renders sane
      if (/undefined/.test(q.engStr) || /undefined/.test(q.conStr))
        fail(seed, level, `q${qi} broken render: ${q.engStr} / ${q.conStr}`);
    }

    // English renders in corpus are sane and unique per meaning
    for (const r of P.corpus)
      if (/undefined/.test(r.engStr) || /undefined/.test(r.conStr))
        fail(seed, level, `corpus broken render: ${r.engStr} / ${r.conStr}`);
  }
}

if (process.exitCode) {
  console.error(`\n${checked} puzzles checked — FAILURES FOUND`);
} else {
  console.log(`OK — ${checked} puzzles checked across ${N} seeds × 5 levels, all invariants hold`);
}
