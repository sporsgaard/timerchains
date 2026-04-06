# Stigs Timed Trainer

A browser-based, offline-capable PWA for composing and executing timed interval running workouts with audio cues. Design a workout, press "Run", pocket your phone, and listen through earphones while running.

![Stigs Timed Trainer](timerchains_1.svg)

## Features

- **Workout editor** with nested, repeatable blocks (leaf timers and groups)
- **Text-to-speech** via SAM (Software Automatic Mouth) — works with screen off
- **Sound tokens** for beeps, rising/falling tones, and buzzer alerts embedded in speech text
- **Templates** — server-side YAML workout definitions, auto-loaded on first visit
- **Copy** workouts and templates to create your own variations
- **Background execution** — works with screen off via silent audio loop and Media Session API
- **Drag-and-drop** reordering of blocks within the editor
- **Offline support** — fully functional after first load (PWA with service worker)
- **No build step** — pure HTML, CSS, and JavaScript

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

You can also copy a built-in template and modify it to your needs.

### Sound token format

Speech text is spoken aloud via SAM. You can embed sound tokens anywhere in the text (no spaces needed):

| Token | Sound | Use for |
|-------|-------|---------|
| `*` | Short beep (200ms) | Tick / count |
| `**` | Medium beep (400ms) | Attention |
| `***` | Long beep (700ms) | Start / end |
| `^` | Rising tone (400ms) | Get ready / ramp up |
| `v` | Falling tone (400ms) | Rest / wind down |
| `!` | Buzzer (300ms) | Alert / stop |

Example: `Ready*set***go` → speaks "Ready" → short beep → speaks "set" → long beep → speaks "go"

### Templates

Workout templates are YAML files in the `templates/` directory, listed in `templates/index.json`. They are fetched automatically on first load and can be refreshed from the home screen. Templates open in read-only mode — copy one to create an editable version.

## Tech Stack

- HTML / CSS / JavaScript (no frameworks)
- [SAM](https://github.com/discordier/sam) (Software Automatic Mouth) for speech synthesis via Web Audio API
- Web Audio API for programmatic sound tones
- [js-yaml](https://github.com/nodeca/js-yaml) for parsing workout templates
- localStorage for workout persistence
- Service Worker for offline caching

## Credits

Created by Stig Porsgaard.

## License

MIT
