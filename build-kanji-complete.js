// Rebuilds the ENTIRE KANJI array (Levels 1-10) from KANJI-COMPLETE-01-10.md,
// which adds real lesson depth on top of the WK-VERIFIED single-reading
// pass: alternate English meanings, OTHER real readings beyond the primary
// WK-taught one (for the "wrong reading, try again" soft-fail — see
// otherReadingFor in index.html), and two original example sentences
// (Easy/Advanced) per kanji.
//
// Storage shape:
//   onyomi: <primary WK reading>, kunyomi: null   (unchanged from the
//     WK-VERIFIED pass — still exactly one correct quiz answer)
//   altMeanings: [...]                             (accepted meaning answers)
//   otherReadings: [...]                            (NOT accepted as correct,
//     but typing one triggers the soft "that's a real reading, try the one
//     we're asking for" shake+retry instead of a hard wrong answer)
//   examples: [{ level: 'easy'|'advanced', jp, romaji, en }, ...]
//
// Usage: node build-kanji-complete.js > kanji-complete-output.txt

const fs = require('fs');
const path = require('path');

const mdPath = path.join(__dirname, 'files', 'KANJI-COMPLETE-01-10.md');
const md = fs.readFileSync(mdPath, 'utf8');

// normalize a raw "other reading" token: strip okurigana dots and the
// prefix/suffix "-" marker, e.g. "あ.げる" -> "あげる", "や-" -> "や"
function normalizeReadingToken(tok) {
  return tok.trim().replace(/\./g, '').replace(/^-|-$/g, '');
}

// Splits on a delimiter but ignores delimiters inside parentheses — needed
// because alt-meaning lists have entries like "Man (informal, in
// compounds)" where a naive comma-split would wrongly cut the parenthetical
// in half.
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

function parseOtherReadings(text) {
  // "い.る, はい.る, い.れる" or "りき, ちから" or "や-" — comma-separated,
  // each token possibly itself "/"-separated alternates
  return splitTopLevel(text, ',').flatMap(part => part.split('/')).map(normalizeReadingToken).filter(Boolean);
}

const levelBlocks = md.split(/^## Level (\d+)\s*$/m).slice(1); // [levelNum, body, levelNum, body, ...]
const rows = [];

for (let i = 0; i < levelBlocks.length; i += 2) {
  const level = Number(levelBlocks[i]);
  const body = levelBlocks[i + 1];
  const entryBlocks = body.split(/^### /m).slice(1);

  for (const block of entryBlocks) {
    const lines = block.split('\n');
    const headerLine = lines[0].trim();
    const headerMatch = headerLine.match(/^(.+?) — (.+?) — (.+)$/);
    if (!headerMatch) continue;
    const [, char, reading, meaning] = headerMatch;

    let idx = 1;
    while (idx < lines.length && lines[idx].trim() === '') idx++;

    let altMeanings = [];
    let otherReadings = [];
    // A real meta line always starts "*Also:" or "*Other reading(s):" — a
    // naive startsWith('*') false-positives on mnemonics that happen to
    // open with **bold** markdown (e.g. "**SIX** little **ROCK**s..."),
    // which would wrongly eat that line as metadata and shift everything
    // after it by one line.
    if (lines[idx] && /^\*(Also|Other reading)/.test(lines[idx].trim())) {
      const meta = lines[idx].trim().replace(/^\*|\*$/g, '');
      const parts = splitTopLevel(meta, ' · ');
      parts.forEach(p => {
        const alsoMatch = p.match(/^Also:\s*(.+)$/);
        const otherMatch = p.match(/^Other readings?:\s*(.+)$/);
        if (alsoMatch) altMeanings = splitTopLevel(alsoMatch[1], ',').map(s => s.trim()).filter(Boolean);
        if (otherMatch) otherReadings = parseOtherReadings(otherMatch[1]);
      });
      idx++;
    }
    while (idx < lines.length && lines[idx].trim() === '') idx++;

    const mnemonic = (lines[idx] || '').trim();
    idx++;

    const examples = [];
    for (; idx < lines.length; idx++) {
      const line = lines[idx].trim();
      // JP text sometimes butts right up against the dash with no space
      // (e.g. "あります。— Hon...") while the second separator usually has
      // one on both sides — allow either, don't require a fixed spacing.
      const exMatch = line.match(/^- (Easy|Advanced):\s*(.+?)\s*—\s*(.+?)\s*—\s*(.+)$/);
      if (exMatch) {
        const [, tier, jp, romaji, en] = exMatch;
        examples.push({ level: tier.toLowerCase(), jp, romaji, en });
      }
    }

    rows.push({ level, char, reading, meaning, altMeanings, otherReadings, mnemonic, examples });
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
  idCounts[r.char] = (idCounts[r.char] || 0) + 1;
  const id = idCounts[r.char] > 1 ? `${r.char}#${idCounts[r.char]}` : r.char;
  const meaningJs = r.meaning.includes("'") ? jsSingleQuoted(r.meaning) : `'${r.meaning}'`;
  if (r.examples.length < 2) noExampleCount++;

  out.push(
    `  {id:${jsSingleQuoted(id)},char:${jsSingleQuoted(r.char)},onyomi:${jsSingleQuoted(r.reading)},kunyomi:null,altMeanings:${jsArrayOfStrings(r.altMeanings)},otherReadings:${jsArrayOfStrings(r.otherReadings)},meaning:${meaningJs},level:${r.level},meaningMnemonic:${jsString(r.mnemonic)},examples:${jsExamples(r.examples)}},`
  );
}

console.log(`// Parsed ${rows.length} kanji rows from KANJI-COMPLETE-01-10.md.`);
console.log(`// Entries with fewer than 2 examples: ${noExampleCount}`);
console.log(out.join('\n'));
