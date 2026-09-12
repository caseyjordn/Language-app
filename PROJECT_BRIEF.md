# Japanese Practice App — Redesign Brief

## Context
Casey is learning Japanese (Tofugu guide method) for a Tokyo trip with their brother.
There is an existing single-file app, `japanese-practice.html`, built iteratively over
many chat sessions. It currently has five tabs: Kana Drill, Sentence Reader, Vocabulary,
Books, Progress. Key existing mechanics: token-matching answer engine with alternate
romaji spellings, per-word click-to-play audio, six switchable Japanese fonts, 5-mistake
lesson-failure rule, manual "Next" (no auto-advance), decoy words in sentence builders,
diagnostic report generator, export/import progress with baked-in seed support.

This brief is for a **visual + functional redesign**, not a rewrite from scratch —
keep the working mechanics, change the shell and add new sections.

## Aesthetic direction (locked in — reference these exactly, do not reinterpret loosely)

**Primary reference: WaniKani** (https://www.wanikani.com — dashboard/widget-grid UI).
Casey wants WaniKani's structure and functional density prioritized over the Duolingo
reference that was tried earlier and rejected — **no game path, no tree, no gamified
unit-map.** The dashboard should be a widget grid: independent cards, each owning one
section, similar to WaniKani's Lessons / Reviews / Review Forecast / Study Streak /
Recent Mistakes / Level Progress / Item Spread cards.

Actual values pulled from WaniKani's own CSS (use these, don't approximate):
- `--color-pink: #FF00AA` (kanji category)
- `--color-blue: #00AAFF` (radical/kana-equivalent category)
- `--color-purple: #AA00FF` (vocabulary category)
- `--color-charcoal: #6B7079` (secondary text)
- `--border-radius-widget: 16px`
- `--border-radius-normal: 8px`
- Font family: `"Noto Sans", "Noto Sans JP", sans-serif`
- Card backgrounds white/near-white, thin light-gray borders (`#CAD0D6`-ish), pale
  gray page background (`#F4F4F4`-ish), not white — subtle, not stark.
- SRS-stage pill rows, count bubbles, small colored subject tiles (character +
  colored background per category) are all part of the visual language — reuse
  these patterns adapted to kana/kanji/vocab.

**Secondary reference: a Dribbble self-care app case study** (mental wellness app,
warm illustrated aesthetic). Pull from it:
- Soft **khaki/dusty-mustard paper background**, NOT bright saturated yellow.
- Cream/off-white cards on top of that paper tone.
- Rounded, friendly illustration style — simple blob-character faces (not needed
  functionally, but sets the "soft" register against WaniKani's more clinical feel).
- Typeface sample shown in that reference: **Palanquin** (rounded, soft, bold) —
  use for headings only, paired with WaniKani's Noto Sans for body/data.
- Muted, dusty color chips rather than saturated ones (mustard, near-black, gray,
  cream, small pink accent).

**Net direction:** WaniKani's information architecture, density, and card language,
skinned with the Dribbble app's paper-warm palette instead of WaniKani's cool white/
gray. Two prior attempts at this were rejected as "too AI-startup" — avoid: generic
SaaS-card sameness (identical radius/shadow on everything), soft gray drop shadows,
gradient washes, cream-and-terracotta AI-generated-look defaults. Ground every color
and spacing choice in the actual reference values above, not generic taste.

**Important limitation to flag to Casey if unresolved:** no way to render/screenshot
HTML exists in the source chat environment this brief came from — all prior visual
iterations were unverified guesses. In VS Code, actually open the file in a browser
or use a live preview after each change before presenting it.

## New functionality requested

1. **WaniKani-style vocab flashcards** — Casey will supply vocab lists. Lesson/review
   flow modeled on WaniKani's SRS card style (not Duolingo's).
2. **Speaking/pronunciation practice** — Casey wants to speak and get intonation
   graded. **Important:** Casey originally proposed VOICEVOX
   (https://github.com/VOICEVOX/voicevox_core) for this, but VOICEVOX is a
   **text-to-speech synthesis engine, not speech recognition or pronunciation
   grading** — it cannot listen to or grade the user. This needs a different
   approach: likely browser Web Speech API for transcription-accuracy feedback as a
   starting point; real pitch-accent/intonation grading is a much harder, separate
   problem worth scoping on its own. Confirm with Casey how far to take this before
   building.
3. **Tokyo photo translation section** — images sourced from around Tokyo (Casey's
   own trip photos) that the user translates as practice.
4. **Kana + kanji + (light) reading/typing practice** — hiragana/katakana already
   exist in the current app; extend pattern to kanji Casey is currently learning
   (user-supplied list), with reading and typing input.
5. **Eventual iPhone use** — realistic near-term path is an installable web app
   (add-to-homescreen / PWA, works offline via service worker, no App Store needed).
   True native App Store distribution is a separate, much larger project (Xcode,
   Apple developer account, etc.) — clarify with Casey which one they actually want
   before investing engineering time either direction.

## Process preference (standing instruction from Casey)
Always ask what Casey is currently working on before building new practice material.
Show a wireframe/sample before building a full section — do not build everything and
ask for feedback after the fact. Iterate visually before wiring up functionality.

## Status as of handoff
Two wireframe passes were attempted in the source chat (an artifact-based HTML
mockup); both were rejected as not resembling the references closely enough,
specifically because they leaned toward a generic warm-SaaS look instead of the
actual WaniKani component patterns and Dribbble paper tone. Start fresh in VS Code
with real screenshots of both references open side-by-side while building, checking
visually after every change, rather than translating them from description alone.
