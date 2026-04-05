/**
 * frontend/js/ui.js
 * ──────────────────────────────────────────────────────────────
 * Handles all results rendering:
 *  - Metric cards (height, weight, BMI, TDEE, age, gender)
 *  - BMI gauge needle animation
 *  - Body type card highlight + insight text
 *  - Exercise card grid
 *  - ML meal cards with diet toggle
 *  - Scroll reveal on page load
 *
 * Depends on:
 *   model/bodyMetrics.js  → calcTDEE, getBodyType, getBMILabel, BTYPE_META, BTYPE_INSIGHT
 *   model/meals.js        → scoreMeals, CUISINE_ICON
 *   model/exercises.js    → getExercises
 */

'use strict';

// ── Global result state (shared with diet toggle) ─────────────
let _lastBodyType = 'meso';
let _lastTDEE     = 2000;
let _lastDiet     = 'non-veg';

// ── Average helper ────────────────────────────────────────────
function avg(arr, key) {
  return arr.reduce((s, x) => s + x[key], 0) / arr.length;
}

// ── Called by scanner.js after 5-second scan finishes ─────────
function finalizeResults(readings) {
  console.log("🤖 [ML Orchestration] finalizeResults(): Aggregating scanner readings and finalizing biometrics...");
  if (readings.length < 2) {
    document.getElementById('stxt').textContent = 'Not enough data — try again';
    return;
  }

  const height = avg(readings, 'height');
  const weight = avg(readings, 'weight');
  const bmi    = avg(readings, 'bmi');
  const shoW   = avg(readings, 'shoW');
  const hipW   = avg(readings, 'hipW');
  const gender = document.getElementById('gender').value;
  const age    = parseInt(document.getElementById('age').value);

  document.getElementById('stxt').textContent = `Scan complete! Height: ${Math.round(height)} cm`;

  showResults({ height, weight, bmi, shoW, hipW, gender, age });
}

// ── Main results renderer ─────────────────────────────────────
function showResults(d) {
  const { height, weight, bmi, gender, age } = d;
  const bodyType = window.getBodyType(bmi);
  const bmiLabel = window.getBMILabel(bmi);
  const tdee     = window.calcTDEE(weight, height, age, gender);

  _lastBodyType = bodyType;
  _lastTDEE     = tdee;

  // 01 — Metric cards
  document.getElementById('results-grid').innerHTML = `
    <div class="metric-card"><div class="m-label">Height</div>      <div class="m-val">${Math.round(height)}</div><div class="m-unit">cm</div></div>
    <div class="metric-card"><div class="m-label">Ref. Weight</div>  <div class="m-val">${Math.round(weight)}</div><div class="m-unit">kg</div></div>
    <div class="metric-card"><div class="m-label">BMI</div>          <div class="m-val">${bmi.toFixed(1)}</div>   <div class="m-unit">kg/m²</div></div>
    <div class="metric-card"><div class="m-label">Daily TDEE</div>   <div class="m-val">${Math.round(tdee)}</div> <div class="m-unit">kcal</div></div>
    <div class="metric-card"><div class="m-label">Age</div>          <div class="m-val">${age}</div>             <div class="m-unit">years</div></div>
    <div class="metric-card"><div class="m-label">Gender</div>
      <div class="m-val" style="font-size:1.2rem;">${gender === 'male' ? '♂' : '♀'}</div>
      <div class="m-unit">${gender}</div>
    </div>
  `;

  // 01 — BMI needle
  const pct = Math.max(0, Math.min(100, ((bmi - 14) / (42 - 14)) * 100));
  document.getElementById('bmi-needle').style.left = pct + '%';
  document.getElementById('bmi-text').innerHTML =
    `<span style="color:${bmiLabel.color}">${bmiLabel.txt}</span> — BMI ${bmi.toFixed(1)}`;

  // 02 — Body type cards
  ['ecto', 'meso', 'endo'].forEach(t => document.getElementById('bt-' + t).classList.remove('active'));
  document.getElementById('bt-' + bodyType).classList.add('active');
  document.getElementById('btype-insight').innerHTML =
    window.BTYPE_INSIGHT[bodyType](height, weight, bmi);

  // 03 — Exercises
  renderExercises(bodyType);

  // 04 — Meals (default diet = non-veg unless user already changed it)
  renderMeals(_lastDiet, tdee, bodyType);

  // Show & scroll
  const sec = document.getElementById('results-section');
  sec.style.display = 'block';
  setTimeout(() => sec.scrollIntoView({ behavior: 'smooth' }), 200);
}

// ── Exercise card renderer ────────────────────────────────────
function renderExercises(bodyType) {
  const exes = window.getExercises(bodyType);
  document.getElementById('exercise-grid').innerHTML = exes.map(e => `
    <div class="ex-card">
      <div class="ex-card-icon">${e.icon}</div>
      <div class="ex-card-body">
        <div class="ex-card-name">${e.name}</div>
        <div class="ex-card-meta">${e.meta}</div>
        <div class="ex-card-meta" style="margin-top:3px;color:var(--accent);font-size:0.78rem;">${e.sets}</div>
        <span class="ex-card-tag tag-${e.tag}">${e.tagLbl}</span>
      </div>
    </div>
  `).join('');
}

// ── Meal card renderer ────────────────────────────────────────
function renderMeals(diet, tdee, bodyType) {
  const meals     = window.scoreMeals(diet, tdee, bodyType);
  const container = document.getElementById('meal-cards');
  container.innerHTML = meals.map((m, i) => {
    const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : 'rank-other';
    const rankTxt   = i === 0 ? '★ BEST MATCH' : i === 1 ? '2ND' : `#${i + 1}`;
    const icon      = window.CUISINE_ICON[m.cuisine] || '🍽️';
    const topCls    = i < 2 ? ' top-pick' : '';
    const ings      = m.ings.map(x => x.replace(/_/g, ' ')).join(', ');
    return `
    <div class="meal-card${topCls}">
      <span class="meal-rank ${rankClass}">${rankTxt}</span>
      <div class="meal-cuisine">${icon} ${m.cuisine}</div>
      <div class="meal-name-big">${m.name}</div>
      <div class="meal-macros">
        <div class="macro-pill"><div class="macro-val">${m.cal}</div>    <div class="macro-lbl">kcal</div></div>
        <div class="macro-pill"><div class="macro-val">${m.pro}g</div>   <div class="macro-lbl">protein</div></div>
        <div class="macro-pill"><div class="macro-val">${m.carb}g</div>  <div class="macro-lbl">carbs</div></div>
        <div class="macro-pill"><div class="macro-val">${m.fat}g</div>   <div class="macro-lbl">fat</div></div>
      </div>
      <div class="meal-ings">Ingredients: ${ings}</div>
      <div class="meal-score-bar"><div class="meal-score-fill" style="width:${m.score}%"></div></div>
      <div class="meal-score-txt">ML match score: ${m.score}%</div>
    </div>`;
  }).join('');
}

// ── Diet toggle (called from HTML onclick) ────────────────────
function selectDiet(btn) {
  document.querySelectorAll('.diet-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  _lastDiet = btn.dataset.diet;
  renderMeals(_lastDiet, _lastTDEE, _lastBodyType);
}

// ── Scroll-reveal on load ─────────────────────────────────────
const scrollObs = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.12 });
document.querySelectorAll('.fade-in').forEach(el => scrollObs.observe(el));

// ── Navbar burger menu ────────────────────────────────────────
const burger = document.getElementById('burger');
const navLinks = document.getElementById('nav-links');
const links = document.querySelectorAll('.nav-links li');

if (burger) {
  burger.addEventListener('click', () => {
    // Toggle Nav
    navLinks.classList.toggle('active');
    
    // Burger Animation
    burger.classList.toggle('active');
  });
}

// Close menu on click of links
links.forEach(link => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('active');
    burger.classList.remove('active');
  });
});

// ── Expose to global scope ────────────────────────────────────
window.finalizeResults = finalizeResults;
window.selectDiet      = selectDiet;

