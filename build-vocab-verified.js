// Rebuilds the ENTIRE CORE_VOCAB array (Levels 1-10) using:
//   - vocab-mnemonics-levels-01-05-FINAL.md   -> word/meaning/readingType/mnemonic, L1-5
//   - vocab-mnemonics-levels-06-10.md         -> word/meaning/note(->type+mnemonic), L6-10
//   - vocab-readings-levels-01-10-WK-VERIFIED.md -> the AUTHORITATIVE reading for
//     every word, "copied directly from WaniKani's own vocabulary pages" —
//     overrides whatever reading the mnemonic docs list, the same fix
//     already applied to kanji (see kanji-mnemonics-levels-01-10-WK-VERIFIED.md,
//     which found real mismatches like 九/大/人/川 from dictionary-reconstructed
//     readings vs what WK actually teaches).
//
// Usage: node build-vocab-verified.js > vocab-verified-output.txt

const fs = require('fs');
const path = require('path');

function parseLeveledTable(mdPath, headerTest) {
  const md = fs.readFileSync(mdPath, 'utf8');
  const lines = md.split('\n');
  let currentLevel = null;
  const rows = [];
  for (const line of lines) {
    const levelMatch = line.match(/^## Level (\d+)/);
    if (levelMatch) { currentLevel = Number(levelMatch[1]); continue; }
    if (!line.trim().startsWith('|')) continue;
    if (headerTest(line)) continue;
    if (/^\|[\s-]+\|/.test(line) && line.includes('---')) continue;
    if (currentLevel === null) continue;
    const cells = line.split('|').map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
    rows.push({ level: currentLevel, cells });
  }
  return rows;
}

// ---- 1. Load the WK-verified reading for every word, keyed by level+word
// (a couple of words legitimately repeat with different readings across
// entries, e.g. 大した vs 大人, so keying on word ALONE risks collisions —
// level+word is unique enough for this dataset). ----
const readingsPath = path.join(__dirname, 'files', 'vocab-readings-levels-01-10-WK-VERIFIED.md');
const readingRows = parseLeveledTable(readingsPath, line => /^\|\s*Word\s*\|/.test(line));
const verifiedReading = new Map(); // `${level}:${word}` -> reading
readingRows.forEach(({ level, cells }) => {
  const [word, reading] = cells;
  if (word && word !== 'Word') verifiedReading.set(`${level}:${word}`, reading);
});
console.error(`Loaded ${verifiedReading.size} verified readings.`);

function lookupReading(level, word, fallback) {
  const key = `${level}:${word}`;
  if (verifiedReading.has(key)) return verifiedReading.get(key);
  return fallback; // not found in the verified doc — keep whatever the mnemonic doc said, flagged below
}

// ---- 2. Levels 1-5 (5-column: Word/Reading/Meaning/Type/Mnemonic) ----
const finalPath = path.join(__dirname, 'files', 'vocab-mnemonics-levels-01-05-FINAL.md');
const finalRows = parseLeveledTable(finalPath, line => /^\|\s*Word\s*\|/.test(line));
const entries15 = [];
const misses15 = [];
finalRows.forEach(({ level, cells }) => {
  if (cells.length < 5) return;
  const [word, reading, meaning, type, mnemonic] = cells;
  if (!word || word === 'Word') return;
  const verified = lookupReading(level, word, null);
  if (verified === null) misses15.push(`${level}:${word}`);
  entries15.push({ level, word, reading: verified || reading, meaning, type, mnemonic });
});

// ---- 3. Levels 6-10 (4-column: Word/Reading/Meaning/Note) ----
function splitNote(note) {
  const idx = note.indexOf(': ');
  if (idx === -1) return { type: note.replace(/\.$/, ''), mnemonic: note };
  return { type: note.slice(0, idx), mnemonic: note.slice(idx + 2) };
}
const v610Path = path.join(__dirname, 'files', 'vocab-mnemonics-levels-06-10.md');
const v610Rows = parseLeveledTable(v610Path, line => /^\|\s*Word\s*\|/.test(line));
const entries610 = [];
const misses610 = [];
v610Rows.forEach(({ level, cells }) => {
  if (cells.length < 4) return;
  const [word, reading, meaning, note] = cells;
  if (!word || word === 'Word') return;
  const verified = lookupReading(level, word, null);
  if (verified === null) misses610.push(`${level}:${word}`);
  const { type, mnemonic } = splitNote(note);
  entries610.push({ level, word, reading: verified || reading, meaning, type, mnemonic });
});

console.error(`Levels 1-5: ${entries15.length} words, ${misses15.length} not found in verified doc.`);
if (misses15.length) console.error('  Missing (kept mnemonic-doc reading):', misses15.join(', '));
console.error(`Levels 6-10: ${entries610.length} words, ${misses610.length} not found in verified doc.`);
if (misses610.length) console.error('  Missing (kept mnemonic-doc reading):', misses610.join(', '));

// ---- 4. Emit combined CORE_VOCAB ----
function jsString(s) {
  return '`' + s.replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`';
}
function jsSingleQuoted(s) {
  return "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

const all = entries15.concat(entries610);
const idCounts = {};
const out = [];
let lastLevel = null;
for (const r of all) {
  if (r.level !== lastLevel) {
    out.push(`\n  // ---- Level ${r.level} ----`);
    lastLevel = r.level;
  }
  idCounts[r.word] = (idCounts[r.word] || 0) + 1;
  const id = idCounts[r.word] > 1 ? `${r.word}#${idCounts[r.word]}` : r.word;
  const meaningJs = r.meaning.includes("'") ? jsSingleQuoted(r.meaning) : `'${r.meaning}'`;
  out.push(
    `  {id:${jsSingleQuoted(id)},word:${jsSingleQuoted(r.word)},reading:${jsSingleQuoted(r.reading)},meaning:${meaningJs},readingType:${jsString(r.type)},level:${r.level},meaningMnemonic:${jsString(r.mnemonic)}},`
  );
}

console.log(`// Parsed ${all.length} vocab rows (Levels 1-10), readings cross-checked against WK-VERIFIED doc.`);
console.log(out.join('\n'));
