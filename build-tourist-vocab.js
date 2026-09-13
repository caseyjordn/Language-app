// Parses tokyo-vocabulary-merged.md (216 words, tourist/food/drink vocab)
// into custom-vocab-shaped entries for Casey's one-time import — same
// shape as the Duo words: { id, word, reading, meaning, meaningMnemonic,
// readingType, source: 'custom' }, NOT auto-introduced (per her new "custom
// vocab needs a real Lesson first" ask — see migrate-duo-vocab.js, which
// now just adds these to customVocab.vocab without calling introduceItem).
//
// Usage: node build-tourist-vocab.js > tourist-vocab-output.json

const fs = require('fs');
const path = require('path');

const mdPath = path.join(__dirname, 'files', 'tokyo-vocabulary-merged.md');
const md = fs.readFileSync(mdPath, 'utf8');

const entryBlocks = md.split(/^### /m).slice(1);
const rows = [];

for (const block of entryBlocks) {
  const lines = block.split('\n');
  const headerMatch = lines[0].trim().match(/^(.+?) — (.+?) — (.+)$/);
  if (!headerMatch) continue;
  const [, word, reading, meaning] = headerMatch;

  // join the rest of the block (up to the first blank line, i.e. before
  // the next entry) into one string so a note that wraps across physical
  // markdown lines can still be matched as a single *...* span
  const restLines = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '') break;
    restLines.push(lines[i].trim());
  }
  const rest = restLines.join(' ');
  const spans = [...rest.matchAll(/\*(.+?)\*/g)].map(m => m[1].trim());

  let note = '';
  let wordType = '';
  spans.forEach(s => {
    const typeMatch = s.match(/^Word type:\s*(.+)$/);
    if (typeMatch) wordType = typeMatch[1];
    else if (!note) note = s;
  });

  rows.push({ word: word.trim(), reading: reading.trim(), meaning: meaning.trim(), note, wordType });
}

const idCounts = {};
const entries = rows.map(r => {
  idCounts[r.word] = (idCounts[r.word] || 0) + 1;
  const id = idCounts[r.word] > 1 ? `${r.word}#${idCounts[r.word]}` : r.word;
  return {
    id,
    word: r.word,
    reading: r.reading,
    meaning: r.meaning,
    readingType: r.wordType,
    meaningMnemonic: r.note,
    source: 'custom'
  };
});

console.error(`Parsed ${entries.length} tourist vocab entries.`);
console.log(JSON.stringify(entries, null, 2));
