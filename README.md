# NeuroFit AI

AI-powered body analysis using your webcam.
Estimates height, classifies body type, and generates personalised
meal + exercise plans — 100% in-browser, no server required.

---

## Project Structure

```
bodyscan/
│
├── frontend/                   # Everything the browser renders
│   ├── index.html              # Main page — pure HTML, no inline JS/CSS
│   ├── css/
│   │   └── main.css            # Complete stylesheet (design tokens, all sections)
│   └── js/
│       ├── scanner.js          # Webcam + MediaPipe + in-frame detection + countdown
│       └── ui.js               # Results rendering (metrics, BMI, body type, exercises, meals)
│
└── model/                      # Data + algorithm layer (framework-independent JS)
    ├── bodyMetrics.js          # Height/weight table, BMI, TDEE, body type, insight text
    ├── meals.js                # 25-meal dataset + ML scoring engine (ported from meal_model.py)
    └── exercises.js            # Exercise database keyed by body type (ecto/meso/endo)
```

---

## How to Run

Since the app uses ES modules loaded via `<script src>`, it needs to be served
over HTTP (not opened as a local `file://` URL, due to CORS restrictions on
MediaPipe's WASM files).

### Option 1 — Python (quickest)
```bash
cd bodyscan/frontend
python3 -m http.server 8080
# Open http://localhost:8080
```

### Option 2 — Node / npx
```bash
cd bodyscan/frontend
npx serve .
```

### Option 3 — VS Code
Install the **Live Server** extension, right-click `frontend/index.html` → Open with Live Server.

---

## File Responsibilities

### `model/bodyMetrics.js`
- `lookupWeight(heightCm, gender)` — returns healthy reference weight + BMI from lookup table
- `calcTDEE(weight, height, age, gender)` — Harris-Benedict BMR × 1.55
- `getBodyType(bmi)` — classifies as ecto / meso / endo
- `getBMILabel(bmi)` — returns display text + colour for BMI category
- `BTYPE_META` — display info (emoji, name, sub-title, traits) per body type
- `BTYPE_INSIGHT` — personalised paragraph text functions per body type

### `model/meals.js`
- `MEALS_DB` — 25-meal dataset (ported from `meal_model.py` MEALS list)
- `scoreMeals(diet, tdee, bodyType, topK)` — JS port of Random Forest feature scoring:
  - Calorie proximity to TDEE ÷ 5 (per-meal target)
  - Body-type cuisine preference boost
  - Protein/carb/fat macro priority per body type
  - Low-calorie preference for endomorphs
- `CUISINE_ICON` — emoji map for cuisine strings

### `model/exercises.js`
- `EXERCISE_DB` — 6 exercises per body type with icon, name, sets, tag
- `getExercises(bodyType)` — returns the relevant exercise list

### `frontend/js/scanner.js`
- Requests webcam access
- Initialises MediaPipe Pose
- Runs `assessFrame()` every frame — returns `'in'` | `'partial'` | `'out'`
- Updates the frame banner and guide-box border colour
- Accumulates good frames; auto-starts 5-second countdown when threshold is met
- Live readings (height/weight) only shown when `frameState === 'in'`
- Collects pose readings during scan; calls `window.finalizeResults(readings)`

### `frontend/js/ui.js`
- `finalizeResults(readings)` — averages readings, calls `showResults()`
- `showResults(data)` — renders all 4 result blocks
- `renderExercises(bodyType)` — builds exercise card grid
- `renderMeals(diet, tdee, bodyType)` — calls `scoreMeals()`, builds meal cards
- `selectDiet(btn)` — diet toggle handler; re-runs `renderMeals()`
- Scroll-reveal IntersectionObserver for `.fade-in` elements

---

## Script Load Order (index.html)

```
MediaPipe CDN scripts          ← external pose detection
  ↓
model/bodyMetrics.js           ← weight table, BMI, TDEE, body type
model/meals.js                 ← meal dataset + ML scorer
model/exercises.js             ← exercise database
  ↓
frontend/js/ui.js              ← result renderer (needs model layer)
frontend/js/scanner.js         ← camera + pose (needs model + ui)
```

All model functions are exposed on `window.*` so plain `<script>` tags work
without a bundler. If you move to a bundler (Vite, Webpack), replace
`window.X = ...` with ES module `export` statements.

---

## Notes

- **Weight shown is a healthy reference value**, not the user's actual weight.
  A webcam cannot measure mass. The lookup table uses BMI midpoints from the
  `height_weight_male_female.html` reference data.
- **No data leaves the device.** MediaPipe runs via WebAssembly in-browser.
- Camera must be served over `http://` or `https://` — `file://` won't work.
