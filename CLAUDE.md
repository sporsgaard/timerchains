# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Interval Runner is a browser-based PWA for composing and executing timed interval running workouts with text-to-speech announcements. The user designs a workout, presses "Run", pockets the phone, and listens through earphones while running.

## Development

No build step, no dependencies, no package manager. Serve with any static HTTP server:

```bash
python3 -m http.server 8000
# or
npx serve .
```

No tests or linting configured.

When changing files, bump `CACHE_NAME` in `sw.js` so returning users get fresh assets.

## Architecture

Single-page app — all logic lives in one IIFE in `app.js`:

- **`index.html`** — app shell with all CSS inlined in `<style>`, five screen `<div>`s (home, editor, execution, home help, editor help), and an inline base64 silent WAV `<audio>` element for background execution.
- **`app.js`** — all application logic: screen navigation, workout CRUD (localStorage), template fetch/cache, recursive block tree editor with drag-and-drop, TTS/sound token parser, and the timer executor.
- **`sw.js`** — service worker with cache-first strategy. Assets list is hardcoded.
- **`manifest.json`** — PWA manifest.
- **`samjs.min.js`** — vendored SAM speech synthesis (renders to Web Audio API buffers).
- **`js-yaml.min.js`** — vendored YAML parser for workout templates.
- **`templates/`** — YAML workout templates with `index.json` manifest.

## Data Model

Workouts are stored in `localStorage` under key `"workouts"` as a JSON array. Each workout contains a recursive block tree:

- **Leaf block**: `{ type: "leaf", text, duration, repeat }` — a timed segment with optional TTS text
- **Group block**: `{ type: "group", name, blocks: [...], repeat }` — a container that repeats its children

On execution, the tree is flattened into a linear step array (respecting all repeats).

## Key Design Decisions

- **Background execution** relies on a silent audio loop + Media Session API to keep the browser alive with the screen off. Wake Lock is intentionally *not* used — the screen should turn off to save battery.
- **Dual timer strategy**: `setInterval` (250ms) for background reliability + `requestAnimationFrame` for smooth display. Both use `Date.now()` for drift correction.
- **Block duration includes TTS time** — a 30s block with 5s of speech has 25s of remaining silence. TTS and countdown run concurrently.
- **TTS sound syntax**: `*` = 200ms beep, `**` = 400ms, `***` (or more) = 700ms (880Hz sine wave); `^` = rising tone (440-880Hz, 400ms); `v` = falling tone (880-440Hz, 400ms); `!` = buzzer (square wave, 300ms). All tokens work inline without surrounding spaces. Multiple `*` group into one longer beep; `^`, `v`, and `!` are always individual.
- **Drag-and-drop** only reorders within the same parent level (no cross-level moves).

## UI

Dark theme. Five screens toggled via `.active` class: home, editor, execution, home help (about), and editor help (sound tokens reference). Mobile-first with 48px minimum touch targets. All CSS is in `index.html`.
