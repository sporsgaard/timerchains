# Interval Runner — Design & Specification

## Overview

A browser-based, offline-capable PWA for composing and executing timed interval running workouts with text-to-speech announcements. The user designs a workout, presses "Run", pockets the phone, and listens through earphones while running. The screen is typically off during execution.

## Tech Stack

- Pure HTML/CSS/JavaScript — no frameworks, no build tools
- Web Speech API for TTS
- Web Audio API for programmatic beep tones
- localStorage for persistence
- Service Worker for offline PWA support

## File Structure

```
sporsgaard/timerchains/
  index.html        — app shell, all CSS, PWA manifest link, 3 screen layouts
  app.js            — all logic (editor, executor, storage, TTS, audio)
  sw.js             — service worker for offline caching (cache-first)
  manifest.json     — PWA manifest (name, icons, theme)
```

## Data Model

### Block (recursive tree)

```js
// Leaf block — a timed segment with optional speech/beeps
{
  type: "leaf",
  text: "Sprint now ... go",  // TTS text; dots = beeps (see below)
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

Stored in `localStorage` under key `"workouts"` as a JSON array.

### TTS + Beep Text Parsing

The `text` field is split on whitespace into tokens:

- Word tokens → accumulated into speech segments → `speechSynthesis.speak()`
- `.` → short beep (200ms, 880Hz sine wave)
- `..` → medium beep (400ms)
- `...` → long beep (700ms)

Segments play sequentially. Example: `"Ready . set ... go"` → speak "Ready" → short beep → speak "set" → long beep → speak "go".

### Timer Behavior

Block duration **includes** TTS/beep time. A 30s block with 5s of speech has 25s of remaining silence. TTS and the countdown timer run concurrently.

## UI Screens

### 1. Home Screen (workout list)

- List of saved workouts, tap name to edit
- Delete button (×) on each item with confirmation
- "+ New Workout" button at bottom

### 2. Editor Screen

- **Workout name** text input at top
- **Nested block tree** rendered as indented cards:
  - **Leaf card**: drag handle, text input, duration (seconds), repeat (×N)
  - **Group card**: drag handle, clickable name label (click to rename inline), repeat (×N), child blocks indented with left border
  - Each level has "+ Block" and "+ Group" buttons
  - Delete button on every item
- **Bottom bar** (fixed): Save / Run buttons
- Drag-and-drop reordering within the same level via drag handles (⠿)

### 3. Execution Screen

- Large countdown timer (MM:SS)
- Current block text
- Step position indicator ("Step 3 / 12")
- Overall progress bar + time remaining
- Pause / Stop buttons
- On completion: "Workout complete!" message, TTS announcement, returns to editor after 5s

## Key Implementation Details

### Background Execution (screen off)

Critical for the primary use case (phone in pocket).

1. **Silent audio loop**: A tiny near-silent WAV plays on loop via `<audio>` element, keeping the browser process alive when the screen is off.
2. **Media Session API**: Registers as "now playing" — shows workout info in notification shade/lock screen, prevents OS from killing the tab, enables pause/stop from lock screen.
3. **Dual timer strategy**: `setInterval` (250ms) for reliable background ticking + `requestAnimationFrame` for smooth display when visible. Both use `Date.now()` for drift correction.

### Audio Ducking

`speechSynthesis.speak()` automatically triggers OS-level audio ducking on Android (Spotify volume drops, TTS plays, Spotify resumes). iOS Safari handles this similarly. No app code needed.

### Precise Timing

- Each step records `startTime = Date.now()`
- Elapsed time computed as `Date.now() - startTime - pausedElapsed`
- Next step starts based on absolute time, preventing drift over long workouts

### Execution Flow

1. "Run" tapped → workout auto-saved → blocks flattened (respecting all repeats) into linear step array
2. For each step: display info → parse and play TTS/beeps → countdown → advance
3. On completion: announce "Workout complete", show summary, return to editor

### Offline / PWA

- `sw.js` caches all 4 files on install
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

- First `speechSynthesis.speak()` must be triggered by user gesture (the "Run" button tap satisfies this)
- Wake Lock is intentionally NOT used — we want the screen to turn off to save battery
- Group names are for editor readability only and are not included in TTS output
- Drag-and-drop only reorders within the same parent level (no cross-level moves)
