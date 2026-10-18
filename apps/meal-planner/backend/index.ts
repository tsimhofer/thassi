import { defineThassiApp } from '@thassi/sdk';

export interface Recipe {
  id: number;
  name: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  calories: number;
  protein_g: number;
  prep_minutes: number;
  ingredients: string[]; // stored as JSON array in SQLite
  instructions: string;
  tags: string;
  created_at: string;
}

interface RawRecipeRow extends Omit<Recipe, 'ingredients'> {
  ingredients: string;
}

export interface MealPlanEntry {
  id: number;
  plan_date: string; // YYYY-MM-DD
  slot: 'breakfast' | 'lunch' | 'dinner';
  recipe_id: number | null;
  custom_title: string;
  calories: number;
  protein_g: number;
  completed: number;
  notes: string;
}

export interface GroceryItem {
  id: number;
  name: string;
  category: string;
  checked: number;
  source_recipe: string;
}

const STARTER_RECIPES: Array<Omit<Recipe, 'id' | 'created_at'>> = [
  {
    name: 'High-Protein Overnight Oats & Berries',
    meal_type: 'breakfast',
    calories: 460,
    protein_g: 32,
    prep_minutes: 5,
    ingredients: ['80g Rolled Oats', '200g Skyr / Greek Yogurt', '1 scoop Whey or Plant Protein', '80g Mixed Berries', '10g Chia Seeds'],
    instructions: 'Mix oats, yogurt, protein powder, and chia seeds with a splash of milk. Refrigerate overnight and top with berries.',
    tags: 'quick,high-protein,vegetarian',
  },
  {
    name: 'Shakshuka with Feta & Sourdough',
    meal_type: 'breakfast',
    calories: 520,
    protein_g: 26,
    prep_minutes: 20,
    ingredients: ['3 Eggs', '1 can Crushed Tomatoes', '1 Red Bell Pepper', '50g Feta Cheese', '2 slices Sourdough Bread'],
    instructions: 'Simmer diced pepper and spiced tomatoes for 10 mins, poach eggs in the sauce, crumble feta on top.',
    tags: 'vegetarian,weekend',
  },
  {
    name: 'Mediterranean Chicken Quinoa Bowl',
    meal_type: 'lunch',
    calories: 640,
    protein_g: 48,
    prep_minutes: 25,
    ingredients: ['180g Chicken Breast', '85g Dry Quinoa', '1 Cucumber', '100g Cherry Tomatoes', '40g Hummus', 'Olives & Lemon Olive Oil'],
    instructions: 'Cook quinoa, grill seasoned chicken breast, and assemble bowl with chopped vegetables and hummus.',
    tags: 'meal-prep,high-protein',
  },
  {
    name: 'Red Lentil & Coconut Curry',
    meal_type: 'lunch',
    calories: 580,
    protein_g: 24,
    prep_minutes: 30,
    ingredients: ['120g Red Lentils', '200ml Coconut Milk', '100g Baby Spinach', '1 Onion & Garlic', 'Curry Paste & Basmati Rice'],
    instructions: 'Sauté aromatics and curry paste, simmer red lentils with coconut milk and broth for 20 mins, stir in spinach.',
    tags: 'vegan,meal-prep,budget',
  },
  {
    name: 'Teriyaki Glazed Salmon with Broccoli & Rice',
    meal_type: 'dinner',
    calories: 690,
    protein_g: 46,
    prep_minutes: 20,
    ingredients: ['200g Salmon Fillet', '200g Broccoli Florets', '90g Jasmine Rice', '2 tbsp Teriyaki Sauce', 'Sesame Seeds & Spring Onion'],
    instructions: 'Roast salmon and broccoli at 200°C for 14 minutes with teriyaki glaze; serve over steamed jasmine rice.',
    tags: 'omega-3,quick,high-protein',
  },
  {
    name: 'Crispy Tofu & Peanut Udon Stir-Fry',
    meal_type: 'dinner',
    calories: 610,
    protein_g: 28,
    prep_minutes: 20,
    ingredients: ['200g Firm Tofu', '200g Udon Noodles', '150g Edamame & Snap Peas', '2 tbsp Peanut Butter', 'Soy Sauce, Lime & Chili Crisp'],
    instructions: 'Pan-sear cubed tofu until golden, toss with udon noodles, veggies, and warm peanut-soy-lime sauce.',
    tags: 'vegan,quick',
  },
];

function formatDateYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getMondayOfCurrentWeek(refDateStr?: string): Date {
  const d = refDateStr ? new Date(`${refDateStr}T12:00:00`) : new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  return new Date(d.setDate(diff));
}

export default defineThassiApp((ctx) => {
  // 1. Initialize SQLite Schema for Meal Planner
  ctx.db.exec(`
    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      meal_type TEXT NOT NULL DEFAULT 'dinner',
      calories INTEGER NOT NULL DEFAULT 0,
      protein_g INTEGER NOT NULL DEFAULT 0,
      prep_minutes INTEGER NOT NULL DEFAULT 20,
      ingredients TEXT NOT NULL DEFAULT '[]',
      instructions TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meal_plan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_date TEXT NOT NULL,
      slot TEXT NOT NULL,
      recipe_id INTEGER,
      custom_title TEXT NOT NULL,
      calories INTEGER NOT NULL DEFAULT 0,
      protein_g INTEGER NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      UNIQUE(plan_date, slot)
    );

    CREATE TABLE IF NOT EXISTS grocery_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      checked INTEGER NOT NULL DEFAULT 0,
      source_recipe TEXT NOT NULL DEFAULT ''
    );
  `);

  // Seed starter recipes & sample meal plan for today if empty
  const recipeCount = ctx.db.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM recipes')?.cnt ?? 0;
  if (recipeCount === 0) {
    const now = new Date().toISOString();
    for (const r of STARTER_RECIPES) {
      ctx.db.execute(
        `INSERT INTO recipes (name, meal_type, calories, protein_g, prep_minutes, ingredients, instructions, tags, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          r.name,
          r.meal_type,
          r.calories,
          r.protein_g,
          r.prep_minutes,
          JSON.stringify(r.ingredients),
          r.instructions,
          r.tags,
          now,
        ]
      );
    }

    // Seed today's Breakfast, Lunch, and Dinner so the weekly view & HA sensor work out-of-the-box
    const today = formatDateYMD(new Date());
    const seededRecipes = ctx.db.query<RawRecipeRow>('SELECT * FROM recipes ORDER BY id ASC');
    const breakfast = seededRecipes.find((r) => r.meal_type === 'breakfast');
    const lunch = seededRecipes.find((r) => r.meal_type === 'lunch');
    const dinner = seededRecipes.find((r) => r.meal_type === 'dinner');

    if (breakfast) {
      ctx.db.execute(
        `INSERT OR REPLACE INTO meal_plan (plan_date, slot, recipe_id, custom_title, calories, protein_g, completed)
         VALUES (?, 'breakfast', ?, ?, ?, ?, 0)`,
        [today, breakfast.id, breakfast.name, breakfast.calories, breakfast.protein_g]
      );
    }
    if (lunch) {
      ctx.db.execute(
        `INSERT OR REPLACE INTO meal_plan (plan_date, slot, recipe_id, custom_title, calories, protein_g, completed)
         VALUES (?, 'lunch', ?, ?, ?, ?, 0)`,
        [today, lunch.id, lunch.name, lunch.calories, lunch.protein_g]
      );
    }
    if (dinner) {
      ctx.db.execute(
        `INSERT OR REPLACE INTO meal_plan (plan_date, slot, recipe_id, custom_title, calories, protein_g, completed)
         VALUES (?, 'dinner', ?, ?, ?, ?, 0)`,
        [today, dinner.id, dinner.name, dinner.calories, dinner.protein_g]
      );
    }
  }

  function parseRecipeRow(row: RawRecipeRow): Recipe {
    let ingredients: string[] = [];
    try {
      ingredients = JSON.parse(row.ingredients);
    } catch {
      ingredients = [];
    }
    return { ...row, ingredients };
  }

  async function syncTodayToHomeAssistantAndSharedDb() {
    const today = formatDateYMD(new Date());
    const todaysMeals = ctx.db.query<MealPlanEntry>(
      'SELECT * FROM meal_plan WHERE plan_date = ? ORDER BY slot ASC',
      [today]
    );
    const dinner = todaysMeals.find((m) => m.slot === 'dinner');
    const lunch = todaysMeals.find((m) => m.slot === 'lunch');
    const breakfast = todaysMeals.find((m) => m.slot === 'breakfast');

    const totalCalories = todaysMeals.reduce((sum, m) => sum + (m.calories || 0), 0);
    const totalProtein = todaysMeals.reduce((sum, m) => sum + (m.protein_g || 0), 0);
    const openGroceries =
      ctx.db.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM grocery_items WHERE checked = 0')?.cnt ?? 0;

    // Share meal & nutrition summary in /data/shared.db so future Health / Calendar apps can read it!
    ctx.sharedDb.kvSet('meal_planner_today', {
      date: today,
      breakfast: breakfast?.custom_title || null,
      lunch: lunch?.custom_title || null,
      dinner: dinner?.custom_title || null,
      totalCalories,
      totalProtein,
      openGroceries,
      updatedAt: new Date().toISOString(),
    });

    const haStatus = await ctx.ha.getStatus();
    if (haStatus.connected) {
      await ctx.ha.publishSensor('todays_dinner', dinner?.custom_title || 'Unplanned', {
        friendly_name: "Today's Planned Dinner",
        icon: 'mdi:silverware-fork-knife',
        date: today,
        breakfast: breakfast?.custom_title || 'Unplanned',
        lunch: lunch?.custom_title || 'Unplanned',
        dinner_calories: dinner?.calories ?? 0,
        dinner_protein_g: dinner?.protein_g ?? 0,
        daily_calories_total: totalCalories,
        daily_protein_total_g: totalProtein,
      });

      await ctx.ha.publishSensor('todays_calories', totalCalories, {
        friendly_name: "Today's Planned Calories",
        unit_of_measurement: 'kcal',
        icon: 'mdi:fire',
        protein_g: totalProtein,
      });

      await ctx.ha.publishSensor('open_groceries', openGroceries, {
        friendly_name: 'Open Grocery Items',
        unit_of_measurement: 'items',
        icon: 'mdi:cart-outline',
      });
    }

    return {
      today,
      dinner: dinner?.custom_title || 'Unplanned',
      totalCalories,
      totalProtein,
      openGroceries,
      haConnected: haStatus.connected,
    };
  }

  // 2. REST API Routes (/api/apps/meal-planner/*)

  // Get all recipes
  ctx.route('GET', '/recipes', (_req, { db }) => {
    const rows = db.query<RawRecipeRow>('SELECT * FROM recipes ORDER BY name ASC');
    return { recipes: rows.map(parseRecipeRow) };
  });

  // Create a new recipe
  ctx.route('POST', '/recipes', (req, { db }) => {
    const body = (req.body || {}) as Partial<Recipe> & { ingredientsText?: string };
    if (!body.name?.trim()) {
      return { status: 400, body: { error: 'Recipe name is required' } };
    }
    const ingredients = Array.isArray(body.ingredients)
      ? body.ingredients
      : (body.ingredientsText || '')
          .split(/\r?\n|,/)
          .map((s) => s.trim())
          .filter(Boolean);

    const now = new Date().toISOString();
    const res = db.execute(
      `INSERT INTO recipes (name, meal_type, calories, protein_g, prep_minutes, ingredients, instructions, tags, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.name.trim(),
        body.meal_type || 'dinner',
        Number(body.calories || 0),
        Number(body.protein_g || 0),
        Number(body.prep_minutes || 20),
        JSON.stringify(ingredients),
        (body.instructions || '').trim(),
        (body.tags || '').trim(),
        now,
      ]
    );
    return { id: res.lastInsertRowid };
  });

  // Delete a recipe
  ctx.route('DELETE', '/recipes', (req, { db }) => {
    const id = Number(req.query.id);
    db.execute('DELETE FROM recipes WHERE id = ?', [id]);
    return { deleted: id };
  });

  // Get 7-day meal plan starting from Monday of requested week
  ctx.route('GET', '/week', (req, { db }) => {
    const monday = getMondayOfCurrentWeek(req.query.start);
    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push(formatDateYMD(d));
    }

    const startDay = days[0];
    const endDay = days[6];
    const entries = db.query<MealPlanEntry>(
      'SELECT * FROM meal_plan WHERE plan_date >= ? AND plan_date <= ? ORDER BY plan_date ASC',
      [startDay, endDay]
    );

    return {
      weekStart: startDay,
      weekEnd: endDay,
      days,
      entries,
    };
  });

  // Assign a recipe or custom meal to a date + slot
  ctx.route('POST', '/plan', async (req, { db }) => {
    const body = (req.body || {}) as {
      plan_date?: string;
      slot?: 'breakfast' | 'lunch' | 'dinner';
      recipe_id?: number | null;
      custom_title?: string;
      calories?: number;
      protein_g?: number;
    };

    if (!body.plan_date || !body.slot) {
      return { status: 400, body: { error: 'plan_date and slot are required' } };
    }

    let title = (body.custom_title || '').trim();
    let calories = Number(body.calories || 0);
    let protein = Number(body.protein_g || 0);
    const recipeId = body.recipe_id ? Number(body.recipe_id) : null;

    if (recipeId) {
      const r = db.queryOne<RawRecipeRow>('SELECT * FROM recipes WHERE id = ?', [recipeId]);
      if (r) {
        title = title || r.name;
        calories = body.calories !== undefined ? Number(body.calories) : r.calories;
        protein = body.protein_g !== undefined ? Number(body.protein_g) : r.protein_g;
      }
    }

    if (!title) {
      return { status: 400, body: { error: 'Meal title or recipe_id is required' } };
    }

    db.execute(
      `INSERT INTO meal_plan (plan_date, slot, recipe_id, custom_title, calories, protein_g, completed)
       VALUES (?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(plan_date, slot) DO UPDATE SET
         recipe_id = excluded.recipe_id,
         custom_title = excluded.custom_title,
         calories = excluded.calories,
         protein_g = excluded.protein_g`,
      [body.plan_date, body.slot, recipeId, title, calories, protein]
    );

    const syncSummary = await syncTodayToHomeAssistantAndSharedDb();
    return { saved: true, syncSummary };
  });

  // Toggle meal completed or delete planned slot
  ctx.route('POST', '/plan/toggle', (req, { db }) => {
    const body = (req.body || {}) as { id?: number };
    db.execute('UPDATE meal_plan SET completed = CASE WHEN completed = 1 THEN 0 ELSE 1 END WHERE id = ?', [
      Number(body.id),
    ]);
    return { toggled: body.id };
  });

  ctx.route('DELETE', '/plan', async (req, { db }) => {
    const id = Number(req.query.id);
    db.execute('DELETE FROM meal_plan WHERE id = ?', [id]);
    await syncTodayToHomeAssistantAndSharedDb();
    return { deleted: id };
  });

  // Grocery List endpoints
  ctx.route('GET', '/groceries', (_req, { db }) => {
    const items = db.query<GroceryItem>('SELECT * FROM grocery_items ORDER BY checked ASC, id DESC');
    return { items };
  });

  ctx.route('POST', '/groceries', async (req, { db }) => {
    const body = (req.body || {}) as { name?: string; category?: string; source_recipe?: string };
    if (!body.name?.trim()) {
      return { status: 400, body: { error: 'Item name is required' } };
    }
    db.execute(
      'INSERT INTO grocery_items (name, category, checked, source_recipe) VALUES (?, ?, 0, ?)',
      [body.name.trim(), (body.category || 'General').trim(), (body.source_recipe || '').trim()]
    );
    await syncTodayToHomeAssistantAndSharedDb();
    return { added: true };
  });

  ctx.route('POST', '/groceries/toggle', async (req, { db }) => {
    const body = (req.body || {}) as { id?: number };
    db.execute('UPDATE grocery_items SET checked = CASE WHEN checked = 1 THEN 0 ELSE 1 END WHERE id = ?', [
      Number(body.id),
    ]);
    await syncTodayToHomeAssistantAndSharedDb();
    return { toggled: body.id };
  });

  ctx.route('DELETE', '/groceries/checked', async (_req, { db }) => {
    db.execute('DELETE FROM grocery_items WHERE checked = 1');
    await syncTodayToHomeAssistantAndSharedDb();
    return { cleared: true };
  });

  // Automatically generate grocery items from all recipes planned in a given week
  ctx.route('POST', '/groceries/generate-from-week', async (req, { db }) => {
    const body = (req.body || {}) as { weekStart?: string; weekEnd?: string };
    if (!body.weekStart || !body.weekEnd) {
      return { status: 400, body: { error: 'weekStart and weekEnd are required' } };
    }

    const planned = db.query<{ recipe_id: number; custom_title: string }>(
      'SELECT recipe_id, custom_title FROM meal_plan WHERE plan_date >= ? AND plan_date <= ? AND recipe_id IS NOT NULL',
      [body.weekStart, body.weekEnd]
    );

    const existingItems = new Set(
      db
        .query<{ name: string }>('SELECT LOWER(name) as name FROM grocery_items WHERE checked = 0')
        .map((r) => r.name)
    );

    let addedCount = 0;
    for (const entry of planned) {
      const r = db.queryOne<RawRecipeRow>('SELECT * FROM recipes WHERE id = ?', [entry.recipe_id]);
      if (!r) continue;
      const parsed = parseRecipeRow(r);
      for (const ing of parsed.ingredients) {
        const key = ing.trim().toLowerCase();
        if (key && !existingItems.has(key)) {
          db.execute(
            'INSERT INTO grocery_items (name, category, checked, source_recipe) VALUES (?, ?, 0, ?)',
            [ing.trim(), 'Meal Plan', parsed.name]
          );
          existingItems.add(key);
          addedCount++;
        }
      }
    }

    await syncTodayToHomeAssistantAndSharedDb();
    return { addedCount };
  });

  // Trigger manual sync of sensors to Home Assistant
  ctx.route('POST', '/sync-ha', async () => {
    return await syncTodayToHomeAssistantAndSharedDb();
  });

  // 3. Background Cron Job: Sync Today's Meal Plan & Grocery Count to Home Assistant
  ctx.scheduleJob({
    id: 'sync-meal-sensors',
    name: "Sync Today's Meals & Nutrition to Home Assistant",
    description:
      'Publishes sensor.thassi_meal_planner_todays_dinner, todays_calories, and open_groceries to Home Assistant and /data/shared.db.',
    intervalMinutes: 15,
    runOnStart: true,
    handler: async () => {
      const res = await syncTodayToHomeAssistantAndSharedDb();
      return `Dinner: ${res.dinner} (${res.totalCalories} kcal, ${res.totalProtein}g protein, ${res.openGroceries} groceries) [HA: ${res.haConnected ? 'synced' : 'local-only'}]`;
    },
  });
});
