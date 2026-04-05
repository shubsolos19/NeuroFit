/**
 * model/bodyMetrics.js
 * ──────────────────────────────────────────────────────────────
 * Body measurement utilities:
 *  - Height-based healthy weight lookup table (from reference data)
 *  - BMI calculation & label
 *  - TDEE (Harris-Benedict + activity multiplier)
 *  - Body type classification (ecto / meso / endo)
 *  - Body type insight text
 *
 * Exports (via window.*):
 *   lookupWeight(heightCm, gender) → { weight, bmi }
 *   calcTDEE(weight, height, age, gender) → kcal/day
 *   getBodyType(bmi) → "ecto" | "meso" | "endo"
 *   getBMILabel(bmi) → { txt, color }
 *   BTYPE_META — display info for each body type
 *   BTYPE_INSIGHT — personalised insight text functions
 */

'use strict';

// ── Healthy weight lookup table ───────────────────────────────
// Source: height_weight_male_female.html reference data
// Male  BMI midpoint: 21.75  (range 18.5–25.0)
// Female BMI midpoint: 20.75 (range 17.5–24.0)
// Generated for every cm from 120 to 200.
function _buildWeightTable() {
  const table = {};
  for (let cm = 120; cm <= 200; cm++) {
    const m = cm / 100;
    table[cm] = {
      male:      Math.round(21.75 * m * m),
      female:    Math.round(20.75 * m * m),
      bmiMale:   21.75,
      bmiFemale: 20.75,
    };
  }
  return table;
}
const _WEIGHT_TABLE = _buildWeightTable();

/**
 * lookupWeight(heightCm, gender)
 * Returns the healthy reference weight and BMI midpoint for a given
 * height and gender, based on the reference data table.
 */
function lookupWeight(heightCm, gender) {
  const cm      = Math.round(heightCm);

  const clamped = Math.max(120, Math.min(200, cm));

  const row     = _WEIGHT_TABLE[clamped];
  if (!row) return null;
  return {
    weight: gender === 'female' ? row.female    : row.male,
    bmi:    gender === 'female' ? row.bmiFemale : row.bmiMale,
  };
}

/**
 * calcTDEE(weight, height, age, gender)
 * Harris-Benedict BMR × 1.55 (moderately active) → daily calories.
 */
function calcTDEE(weight, height, age, gender) {
  console.log("🔥 [ML Model] calcTDEE(): Computing TDEE for " + weight + "kg " + gender + "...");
  const bmr = gender === 'male'
    ? 88.362 + 13.397 * weight + 4.799 * height - 5.677 * age
    : 447.593 + 9.247 * weight + 3.098 * height - 4.330 * age;
  return bmr * 1.55;
}

/**
 * getBodyType(bmi)
 * Classifies into ectomorph / mesomorph / endomorph by BMI bracket.
 */
function getBodyType(bmi) {
  console.log("🧠 [ML Model] getBodyType(): Classifying body type for BMI: " + bmi.toFixed(1) + "...");
  if (bmi < 20)  return 'ecto';
  if (bmi <= 25) return 'meso';
  return 'endo';
}

/**
 * getBMILabel(bmi)
 * Returns a human-readable label and accent colour for the BMI value.
 */
function getBMILabel(bmi) {
  if (bmi < 18.5) return { txt:'Underweight',   color:'#4fc3f7' };
  if (bmi < 25)   return { txt:'Normal Weight',  color:'#81c784' };
  if (bmi < 30)   return { txt:'Overweight',     color:'#ffd54f' };
  return               { txt:'Obese',           color:'#e57373' };
}

// ── Body type display metadata ────────────────────────────────
const BTYPE_META = {
  ecto: { fig:'🦒', name:'ECTOMORPH',  sub:'Slim & Lean',        traits:'Fast metabolism · Thin frame · Difficulty gaining muscle' },
  meso: { fig:'💪', name:'MESOMORPH',  sub:'Athletic & Muscular', traits:'Moderate metabolism · Gains muscle easily · Naturally athletic' },
  endo: { fig:'🧸', name:'ENDOMORPH',  sub:'Rounder & Stocky',    traits:'Slow metabolism · Stores fat easily · High strength potential' },
};

// ── Personalised insight text per body type ───────────────────
const BTYPE_INSIGHT = {
  ecto: (h, w, bmi) =>
    `You are an <strong>Ectomorph</strong> — your BMI of ${bmi.toFixed(1)} and lean frame indicate a fast metabolism with difficulty storing mass. Your goal should be a <strong>caloric surplus</strong> and progressive overload training. Focus on high-calorie dense meals spaced every 2–3 hours and limit cardio to preserve energy for muscle growth.`,
  meso: (h, w, bmi) =>
    `You are a <strong>Mesomorph</strong> — your BMI of ${bmi.toFixed(1)} reflects a naturally athletic build with balanced muscle and moderate fat. You respond well to both <strong>strength and cardio training</strong>. Maintain a balanced diet around your TDEE with moderate protein intake and varied workouts to stay defined.`,
  endo: (h, w, bmi) =>
    `You are an <strong>Endomorph</strong> — your BMI of ${bmi.toFixed(1)} indicates a tendency to store fat more easily. Your strategy is <strong>caloric deficit + high-frequency cardio</strong>. Prioritise low-glycaemic meals, time carbs around workouts, and keep activity levels consistently high throughout the day.`,
};

// ── Expose to global scope ────────────────────────────────────
window.lookupWeight  = lookupWeight;
window.calcTDEE      = calcTDEE;
window.getBodyType   = getBodyType;
window.getBMILabel   = getBMILabel;
window.BTYPE_META    = BTYPE_META;
window.BTYPE_INSIGHT = BTYPE_INSIGHT;
