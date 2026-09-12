// One-time build script: parses practice-sentences-levels-01-10-CLEAN.md
// into SENTENCES array entries. Unlike vocab/kanji, these are gated by a
// simple `requiredLevel` (matching the doc's own framing: "built from
// cumulative kanji/vocab through each level") rather than per-word
// requiredVocab/requiredKanji lists — accurately tokenizing which specific
// words appear in a raw sentence isn't reliable to automate, and the doc
// itself levels by cumulative content anyway. availableSentences() in
// index.html checks requiredLevel against STATE.levels.vocab/kanji.
//
// No `breakdown` array is generated (the source doc doesn't provide
// word-by-word tags/explanations) — the wrong-answer review panel just
// shows no word tiles for these, which the existing code already handles
// gracefully ((s.breakdown || [])).
//
// Usage: node build-sentences.js > sentences-output.txt

const fs = require('fs');
const path = require('path');

const mdPath = path.join(__dirname, 'files', 'practice-sentences-levels-01-10-CLEAN.md');
const md = fs.readFileSync(mdPath, 'utf8');
const lines = md.split('\n');

let currentLevel = null;
const rows = [];

for (const line of lines) {
  const levelMatch = line.match(/^## Level (\d+)/);
  if (levelMatch) { currentLevel = Number(levelMatch[1]); continue; }

  const rowMatch = line.match(/^\d+\.\s*(.+?)\s+—\s+(.+?)\s+—\s+(.+)$/);
  if (!rowMatch || currentLevel === null) continue;
  const [, jp, romaji, en] = rowMatch;
  rows.push({ level: currentLevel, jp: jp.trim(), romaji: romaji.trim(), en: en.trim() });
}

function jsString(s) {
  return '`' + s.replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`';
}

const out = [];
let lastLevel = null;
let indexInLevel = 0;
for (const r of rows) {
  if (r.level !== lastLevel) {
    out.push(`\n  // ---- Level ${r.level} ----`);
    lastLevel = r.level;
    indexInLevel = 0;
  }
  indexInLevel++;
  const id = `s-l${r.level}-${indexInLevel}`;
  const romajiLower = r.romaji.replace(/\.$/, '').toLowerCase();
  out.push(
    `  { id:'${id}', jp:${jsString(r.jp)}, romaji:${jsString(r.romaji)}, en:${jsString(r.en)}, requiredLevel:${r.level}, requiredVocab:[], requiredKanji:[], requiredGrammar:[], acceptedReadings:[${jsString(romajiLower)}], acceptedTranslations:[${jsString(r.jp)}], breakdown:[] },`
  );
}

console.log(`// Parsed ${rows.length} sentences from practice-sentences-levels-01-10-CLEAN.md.`);
console.log(out.join('\n'));
