/**
 * model/exercises.js
 * ──────────────────────────────────────────────────────────────
 * Exercise recommendations keyed by body type.
 * Each exercise has: icon, name, meta description, sets/reps,
 * a tag category, and a display label for the tag.
 *
 * Exports (via window.*):
 *   EXERCISE_DB    — { ecto: [...], meso: [...], endo: [...] }
 *   getExercises(bodyType) → exercise array for given body type
 */

'use strict';

const EXERCISE_DB = {
  // ── Ectomorph: priority = muscle gain, minimal cardio ─────
  ecto: [
    { icon:"🏋️", name:"Heavy Compound Lifts",  meta:"Squat · Deadlift · Bench Press",      sets:"4 × 6 reps",    tag:"build",  tagLbl:"Muscle Gain" },
    { icon:"💪",  name:"Barbell Rows",          meta:"Back thickness & width",               sets:"4 × 8 reps",    tag:"build",  tagLbl:"Muscle Gain" },
    { icon:"🦵",  name:"Leg Press & RDL",       meta:"Quad & hamstring hypertrophy",         sets:"3 × 10 reps",   tag:"build",  tagLbl:"Muscle Gain" },
    { icon:"🤸",  name:"Overhead Press",        meta:"Shoulder & upper body mass",           sets:"4 × 8 reps",    tag:"build",  tagLbl:"Muscle Gain" },
    { icon:"🏃",  name:"Minimal Cardio Only",   meta:"Max 2 × 20 min/week — preserve cals", sets:"Low intensity", tag:"cardio", tagLbl:"Cardio"      },
    { icon:"😴",  name:"Rest & Recovery",       meta:"8+ hrs sleep — critical for growth",   sets:"Every night",   tag:"flex",   tagLbl:"Recovery"    },
  ],
  // ── Mesomorph: priority = strength + definition ───────────
  meso: [
    { icon:"🏋️", name:"Push / Pull / Legs Split",  meta:"Volume training for definition",    sets:"4 × 10–12",     tag:"build",  tagLbl:"Strength"    },
    { icon:"⚡",  name:"HIIT Cardio",               meta:"High intensity interval training",   sets:"3 × 25 min/wk", tag:"burn",   tagLbl:"Fat Burn"    },
    { icon:"🔄",  name:"Supersets & Drop Sets",     meta:"Advanced hypertrophy technique",     sets:"High intensity",tag:"build",  tagLbl:"Definition"  },
    { icon:"🤸",  name:"Mobility Work",             meta:"Flexibility & injury prevention",    sets:"15 min/session",tag:"flex",   tagLbl:"Flexibility" },
    { icon:"🚴",  name:"Cycling or Swimming",       meta:"Aerobic base, calorie burn",         sets:"2 × 40 min/wk", tag:"cardio", tagLbl:"Cardio"      },
    { icon:"🥊",  name:"Sport-Specific Training",   meta:"Basketball, football, boxing",       sets:"Optional",      tag:"cardio", tagLbl:"Agility"     },
  ],
  // ── Endomorph: priority = fat loss, high-frequency cardio ─
  endo: [
    { icon:"🚴",  name:"Steady-State Cardio",   meta:"Bike · Walk · Swim",                   sets:"45 min, 5×/wk", tag:"burn",   tagLbl:"Fat Burn"    },
    { icon:"🏋️", name:"Circuit Training",       meta:"Full body, moderate weights",           sets:"3 × 15 reps",   tag:"burn",   tagLbl:"Fat Burn"    },
    { icon:"⚡",  name:"HIIT Intervals",         meta:"Maximum calorie afterburn",             sets:"2 × 30 min/wk", tag:"burn",   tagLbl:"Fat Burn"    },
    { icon:"🚶",  name:"10,000 Steps Daily",     meta:"Low-intensity constant movement",       sets:"Every day",     tag:"cardio", tagLbl:"Cardio"      },
    { icon:"🧘",  name:"Yoga / Stretching",      meta:"Cortisol control & stress reduction",  sets:"3×/week",       tag:"flex",   tagLbl:"Recovery"    },
    { icon:"💪",  name:"Resistance Training",    meta:"Preserve muscle while losing fat",      sets:"3 × 12 reps",   tag:"build",  tagLbl:"Muscle"      },
  ],
};

/**
 * getExercises(bodyType)
 * Returns the exercise list for the given body type.
 * Defaults to meso if an unknown type is passed.
 */
function getExercises(bodyType) {
  console.log("👟 [ML Model] getExercises(): Fetching exercise plan for " + bodyType + "...");
  return EXERCISE_DB[bodyType] || EXERCISE_DB.meso;
}

// ── Expose to global scope ────────────────────────────────────
window.EXERCISE_DB  = EXERCISE_DB;
window.getExercises = getExercises;
