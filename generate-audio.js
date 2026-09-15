// Pre-generates VOICEVOX audio for every vocab reading, kanji reading, and
// sentence in index.html, saving them as static .wav files in audio/, plus
// audio/manifest.json mapping normalized text -> filename.
//
// Run this any time you add new vocab/kanji/sentences: it skips texts that
// already have a file, so it's safe (and fast) to re-run repeatedly —
// only new content gets synthesized.
//
// Requires the VOICEVOX Engine app running locally (default port 50021).
//
// Usage: node generate-audio.js

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VOICEVOX_BASE = 'http://127.0.0.1:50021';
const AUDIO_DIR = path.join(__dirname, 'audio');
const MANIFEST_PATH = path.join(AUDIO_DIR, 'manifest.json');

// MUST stay identical to the copy in index.html — this determines which
// specific voice a given piece of text gets, and the app needs to agree
// with this script about that, or a live-VOICEVOX fallback in the browser
// could use a different voice than the pre-generated file did.
const FEMALE_SPEAKERS = [
  { id: 2, name: 'Shikoku Metan', style: 'Bright & playful' },
  { id: 8, name: 'Kasukabe Tsumugi', style: 'Calm & clear' },
  { id: 10, name: 'Amehare Hau', style: 'Soft & gentle' },
  { id: 9, name: 'Namine Ritsu', style: 'Cool & low-toned' },
  { id: 16, name: 'Kyushu Sora', style: 'Warm & friendly' }
];
const MALE_SPEAKERS = [
  { id: 52, name: 'Suzumatsu Shuji', style: 'Smooth & mature' },
  { id: 21, name: 'Kenzaki', style: 'Deep & steady' },
  { id: 11, name: 'Kurono Takehiro', style: 'Energetic & warm' },
  { id: 12, name: 'Shirakami Kotaro', style: 'Upbeat & enthusiastic' },
  { id: 13, name: 'Aoyama Ryusei', style: 'Bold & hot-blooded' }
];
function pickSpeakerId(gender, text) {
  const pool = gender === 'male' ? MALE_SPEAKERS : FEMALE_SPEAKERS;
  let h = 0;
  for (const ch of String(text)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return pool[h % pool.length].id;
}

function normalizeAnswer(s) {
  return String(s || '').trim().toLowerCase().replace(/[.,、。\s!！]/g, '');
}

function hashFor(text) {
  return crypto.createHash('md5').update(text, 'utf8').digest('hex');
}

// ---- Load VOCAB / KANJI / SENTENCES out of index.html by evaluating its
// script in a sandboxed context with DOM stubs, same technique used to
// validate index.html during development. ----
function loadAppData() {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const start = html.indexOf("'use strict';");
  const end = html.indexOf('</script>', start);
  const code = html.slice(start, end);

  const sandbox = {
    localStorage: (() => { const store = {}; return { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } }; })(),
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
    alert() {},
    console
  };

  const vm = require('vm');
  const context = vm.createContext(sandbox);
  vm.runInContext(code + '\nthis.__EXPORTED__ = { VOCAB, KANJI, SENTENCES, GRAMMAR };', context);
  return context.__EXPORTED__;
}

async function synthesize(text, speakerId) {
  const qRes = await fetch(`${VOICEVOX_BASE}/audio_query?speaker=${speakerId}&text=${encodeURIComponent(text)}`, { method: 'POST' });
  if (!qRes.ok) throw new Error('audio_query failed: ' + qRes.status);
  const query = await qRes.json();
  const sRes = await fetch(`${VOICEVOX_BASE}/synthesis?speaker=${speakerId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query)
  });
  if (!sRes.ok) throw new Error('synthesis failed: ' + sRes.status);
  return Buffer.from(await sRes.arrayBuffer());
}

async function main() {
  if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

  const { VOCAB, KANJI, SENTENCES, GRAMMAR } = loadAppData();

  // BUG FIX: this used to only cover the headline reading for each vocab/
  // kanji entry, never the "Example Sentences" shown underneath it (or
  // grammar's own example) — those always fell through to the live
  // VOICEVOX Engine / browser-TTS fallback instead of a pre-generated
  // file, which is why example-sentence audio never sounded like the same
  // VOICEVOX voice as the reading audio right above it (and why it doesn't
  // play at all on mobile, where there's no VOICEVOX Engine to fall
  // through to). Every example.jp is now collected too.
  const texts = new Set();
  VOCAB.forEach(v => {
    if (v.reading) texts.add(v.reading);
    (v.examples || []).forEach(e => { if (e.jp) texts.add(e.jp); });
  });
  KANJI.forEach(k => {
    if (k.onyomi) texts.add(k.onyomi);
    (k.examples || []).forEach(e => { if (e.jp) texts.add(e.jp); });
  });
  (GRAMMAR || []).forEach(g => { if (g.example && g.example.jp) texts.add(g.example.jp); });
  SENTENCES.forEach(s => { if (s.jp) texts.add(s.jp); });

  let manifest = {};
  if (fs.existsSync(MANIFEST_PATH)) {
    try { manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')); } catch (e) {}
  }

  const versionCheck = await fetch(`${VOICEVOX_BASE}/version`).catch(() => null);
  if (!versionCheck || !versionCheck.ok) {
    console.error('VOICEVOX Engine not reachable at ' + VOICEVOX_BASE + '. Start it and try again.');
    process.exit(1);
  }

  let generated = 0, skipped = 0, failed = 0;
  for (const text of texts) {
    const key = normalizeAnswer(text);
    if (!manifest[key]) manifest[key] = {};
    for (const gender of ['female', 'male']) {
      if (manifest[key][gender] && fs.existsSync(path.join(AUDIO_DIR, manifest[key][gender]))) {
        skipped++;
        continue;
      }
      const speakerId = pickSpeakerId(gender, text);
      const filename = hashFor(key) + '-' + gender + '.wav';
      try {
        const wav = await synthesize(text, speakerId);
        fs.writeFileSync(path.join(AUDIO_DIR, filename), wav);
        manifest[key][gender] = filename;
        generated++;
        process.stdout.write('.');
      } catch (err) {
        failed++;
        console.error(`\nFailed on "${text}" (${gender}): ${err.message}`);
      }
    }
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`\nDone. Generated ${generated}, skipped ${skipped} (already had audio), failed ${failed}. Total texts: ${texts.size} x 2 voices.`);
}

main();
