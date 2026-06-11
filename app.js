/* Polyglot Express — UI layer. All puzzle logic lives in engine.js. */
(function () {
'use strict';
const { genPuzzle, LEVELS } = globalThis.PX;
const $ = (s) => document.querySelector(s);

const LEVEL_BLURBS = [null,
  'plurals & past tense',
  '+ object case, adjectives',
  '+ vowel harmony, future tense',
  '+ verb agreement, negation',
  'everything · exotic word orders',
  'ergative case · prefixes too · ×2 points',
  '+ sandhi, reduplication, trap tiles · ×3',
  '+ dual number · ×5',
  '+ noun classes, rarest word orders · ×7',
  'all of it · production only · ×10',
];

/* ---------- persistence ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};

/* ---------- state ---------- */
let P = null;   // current puzzle (regenerable from seed+level)
let S = null;   // session: {seed, level, qi, scores[], pen, done}
let ans = [];   // tile ids placed in the answer row
let highlightForm = null;

const newSeed = () => Math.random().toString(36).slice(2, 8);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const save = () => { store.set('px:cur', S); store.set('px:lastlvl', S.level); };
const qScoreNow = () => Math.max(10, 100 - S.pen);
const curQ = () => P.questions[S.qi];
const solved = () => S.scores.length > S.qi;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function parseHash() {
  const m = location.hash.match(/^#([a-z0-9]+)\.(10|[1-9])$/);
  return m ? { seed: m[1], level: +m[2] } : null;
}

function start(seed, level, tryResume) {
  P = genPuzzle(seed, level);
  const saved = store.get('px:cur', null);
  if (tryResume && saved && saved.seed === seed && saved.level === level) {
    S = saved;
    S.qi = Math.min(S.qi, P.questions.length);
  } else {
    S = { seed, level, qi: 0, scores: [], pen: 0, done: false };
  }
  history.replaceState(null, '', '#' + seed + '.' + level);
  ans = [];
  highlightForm = null;
  save();
  renderAll();
  window.scrollTo(0, 0);
}

/* ---------- word-relative highlighting ---------- */
function prefixLen(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}
function applyHighlight() {
  document.querySelectorAll('.ct').forEach((n) => {
    const f = n.dataset.form;
    n.classList.toggle('hl', !!highlightForm && f === highlightForm);
    n.classList.toggle('hl2', !!highlightForm && f !== highlightForm && prefixLen(f, highlightForm) >= 3);
  });
}
document.addEventListener('click', (e) => {
  const t = e.target.closest('.ct');
  if (!t) return;
  highlightForm = highlightForm === t.dataset.form ? null : t.dataset.form;
  applyHighlight();
});

/* ---------- rendering ---------- */
function conSpan(tok) {
  const s = el('span', 'ct con', tok.form);
  s.dataset.form = tok.form;
  return s;
}
function conLine(toks) {
  const d = el('div', 'con');
  toks.forEach((t, i) => {
    if (i) d.appendChild(document.createTextNode(' '));
    d.appendChild(conSpan(t));
  });
  return d;
}

function renderLangbar() {
  const bar = $('#langbar');
  bar.innerHTML = '';
  bar.appendChild(el('span', null, 'Now decoding:'));
  bar.appendChild(el('span', 'langname', P.langName));
  bar.appendChild(el('span', 'chip', `Level ${S.level} · ${LEVELS[S.level].name}`));
  if (P.mult > 1) bar.appendChild(el('span', 'chip', '×' + P.mult + ' pts'));
  bar.appendChild(el('span', 'chip', 'seed ' + S.seed));
}

function renderCorpus() {
  const box = $('#corpus');
  box.innerHTML = '';
  for (const r of P.corpus) {
    const c = el('div', 'card');
    c.appendChild(conLine(r.con));
    c.appendChild(el('div', 'eng', cap(r.engStr) + '.'));
    box.appendChild(c);
  }
}

function renderDots() {
  const d = $('#dots');
  d.innerHTML = '';
  P.questions.forEach((q, i) => {
    const dot = el('span', 'dot');
    if (i < S.scores.length) dot.classList.add('done');
    else if (i === S.qi) dot.classList.add('cur');
    d.appendChild(dot);
  });
  $('#scorebadge').textContent = S.done ? '' : (solved() ? '' : `worth ${qScoreNow()} pts`);
}

function tileBtn(t, conlangStyle, onTap) {
  const b = el('button', 'tile' + (conlangStyle ? ' con' : ''), t.t);
  b.addEventListener('click', onTap);
  return b;
}

function renderQuestion() {
  const area = $('#qarea');
  area.innerHTML = '';
  if (S.qi >= P.questions.length) { renderFinish(area); return; }
  const q = curQ();
  $('#qtitle').textContent = `Question ${S.qi + 1} of ${P.questions.length}`;
  const card = el('div', 'qcard');
  const intoCon = q.dir === 'e2c';
  card.appendChild(el('div', 'qdir', intoCon ? `Say it in ${P.langName}` : 'Translate into English'));
  if (intoCon) {
    card.appendChild(el('div', 'qsrc', cap(q.engStr) + '.'));
  } else {
    const src = el('div', 'qsrc');
    src.appendChild(conLine(q.con));
    card.appendChild(src);
  }

  const ansline = el('div', 'ansline');
  ansline.id = 'ansline';
  if (!ans.length) ansline.classList.add('empty');
  const byId = Object.fromEntries(q.tiles.map((t) => [t.id, t]));
  ans.forEach((id) => {
    ansline.appendChild(tileBtn(byId[id], intoCon, () => {
      if (solved()) return;
      ans = ans.filter((x) => x !== id);
      renderQuestion();
    }));
  });
  card.appendChild(ansline);

  const bank = el('div', 'bank');
  q.tiles.forEach((t) => {
    if (ans.includes(t.id)) return;
    bank.appendChild(tileBtn(t, intoCon, () => {
      if (solved()) return;
      ans.push(t.id);
      renderQuestion();
    }));
  });
  card.appendChild(bank);

  const verdict = el('div', 'verdict');
  verdict.id = 'verdict';
  if (solved()) {
    verdict.className = 'verdict good';
    verdict.textContent = `✓ Correct — +${S.scores[S.qi]} pts`;
    card.appendChild(verdict);
    card.appendChild(glossPanel(q));
    const row = el('div', 'btnrow');
    const next = el('button', 'btn primary', S.qi + 1 < P.questions.length ? 'Next question →' : 'Finish journey →');
    next.addEventListener('click', nextQuestion);
    row.appendChild(next);
    card.appendChild(row);
  } else {
    const row = el('div', 'btnrow');
    const hint = el('button', 'btn', 'Hint −25');
    const clear = el('button', 'btn', 'Clear');
    const check = el('button', 'btn primary', 'Check');
    hint.addEventListener('click', doHint);
    clear.addEventListener('click', () => { ans = []; renderQuestion(); });
    check.addEventListener('click', doCheck);
    check.disabled = ans.length === 0;
    row.append(hint, clear, check);
    card.appendChild(row);
    card.appendChild(verdict);
  }
  area.appendChild(card);
  applyHighlight();
}

function glossPanel(q) {
  const g = el('div', 'gloss');
  for (const tok of q.con) {
    const chip = el('div', 'gchip');
    chip.appendChild(el('b', null, tok.form));
    chip.appendChild(document.createTextNode(' '));
    chip.appendChild(el('span', null, tok.gloss.join('-')));
    g.appendChild(chip);
  }
  return g;
}

/* ---------- answer actions ---------- */
function doCheck() {
  const q = curQ();
  const byId = Object.fromEntries(q.tiles.map((t) => [t.id, t]));
  const got = ans.map((id) => byId[id].t).join(' ');
  if (got === q.correct.join(' ')) {
    S.scores.push(qScoreNow());
    save();
    renderDots();
    renderQuestion();
  } else {
    S.pen = Math.min(90, S.pen + 20);
    save();
    renderDots();
    const v = $('#verdict');
    v.className = 'verdict bad';
    let p = 0;
    while (p < ans.length && byId[ans[p]].t === q.correct[p]) p++;
    v.textContent = p > 0 ? `Not quite — the first ${p} ${p === 1 ? 'word is' : 'words are'} right.` : 'Not quite — keep deducing.';
    const line = $('#ansline');
    line.classList.add('shake');
    [...line.children].slice(0, p).forEach((t) => t.classList.add('ok'));
    setTimeout(() => line.classList.remove('shake'), 450);
  }
}

function doHint() {
  const q = curQ();
  const byId = Object.fromEntries(q.tiles.map((t) => [t.id, t]));
  let p = 0;
  while (p < ans.length && byId[ans[p]].t === q.correct[p]) p++;
  if (p >= q.correct.length) return; // answer already complete & right; just press Check
  ans = ans.slice(0, p);
  const inAns = new Set(ans);
  const tile = q.tiles.find((t) => !inAns.has(t.id) && t.t === q.correct[p]);
  if (tile) ans.push(tile.id);
  S.pen = Math.min(90, S.pen + 25);
  save();
  renderDots();
  renderQuestion();
}

function nextQuestion() {
  S.qi++;
  S.pen = 0;
  ans = [];
  if (S.qi >= P.questions.length && !S.done) {
    S.done = true;
    const st = store.get('px:stats', { langs: 0, points: 0 });
    st.langs++;
    st.points += S.scores.reduce((a, b) => a + b, 0) * P.mult;
    store.set('px:stats', st);
  }
  save();
  renderDots();
  renderQuestion();
}

/* ---------- finish screen + dossier ---------- */
function renderFinish(area) {
  $('#qtitle').textContent = 'Journey complete';
  const total = S.scores.reduce((a, b) => a + b, 0);
  const pct = total / P.maxScore;
  const stars = pct >= 0.85 ? '★★★' : pct >= 0.6 ? '★★☆' : '★☆☆';

  const card = el('div', 'qcard finish');
  card.appendChild(el('div', null, `You have deciphered ${P.langName}.`));
  card.appendChild(el('div', 'stars', stars));
  card.appendChild(el('div', 'big', P.mult > 1
    ? `${total} / ${P.maxScore} × ${P.mult} = ${total * P.mult} pts banked`
    : `${total} / ${P.maxScore} pts`));
  if (S.level === 5) {
    card.appendChild(el('div', 'eng', 'The rails continue past the Oracle: five bonus tiers await — ergative case, sandhi, dual number, noun classes…'));
  }
  const row = el('div', 'btnrow');
  const again = el('button', 'btn', 'New language');
  again.addEventListener('click', () => start(newSeed(), S.level, false));
  row.appendChild(again);
  if (S.level < 10) {
    const up = el('button', 'btn primary', `Level ${S.level + 1} →`);
    up.addEventListener('click', () => start(newSeed(), S.level + 1, false));
    row.appendChild(up);
  } else {
    const again10 = el('button', 'btn primary', 'Another at level 10 →');
    again10.addEventListener('click', () => start(newSeed(), 10, false));
    row.appendChild(again10);
  }
  card.appendChild(row);
  area.appendChild(card);

  // the payoff: the language's full dossier
  const dossier = el('div', 'qcard');
  dossier.appendChild(el('div', 'qdir', `Dossier: a grammar of ${P.langName}`));
  const ul = el('ul', 'notes-list');
  for (const [k, v] of P.notes) {
    const li = el('li');
    li.appendChild(el('b', null, k));
    li.appendChild(el('span', null, v));
    ul.appendChild(li);
  }
  dossier.appendChild(ul);
  const tbl = el('table', 'lex');
  for (const [stem, eng, pos] of P.lexTable) {
    const tr = el('tr');
    tr.appendChild(el('td', null, stem));
    tr.appendChild(el('td', null, eng));
    tr.appendChild(el('td', null, pos));
    tbl.appendChild(tr);
  }
  const h = el('div', 'qdir', 'Lexicon');
  h.style.marginTop = '14px';
  dossier.appendChild(h);
  dossier.appendChild(tbl);
  area.appendChild(dossier);
}

function renderAll() {
  renderLangbar();
  renderCorpus();
  renderDots();
  renderQuestion();
  loadNotes();
}

/* ---------- sheets ---------- */
const overlay = $('#overlay');
let openId = null;
function openSheet(id) {
  closeSheet();
  openId = id;
  overlay.classList.add('show');
  $('#' + id).classList.add('show');
  if (id === 'sheetMenu') renderMenu();
}
function closeSheet() {
  if (!openId) return;
  $('#' + openId).classList.remove('show');
  overlay.classList.remove('show');
  openId = null;
}
overlay.addEventListener('click', closeSheet);
$('#btnHelp').addEventListener('click', () => openSheet('sheetHelp'));
$('#btnMenu').addEventListener('click', () => openSheet('sheetMenu'));
$('#btnNotes').addEventListener('click', () => openSheet('sheetNotes'));
$('#helpClose').addEventListener('click', closeSheet);

function renderMenu() {
  const st = store.get('px:stats', { langs: 0, points: 0 });
  $('#menuStats').textContent = `★ ${st.points} lifetime points · ${st.langs} language${st.langs === 1 ? '' : 's'} deciphered`;
  const list = $('#lvlList');
  list.innerHTML = '';
  for (let i = 1; i <= 10; i++) {
    if (i === 6) {
      const div = el('div', 'menu-stats', '— BEYOND THE ORACLE · bonus tiers —');
      div.style.textAlign = 'center';
      div.style.letterSpacing = '.08em';
      list.appendChild(div);
    }
    const b = el('button', 'lvlbtn' + (i === S.level ? ' cur' : ''));
    b.appendChild(el('span', 'n', String(i)));
    const span = el('span');
    span.appendChild(el('span', null, LEVELS[i].name + ' '));
    span.appendChild(el('small', null, '— ' + LEVEL_BLURBS[i]));
    b.appendChild(span);
    b.addEventListener('click', () => { closeSheet(); start(newSeed(), i, false); });
    list.appendChild(b);
  }
}
$('#btnNew').addEventListener('click', () => { closeSheet(); start(newSeed(), S.level, false); });
$('#btnShare').addEventListener('click', async () => {
  const url = location.href;
  const text = `Polyglot Express — can you decipher ${P.langName}? A language that has never existed before.`;
  const btn = $('#btnShare');
  try {
    if (navigator.share) { await navigator.share({ title: 'Polyglot Express', text, url }); return; }
    await navigator.clipboard.writeText(text + ' ' + url);
    btn.textContent = 'Link copied ✓';
  } catch (e) {
    btn.textContent = url;
  }
  setTimeout(() => { btn.textContent = 'Share this language'; }, 1800);
});

/* ---------- notebook ---------- */
const pad = $('#notepad');
const notesKey = () => `px:notes:${S.seed}.${S.level}`;
function loadNotes() { pad.value = store.get(notesKey(), ''); }
pad.addEventListener('input', () => store.set(notesKey(), pad.value));

/* ---------- boot ---------- */
window.addEventListener('hashchange', () => {
  const h = parseHash();
  if (h && (h.seed !== S.seed || h.level !== S.level)) start(h.seed, h.level, true);
});

const h = parseHash();
const savedCur = store.get('px:cur', null);
if (h) start(h.seed, h.level, true);
else if (savedCur && !savedCur.done) start(savedCur.seed, savedCur.level, true);
else start(newSeed(), store.get('px:lastlvl', 1), false);

if (!store.get('px:intro', false)) {
  openSheet('sheetHelp');
  store.set('px:intro', true);
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
})();
