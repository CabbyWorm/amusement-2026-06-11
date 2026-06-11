# 🚂 Polyglot Express

**Decipher a language that didn't exist a second ago.**

Every round, Polyglot Express invents a complete miniature language from a seed —
phoneme inventory, vowel harmony, case suffixes, verb agreement, tense marking,
SOV/SVO/VSO/OVS word order, negation strategy. It then hands you a small "Rosetta
stone" corpus of translated sentences and challenges you to translate **sentences
you have never seen, in both directions** — exactly like the famous decipherment
problems from the International Linguistics Olympiad, except generated endlessly.

No two languages are alike. None of them appear in any dictionary on Earth.

## The fairness guarantee

A decipherment puzzle is only fun if it's *fair*. The generator enforces, by
construction, that every question is solvable purely by deduction:

- every stem and every suffix a question needs is **attested in the corpus**;
- the corpus always contains the **minimal pairs** you need — the same noun in
  singular and plural, the same verb in two tenses, the same noun as subject
  and object (so the case suffix is isolatable);
- all inflected forms across the lexicon are pairwise distinct (colliding
  languages are rejected and rerolled);
- every question is **novel** — never a corpus sentence repeated back.

These invariants are tested across thousands of generated puzzles:

```
node test/test.js 300   # 1500 puzzles × all invariants
```

## Playing

- **Tap any foreign word** to light up its exact twins (bright) and likely
  relatives (faint) across the corpus.
- Build translations from tiles. Wrong inflections of the right stems lurk
  among them — the suffixes matter.
- The 📓 notebook (saved locally, per language) is your field journal.
- Finish a journey and you're rewarded with the **dossier**: the full grammar
  and lexicon of the language you just cracked.
- Share the URL (`#seed.level`) and a friend gets the *identical* language.

Five difficulty tiers, from **Tourist** (plurals, past tense) to **Oracle of
Babel** (vowel harmony, object case, verb agreement, negation, and word orders
like OVS that no major human language uses).

## Hosting

Pure static files, no build step, no dependencies. Works offline after first
load (service worker) and installs as a PWA.

**GitHub Pages:** Settings → Pages → *Deploy from a branch* → pick this branch,
root folder. Done.

**Local:** any static server, e.g. `python3 -m http.server` then open
`http://localhost:8000`.

## Layout

| file | role |
|---|---|
| `engine.js` | seeded language generator, corpus builder, question/tile builder — pure logic, runs in Node too |
| `app.js` | UI: tiles, highlighting, scoring, notebook, dossier |
| `index.html` | markup + styles |
| `sw.js`, `manifest.webmanifest` | offline + PWA |
| `test/test.js` | fairness-invariant test suite |
