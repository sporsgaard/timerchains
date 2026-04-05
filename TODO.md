# TODO

## Issue 1: Templates

Server-side workout templates served as static YAML files, fetched by the client.

### Structure
- `templates/` directory at repo root
- `templates/index.json` — array of `{ "file": "filename.yaml", "name": "Display Name" }`
- Each `.yaml` file uses the same block tree structure as the app data model (leaf/group blocks with text, duration, repeat)
- Client-side YAML parsing via vendored `js-yaml` (~50KB min)

### Behavior
- On first load (no workouts in localStorage), templates are fetched automatically
- Templates shown on home screen **below** the user's own workouts, in a separate "Templates" section
- Templates are read-only — tapping one opens the normal editor screen but with all inputs disabled (read-only mode). Run and Copy buttons available, Save hidden.
- "Refresh" button on the templates section triggers a re-fetch from server
- Templates cached in localStorage (key: `"templates"`) after fetch; refresh overwrites cache
- Template names must be unique among templates; user workout names must be unique among user workouts; overlap between the two is allowed

### Files to change
- `index.html` — add `<script>` for js-yaml, add templates section markup
- `app.js` — template fetch/cache logic, render templates list, template preview
- `sw.js` — bump cache version, add `js-yaml.min.js` to assets (templates themselves fetched on demand, not precached)
- New: `templates/index.json`, 2 example `.yaml` files, `js-yaml.min.js` (vendored)

### Example templates to create
1. **"10-20-30"** — classic 10-20-30 interval training (30s slow, 20s medium, 10s fast, repeated)
2. **"Couch to 5K Week 1"** — alternating walk/run intervals for beginners

---

## Issue 2: Copy workout/template

Allow users to duplicate any workout or template into a new user-defined workout.

### Behavior
- Add a "Copy" button on each workout item and each template item on the home screen
- Copying creates a new user workout with the block tree deep-cloned
- Name set to `"<original name> (copy)"` — if that collides with an existing user workout name, append a number
- The new workout opens in the editor immediately after copy
- User workout names must remain unique (enforced on save as well)

### Files to change
- `app.js` — copy logic for both workouts and templates, unique name generation, save + open editor

---

## Issue 3: Delete confirmation on groups

Add confirmation dialog when deleting a **group** block in the editor. Block (leaf) deletes remain instant.

### Current state
- Home screen workout delete: already has `confirm()` — no change needed
- Editor group delete: no confirmation — **add it**
- Editor leaf/block delete: no confirmation — leave as-is

### Files to change
- `app.js` — add `confirm()` guard on group block delete handler (~line 191)

---

## Issue 4: Colorize the app icon

Update `timerchains_1.svg` to use the app's color scheme and regenerate all PNG icons.

### Colors
- Background: dark blue `#1a1a2e` (filled rect covering viewBox)
- Stopwatches (circles, crowns, hands): accent red `#e94560`
- Chain links: white `#ffffff`

### Steps
1. Edit SVG: add background rect, split the single `<g>` into two groups with different stroke colors
2. Regenerate all PNG sizes using `rsvg-convert` (install: `sudo apt install librsvg2-bin`)
3. Verify icons render correctly at small sizes (48x48)

### Files to change
- `timerchains_1.svg`
- `icons/icon-*.png` (all 9 sizes)
- `sw.js` — bump cache version
