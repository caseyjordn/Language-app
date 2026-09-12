// Rebuilds the ENTIRE KANJI array (Levels 1-10) from
// kanji-mnemonics-levels-01-10-WK-VERIFIED.md, which explicitly replaces
// all prior kanji reading tables — each kanji now has exactly ONE reading
// (the one WaniKani actually teaches at that level), not a separate
// onyomi/kunyomi pair reconstructed from general dictionary conventions
// (which caused real mismatches, e.g. 九/大/人/川 per the doc's own note).
//
// Storage shape: the app's KANJI entries still have onyomi/kunyomi fields
// (existing quiz/display code reads `item.onyomi || item.kunyomi`), so the
// single WK reading is stored as `onyomi` with `kunyomi: null` uniformly —
// this makes acceptedFor/displayReading/otherReadingFor all naturally
// collapse to "exactly one correct reading, no soft-fail-other-reading
// case" with zero code changes, since that's exactly the existing
// fallback behavior for a kanji that only has one reading.
//
// A handful of rows use "X...Y" in the WK Reading column to flag "the
// standalone vocab word uses one kun'yomi, but WK teaches a different
// reading for the kanji itself" — those aren't resolvable by position
// (checked manually: it's inconsistent which side is the WK reading), so
// they're hardcoded via READING_OVERRIDES below, cross-checked against
// each row's own explanation text.
//
// Usage: node build-kanji-verified.js > kanji-verified-output.txt
// Then replace the ENTIRE KANJI array in index.html with this output.

const fs = require('fs');
const path = require('path');

const mdPath = path.join(__dirname, 'files', 'kanji-mnemonics-levels-01-10-WK-VERIFIED.md');
const md = fs.readFileSync(mdPath, 'utf8');
const lines = md.split('\n');

// kanji -> the actual WK-taught reading, for the 5 rows whose "WK Reading"
// column is "vocabKun...wkReading" or "wkReading...vocabKun" (order isn't
// consistent — verified against each row's own explanation sentence).
const READING_OVERRIDES = {
  '飲': 'いん',  // "vocab kun is の, but the kanji itself is taught with the on'yomi いん"
  '頭': 'とう',  // "vocab kun is あたま, but the kanji itself is taught with とう"
  '葉': 'よう',  // "vocab kun is は, but the kanji itself is taught with よう"
  '軽': 'けい',  // "vocab kun is かる, but the kanji itself is taught with けい"
  '読': 'どく'   // "vocab kun is よ, but the kanji itself is taught with どく"
};

let currentLevel = null;
const rows = [];

for (const line of lines) {
  const levelMatch = line.match(/^## Level (\d+)/);
  if (levelMatch) { currentLevel = Number(levelMatch[1]); continue; }

  if (!line.trim().startsWith('|')) continue;
  if (/^\|\s*Kanji\s*\|/.test(line)) continue;               // header row
  if (/^\|[\s-]+\|/.test(line) && line.includes('---')) continue; // separator row
  if (currentLevel === null) continue;

  const cells = line.split('|').map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
  if (cells.length < 4) continue;
  const [char, meaning, wkReading, mnemonic] = cells;
  if (!char || char === 'Kanji') continue;

  const reading = READING_OVERRIDES[char] || wkReading;
  rows.push({ level: currentLevel, char, meaning, reading, mnemonic });
}

function jsString(s) {
  return '`' + s.replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`';
}
function jsSingleQuoted(s) {
  return "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

const idCounts = {};
const out = [];
let lastLevel = null;
for (const r of rows) {
  if (r.level !== lastLevel) {
    out.push(`\n  // ---- Level ${r.level} ----`);
    lastLevel = r.level;
  }
  idCounts[r.char] = (idCounts[r.char] || 0) + 1;
  const id = idCounts[r.char] > 1 ? `${r.char}#${idCounts[r.char]}` : r.char;
  const meaningJs = r.meaning.includes("'") ? jsSingleQuoted(r.meaning) : `'${r.meaning}'`;

  out.push(
    `  {id:${jsSingleQuoted(id)},char:${jsSingleQuoted(r.char)},onyomi:${jsSingleQuoted(r.reading)},kunyomi:null,meaning:${meaningJs},level:${r.level},meaningMnemonic:${jsString(r.mnemonic)}},`
  );
}

console.log(`// Parsed ${rows.length} kanji rows from WK-VERIFIED doc (Levels 1-10).`);
console.log(`// Reading overrides applied: ${Object.keys(READING_OVERRIDES).join(', ')}`);
console.log(out.join('\n'));
