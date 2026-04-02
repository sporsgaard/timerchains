# Interval Runner

A browser-based, offline-capable PWA for composing and executing timed interval running workouts with text-to-speech announcements. Design a workout, press "Run", pocket your phone, and listen through earphones while running.

![Interval Runner](timerchains_1.svg)

## Features

- **Workout editor** with nested, repeatable blocks (leaf timers and groups)
- **Text-to-speech** announcements with inline beep tones (`.` short, `..` medium, `...` long)
- **Background execution** — works with screen off via silent audio loop and Media Session API
- **Drag-and-drop** reordering of blocks within the editor
- **Offline support** — fully functional after first load (PWA with service worker)
- **No dependencies** — pure HTML, CSS, and JavaScript; no build step

## Usage

Serve the files with any static HTTP server:

```bash
# Python
python3 -m http.server 8000

# Node
npx serve .
```

Open `http://localhost:8000` in a mobile browser and add to home screen for the full PWA experience.

### Creating a workout

1. Tap **+ New Workout** on the home screen
2. Add **blocks** (timed segments with optional speech text) and **groups** (containers that repeat their children)
3. Set durations in seconds and repeat counts
4. Tap **Run** to start — the workout auto-saves

### TTS text format

Speech text is split into spoken words and beep tokens:

| Token | Effect |
|-------|--------|
| words | Spoken via Web Speech API |
| `.`   | Short beep (200ms, 880Hz) |
| `..`  | Medium beep (400ms) |
| `...` | Long beep (700ms) |

Example: `Ready . set ... go` → speak "Ready" → short beep → speak "set" → long beep → speak "go"

## Tech Stack

- HTML / CSS / JavaScript (no frameworks)
- Web Speech API for TTS
- Web Audio API for programmatic beep tones
- localStorage for workout persistence
- Service Worker for offline caching

## License

MIT
