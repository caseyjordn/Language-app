// One-time build script: parses vocab-mnemonics-levels-01-05-FINAL.md and
// generates the CORE_VOCAB array literal text (all 441 words, Levels 1-5,
// each tagged with WHY its reading is what it is). Run once, paste output
// into index.html, then delete this script (or keep it for the next content
// update — re-running is safe, it doesn't touch index.html itself).
//
// Usage: node build-vocab.js > vocab-array-output.txt

const fs = require('fs');
const path = require('path');

const mdPath = path.join(__dirname, 'files', 'vocab-mnemonics-levels-01-05-FINAL.md');
const md = fs.readFileSync(mdPath, 'utf8');
const lines = md.split('\n');

let currentLevel = null;
const rows = [];

for (const line of lines) {
  const levelMatch = line.match(/^## Level (\d+)/);
  if (levelMatch) { currentLevel = Number(levelMatch[1]); continue; }

  if (!line.trim().startsWith('|')) continue;
  if (/^\|\s*Word\s*\|/.test(line)) continue;       // header row
  if (/^\|[\s-]+\|/.test(line) && line.includes('---')) continue; // separator row
  if (currentLevel === null) continue;

  const cells = line.split('|').map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
  if (cells.length < 5) continue;
  const [word, reading, meaning, type, mnemonic] = cells;
  if (!word || word === 'Word') continue;
  rows.push({ level: currentLevel, word, reading, meaning, type, mnemonic });
}

function jsString(s) {
  // backtick template literal — only need to escape backticks/${ (none expected in this content)
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
  // de-dupe ids: a few words legitimately repeat across levels or within
  // one (e.g. two words both glossed "Rice Paddy") — suffix a counter so
  // every array entry still has a unique id/key.
  idCounts[r.word] = (idCounts[r.word] || 0) + 1;
  const id = idCounts[r.word] > 1 ? `${r.word}#${idCounts[r.word]}` : r.word;

  const meaningJs = r.meaning.includes("'") ? jsSingleQuoted(r.meaning) : `'${r.meaning}'`;
  out.push(
    `  {id:${jsSingleQuoted(id)},word:${jsSingleQuoted(r.word)},reading:${jsSingleQuoted(r.reading)},meaning:${meaningJs},readingType:${jsString(r.type)},level:${r.level},meaningMnemonic:${jsString(r.mnemonic)}},`
  );
}

console.log(`// Parsed ${rows.length} vocab rows from FINAL doc.`);
console.log(out.join('\n'));
