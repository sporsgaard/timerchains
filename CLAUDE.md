# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Stigs Timed Trainer is a browser-based PWA for composing and executing timed interval running workouts with text-to-speech announcements. The user designs a workout, presses "Run", pockets the phone, and listens through earphones while running. Live at https://stigporsgaard.dk/timerchains/ — hosted on a Raspberry Pi via git pull from this repo.

## Development

No build step, no dependencies, no package manager. Serve with any static HTTP server:

```bash
python3 -m http.server 8000
# or
npx serve .
```

No tests or linting configured. The entire app is ~4 files of hand-written code plus vendored libraries.

### Deployment workflow
1. Make changes and commit
2. Push to `origin/master`
3. On the Raspberry Pi: `git pull` — the Pi serves the repo directory as a static site
4. The service worker update cycle delivers changes to installed PWAs on next open

### Important conventions
- **Bump `CACHE_NAME` in `sw.js`** with every change to cached assets (index.html, app.js, etc.). The service worker won't update without this.
- **Piper files in `piper/` are NOT precached** by the service worker — they're loaded on demand when a user selects an HD voice.
- **Large binaries use Git LFS** — `.onnx`, `.wasm`, and `.data` files in `piper/` are tracked via `.gitattributes`. Run `git lfs install` before cloning.
- **`.mjs` extension doesn't work** on the Pi's web server (wrong MIME type). Use `.js` for all JavaScript, even ES modules.

## Architecture

Single-page app — all logic lives in one IIFE in `app.js`:

- **`index.html`** — app shell with all CSS inlined in `<style>`, five screen `<div>`s (home, editor, execution, home help, editor help), and an inline base64 silent WAV `<audio>` element for background execution.
- **`app.js`** — all application logic: screen navigation, workout CRUD (localStorage), template fetch/cache, recursive block tree editor with drag-and-drop, TTS/sound token parser, voice engine switching, and the timer executor.
- **`sw.js`** — service worker with cache-first strategy. Assets list is hardcoded. Cache name format: `stt-vN`.
- **`manifest.json`** — PWA manifest. App name: "Stigs Timed Trainer", short name: "STT".
- **`samjs.min.js`** — vendored SAM speech synthesis (~21KB, renders to Web Audio API buffers).
- **`js-yaml.min.js`** — vendored js-yaml (~50KB, parses YAML workout templates).
- **`templates/`** — YAML workout templates with `index.json` manifest. Templates support comments and map directly to the block tree data model.
- **`piper/`** — self-hosted Piper neural TTS (loaded on demand via dynamic `import()`):
  - `piper-tts.js` — ES module wrapper exposing `window.PiperTTS` with `init()`, `speak()`, `switchVoice()`
  - `piper-DeOu3H9E.js` + `piper_phonemize.{wasm,data}` — eSpeak phonemizer (~19MB)
  - `ort.min.js` + `ort-wasm-simd*.wasm` — ONNX Runtime Web (~11MB, single-threaded to avoid crossOriginIsolated requirement)
  - `voices/*.onnx` + `*.onnx.json` — voice models (~60MB each, MIT-licensed hfc_female/hfc_male)

## Data Model

Workouts stored in `localStorage` key `"workouts"` as JSON array. Templates cached in `localStorage` key `"templates"`. Voice setting in `localStorage` key `"voiceEngine"`.

### Block tree (recursive)
- **Leaf block**: `{ type: "leaf", text, duration, repeat }` — a timed segment with optional TTS text
- **Group block**: `{ type: "group", name, letter, blocks: [...], repeat }` — a container that repeats its children. Optional `letter` (a-z) enables loop variable references in child leaf text.

### Loop variables
Groups can have a single-letter variable (a-z). Leaf text references them:
- `{a}` → count-up (1, 2, 3...)
- `{#a}` → total
- `{%a}` → count-down (total, total-1, ...)
- `{~a}` → remaining after current (total-1, ..., 1, "")

Substitution happens during `flattenBlocks()`. Inner groups shadow outer groups with the same letter. Save warns about undefined variable references.

### Sound token syntax
Parsed by `parseTextSegments()`, played through Web Audio API:
- `*` = 200ms beep, `**` = 400ms, `***`+ = 700ms (880Hz sine)
- `^` = rising tone (440→880Hz, 400ms)
- `v` = falling tone (880→440Hz, 400ms)
- `!` = buzzer (square wave 440Hz, 300ms)

Tokens work inline without spaces: `Ready*set***go` → speak → beep → speak → long beep → speak.

## TTS Engines

Two engines, user-selectable on home screen:

- **SAM** (default) — instant, robotic. `SamJs.buf32()` → Float32Array → AudioBuffer → AudioContext. Always available, no download.
- **Piper** (HD Female / HD Male) — neural TTS, natural-sounding. Loaded on demand (~90MB). `piper-tts.js` module → phonemize → ONNX inference → WAV → `decodeAudioData()` → AudioContext. Falls back to SAM on error.

Both play through the same `AudioContext` pipeline, which stays alive when the screen is off via the silent audio loop.

## Key Design Decisions

- **Background execution** relies on a silent audio loop + Media Session API. Wake Lock intentionally *not* used — screen should turn off. Android/iOS will still kill background browser tabs after ~15 min, so the app should be the foreground app (start music first, then the trainer).
- **Dual timer strategy**: `setInterval` (250ms) for background reliability + `requestAnimationFrame` for smooth display. Both use `Date.now()` for drift correction.
- **Block duration includes TTS time** — a 30s block with 5s of speech has 25s of remaining silence.
- **Piper runs single-threaded** (`wasm.numThreads = 1`) to avoid needing COOP/COEP headers for `crossOriginIsolated`.
- **Templates are read-only** — open in editor with disabled inputs. Users copy them to create editable workouts.
- **Delete confirmations**: workout deletes and group block deletes require `confirm()`. Leaf block deletes are instant.
- **Drag-and-drop** only reorders within the same parent level.

## UI

Dark theme (`--bg: #1a1a2e`, `--surface: #16213e`, `--accent: #e94560`). Five screens toggled via `.active` class. Mobile-first with 48px minimum touch targets. All CSS is in `index.html`. App icon: dark blue background, red stopwatches, white chain links (SVG → PNG via `rsvg-convert`).
