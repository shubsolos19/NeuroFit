/**
 * model/meals.js
 * ──────────────────────────────────────────────────────────────
 * Meal dataset + JS ML scoring engine
 * Ported from meal_model.py (Random Forest feature logic re-implemented
 * as weighted scoring — runs 100% in-browser, no server needed).
 *
 * Exports (via window.*):
 *   MEALS_DB       — full 25-meal dataset array
 *   CUISINE_ICON   — emoji map by cuisine string
 *   scoreMeals(diet, tdee, bodyType, topK) → ranked meal array
 */

'use strict';

// ── Dataset (mirrors MEALS list in meal_model.py) ─────────────
const MEALS_DB = [
  // VEGAN
  { name:"Chickpea Curry",       diet:"vegan",      ings:["chickpea","tomato","onion","garlic","spices"],        cal:380, pro:15, carb:52, fat:10, cuisine:"indian"        },
  { name:"Tofu Stir Fry",        diet:"vegan",      ings:["tofu","broccoli","carrot","soy_sauce","garlic"],       cal:320, pro:22, carb:28, fat: 9, cuisine:"asian"         },
  { name:"Lentil Soup",          diet:"vegan",      ings:["lentil","tomato","onion","carrot","spices"],           cal:290, pro:18, carb:48, fat: 4, cuisine:"mediterranean" },
  { name:"Quinoa Buddha Bowl",   diet:"vegan",      ings:["quinoa","chickpea","spinach","avocado","lemon"],       cal:430, pro:18, carb:52, fat:16, cuisine:"fusion"        },
  { name:"Black Bean Tacos",     diet:"vegan",      ings:["black_bean","corn_tortilla","avocado","salsa","lime"], cal:370, pro:14, carb:54, fat:12, cuisine:"mexican"       },
  { name:"Dal Tadka",            diet:"vegan",      ings:["lentil","tomato","onion","garlic","spices"],           cal:300, pro:16, carb:46, fat: 6, cuisine:"indian"        },
  { name:"Avocado Toast",        diet:"vegan",      ings:["bread","avocado","lemon","tomato","spices"],           cal:340, pro:10, carb:40, fat:16, cuisine:"western"       },
  // VEGETARIAN
  { name:"Mushroom Risotto",     diet:"vegetarian", ings:["mushroom","rice","onion","garlic","parmesan"],         cal:450, pro:14, carb:62, fat:13, cuisine:"italian"       },
  { name:"Paneer Tikka",         diet:"vegetarian", ings:["paneer","yogurt","tomato","spices","onion"],           cal:410, pro:22, carb:18, fat:26, cuisine:"indian"        },
  { name:"Caprese Pasta",        diet:"vegetarian", ings:["pasta","mozzarella","tomato","basil","olive_oil"],     cal:520, pro:20, carb:68, fat:18, cuisine:"italian"       },
  { name:"Veggie Omelette",      diet:"vegetarian", ings:["egg","spinach","mushroom","cheese","onion"],           cal:310, pro:22, carb:10, fat:20, cuisine:"western"       },
  { name:"Greek Salad Wrap",     diet:"vegetarian", ings:["feta","cucumber","tomato","olive","flatbread"],        cal:380, pro:14, carb:46, fat:16, cuisine:"mediterranean" },
  { name:"Palak Paneer",         diet:"vegetarian", ings:["paneer","spinach","onion","garlic","cream"],           cal:420, pro:20, carb:22, fat:28, cuisine:"indian"        },
  { name:"Pesto Pasta",          diet:"vegetarian", ings:["pasta","basil","parmesan","garlic","olive_oil"],       cal:520, pro:16, carb:66, fat:20, cuisine:"italian"       },
  { name:"Veggie Burger",        diet:"vegetarian", ings:["veggie_patty","bread","lettuce","tomato","cheese"],    cal:450, pro:18, carb:56, fat:16, cuisine:"western"       },
  // NON-VEG
  { name:"Grilled Chicken Salad",diet:"non-veg",    ings:["chicken","lettuce","tomato","cucumber","olive_oil"],  cal:350, pro:36, carb:14, fat:14, cuisine:"western"       },
  { name:"Chicken Fried Rice",   diet:"non-veg",    ings:["chicken","rice","egg","carrot","soy_sauce"],          cal:490, pro:30, carb:58, fat:12, cuisine:"asian"         },
  { name:"Salmon with Veggies",  diet:"non-veg",    ings:["salmon","broccoli","lemon","garlic","olive_oil"],     cal:420, pro:38, carb:18, fat:20, cuisine:"western"       },
  { name:"Egg Curry",            diet:"non-veg",    ings:["egg","tomato","onion","garlic","spices"],             cal:360, pro:20, carb:24, fat:20, cuisine:"indian"        },
  { name:"Chicken Biryani",      diet:"non-veg",    ings:["chicken","rice","onion","yogurt","spices"],           cal:580, pro:32, carb:70, fat:16, cuisine:"indian"        },
  { name:"Tuna Pasta",           diet:"non-veg",    ings:["tuna","pasta","tomato","garlic","olive_oil"],         cal:470, pro:30, carb:60, fat:10, cuisine:"mediterranean" },
  { name:"Beef Stir Fry",        diet:"non-veg",    ings:["beef","broccoli","soy_sauce","garlic","ginger"],      cal:430, pro:34, carb:22, fat:20, cuisine:"asian"         },
  { name:"Shrimp Tacos",         diet:"non-veg",    ings:["shrimp","corn_tortilla","avocado","salsa","lime"],    cal:390, pro:26, carb:48, fat:12, cuisine:"mexican"       },
  { name:"Fish Curry",           diet:"non-veg",    ings:["fish","tomato","onion","garlic","spices"],            cal:370, pro:30, carb:24, fat:14, cuisine:"indian"        },
  { name:"Chicken Caesar Wrap",  diet:"non-veg",    ings:["chicken","lettuce","parmesan","flatbread","caesar"],  cal:470, pro:34, carb:44, fat:16, cuisine:"western"       },
];

// ── Cuisine emoji map ─────────────────────────────────────────
const CUISINE_ICON = {
  indian:        "🍛",
  asian:         "🥢",
  mediterranean: "🫒",
  western:       "🍽️",
  italian:       "🍝",
  mexican:       "🌮",
  fusion:        "🥗",
};

// ── Body-type feature weights (mirrors RF feature importance) ─
// Derived from meal_model.py training: diet, calories, and
// body-type-specific cuisine/macro preferences are top features.
const BTYPE_BOOST = {
  ecto: { cuisines:["indian","western","italian"],      highPro:false, highCarb:true,  lowCal:false },
  meso: { cuisines:["western","asian","mediterranean"], highPro:true,  highCarb:false, lowCal:false },
  endo: { cuisines:["mediterranean","asian","indian"],  highPro:true,  highCarb:false, lowCal:true  },
};

/**
 * scoreMeals(diet, tdee, bodyType, topK)
 * ──────────────────────────────────────
 * JS implementation of the Random Forest scoring from meal_model.py.
 * Ranks meals by a composite score built from the same feature set
 * the Python RF model uses: diet match, calorie proximity, macro
 * priorities per body type, and cuisine preference.
 *
 * @param {string} diet       "vegan" | "vegetarian" | "non-veg"
 * @param {number} tdee       daily calorie target (kcal)
 * @param {string} bodyType   "ecto" | "meso" | "endo"
 * @param {number} topK       number of meals to return (default 6)
 * @returns {Array}           sorted meal objects with .score (0–99)
 */
function scoreMeals(diet, tdee, bodyType, topK = 6) {
  console.log("🤖 [ML Model] scoreMeals(): Calculating meal rankings for " + bodyType + " (" + diet + ")...");
  const perMealTarget = tdee / 5; // assume ~5 meals/day
  const bt = BTYPE_BOOST[bodyType] || BTYPE_BOOST.meso;

  const scored = MEALS_DB
    .filter(m => m.diet === diet)
    .map(m => {
      let score = 100;

      // Feature 1 — calorie proximity (highest RF importance)
      const calDiff = Math.abs(m.cal - perMealTarget);
      score -= calDiff / 8;

      // Feature 2 — cuisine preference per body type
      if (bt.cuisines.includes(m.cuisine)) score += 18;

      // Feature 3 — protein priority (meso / endo)
      if (bt.highPro && m.pro >= 25) score += 15;
      if (bt.highPro && m.pro >= 30) score += 10;

      // Feature 4 — carb boost (ecto needs caloric surplus)
      if (bt.highCarb && m.carb >= 45) score += 12;

      // Feature 5 — low calorie preference (endo fat-loss goal)
      if (bt.lowCal && m.cal < 400) score += 14;
      if (bt.lowCal && m.cal > 500) score -= 20;

      // Feature 6 — fat penalty for endo
      if (bodyType === 'endo' && m.fat > 20) score -= 10;

      return { ...m, score: Math.round(Math.max(5, Math.min(99, score))) };
    });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// ── Expose to global scope (used by app.js) ───────────────────
window.MEALS_DB    = MEALS_DB;
window.CUISINE_ICON = CUISINE_ICON;
window.scoreMeals  = scoreMeals;
