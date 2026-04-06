# Stigs Timed Trainer — Design & Specification

## Overview

A browser-based, offline-capable PWA for composing and executing timed interval running workouts with audio cues. The user designs a workout, presses "Run", pockets the phone, and listens through earphones while running. The screen is typically off during execution.

## Tech Stack

- Pure HTML/CSS/JavaScript — no frameworks, no build tools
- SAM (Software Automatic Mouth) for speech synthesis via Web Audio API
- Web Audio API for programmatic sound tones (beeps, rising/falling tones, buzzer)
- js-yaml for parsing YAML workout templates
- localStorage for persistence
- Service Worker for offline PWA support

## File Structure

```
sporsgaard/timerchains/
  index.html        — app shell, all CSS, PWA manifest link, 5 screen layouts
  app.js            — all logic (editor, executor, storage, TTS, audio, templates)
  sw.js             — service worker for offline caching (cache-first)
  manifest.json     — PWA manifest (name, icons, theme)
  samjs.min.js      — vendored SAM speech synthesis library
  js-yaml.min.js    — vendored YAML parser for templates
  templates/
    index.json      — template manifest (array of {file, name})
    *.yaml          — workout template definitions
```

## Data Model

### Block (recursive tree)

```js
// Leaf block — a timed segment with optional speech/sounds
{
  type: "leaf",
  text: "Sprint now *** go",  // TTS text; sound tokens inline (see below)
  duration: 30,               // seconds (includes TTS time)
  repeat: 1                   // 1–99
}

// Group block — a container that repeats its children
{
  type: "group",
  name: "Warm-up",            // optional display label (not read aloud)
  blocks: [ ...children ],
  repeat: 4                   // 1–99
}
```

### Saved Workout

```js
{
  id: 1709912345678,          // Date.now() at creation
  name: "4 repeats of 10-20-30",
  blocks: { type: "group", blocks: [...], repeat: 1 }  // root group
}
```

Stored in `localStorage` under key `"workouts"` as a JSON array. User workout names must be unique among user workouts.

### Templates

Templates are YAML files served from `templates/` and listed in `templates/index.json`. They use the same block tree structure as workouts. Templates are cached in `localStorage` under key `"templates"` after fetch.

- Templates are read-only — they open in the editor with disabled inputs
- Users can copy a template to create an editable workout
- Template names must be unique among templates, but may overlap with user workout names

### TTS + Sound Token Parsing

The `text` field is split on sound tokens into segments played sequentially:

| Token | Sound | Details |
|-------|-------|---------|
| `*` | Short beep (200ms, 880Hz sine) | Multiple `*` group: `**` = 400ms, `***`+ = 700ms |
| `^` | Rising tone (440→880Hz, 400ms sine sweep) | Always individual |
| `v` | Falling tone (880→440Hz, 400ms sine sweep) | Always individual |
| `!` | Buzzer (440Hz, 300ms square wave) | Always individual |
| words | Spoken via SAM (Web Audio API) | |

Tokens can appear inline without surrounding spaces. Example: `Ready*set***go` → speak "Ready" → short beep → speak "set" → long beep → speak "go".

### Timer Behavior

Block duration **includes** TTS/sound time. A 30s block with 5s of speech has 25s of remaining silence. TTS and the countdown timer run concurrently.

## UI Screens

### 1. Home Screen (workout list)

- List of saved workouts, tap name to edit
- Copy button (⧉) and delete button (×) on each item; delete has confirmation
- "+ New Workout" button at bottom
- **Templates section** below workouts with refresh button (↻); tap to open read-only, copy to duplicate
- Help button (?) opens about/credits screen

### 2. Editor Screen

- **Workout name** text input at top
- **Nested block tree** rendered as indented cards:
  - **Leaf card**: drag handle, text input, duration (seconds), repeat (×N)
  - **Group card**: drag handle, clickable name label (click to rename inline), repeat (×N), child blocks indented with left border
  - Each level has "+ Block" and "+ Group" buttons
  - Delete button on every item (groups require confirmation)
- **Bottom bar** (fixed): Save / Run buttons (plus Copy when in read-only template mode)
- **Read-only mode** for templates: inputs disabled, save hidden, drag handles hidden
- Help button (?) opens editor guide with sound tokens reference
- Drag-and-drop reordering within the same level via drag handles (⠿)

### 3. Execution Screen

- Large countdown timer (MM:SS)
- Current block text
- Step position indicator ("Step 3 / 12")
- Overall progress bar + time remaining
- Pause / Stop buttons
- On completion: "Workout complete!" message, TTS announcement, returns to editor after 5s

### 4. Home Help Screen (About)

- App description
- Credits: author and libraries used (SAM, js-yaml)

### 5. Editor Help Screen

- How to create/edit workouts (blocks and groups)
- Sound tokens reference table with examples

## Key Implementation Details

### Background Execution (screen off)

Critical for the primary use case (phone in pocket).

1. **Silent audio loop**: A tiny near-silent WAV plays on loop via `<audio>` element, keeping the browser process alive when the screen is off.
2. **Media Session API**: Registers as "now playing" — shows workout info in notification shade/lock screen, prevents OS from killing the tab, enables pause/stop from lock screen.
3. **Dual timer strategy**: `setInterval` (250ms) for reliable background ticking + `requestAnimationFrame` for smooth display when visible. Both use `Date.now()` for drift correction.

### SAM Speech Synthesis

The app uses SAM (Software Automatic Mouth) instead of the Web Speech API (`speechSynthesis`). SAM renders speech to Float32Array audio buffers played through the Web Audio API's AudioContext. This is necessary because Android suspends the system TTS service when the screen is off, but Web Audio API stays alive through the silent audio loop.

### Audio Ducking

SAM audio played through Web Audio API triggers OS-level audio ducking on Android (Spotify volume drops, speech plays, Spotify resumes). iOS Safari handles this similarly.

### Precise Timing

- Each step records `startTime = Date.now()`
- Elapsed time computed as `Date.now() - startTime - pausedElapsed`
- Next step starts based on absolute time, preventing drift over long workouts

### Execution Flow

1. "Run" tapped → workout auto-saved → blocks flattened (respecting all repeats) into linear step array
2. For each step: display info → parse and play TTS/sounds → countdown → advance
3. On completion: announce "Workout complete", show summary, return to editor

### Offline / PWA

- `sw.js` caches all app files on install (templates are fetched on demand, not precached)
- Cache-first fetch strategy (fully offline after first load)
- `manifest.json`: `display: standalone`, theme color `#e94560`

## UI Design

- Dark theme: background `#1a1a2e`, surface `#16213e`, accent `#e94560`
- Mobile-first: min 48px touch targets, font-size ≥ 16px on inputs (prevents iOS zoom)
- Group cards have accent-colored border to distinguish from leaf cards
- Group name labels have dashed underline to indicate they're clickable/editable

## Field Constraints

| Field         | Type              | Min | Max  | Default                |
| ------------- | ----------------- | --- | ---- | ---------------------- |
| Leaf text     | string            | —   | —    | "" (silence)           |
| Leaf duration | integer (seconds) | 1   | 3600 | 30                     |
| Leaf repeat   | integer           | 1   | 99   | 1                      |
| Group name    | string            | —   | —    | "Group" (display only) |
| Group repeat  | integer           | 1   | 99   | 2                      |

## Known Considerations

- First SAM speech must be triggered by user gesture (the "Run" button tap satisfies this)
- Wake Lock is intentionally NOT used — we want the screen to turn off to save battery
- Group names are for editor readability only and are not included in TTS output
- Drag-and-drop only reorders within the same parent level (no cross-level moves)
- Android suspends `speechSynthesis` when screen is off — hence SAM via Web Audio API
