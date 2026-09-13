// One-time script: builds the backup-JSON file Casey imports (via the
// Backup/Restore screen) into her NEW cloud account, to restore her real
// WaniKani progress (transcribed from her own app screenshots, see
// files/level progress/) that used to be auto-seeded/auto-imported in
// index.html before multi-user accounts existed:
//   - KANJI: exact per-character stage, transcribed 1:1 from her real WK
//     Apprentice/Guru screens (see KANJI_STAGE_OVERRIDES below) — total is
//     83 kanji (Apprentice 16 + Guru 67), which exactly matches her full
//     Level 1+2+3 kanji count (18+35+30), confirming all L1-3 kanji are
//     introduced, matching what she reported ("all level 3 kanji in my
//     current review")
//   - VOCAB Level 1-2: level-based (Guru'd) — no per-word screen for these.
//     Level 3: exact, word-for-word from her real WK Level 3 list (see
//     LEVEL3_LEARNED_WORDS) — all 73 words matched CORE_VOCAB 1:1 with zero
//     misses, so this replaced the earlier "first N by array order" guess
//     once it turned out not to match her real reviews.
//   - Her Duolingo vocab (DUO_RAW) and tourist/food vocab
//     (tourist-vocab-output.json, built by build-tourist-vocab.js from
//     files/tokyo-vocabulary-merged.md) both go into STATE.customVocab.vocab
//     but are NOT introduced — per her latest ask, custom vocab now needs
//     to go through an actual Custom Vocab Lesson (Vocab tab > Custom
//     Vocab, pick which ones, run the lesson) before it enters the real
//     review cycle, same as WK content does. They'll show up there ready
//     to pick from.
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

// BUG FIX: this used to index hoursTable[stage - 1], off-by-one from the
// real app's nextAvailableAt(), which indexes hoursTable[stage] directly
// (see index.html — "index = stage (1-8)"). That off-by-one meant
// stage-1 items (introduceItem, below) got hoursTable[0] === null, i.e.
// availableAt: null — which reviewQueueFor() treats as "never due". Every
// Duo word imported this way would have silently never shown up for
// review, ever.
function nextAvailableAt(stage, hoursTable) {
  const hours = hoursTable[stage];
  return hours === null || hours === undefined ? null : Date.now() + hours * 3600 * 1000;
}

// Deterministic pseudo-random spread, so items you'd actually Guru'd at
// different real-world times don't all land on the exact same due
// instant (which would dump the whole level on you in one sitting the
// moment the timer hits). Hashes the item's id into an offset within
// [0, spreadHours) — same input always gives the same offset, so
// re-running this script produces a stable schedule rather than
// reshuffling due times every time.
function hashSpreadHours(id, spreadHours) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % spreadHours;
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

function setItemStage(type, id, stage, dueNow) {
  state.items[`${type}:${id}`] = {
    stage,
    availableAt: dueNow ? Date.now() - 1000 : nextAvailableAt(stage, SRS_HOURS),
    learnedAt: Date.now(),
    lastReviewedAt: Date.now()
  };
}
// Same as setItemStage, but spreads availableAt across the next
// `spreadHours` instead of everyone landing on the exact same instant —
// for items that were really Guru'd at different real-world times before
// this app tracked that, so reviews trickle in instead of piling up.
function setItemStageSpread(type, id, stage, spreadHours) {
  state.items[`${type}:${id}`] = {
    stage,
    availableAt: Date.now() + hashSpreadHours(id, spreadHours) * 3600 * 1000,
    learnedAt: Date.now(),
    lastReviewedAt: Date.now()
  };
}
// Reviews naturally land at different real-world moments; spreading Guru-
// tier items across a week (Guru I's real interval) avoids dumping them
// all on you in one sitting the instant you import.
const GURU_SPREAD_HOURS = 7 * 24;

// ---- KANJI: exact stage per character, transcribed from her real WK
// Apprentice/Guru screens (files/level progress/IMG_9637-9648.PNG). ----
const KANJI_STAGE_OVERRIDES = {
  2: ['月'],
  3: ['切', '毛', '矢'],
  4: ['今', '午', '友', '太', '少', '止', '冬', '半', '古', '広', '字', '生'],
  5: ['力', '大', '刀', '小', '丸', '才', '中', '左', '正', '々', '万', '分', '引', '心', '戸', '方', '牛', '父', '北', '台', '外', '市', '母', '用', '明'],
  6: ['一', '二', '九', '七', '人', '入', '八', '十', '三', '上', '下', '口', '女', '山', '川', '工', '土', '千', '夕', '子', '丁', '五', '六', '円', '天', '手', '文', '日', '木', '水', '火', '犬', '王', '出', '右', '四', '本', '玉', '田', '白', '目', '立']
};
const kanjiCharToStage = {};
Object.entries(KANJI_STAGE_OVERRIDES).forEach(([stage, chars]) => chars.forEach(c => { kanjiCharToStage[c] = Number(stage); }));

let kanjiApplied = 0;
KANJI.forEach(k => {
  const stage = kanjiCharToStage[k.char];
  if (!stage) return; // not in her real progress yet — leave un-introduced
  kanjiApplied++;
  if (stage <= 4) setItemStage('kanji', k.id, stage, true); // Apprentice tiers — actively cycling through review right now
  else setItemStageSpread('kanji', k.id, stage, GURU_SPREAD_HOURS); // Guru tiers — spread out
});

// ---- VOCAB Level 1-2: Guru'd + spread (no per-word screen for these, so
// still level-based). ----
CORE_VOCAB.filter(v => v.level === 1 || v.level === 2).forEach(v => setItemStageSpread('vocab', v.id, 5, GURU_SPREAD_HOURS));

// ---- VOCAB Level 3: exact, word-for-word from her real WK Level 3
// lesson/review lists (all 73 words matched 1:1 against CORE_VOCAB — no
// misses, unlike the vocab-word mismatches seen at other levels). Replaces
// the earlier "introduce the first N by array order" guess, which visibly
// didn't match her real reviews.
const LEVEL3_LEARNED_WORDS = [
  'これ', 'する', 'リンゴ', 'コーヒー', 'こんにちは', 'いつ', '山びこ', 'テーブルの上',
  'ベッドの下', '日の出', 'イギリス人', 'アメリカ人', 'フランス人', 'ビー玉', '一万', '二万',
  '十万', '分', '引く', '牛', '一台', '二台', '五台', '十台', '〜台', '〜人', '万',
  '女の人', '大人しい'
];
// Everything else at Level 3 — her WK "Lessons" (available, not started)
// and "Locked" (kanji prerequisite not met) items alike — isn't introduced
// in our app either; we have no kanji-locks-vocab mechanic, so both just
// stay as ordinary un-learned Lessons, same as they'd naturally appear.
const level3Vocab = CORE_VOCAB.filter(v => v.level === 3);
const learnedSet = new Set(LEVEL3_LEARNED_WORDS);
const level3Matched = level3Vocab.filter(v => learnedSet.has(v.word));
level3Matched.forEach(v => setItemStage('vocab', v.id, 3, true));

// Duo + tourist vocab: added to the custom deck only, NOT introduced —
// they'll show up in Vocab > Custom Vocab for her to pick and lesson.
DUO_RAW
  .filter(d => !CORE_VOCAB.some(v => v.word === d.word))
  .forEach(d => {
    state.customVocab.vocab.push({ id: d.word, word: d.word, reading: d.reading, meaning: d.meaning, source: 'custom' });
  });

const touristVocabPath = path.join(__dirname, 'tourist-vocab-output.json');
let touristCount = 0;
if (fs.existsSync(touristVocabPath)) {
  const touristVocab = JSON.parse(fs.readFileSync(touristVocabPath, 'utf8'));
  const existingIds = new Set(state.customVocab.vocab.map(v => v.id));
  touristVocab
    .filter(t => !CORE_VOCAB.some(v => v.word === t.word) && !existingIds.has(t.id))
    .forEach(t => { state.customVocab.vocab.push(t); touristCount++; });
}

const outPath = path.join(__dirname, 'casey-progress-import.json');
fs.writeFileSync(outPath, JSON.stringify(state, null, 2));
console.log(`Wrote ${outPath}`);
console.log(`Kanji matched to a real stage: ${kanjiApplied} of ${KANJI.filter(k => k.level <= 3).length} in Levels 1-3 (expect 83)`);
console.log(`  Apprentice (stage 2-4): ${Object.values(KANJI_STAGE_OVERRIDES).flat().length - KANJI_STAGE_OVERRIDES[5].length - KANJI_STAGE_OVERRIDES[6].length}`);
console.log(`  Guru (stage 5-6): ${KANJI_STAGE_OVERRIDES[5].length + KANJI_STAGE_OVERRIDES[6].length}`);
console.log(`Vocab L1-2 Guru'd: ${CORE_VOCAB.filter(v => v.level === 1 || v.level === 2).length}`);
console.log(`Vocab L3 matched exactly and introduced: ${level3Matched.length} of ${LEVEL3_LEARNED_WORDS.length} real learned words (expect 29 of 29)`);
console.log(`  L3 left as ordinary Lessons: ${level3Vocab.length - level3Matched.length}`);
console.log(`Custom vocab deck total (not introduced, ready to pick in Custom Vocab Lessons): ${state.customVocab.vocab.length}`);
console.log(`  of which tourist/food vocab: ${touristCount}`);
