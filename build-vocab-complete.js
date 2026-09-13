// Rebuilds the ENTIRE CORE_VOCAB array (Levels 1-10, 1120 words) from
// VOCAB-COMPLETE-01-10.md, which adds the same lesson depth vocab got for
// kanji: alternate English meanings, word type (noun/adjective/counter/
// etc. — stored in readingType, since vocab has only one reading so there's
// no reading-pattern ambiguity to explain the way kanji needed), and two
// original example sentences (easy/advanced) per word.
//
// Usage: node build-vocab-complete.js > vocab-complete-output.txt

const fs = require('fs');
const path = require('path');

const mdPath = path.join(__dirname, 'files', 'VOCAB-COMPLETE-01-10.md');
const md = fs.readFileSync(mdPath, 'utf8');

// Same paren-aware comma split as build-kanji-complete.js — alt-meaning
// lists can have entries like "Female (student, athlete, etc.)" where a
// naive comma-split would cut the parenthetical in half.
function splitTopLevel(text, delimiter) {
  const parts = [];
  let depth = 0, current = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth === 0 && text.startsWith(delimiter, i)) {
      parts.push(current);
      current = '';
      i += delimiter.length - 1;
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

const levelBlocks = md.split(/^## Level (\d+)[^\n]*$/m).slice(1);
const rows = [];

for (let i = 0; i < levelBlocks.length; i += 2) {
  const level = Number(levelBlocks[i]);
  const body = levelBlocks[i + 1];
  const entryBlocks = body.split(/^### /m).slice(1);

  for (const block of entryBlocks) {
    const lines = block.split('\n');
    const headerMatch = lines[0].trim().match(/^(.+?) — (.+?) — (.+)$/);
    if (!headerMatch) continue;
    const [, word, reading, meaning] = headerMatch;

    let idx = 1;
    while (idx < lines.length && lines[idx].trim() === '') idx++;

    let altMeanings = [];
    let wordType = '';
    if (lines[idx] && lines[idx].trim().startsWith('*')) {
      const meta = lines[idx].trim().replace(/^\*|\*$/g, '');
      const parts = splitTopLevel(meta, ' · ');
      if (parts.length === 2) {
        const alsoMatch = parts[0].match(/^Also:\s*(.+)$/);
        altMeanings = alsoMatch ? splitTopLevel(alsoMatch[1], ',').map(s => s.trim()).filter(Boolean) : [];
        wordType = parts[1].trim();
      } else {
        // no "Also:" — just a bare word-type line, e.g. "*number*" or "*counter*"
        wordType = parts[0].replace(/^Also:\s*/, '').trim();
      }
      idx++;
    }
    while (idx < lines.length && lines[idx].trim() === '') idx++;

    const mnemonic = (lines[idx] || '').trim();
    idx++;

    const examples = [];
    for (; idx < lines.length; idx++) {
      const line = lines[idx].trim();
      const exMatch = line.match(/^- (Easy|Advanced):\s*(.+?)\s*—\s*(.+?)\s*—\s*(.+)$/);
      if (exMatch) {
        const [, tier, jp, romaji, en] = exMatch;
        examples.push({ level: tier.toLowerCase(), jp, romaji, en });
      }
    }

    rows.push({ level, word, reading, meaning, altMeanings, wordType, mnemonic, examples });
  }
}

function jsString(s) {
  return '`' + s.replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`';
}
function jsSingleQuoted(s) {
  return "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}
function jsArrayOfStrings(arr) {
  return '[' + arr.map(jsSingleQuoted).join(', ') + ']';
}
function jsExamples(examples) {
  return '[' + examples.map(e =>
    `{level:${jsSingleQuoted(e.level)},jp:${jsSingleQuoted(e.jp)},romaji:${jsSingleQuoted(e.romaji)},en:${jsSingleQuoted(e.en)}}`
  ).join(', ') + ']';
}

const idCounts = {};
const out = [];
let lastLevel = null;
let noExampleCount = 0;
for (const r of rows) {
  if (r.level !== lastLevel) {
    out.push(`\n  // ---- Level ${r.level} ----`);
    lastLevel = r.level;
  }
  idCounts[r.word] = (idCounts[r.word] || 0) + 1;
  const id = idCounts[r.word] > 1 ? `${r.word}#${idCounts[r.word]}` : r.word;
  const meaningJs = r.meaning.includes("'") ? jsSingleQuoted(r.meaning) : `'${r.meaning}'`;
  if (r.examples.length < 2) noExampleCount++;

  out.push(
    `  {id:${jsSingleQuoted(id)},word:${jsSingleQuoted(r.word)},reading:${jsSingleQuoted(r.reading)},altMeanings:${jsArrayOfStrings(r.altMeanings)},meaning:${meaningJs},readingType:${jsString(r.wordType)},level:${r.level},meaningMnemonic:${jsString(r.mnemonic)},examples:${jsExamples(r.examples)}},`
  );
}

console.log(`// Parsed ${rows.length} vocab rows from VOCAB-COMPLETE-01-10.md.`);
console.log(`// Entries with fewer than 2 examples: ${noExampleCount}`);
console.log(out.join('\n'));
