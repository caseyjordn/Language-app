// One-time script: builds the backup-JSON file Casey imports (via the
// Backup/Restore screen) into her NEW cloud account, to restore the real
// progress that used to be auto-seeded/auto-imported in index.html before
// multi-user accounts existed:
//   - Vocab/Kanji Levels 1-2 set to Guru'd (stage 5), matching the old
//     one-time seed block
//   - Kanji Level 3 introduced at Apprentice I (stage 1)
//   - Levels set to 3 for both
//   - Her Duolingo vocab (DUO_RAW), previously auto-merged into the global
//     VOCAB list for every user, moved into STATE.customVocab.vocab and
//     auto-introduced — same as the old Duo auto-import behavior, but now
//     scoped to her account only instead of leaking into every signup
//
// This does NOT touch index.html or any live account — it just writes
// casey-progress-import.json. Run once: `node migrate-duo-vocab.js`, then
// on caseyjordn@gmail.com's account, go to Backup / Restore -> Import,
// paste the file's contents, and Import.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadAppData() {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const start = html.indexOf("'use strict';");
  const end = html.indexOf('</script>', start);
  const code = html.slice(start, end);

  const sandbox = {
    localStorage: { getItem: () => null, setItem() {} },
    window: { addEventListener() {}, innerWidth: 1000, innerHeight: 800, scrollTo() {} },
    location: { hash: '' },
    document: {
      getElementById: () => ({ innerHTML: '', appendChild() {}, querySelectorAll: () => [], addEventListener() {}, remove() {}, style: { setProperty() {} }, offsetWidth: 0, classList: { add() {}, remove() {}, toggle() {}, contains: () => false } }),
      documentElement: { style: { setProperty() {} } },
      querySelectorAll: () => [],
      body: { appendChild() {} },
      addEventListener() {}
    },
    getComputedStyle: () => ({ getPropertyValue: () => '#AA00FF' }),
    fetch: () => Promise.reject(new Error('no network in extraction sandbox')),
    firebase: { initializeApp() {}, auth: () => ({ onAuthStateChanged() {}, signOut() {} }), firestore() {} },
    navigator: {},
    alert() {},
    console
  };

  const context = vm.createContext(sandbox);
  vm.runInContext(code + '\nthis.__EXPORTED__ = { CORE_VOCAB, KANJI, DUO_RAW, SRS_HOURS };', context);
  return context.__EXPORTED__;
}

function nextAvailableAt(stage, hoursTable) {
  const hours = hoursTable[stage - 1];
  return hours === null ? null : Date.now() + hours * 3600 * 1000;
}

const { CORE_VOCAB, KANJI, DUO_RAW, SRS_HOURS } = loadAppData();

const state = {
  items: {},
  levels: { vocab: 3, kanji: 3, grammar: 1 },
  recentMistakes: [],
  lessonBatchSize: 5,
  devTimeOffsetMs: 0,
  customVocab: { vocab: [], kanji: [], grammar: [] }
};

function setItemStage(type, id, stage) {
  state.items[`${type}:${id}`] = { stage, availableAt: nextAvailableAt(stage, SRS_HOURS), learnedAt: Date.now(), lastReviewedAt: Date.now() };
}
function introduceItem(type, id) {
  state.items[`${type}:${id}`] = { stage: 1, availableAt: nextAvailableAt(1, SRS_HOURS), learnedAt: Date.now(), lastReviewedAt: null };
}

CORE_VOCAB.filter(v => v.level === 1 || v.level === 2).forEach(v => setItemStage('vocab', v.id, 5));
KANJI.filter(k => k.level === 1 || k.level === 2).forEach(k => setItemStage('kanji', k.id, 5));
KANJI.filter(k => k.level === 3).forEach(k => setItemStage('kanji', k.id, 1));

DUO_RAW
  .filter(d => !CORE_VOCAB.some(v => v.word === d.word))
  .forEach(d => {
    const item = { id: d.word, word: d.word, reading: d.reading, meaning: d.meaning, source: 'custom' };
    state.customVocab.vocab.push(item);
    introduceItem('vocab', item.id);
  });

const outPath = path.join(__dirname, 'casey-progress-import.json');
fs.writeFileSync(outPath, JSON.stringify(state, null, 2));
console.log(`Wrote ${outPath}`);
console.log(`Vocab L1-2 Guru'd: ${CORE_VOCAB.filter(v => v.level === 1 || v.level === 2).length}`);
console.log(`Kanji L1-2 Guru'd: ${KANJI.filter(k => k.level === 1 || k.level === 2).length}`);
console.log(`Kanji L3 introduced: ${KANJI.filter(k => k.level === 3).length}`);
console.log(`Duo words moved to customVocab: ${state.customVocab.vocab.length}`);
