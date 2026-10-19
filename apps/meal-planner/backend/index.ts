import { defineThassiApp } from '@thassi/sdk';

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface StructuredIngredient {
  name: string;
  amount: number;
  unit: 'g' | 'ml' | 'Stk';
  category?: string;
}

export interface Recipe {
  id: number;
  name: string;
  meal_type: MealSlot;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  prep_minutes: number;
  ingredients: string[];
  structured_ingredients: StructuredIngredient[];
  instructions: string;
  tags: string;
  created_at: string;
}

interface RawRecipeRow extends Omit<Recipe, 'ingredients' | 'structured_ingredients'> {
  ingredients: string;
  structured_ingredients?: string;
}

export interface IngredientCatalogItem {
  id: number;
  name: string;
  barcode: string;
  brand: string;
  unit: 'g' | 'ml' | 'Stk';
  package_size: number;
  available_amount: number; // Current stock at home (Vorrat)
  calories_per_100: number;
  protein_per_100: number;
  carbs_per_100: number;
  fat_per_100: number;
  fiber_per_100: number;
  sugar_per_100: number;
  nutriscore: string;
  price_billa: number;
  pack_billa: number;
  product_billa: string;
  price_hofer: number;
  pack_hofer: number;
  product_hofer: string;
  price_spar: number;
  pack_spar: number;
  product_spar: string;
  created_at: string;
}

export interface MealPlanEntry {
  id: number;
  plan_date: string; // YYYY-MM-DD
  slot: MealSlot;
  recipe_id: number | null;
  custom_title: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  guest_portions: number;
  selected: number;
  completed: number;
  notes: string;
  custom_ingredients: string;
}

export interface WaterLogEntry {
  plan_date: string;
  amount_ml: number;
  target_ml: number;
  updated_at: string;
}

export interface UserProfile {
  name: string;
  age: number;
  gender: 'male' | 'female' | 'diverse';
  height_cm: number;
  current_weight_kg: number;
  target_weight_kg: number;
  activity_level: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  who_profile: 'who_standard' | 'who_mediterranean' | 'who_high_protein' | 'who_plant_based' | 'who_metabolic';
  weekly_goal_kg: number; // e.g. -0.5 for weight loss, 0 for hold, +0.3 for gain
  target_calories: number;
  target_protein_g: number;
  target_carbs_g: number;
  target_fat_g: number;
  target_fiber_g: number;
  max_sugar_g: number;
  target_water_ml: number;
}

export interface OptimizationOptions {
  mode: 'waste_min' | 'ingredient_min' | 'price_min' | 'balanced';
  preferred_stores: Array<'billa' | 'hofer' | 'spar'>;
  use_pantry_stock: boolean;
  auto_accumulate_packages: boolean;
  max_unique_ingredients_per_week: number;
  prefer_bio: boolean;
}

export interface GroceryItem {
  id: number;
  name: string;
  category: string;
  checked: number;
  source_recipe: string;
}

const DEFAULT_USER_PROFILE: UserProfile = {
  name: 'Thomas',
  age: 32,
  gender: 'male',
  height_cm: 180,
  current_weight_kg: 82,
  target_weight_kg: 76,
  activity_level: 'moderate',
  who_profile: 'who_high_protein',
  weekly_goal_kg: -0.4,
  target_calories: 2150,
  target_protein_g: 145,
  target_carbs_g: 215,
  target_fat_g: 68,
  target_fiber_g: 30,
  max_sugar_g: 48,
  target_water_ml: 2800,
};

const DEFAULT_OPTIMIZATION_OPTIONS: OptimizationOptions = {
  mode: 'waste_min',
  preferred_stores: ['billa', 'hofer', 'spar'],
  use_pantry_stock: true,
  auto_accumulate_packages: true,
  max_unique_ingredients_per_week: 18,
  prefer_bio: true,
};

export function computeProfileTargets(raw: Partial<UserProfile>): UserProfile {
  const merged: UserProfile = { ...DEFAULT_USER_PROFILE, ...raw };
  const weight = Number(merged.current_weight_kg) || 80;
  const targetWeight = Number(merged.target_weight_kg) || weight;
  const height = Number(merged.height_cm) || 178;
  const age = Number(merged.age) || 32;

  // Mifflin-St Jeor BMR
  const genderOffset = merged.gender === 'female' ? -161 : merged.gender === 'diverse' ? -78 : 5;
  const bmr = 10 * weight + 6.25 * height - 5 * age + genderOffset;

  const palMap: Record<UserProfile['activity_level'], number> = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9,
  };
  const tdee = bmr * (palMap[merged.activity_level] || 1.55);

  // Auto-derive weekly_goal_kg direction if not explicitly set
  let weeklyDeltaKg = Number(merged.weekly_goal_kg);
  if (!Number.isFinite(weeklyDeltaKg)) {
    weeklyDeltaKg = targetWeight < weight ? -0.4 : targetWeight > weight ? 0.25 : 0;
  }
  // 1 kg body fat ~ 7000 kcal -> daily delta = weeklyDeltaKg * 1000
  const dailyCalorieDelta = Math.max(-750, Math.min(600, Math.round(weeklyDeltaKg * 1000)));
  const targetCalories = Math.max(1350, Math.round(tdee + dailyCalorieDelta));

  // WHO Profile Macro Ratios
  // WHO Standard: Protein 15-20%, Carbs 50-55%, Fat <30%, Free Sugar <10% (ideal <5%), Fiber >=25g
  let protRatio = 0.2;
  let carbRatio = 0.52;
  let fatRatio = 0.28;
  let fiberTarget = 28;
  let sugarMaxRatio = 0.09; // <10% of total energy per WHO

  if (merged.who_profile === 'who_high_protein') {
    protRatio = 0.27;
    carbRatio = 0.45;
    fatRatio = 0.28;
    fiberTarget = 30;
    sugarMaxRatio = 0.07;
  } else if (merged.who_profile === 'who_mediterranean') {
    protRatio = 0.2;
    carbRatio = 0.45;
    fatRatio = 0.35; // healthy olive oil / nuts / omega-3
    fiberTarget = 32;
    sugarMaxRatio = 0.07;
  } else if (merged.who_profile === 'who_plant_based') {
    protRatio = 0.19;
    carbRatio = 0.55;
    fatRatio = 0.26;
    fiberTarget = 38;
    sugarMaxRatio = 0.08;
  } else if (merged.who_profile === 'who_metabolic') {
    protRatio = 0.28;
    carbRatio = 0.38;
    fatRatio = 0.34;
    fiberTarget = 35;
    sugarMaxRatio = 0.05; // Strict WHO <5% free sugars
  }

  const targetProtein = Math.round((targetCalories * protRatio) / 4);
  const targetCarbs = Math.round((targetCalories * carbRatio) / 4);
  const targetFat = Math.round((targetCalories * fatRatio) / 9);
  const maxSugar = Math.round((targetCalories * sugarMaxRatio) / 4);
  const targetWater = Math.round(weight * 35); // WHO / DGE ~35ml per kg body weight

  return {
    ...merged,
    weekly_goal_kg: weeklyDeltaKg,
    target_calories: targetCalories,
    target_protein_g: targetProtein,
    target_carbs_g: targetCarbs,
    target_fat_g: targetFat,
    target_fiber_g: fiberTarget,
    max_sugar_g: maxSugar,
    target_water_ml: targetWater,
  };
}

const STARTER_INGREDIENTS: Array<Omit<IngredientCatalogItem, 'id' | 'created_at'>> = [
  {
    name: 'Haferflocken Zartblatt',
    barcode: '9002233001122',
    brand: 'SPAR Natur*pur / Ja! Natürlich',
    unit: 'g',
    package_size: 500,
    available_amount: 160,
    calories_per_100: 372,
    protein_per_100: 13.5,
    carbs_per_100: 58.7,
    fat_per_100: 7.0,
    fiber_per_100: 10.0,
    sugar_per_100: 0.8,
    nutriscore: 'A',
    price_billa: 1.49,
    pack_billa: 500,
    product_billa: 'Ja! Natürlich Bio-Haferflocken 500g',
    price_hofer: 0.89,
    pack_hofer: 500,
    product_hofer: 'Zurück zum Ursprung Bio-Haferflocken 500g',
    price_spar: 1.29,
    pack_spar: 500,
    product_spar: 'SPAR Natur*pur Bio-Haferflocken 500g',
  },
  {
    name: 'Skyr Natur',
    barcode: '9002100045123',
    brand: 'NÖM / Milfina',
    unit: 'g',
    package_size: 400,
    available_amount: 100,
    calories_per_100: 63,
    protein_per_100: 11.0,
    carbs_per_100: 4.0,
    fat_per_100: 0.2,
    fiber_per_100: 0,
    sugar_per_100: 4.0,
    nutriscore: 'A',
    price_billa: 1.79,
    pack_billa: 400,
    product_billa: 'NÖM PRO Skyr Natur 400g',
    price_hofer: 1.39,
    pack_hofer: 500,
    product_hofer: 'Milfina Skyr Natur 500g',
    price_spar: 1.59,
    pack_spar: 400,
    product_spar: 'S-BUDGET Skyr Natur 400g',
  },
  {
    name: 'Heidelbeeren / Beerenmix',
    barcode: '9005500112233',
    brand: 'Da komm ich her!',
    unit: 'g',
    package_size: 300,
    available_amount: 0,
    calories_per_100: 46,
    protein_per_100: 0.8,
    carbs_per_100: 9.2,
    fat_per_100: 0.4,
    fiber_per_100: 3.1,
    sugar_per_100: 7.4,
    nutriscore: 'A',
    price_billa: 2.99,
    pack_billa: 300,
    product_billa: 'BILLA Beerenmix TK/Frisch 300g',
    price_hofer: 2.49,
    pack_hofer: 300,
    product_hofer: 'Hofer Marktplatz Heidelbeeren 300g',
    price_spar: 2.79,
    pack_spar: 250,
    product_spar: 'SPAR Natur*pur Heidelbeeren 250g',
  },
  {
    name: 'Bio-Eier',
    barcode: '9001112223334',
    brand: 'Toni\'s Freilandeier / Zurück zum Ursprung',
    unit: 'Stk',
    package_size: 10,
    available_amount: 2,
    calories_per_100: 155,
    protein_per_100: 13.0,
    carbs_per_100: 1.1,
    fat_per_100: 11.0,
    fiber_per_100: 0,
    sugar_per_100: 0.7,
    nutriscore: 'A',
    price_billa: 3.99,
    pack_billa: 10,
    product_billa: 'Ja! Natürlich Bio-Freilandeier 10 Stk',
    price_hofer: 3.49,
    pack_hofer: 10,
    product_hofer: 'Zurück zum Ursprung Bio-Eier 10 Stk',
    price_spar: 3.79,
    pack_spar: 6,
    product_spar: 'SPAR Natur*pur Bio-Eier 6 Stk',
  },
  {
    name: 'Vollkorn-Sauerteigbrot',
    barcode: '9003334445556',
    brand: 'Ölz / Backbox',
    unit: 'g',
    package_size: 500,
    available_amount: 120,
    calories_per_100: 218,
    protein_per_100: 7.8,
    carbs_per_100: 41.0,
    fat_per_100: 1.8,
    fiber_per_100: 7.2,
    sugar_per_100: 2.1,
    nutriscore: 'A',
    price_billa: 2.69,
    pack_billa: 500,
    product_billa: 'Ja! Natürlich Bio-Roggenvollkornbrot 500g',
    price_hofer: 1.99,
    pack_hofer: 500,
    product_hofer: 'Backbox Bio-Urkornbrot 500g',
    price_spar: 2.49,
    pack_spar: 500,
    product_spar: 'SPAR Natur*pur Bio-Vollkornbrot 500g',
  },
  {
    name: 'Hühnerbrustfilet',
    barcode: '9004445556667',
    brand: 'Wech / TANN / FairHOF',
    unit: 'g',
    package_size: 400,
    available_amount: 0,
    calories_per_100: 110,
    protein_per_100: 23.5,
    carbs_per_100: 0.2,
    fat_per_100: 1.5,
    fiber_per_100: 0,
    sugar_per_100: 0,
    nutriscore: 'A',
    price_billa: 6.49,
    pack_billa: 400,
    product_billa: 'BILLA Hofstädter Hühnerbrustfilet 400g',
    price_hofer: 5.49,
    pack_hofer: 500,
    product_hofer: 'FairHOF Hühnerbrustfilet 500g',
    price_spar: 5.99,
    pack_spar: 400,
    product_spar: 'TANN Österreichisches Hühnerfilet 400g',
  },
  {
    name: 'Quinoa / Naturreis',
    barcode: '9006667778889',
    brand: 'SPAR Natur*pur / Ja! Natürlich',
    unit: 'g',
    package_size: 500,
    available_amount: 150,
    calories_per_100: 355,
    protein_per_100: 13.8,
    carbs_per_100: 62.0,
    fat_per_100: 5.8,
    fiber_per_100: 6.8,
    sugar_per_100: 1.6,
    nutriscore: 'A',
    price_billa: 2.99,
    pack_billa: 400,
    product_billa: 'Ja! Natürlich Bio-Quinoa 400g',
    price_hofer: 2.29,
    pack_hofer: 500,
    product_hofer: 'Natur Aktiv Bio-Quinoa & Reis 500g',
    price_spar: 2.69,
    pack_spar: 500,
    product_spar: 'SPAR Natur*pur Bio-Quinoa 500g',
  },
  {
    name: 'Lachsfilet',
    barcode: '9007778889990',
    brand: 'Gourmet / ASC',
    unit: 'g',
    package_size: 250,
    available_amount: 0,
    calories_per_100: 206,
    protein_per_100: 20.4,
    carbs_per_100: 0,
    fat_per_100: 13.6,
    fiber_per_100: 0,
    sugar_per_100: 0,
    nutriscore: 'A',
    price_billa: 6.99,
    pack_billa: 250,
    product_billa: 'BILLA Genusswelt Bio-Lachsfilet 250g',
    price_hofer: 5.29,
    pack_hofer: 300,
    product_hofer: 'Golden Seafood Lachsfilet 300g',
    price_spar: 5.99,
    pack_spar: 250,
    product_spar: 'SPAR Premium Norwegischer Lachs 250g',
  },
  {
    name: 'Brokkoli',
    barcode: '9008889990001',
    brand: 'Frischgemüse Österreich',
    unit: 'g',
    package_size: 400,
    available_amount: 0,
    calories_per_100: 34,
    protein_per_100: 3.3,
    carbs_per_100: 2.7,
    fat_per_100: 0.4,
    fiber_per_100: 3.0,
    sugar_per_100: 1.4,
    nutriscore: 'A',
    price_billa: 1.99,
    pack_billa: 400,
    product_billa: 'Da komm ich her! Brokkoli 400g',
    price_hofer: 1.59,
    pack_hofer: 500,
    product_hofer: 'Hofer Marktplatz Brokkoli 500g',
    price_spar: 1.89,
    pack_spar: 400,
    product_spar: 'SPAR Natur*pur Bio-Brokkoli 400g',
  },
  {
    name: 'Rote Linsen',
    barcode: '9009990001112',
    brand: 'Ja! Natürlich / Natur Aktiv',
    unit: 'g',
    package_size: 500,
    available_amount: 200,
    calories_per_100: 348,
    protein_per_100: 25.4,
    carbs_per_100: 52.0,
    fat_per_100: 1.6,
    fiber_per_100: 11.5,
    sugar_per_100: 1.8,
    nutriscore: 'A',
    price_billa: 2.19,
    pack_billa: 500,
    product_billa: 'Ja! Natürlich Bio-Rote Linsen 500g',
    price_hofer: 1.69,
    pack_hofer: 500,
    product_hofer: 'Natur Aktiv Bio Rote Linsen 500g',
    price_spar: 1.99,
    pack_spar: 500,
    product_spar: 'SPAR Natur*pur Bio Rote Linsen 500g',
  },
  {
    name: 'Bio-Tofu Natur',
    barcode: '9001234567890',
    brand: 'SPAR Veggie / Vegavita',
    unit: 'g',
    package_size: 300,
    available_amount: 0,
    calories_per_100: 138,
    protein_per_100: 15.5,
    carbs_per_100: 1.2,
    fat_per_100: 8.1,
    fiber_per_100: 1.5,
    sugar_per_100: 0.5,
    nutriscore: 'A',
    price_billa: 1.99,
    pack_billa: 300,
    product_billa: 'Vegavita Bio-Tofu Natur 300g',
    price_hofer: 1.59,
    pack_hofer: 400,
    product_hofer: 'MyVay Bio-Tofu Natur 400g',
    price_spar: 1.79,
    pack_spar: 300,
    product_spar: 'SPAR Veggie Bio-Tofu 300g',
  },
  {
    name: 'Babyspinat & Blattgemüse',
    barcode: '9002345678901',
    brand: 'LGV / Marktplatz',
    unit: 'g',
    package_size: 200,
    available_amount: 50,
    calories_per_100: 23,
    protein_per_100: 2.9,
    carbs_per_100: 1.6,
    fat_per_100: 0.4,
    fiber_per_100: 2.6,
    sugar_per_100: 0.4,
    nutriscore: 'A',
    price_billa: 1.99,
    pack_billa: 200,
    product_billa: 'Ja! Natürlich Bio-Babyspinat 200g',
    price_hofer: 1.49,
    pack_hofer: 200,
    product_hofer: 'Natur Aktiv Bio-Babyspinat 200g',
    price_spar: 1.79,
    pack_spar: 200,
    product_spar: 'SPAR Natur*pur Bio-Babyspinat 200g',
  },
  {
    name: 'Schafkäse / Feta',
    barcode: '9003456789012',
    brand: 'Salakis / Milfina',
    unit: 'g',
    package_size: 200,
    available_amount: 0,
    calories_per_100: 264,
    protein_per_100: 16.5,
    carbs_per_100: 1.0,
    fat_per_100: 21.5,
    fiber_per_100: 0,
    sugar_per_100: 1.0,
    nutriscore: 'C',
    price_billa: 2.49,
    pack_billa: 200,
    product_billa: 'Ja! Natürlich Bio-Feta g.U. 200g',
    price_hofer: 1.89,
    pack_hofer: 200,
    product_hofer: 'Milfina Griechischer Feta 200g',
    price_spar: 2.19,
    pack_spar: 200,
    product_spar: 'S-BUDGET Feta 200g',
  },
  {
    name: 'Strauchtomaten / Cherrytomaten',
    barcode: '9004567890123',
    brand: 'LGV Gärtnergemüse',
    unit: 'g',
    package_size: 500,
    available_amount: 100,
    calories_per_100: 19,
    protein_per_100: 0.9,
    carbs_per_100: 3.2,
    fat_per_100: 0.2,
    fiber_per_100: 1.2,
    sugar_per_100: 2.6,
    nutriscore: 'A',
    price_billa: 2.49,
    pack_billa: 500,
    product_billa: 'LGV Sonnenreife Strauchtomaten 500g',
    price_hofer: 1.99,
    pack_hofer: 500,
    product_hofer: 'Hofer Marktplatz Rispentomaten 500g',
    price_spar: 2.29,
    pack_spar: 500,
    product_spar: 'SPAR Natur*pur Bio-Tomaten 500g',
  },
  {
    name: 'Hummus Natur',
    barcode: '9005678901234',
    brand: 'Neni / SPAR Veggie',
    unit: 'g',
    package_size: 200,
    available_amount: 50,
    calories_per_100: 245,
    protein_per_100: 7.8,
    carbs_per_100: 14.0,
    fat_per_100: 16.5,
    fiber_per_100: 5.8,
    sugar_per_100: 1.1,
    nutriscore: 'A',
    price_billa: 2.29,
    pack_billa: 200,
    product_billa: 'Vegavita Bio-Hummus Natur 200g',
    price_hofer: 1.49,
    pack_hofer: 200,
    product_hofer: 'Good Choice Hummus Trio/Natur 200g',
    price_spar: 1.99,
    pack_spar: 200,
    product_spar: 'NENI am Tisch Hummus 200g',
  },
  {
    name: 'Walnüsse & Mandeln Mix',
    barcode: '9006789012345',
    brand: 'Seeberger / Good Choice',
    unit: 'g',
    package_size: 200,
    available_amount: 80,
    calories_per_100: 615,
    protein_per_100: 18.5,
    carbs_per_100: 9.0,
    fat_per_100: 54.0,
    fiber_per_100: 9.5,
    sugar_per_100: 3.8,
    nutriscore: 'A',
    price_billa: 3.49,
    pack_billa: 200,
    product_billa: 'Ja! Natürlich Bio-Nusskernmischung 200g',
    price_hofer: 2.49,
    pack_hofer: 200,
    product_hofer: 'Happy Harvest Nuss-Mix ungesalzen 200g',
    price_spar: 2.99,
    pack_spar: 200,
    product_spar: 'SPAR Natur*pur Bio-Edelnussmix 200g',
  },
];

const STARTER_RECIPES: Array<Omit<Recipe, 'id' | 'created_at'>> = [
  {
    name: 'Skyr-Haferflocken Bowl mit Beeren & Nüssen',
    meal_type: 'breakfast',
    calories: 470,
    protein_g: 34,
    carbs_g: 52,
    fat_g: 12,
    fiber_g: 9,
    sugar_g: 11,
    prep_minutes: 5,
    ingredients: [
      '75g Haferflocken Zartblatt',
      '200g Skyr Natur',
      '80g Heidelbeeren / Beerenmix',
      '15g Walnüsse & Mandeln Mix',
    ],
    structured_ingredients: [
      { name: 'Haferflocken Zartblatt', amount: 75, unit: 'g' },
      { name: 'Skyr Natur', amount: 200, unit: 'g' },
      { name: 'Heidelbeeren / Beerenmix', amount: 80, unit: 'g' },
      { name: 'Walnüsse & Mandeln Mix', amount: 15, unit: 'g' },
    ],
    instructions: 'Skyr mit Haferflocken verrühren, mit frischen Beeren und gehackten Nüssen toppen.',
    tags: 'who-konform,high-protein,schnell',
  },
  {
    name: 'Mediterranes Eier-Shakshuka mit Sauerteigbrot',
    meal_type: 'breakfast',
    calories: 510,
    protein_g: 28,
    carbs_g: 42,
    fat_g: 23,
    fiber_g: 7,
    sugar_g: 6,
    prep_minutes: 15,
    ingredients: [
      '2 Stk Bio-Eier',
      '150g Strauchtomaten / Cherrytomaten',
      '40g Schafkäse / Feta',
      '85g Vollkorn-Sauerteigbrot',
      '50g Babyspinat & Blattgemüse',
    ],
    structured_ingredients: [
      { name: 'Bio-Eier', amount: 2, unit: 'Stk' },
      { name: 'Strauchtomaten / Cherrytomaten', amount: 150, unit: 'g' },
      { name: 'Schafkäse / Feta', amount: 40, unit: 'g' },
      { name: 'Vollkorn-Sauerteigbrot', amount: 85, unit: 'g' },
      { name: 'Babyspinat & Blattgemüse', amount: 50, unit: 'g' },
    ],
    instructions: 'Tomaten und Spinat schmoren, Eier darin pochieren, Feta darüberbröseln und mit Vollkornbrot servieren.',
    tags: 'mediterran,vegetarisch,ballaststoffreich',
  },
  {
    name: 'Vollkorn-Avocado-Hummus Stulle mit Bio-Ei',
    meal_type: 'breakfast',
    calories: 440,
    protein_g: 22,
    carbs_g: 46,
    fat_g: 17,
    fiber_g: 8,
    sugar_g: 4,
    prep_minutes: 8,
    ingredients: [
      '100g Vollkorn-Sauerteigbrot',
      '50g Hummus Natur',
      '2 Stk Bio-Eier',
      '80g Strauchtomaten / Cherrytomaten',
    ],
    structured_ingredients: [
      { name: 'Vollkorn-Sauerteigbrot', amount: 100, unit: 'g' },
      { name: 'Hummus Natur', amount: 50, unit: 'g' },
      { name: 'Bio-Eier', amount: 2, unit: 'Stk' },
      { name: 'Strauchtomaten / Cherrytomaten', amount: 80, unit: 'g' },
    ],
    instructions: 'Vollkornbrot rösten, mit Hummus bestreichen, wachsweiche Bio-Eier und Tomatenscheiben darauf anrichten.',
    tags: 'herzhaft,who-standard',
  },
  {
    name: 'Mediterrane Hühner-Quinoa-Bowl mit Hummus',
    meal_type: 'lunch',
    calories: 630,
    protein_g: 52,
    carbs_g: 58,
    fat_g: 19,
    fiber_g: 9,
    sugar_g: 5,
    prep_minutes: 20,
    ingredients: [
      '180g Hühnerbrustfilet',
      '85g Quinoa / Naturreis',
      '120g Strauchtomaten / Cherrytomaten',
      '60g Babyspinat & Blattgemüse',
      '45g Hummus Natur',
    ],
    structured_ingredients: [
      { name: 'Hühnerbrustfilet', amount: 180, unit: 'g' },
      { name: 'Quinoa / Naturreis', amount: 85, unit: 'g' },
      { name: 'Strauchtomaten / Cherrytomaten', amount: 120, unit: 'g' },
      { name: 'Babyspinat & Blattgemüse', amount: 60, unit: 'g' },
      { name: 'Hummus Natur', amount: 45, unit: 'g' },
    ],
    instructions: 'Quinoa kochen, Hühnerbrustfilet kurz braten, mit Babyspinat, Tomaten und Hummus als Bowl anrichten.',
    tags: 'meal-prep,high-protein,who-konform',
  },
  {
    name: 'Rotes Linsen-Dal mit Babyspinat & Naturreis',
    meal_type: 'lunch',
    calories: 560,
    protein_g: 29,
    carbs_g: 82,
    fat_g: 9,
    fiber_g: 14,
    sugar_g: 5,
    prep_minutes: 25,
    ingredients: [
      '100g Rote Linsen',
      '60g Quinoa / Naturreis',
      '80g Babyspinat & Blattgemüse',
      '120g Strauchtomaten / Cherrytomaten',
    ],
    structured_ingredients: [
      { name: 'Rote Linsen', amount: 100, unit: 'g' },
      { name: 'Quinoa / Naturreis', amount: 60, unit: 'g' },
      { name: 'Babyspinat & Blattgemüse', amount: 80, unit: 'g' },
      { name: 'Strauchtomaten / Cherrytomaten', amount: 120, unit: 'g' },
    ],
    instructions: 'Rote Linsen mit gewürfelten Tomaten und Gewürzen 18 Min köcheln, Spinat unterheben, mit Naturreis/Quinoa servieren.',
    tags: 'vegan,ballaststoff-champion,preiswert',
  },
  {
    name: 'Knuspriger Bio-Tofu & Brokkoli Power-Bowl',
    meal_type: 'lunch',
    calories: 540,
    protein_g: 32,
    carbs_g: 56,
    fat_g: 18,
    fiber_g: 10,
    sugar_g: 4,
    prep_minutes: 20,
    ingredients: [
      '150g Bio-Tofu Natur',
      '180g Brokkoli',
      '80g Quinoa / Naturreis',
      '40g Hummus Natur',
    ],
    structured_ingredients: [
      { name: 'Bio-Tofu Natur', amount: 150, unit: 'g' },
      { name: 'Brokkoli', amount: 180, unit: 'g' },
      { name: 'Quinoa / Naturreis', amount: 80, unit: 'g' },
      { name: 'Hummus Natur', amount: 40, unit: 'g' },
    ],
    instructions: 'Tofu würfeln und goldbraun anbraten, Brokkoli dünsten, auf Quinoa/Reis mit Hummus-Dressing anrichten.',
    tags: 'pflanzlich,who-konform,zero-waste',
  },
  {
    name: 'Ofen-Lachsfilet mit Brokkoli & Quinoa',
    meal_type: 'dinner',
    calories: 640,
    protein_g: 48,
    carbs_g: 49,
    fat_g: 25,
    fiber_g: 8,
    sugar_g: 3,
    prep_minutes: 20,
    ingredients: [
      '180g Lachsfilet',
      '200g Brokkoli',
      '75g Quinoa / Naturreis',
      '80g Strauchtomaten / Cherrytomaten',
    ],
    structured_ingredients: [
      { name: 'Lachsfilet', amount: 180, unit: 'g' },
      { name: 'Brokkoli', amount: 200, unit: 'g' },
      { name: 'Quinoa / Naturreis', amount: 75, unit: 'g' },
      { name: 'Strauchtomaten / Cherrytomaten', amount: 80, unit: 'g' },
    ],
    instructions: 'Lachsfilet, Brokkchiröschen und Tomaten bei 200°C im Rohr 15 Min garen; mit Quinoa servieren.',
    tags: 'omega-3,high-protein,mediterran',
  },
  {
    name: 'Gegrilltes Hühnerfilet mit Feta-Spinat & Ofengemüse',
    meal_type: 'dinner',
    calories: 550,
    protein_g: 54,
    carbs_g: 28,
    fat_g: 22,
    fiber_g: 7,
    sugar_g: 5,
    prep_minutes: 22,
    ingredients: [
      '180g Hühnerbrustfilet',
      '160g Brokkoli',
      '60g Schafkäse / Feta',
      '80g Babyspinat & Blattgemüse',
      '60g Vollkorn-Sauerteigbrot',
    ],
    structured_ingredients: [
      { name: 'Hühnerbrustfilet', amount: 180, unit: 'g' },
      { name: 'Brokkoli', amount: 160, unit: 'g' },
      { name: 'Schafkäse / Feta', amount: 60, unit: 'g' },
      { name: 'Babyspinat & Blattgemüse', amount: 80, unit: 'g' },
      { name: 'Vollkorn-Sauerteigbrot', amount: 60, unit: 'g' },
    ],
    instructions: 'Hühnerbrust braten, Brokkoli und Spinat schwenken, mit Feta überbacken und einer Scheibe Vollkornbrot servieren.',
    tags: 'low-carb,high-protein,abends',
  },
  {
    name: 'Wärmender Linsen-Tofu-Eintopf mit Wurzelgemüse',
    meal_type: 'dinner',
    calories: 520,
    protein_g: 36,
    carbs_g: 54,
    fat_g: 14,
    fiber_g: 13,
    sugar_g: 5,
    prep_minutes: 25,
    ingredients: [
      '80g Rote Linsen',
      '120g Bio-Tofu Natur',
      '150g Brokkoli',
      '120g Strauchtomaten / Cherrytomaten',
      '60g Babyspinat & Blattgemüse',
    ],
    structured_ingredients: [
      { name: 'Rote Linsen', amount: 80, unit: 'g' },
      { name: 'Bio-Tofu Natur', amount: 120, unit: 'g' },
      { name: 'Brokkoli', amount: 150, unit: 'g' },
      { name: 'Strauchtomaten / Cherrytomaten', amount: 120, unit: 'g' },
      { name: 'Babyspinat & Blattgemüse', amount: 60, unit: 'g' },
    ],
    instructions: 'Linsen und Gemüse schmoren, angebratene Tofuwürfel und frischen Spinat vor dem Servieren zugeben.',
    tags: 'vegan,ballaststoffreich,zero-waste',
  },
  {
    name: 'Skyr-Beeren-Proteinbecher & Edelnüsse',
    meal_type: 'snack',
    calories: 255,
    protein_g: 22,
    carbs_g: 15,
    fat_g: 11,
    fiber_g: 4,
    sugar_g: 9,
    prep_minutes: 2,
    ingredients: [
      '150g Skyr Natur',
      '60g Heidelbeeren / Beerenmix',
      '20g Walnüsse & Mandeln Mix',
    ],
    structured_ingredients: [
      { name: 'Skyr Natur', amount: 150, unit: 'g' },
      { name: 'Heidelbeeren / Beerenmix', amount: 60, unit: 'g' },
      { name: 'Walnüsse & Mandeln Mix', amount: 20, unit: 'g' },
    ],
    instructions: 'Skyr glattrühren und mit Beeren sowie Nüssen als Snack genießen.',
    tags: 'snack,high-protein,zuckerarm',
  },
  {
    name: 'Hummus-Gemüse-Snack mit Vollkorn-Crostini',
    meal_type: 'snack',
    calories: 240,
    protein_g: 9,
    carbs_g: 26,
    fat_g: 10,
    fiber_g: 6,
    sugar_g: 3,
    prep_minutes: 3,
    ingredients: [
      '50g Hummus Natur',
      '50g Vollkorn-Sauerteigbrot',
      '100g Strauchtomaten / Cherrytomaten',
    ],
    structured_ingredients: [
      { name: 'Hummus Natur', amount: 50, unit: 'g' },
      { name: 'Vollkorn-Sauerteigbrot', amount: 50, unit: 'g' },
      { name: 'Strauchtomaten / Cherrytomaten', amount: 100, unit: 'g' },
    ],
    instructions: 'Vollkornbrot in Streifen schneiden und mit Hummus und Cherrytomaten dippen.',
    tags: 'snack,vegan,ballaststoffe',
  },
];

// Austrian Barcode Lookup Presets (also serves as instant enrichment for OpenFoodFacts API)
const AUSTRIAN_BARCODE_PRESETS: Record<string, Omit<IngredientCatalogItem, 'id' | 'created_at'>> = {
  '9002100045123': STARTER_INGREDIENTS[1], // NÖM PRO Skyr
  '9002233001122': STARTER_INGREDIENTS[0], // Bio-Haferflocken
  '9004445556667': STARTER_INGREDIENTS[5], // Hühnerbrustfilet
  '9007778889990': STARTER_INGREDIENTS[7], // Lachsfilet
  '9009990001112': STARTER_INGREDIENTS[9], // Rote Linsen
  '9001234567890': STARTER_INGREDIENTS[10], // Bio-Tofu
  '9002515000019': {
    name: 'Schärdinger Bergbaron Leicht',
    barcode: '9002515000019',
    brand: 'Schärdinger',
    unit: 'g',
    package_size: 200,
    available_amount: 0,
    calories_per_100: 265,
    protein_per_100: 31.0,
    carbs_per_100: 0.1,
    fat_per_100: 15.0,
    fiber_per_100: 0,
    sugar_per_100: 0.1,
    nutriscore: 'B',
    price_billa: 2.79,
    pack_billa: 200,
    product_billa: 'Schärdinger Bergbaron Leicht 200g',
    price_hofer: 2.39,
    pack_hofer: 250,
    product_hofer: 'Milfina Bergkäse Leicht 250g',
    price_spar: 2.69,
    pack_spar: 200,
    product_spar: 'Schärdinger Bergbaron 200g',
  },
  '9001414002117': {
    name: 'Darbo Naturrein Konfitüre Marille Weniger Zucker',
    barcode: '9001414002117',
    brand: 'Darbo',
    unit: 'g',
    package_size: 250,
    available_amount: 0,
    calories_per_100: 162,
    protein_per_100: 0.6,
    carbs_per_100: 38.0,
    fat_per_100: 0.2,
    fiber_per_100: 1.8,
    sugar_per_100: 36.0,
    nutriscore: 'C',
    price_billa: 3.19,
    pack_billa: 250,
    product_billa: 'Darbo Fruchtreich Marille 250g',
    price_hofer: 2.49,
    pack_hofer: 300,
    product_hofer: 'Grandessa Fruchtaufstrich Marille 300g',
    price_spar: 2.99,
    pack_spar: 250,
    product_spar: 'Darbo Naturrein Marille 250g',
  },
  '9002859087127': {
    name: 'Ja! Natürlich Bio-Kichererbsen gekocht',
    barcode: '9002859087127',
    brand: 'Ja! Natürlich / Natur Aktiv',
    unit: 'g',
    package_size: 240,
    available_amount: 0,
    calories_per_100: 128,
    protein_per_100: 7.2,
    carbs_per_100: 16.5,
    fat_per_100: 2.2,
    fiber_per_100: 5.9,
    sugar_per_100: 0.8,
    nutriscore: 'A',
    price_billa: 1.39,
    pack_billa: 240,
    product_billa: 'Ja! Natürlich Bio-Kichererbsen 240g',
    price_hofer: 0.99,
    pack_hofer: 250,
    product_hofer: 'Natur Aktiv Bio-Kichererbsen 250g',
    price_spar: 1.29,
    pack_spar: 240,
    product_spar: 'SPAR Natur*pur Bio-Kichererbsen 240g',
  },
};

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

export function parseIngredientLine(line: string): StructuredIngredient {
  const cleaned = line.trim();
  // Match e.g. "180g Hühnerbrust", "2 Stk Bio-Eier", "250 ml Milch", "1.5 Stk Avocado"
  const m = cleaned.match(/^(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l|stk|stück|el|tl|scoop|scheiben|can)?\s+(.+)$/i);
  if (m) {
    let amount = parseFloat(m[1].replace(',', '.'));
    const rawUnit = (m[2] || 'g').toLowerCase();
    let unit: 'g' | 'ml' | 'Stk' = 'g';
    if (rawUnit === 'kg') {
      amount *= 1000;
      unit = 'g';
    } else if (rawUnit === 'l') {
      amount *= 1000;
      unit = 'ml';
    } else if (rawUnit === 'ml') {
      unit = 'ml';
    } else if (rawUnit === 'stk' || rawUnit === 'stück') {
      unit = 'Stk';
    } else if (rawUnit === 'el' || rawUnit === 'scoop') {
      amount *= 25;
      unit = 'g';
    } else if (rawUnit === 'tl') {
      amount *= 8;
      unit = 'g';
    } else if (rawUnit === 'scheiben') {
      amount *= 45;
      unit = 'g';
    } else if (rawUnit === 'can') {
      amount *= 250;
      unit = 'g';
    }
    return {
      name: m[3].trim(),
      amount: Math.round(amount * 10) / 10,
      unit,
    };
  }
  return {
    name: cleaned,
    amount: 100,
    unit: 'g',
  };
}

export default defineThassiApp((ctx) => {
  // 1. Initialize & Migrate SQLite Schema
  ctx.db.exec(`
    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      meal_type TEXT NOT NULL DEFAULT 'dinner',
      calories INTEGER NOT NULL DEFAULT 0,
      protein_g INTEGER NOT NULL DEFAULT 0,
      carbs_g INTEGER NOT NULL DEFAULT 0,
      fat_g INTEGER NOT NULL DEFAULT 0,
      fiber_g INTEGER NOT NULL DEFAULT 0,
      sugar_g INTEGER NOT NULL DEFAULT 0,
      prep_minutes INTEGER NOT NULL DEFAULT 20,
      ingredients TEXT NOT NULL DEFAULT '[]',
      structured_ingredients TEXT NOT NULL DEFAULT '[]',
      instructions TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      barcode TEXT NOT NULL DEFAULT '',
      brand TEXT NOT NULL DEFAULT '',
      unit TEXT NOT NULL DEFAULT 'g',
      package_size REAL NOT NULL DEFAULT 100,
      available_amount REAL NOT NULL DEFAULT 0,
      calories_per_100 REAL NOT NULL DEFAULT 0,
      protein_per_100 REAL NOT NULL DEFAULT 0,
      carbs_per_100 REAL NOT NULL DEFAULT 0,
      fat_per_100 REAL NOT NULL DEFAULT 0,
      fiber_per_100 REAL NOT NULL DEFAULT 0,
      sugar_per_100 REAL NOT NULL DEFAULT 0,
      nutriscore TEXT NOT NULL DEFAULT 'A',
      price_billa REAL NOT NULL DEFAULT 1.99,
      pack_billa REAL NOT NULL DEFAULT 250,
      product_billa TEXT NOT NULL DEFAULT '',
      price_hofer REAL NOT NULL DEFAULT 1.59,
      pack_hofer REAL NOT NULL DEFAULT 250,
      product_hofer TEXT NOT NULL DEFAULT '',
      price_spar REAL NOT NULL DEFAULT 1.89,
      pack_spar REAL NOT NULL DEFAULT 250,
      product_spar TEXT NOT NULL DEFAULT '',
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
      carbs_g INTEGER NOT NULL DEFAULT 0,
      fat_g INTEGER NOT NULL DEFAULT 0,
      fiber_g INTEGER NOT NULL DEFAULT 0,
      sugar_g INTEGER NOT NULL DEFAULT 0,
      guest_portions INTEGER NOT NULL DEFAULT 0,
      selected INTEGER NOT NULL DEFAULT 1,
      completed INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      custom_ingredients TEXT NOT NULL DEFAULT '[]',
      UNIQUE(plan_date, slot)
    );

    CREATE TABLE IF NOT EXISTS water_log (
      plan_date TEXT PRIMARY KEY,
      amount_ml INTEGER NOT NULL DEFAULT 0,
      target_ml INTEGER NOT NULL DEFAULT 2800,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS grocery_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      checked INTEGER NOT NULL DEFAULT 0,
      source_recipe TEXT NOT NULL DEFAULT ''
    );
  `);

  // Safe schema migrations for existing v1 databases
  const safeAlterStatements = [
    `ALTER TABLE recipes ADD COLUMN carbs_g INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE recipes ADD COLUMN fat_g INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE recipes ADD COLUMN fiber_g INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE recipes ADD COLUMN sugar_g INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE recipes ADD COLUMN structured_ingredients TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE meal_plan ADD COLUMN carbs_g INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE meal_plan ADD COLUMN fat_g INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE meal_plan ADD COLUMN fiber_g INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE meal_plan ADD COLUMN sugar_g INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE meal_plan ADD COLUMN guest_portions INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE meal_plan ADD COLUMN selected INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE meal_plan ADD COLUMN custom_ingredients TEXT NOT NULL DEFAULT '[]'`,
  ];
  for (const stmt of safeAlterStatements) {
    try {
      ctx.db.exec(stmt);
    } catch {
      // Column already exists
    }
  }

  // Seed starter Austrian ingredients & WHO recipes if not yet initialized
  const isV2Seeded = ctx.db.kvGet<boolean>('meal_planner_v2_seeded', false);
  const existingIngredientCount = ctx.db.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM ingredients')?.cnt ?? 0;
  if (!isV2Seeded || existingIngredientCount === 0) {
    const now = new Date().toISOString();
    if (existingIngredientCount === 0) {
      for (const item of STARTER_INGREDIENTS) {
        ctx.db.execute(
          `INSERT INTO ingredients (
            name, barcode, brand, unit, package_size, available_amount,
            calories_per_100, protein_per_100, carbs_per_100, fat_per_100, fiber_per_100, sugar_per_100, nutriscore,
            price_billa, pack_billa, product_billa,
            price_hofer, pack_hofer, product_hofer,
            price_spar, pack_spar, product_spar, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.name, item.barcode, item.brand, item.unit, item.package_size, item.available_amount,
            item.calories_per_100, item.protein_per_100, item.carbs_per_100, item.fat_per_100, item.fiber_per_100, item.sugar_per_100, item.nutriscore,
            item.price_billa, item.pack_billa, item.product_billa,
            item.price_hofer, item.pack_hofer, item.product_hofer,
            item.price_spar, item.pack_spar, item.product_spar,
            now,
          ]
        );
      }
    }

    const existingRecipeCount = ctx.db.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM recipes')?.cnt ?? 0;
    if (existingRecipeCount === 0) {
      for (const r of STARTER_RECIPES) {
        ctx.db.execute(
          `INSERT INTO recipes (
            name, meal_type, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g,
            prep_minutes, ingredients, structured_ingredients, instructions, tags, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            r.name, r.meal_type, r.calories, r.protein_g, r.carbs_g, r.fat_g, r.fiber_g, r.sugar_g,
            r.prep_minutes, JSON.stringify(r.ingredients), JSON.stringify(r.structured_ingredients),
            r.instructions, r.tags, now,
          ]
        );
      }
    }

    // Seed current week meal plan if completely empty so the user immediately sees a rich week
    const existingPlanCount = ctx.db.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM meal_plan')?.cnt ?? 0;
    if (existingPlanCount === 0) {
      const monday = getMondayOfCurrentWeek();
      const allRecipes = ctx.db.query<RawRecipeRow>('SELECT * FROM recipes');
      const bySlot = (slot: MealSlot) => allRecipes.filter((r) => r.meal_type === slot);
      const bList = bySlot('breakfast');
      const lList = bySlot('lunch');
      const dList = bySlot('dinner');
      const sList = bySlot('snack');

      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const dateStr = formatDateYMD(d);

        const picks: Array<{ slot: MealSlot; recipe?: RawRecipeRow; guests: number; selected: number }> = [
          { slot: 'breakfast', recipe: bList[i % Math.max(1, bList.length)], guests: 0, selected: i < 5 ? 1 : 0 },
          { slot: 'lunch', recipe: lList[i % Math.max(1, lList.length)], guests: i === 2 ? 1 : 0, selected: i < 5 ? 1 : 0 },
          { slot: 'dinner', recipe: dList[i % Math.max(1, dList.length)], guests: i === 5 ? 2 : 0, selected: i < 5 ? 1 : 0 },
          { slot: 'snack', recipe: sList[i % Math.max(1, sList.length)], guests: 0, selected: i < 3 ? 1 : 0 },
        ];

        for (const p of picks) {
          if (!p.recipe) continue;
          ctx.db.execute(
            `INSERT OR IGNORE INTO meal_plan (
              plan_date, slot, recipe_id, custom_title, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g,
              guest_portions, selected, completed, custom_ingredients
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
            [
              dateStr,
              p.slot,
              p.recipe.id,
              p.recipe.name,
              p.recipe.calories,
              p.recipe.protein_g,
              p.recipe.carbs_g,
              p.recipe.fat_g,
              p.recipe.fiber_g,
              p.recipe.sugar_g,
              p.guests,
              p.selected,
              p.recipe.structured_ingredients || '[]',
            ]
          );
        }

        ctx.db.execute(
          `INSERT OR IGNORE INTO water_log (plan_date, amount_ml, target_ml, updated_at) VALUES (?, ?, ?, ?)`,
          [dateStr, i <= 2 ? 2250 : 1750, 2800, now]
        );
      }
    }

    ctx.db.kvSet('meal_planner_v2_seeded', true);
  }

  function getUserProfile(): UserProfile {
    const saved = ctx.db.kvGet<UserProfile>('user_profile');
    return computeProfileTargets(saved || DEFAULT_USER_PROFILE);
  }

  function getOptimizationOptions(): OptimizationOptions {
    return {
      ...DEFAULT_OPTIMIZATION_OPTIONS,
      ...(ctx.db.kvGet<Partial<OptimizationOptions>>('optimization_options') || {}),
    };
  }

  function parseRecipeRow(row: RawRecipeRow): Recipe {
    let ingredients: string[] = [];
    try {
      ingredients = JSON.parse(row.ingredients || '[]');
    } catch {
      ingredients = [];
    }
    let structured: StructuredIngredient[] = [];
    try {
      structured = JSON.parse(row.structured_ingredients || '[]');
    } catch {
      structured = [];
    }
    if (structured.length === 0 && ingredients.length > 0) {
      structured = ingredients.map(parseIngredientLine);
    }
    return {
      ...row,
      carbs_g: row.carbs_g || Math.round(((row.calories - row.protein_g * 4) * 0.55) / 4),
      fat_g: row.fat_g || Math.round(((row.calories - row.protein_g * 4) * 0.45) / 9),
      fiber_g: row.fiber_g || 6,
      sugar_g: row.sugar_g || 5,
      ingredients,
      structured_ingredients: structured,
    };
  }

  function findCatalogMatch(ingName: string, catalog: IngredientCatalogItem[]): IngredientCatalogItem | undefined {
    const norm = ingName.toLowerCase().trim();
    return (
      catalog.find((c) => c.name.toLowerCase() === norm) ||
      catalog.find((c) => norm.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(norm)) ||
      catalog.find((c) => {
        const words = norm.split(/\s+/).filter((w) => w.length >= 4);
        return words.some((w) => c.name.toLowerCase().includes(w));
      })
    );
  }

  // Supermarket API & Cumulative Optimization Engine
  function computeSupermarketOptimization(mealIds?: number[], customOpts?: Partial<OptimizationOptions>) {
    const opts: OptimizationOptions = { ...getOptimizationOptions(), ...(customOpts || {}) };
    const catalog = ctx.db.query<IngredientCatalogItem>('SELECT * FROM ingredients ORDER BY name ASC');
    const allRecipes = ctx.db.query<RawRecipeRow>('SELECT * FROM recipes').map(parseRecipeRow);
    const recipeMap = new Map<number, Recipe>(allRecipes.map((r) => [r.id, r]));

    let selectedMeals: MealPlanEntry[] = [];
    if (Array.isArray(mealIds) && mealIds.length > 0) {
      const placeholders = mealIds.map(() => '?').join(',');
      selectedMeals = ctx.db.query<MealPlanEntry>(
        `SELECT * FROM meal_plan WHERE id IN (${placeholders}) ORDER BY plan_date ASC`,
        mealIds
      );
    } else {
      selectedMeals = ctx.db.query<MealPlanEntry>(
        'SELECT * FROM meal_plan WHERE selected = 1 ORDER BY plan_date ASC'
      );
    }

    // Step 1: Accumulate (kumulieren) all required ingredients across selected meals (including guest portions!)
    const accumulatedMap = new Map<
      string,
      {
        canonicalName: string;
        unit: 'g' | 'ml' | 'Stk';
        grossRequired: number;
        mealOccurrences: number;
        usedInMeals: string[];
        catalogItem?: IngredientCatalogItem;
      }
    >();

    let totalPortions = 0;

    for (const meal of selectedMeals) {
      const portions = 1 + Math.max(0, Number(meal.guest_portions || 0));
      totalPortions += portions;

      let ingList: StructuredIngredient[] = [];
      const recipe = meal.recipe_id ? recipeMap.get(meal.recipe_id) : undefined;
      if (recipe && recipe.structured_ingredients.length > 0) {
        ingList = recipe.structured_ingredients;
      } else if (meal.custom_ingredients) {
        try {
          const parsed = JSON.parse(meal.custom_ingredients);
          if (Array.isArray(parsed) && parsed.length > 0) {
            ingList = parsed.map((x) => (typeof x === 'string' ? parseIngredientLine(x) : x));
          }
        } catch {
          // ignore
        }
      }

      for (const ing of ingList) {
        const matchedCatalog = findCatalogMatch(ing.name, catalog);
        const canonicalName = matchedCatalog ? matchedCatalog.name : ing.name.trim();
        const key = canonicalName.toLowerCase();
        const scaledAmount = Math.round(Number(ing.amount || 100) * portions * 10) / 10;

        const existing = accumulatedMap.get(key);
        const mealLabel = `${meal.plan_date.slice(5)} ${meal.custom_title}${portions > 1 ? ` (${portions}x)` : ''}`;
        if (existing) {
          existing.grossRequired = Math.round((existing.grossRequired + scaledAmount) * 10) / 10;
          existing.mealOccurrences += 1;
          if (!existing.usedInMeals.includes(mealLabel)) {
            existing.usedInMeals.push(mealLabel);
          }
        } else {
          accumulatedMap.set(key, {
            canonicalName,
            unit: matchedCatalog?.unit || ing.unit || 'g',
            grossRequired: scaledAmount,
            mealOccurrences: 1,
            usedInMeals: [mealLabel],
            catalogItem: matchedCatalog,
          });
        }
      }
    }

    // Step 2: Deduct available pantry stock & compute Supermarket packages (Billa, Hofer, Spar)
    interface StorePackageCalc {
      store: 'billa' | 'hofer' | 'spar';
      storeLabel: string;
      productName: string;
      packSize: number;
      unitPrice: number;
      packsNeeded: number;
      purchasedAmount: number;
      totalPrice: number;
      surplusAmount: number; // Remaining available amount after cooking
      wasteRatio: number;
       singleMealPacksWithoutAccumulation: number;
    }

    const cumulativeIngredients = Array.from(accumulatedMap.values()).map((acc) => {
      const cat = acc.catalogItem;
      const availableInPantry = opts.use_pantry_stock && cat ? Math.max(0, Number(cat.available_amount || 0)) : 0;
      const pantryUsed = Math.min(acc.grossRequired, availableInPantry);
      const netToBuy = Math.max(0, Math.round((acc.grossRequired - pantryUsed) * 10) / 10);

      const defaultPack = acc.unit === 'Stk' ? 6 : 250;
      const storeConfigs: Array<{
        store: 'billa' | 'hofer' | 'spar';
        storeLabel: string;
        productName: string;
        packSize: number;
        unitPrice: number;
      }> = [
        {
          store: 'billa',
          storeLabel: 'BILLA',
          productName: cat?.product_billa || `BILLA ${acc.canonicalName} ${ defaultPack }${acc.unit}`,
          packSize: Number(cat?.pack_billa || defaultPack),
          unitPrice: Number(cat?.price_billa || 2.29),
        },
        {
          store: 'hofer',
          storeLabel: 'HOFER',
          productName: cat?.product_hofer || `HOFER ${acc.canonicalName} ${ defaultPack }${acc.unit}`,
          packSize: Number(cat?.pack_hofer || defaultPack),
          unitPrice: Number(cat?.price_hofer || 1.79),
        },
        {
          store: 'spar',
          storeLabel: 'SPAR',
          productName: cat?.product_spar || `SPAR Natur*pur ${acc.canonicalName} ${ defaultPack }${acc.unit}`,
          packSize: Number(cat?.pack_spar || defaultPack),
          unitPrice: Number(cat?.price_spar || 1.99),
        },
      ];

      const storeOffers: Record<'billa' | 'hofer' | 'spar', StorePackageCalc> = {} as Record<
        'billa' | 'hofer' | 'spar',
        StorePackageCalc
      >;

      for (const sc of storeConfigs) {
        const packsNeeded = netToBuy <= 0 ? 0 : Math.ceil(netToBuy / sc.packSize);
        // Without cumulative optimization, each meal occurrence would buy at least 1 pack
        const unoptimizedPacks = netToBuy <= 0 ? 0 : Math.max(packsNeeded, acc.mealOccurrences);
        const purchasedAmount = packsNeeded * sc.packSize;
        const surplusAmount = Math.max(0, Math.round((purchasedAmount - netToBuy) * 10) / 10);
        const totalPrice = Math.round(packsNeeded * sc.unitPrice * 100) / 100;
        const wasteRatio = purchasedAmount > 0 ? surplusAmount / purchasedAmount : 0;

        storeOffers[sc.store] = {
          store: sc.store,
          storeLabel: sc.storeLabel,
          productName: sc.productName,
          packSize: sc.packSize,
          unitPrice: sc.unitPrice,
          packsNeeded,
          purchasedAmount,
          totalPrice,
          surplusAmount,
          wasteRatio,
          singleMealPacksWithoutAccumulation: unoptimizedPacks,
        };
      }

      // Pick best store for this ingredient based on active OptimizationOptions
      const allowedStores =
        opts.preferred_stores && opts.preferred_stores.length > 0
          ? opts.preferred_stores
          : (['billa', 'hofer', 'spar'] as Array<'billa' | 'hofer' | 'spar'>);

      const candidates = allowedStores.map((s) => storeOffers[s]);
      candidates.sort((a, b) => {
        if (opts.mode === 'waste_min') {
          if (a.surplusAmount !== b.surplusAmount) return a.surplusAmount - b.surplusAmount;
          return a.totalPrice - b.totalPrice;
        }
        if (opts.mode === 'price_min') {
          if (a.totalPrice !== b.totalPrice) return a.totalPrice - b.totalPrice;
          return a.surplusAmount - b.surplusAmount;
        }
        // balanced or ingredient_min: weighted score of price and waste
        const scoreA = a.totalPrice * 1.2 + a.surplusAmount * 0.006;
        const scoreB = b.totalPrice * 1.2 + b.surplusAmount * 0.006;
        return scoreA - scoreB;
      });

      const bestOffer = candidates[0] || storeOffers.hofer;
      const unoptimizedSurplus = Math.max(
        0,
        bestOffer.singleMealPacksWithoutAccumulation * bestOffer.packSize - netToBuy
      );
      const wasteSavedByAccumulation = Math.max(0, Math.round(unoptimizedSurplus - bestOffer.surplusAmount));

      return {
        ingredientId: cat?.id ?? null,
        name: acc.canonicalName,
        unit: acc.unit,
        mealOccurrences: acc.mealOccurrences,
        usedInMeals: acc.usedInMeals,
        grossRequired: acc.grossRequired,
        availableInPantry,
        pantryUsed,
        netToBuy,
        offers: storeOffers,
        recommendedStore: bestOffer.store,
        recommendedOffer: bestOffer,
        wasteSavedByAccumulation,
      };
    });

    // Summarize store totals across all cumulative ingredients
    const summarizeStore = (store: 'billa' | 'hofer' | 'spar') => {
      let totalPrice = 0;
      let totalPurchased = 0;
      let totalSurplus = 0;
      let totalPacks = 0;
      for (const item of cumulativeIngredients) {
        const off = item.offers[store];
        totalPrice += off.totalPrice;
        totalPurchased += off.purchasedAmount;
        totalSurplus += off.surplusAmount;
        totalPacks += off.packsNeeded;
      }
      const efficiencyPct =
        totalPurchased > 0 ? Math.round(((totalPurchased - totalSurplus) / totalPurchased) * 100) : 100;
      return {
        store,
        totalPrice: Math.round(totalPrice * 100) / 100,
        totalPurchased: Math.round(totalPurchased),
        totalSurplus: Math.round(totalSurplus),
        totalPacks,
        efficiencyPct,
      };
    };

    const billaSummary = summarizeStore('billa');
    const hoferSummary = summarizeStore('hofer');
    const sparSummary = summarizeStore('spar');

    // Optimal Mix Summary
    let mixPrice = 0;
    let mixPurchased = 0;
    let mixSurplus = 0;
    let mixPacks = 0;
    let totalWasteSaved = 0;
    let totalPantryUsed = 0;

    for (const item of cumulativeIngredients) {
      const off = item.recommendedOffer;
      mixPrice += off.totalPrice;
      mixPurchased += off.purchasedAmount;
      mixSurplus += off.surplusAmount;
      mixPacks += off.packsNeeded;
      totalWasteSaved += item.wasteSavedByAccumulation;
      totalPantryUsed += item.pantryUsed;
    }

    const singleStores = [billaSummary, hoferSummary, sparSummary].filter((s) =>
      opts.preferred_stores.includes(s.store)
    );
    const bestSingleStore =
      (singleStores.length > 0 ? singleStores : [billaSummary, hoferSummary, sparSummary]).sort((a, b) =>
        opts.mode === 'waste_min' ? a.totalSurplus - b.totalSurplus : a.totalPrice - b.totalPrice
      )[0] || hoferSummary;

    const multiUseIngredientsCount = cumulativeIngredients.filter((i) => i.mealOccurrences > 1).length;

    return {
      queriedAt: new Date().toISOString(),
      optimizationMode: opts.mode,
      selectedMealsCount: selectedMeals.length,
      totalPortions,
      uniqueIngredientsCount: cumulativeIngredients.length,
      multiUseIngredientsCount,
      totalPantryUsed: Math.round(totalPantryUsed),
      totalWasteSavedByAccumulation: Math.round(totalWasteSaved),
      stores: {
        billa: billaSummary,
        hofer: hoferSummary,
        spar: sparSummary,
      },
      optimalMix: {
        totalPrice: Math.round(mixPrice * 100) / 100,
        totalPurchased: Math.round(mixPurchased),
        totalSurplus: Math.round(mixSurplus),
        totalPacks: mixPacks,
        efficiencyPct:
          mixPurchased > 0 ? Math.round(((mixPurchased - mixSurplus) / mixPurchased) * 100) : 100,
        bestSingleStore: bestSingleStore.store,
      },
      cumulativeIngredients,
    };
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

  // Get User Profile & Optimization Options
  ctx.route('GET', '/profile', () => {
    return {
      profile: getUserProfile(),
      optimization: getOptimizationOptions(),
    };
  });

  // Update User Profile (WHO profile, weight goal, etc.)
  ctx.route('POST', '/profile', (req) => {
    const body = (req.body || {}) as Partial<UserProfile>;
    const updated = computeProfileTargets({ ...getUserProfile(), ...body });
    ctx.db.kvSet('user_profile', updated);
    return { profile: updated };
  });

  // Update Optimization Options
  ctx.route('POST', '/optimization-options', (req) => {
    const body = (req.body || {}) as Partial<OptimizationOptions>;
    const updated: OptimizationOptions = { ...getOptimizationOptions(), ...body };
    ctx.db.kvSet('optimization_options', updated);
    const supermarket = computeSupermarketOptimization(undefined, updated);
    return { optimization: updated, supermarket };
  });

  // Get all ingredients (pantry + supermarket catalog)
  ctx.route('GET', '/ingredients', (_req, { db }) => {
    const ingredients = db.query<IngredientCatalogItem>('SELECT * FROM ingredients ORDER BY name ASC');
    return { ingredients };
  });

  // Add or update an ingredient (from Barcode Scanner or manual entry)
  ctx.route('POST', '/ingredients', (req, { db }) => {
    const body = (req.body || {}) as Partial<IngredientCatalogItem>;
    if (!body.name?.trim()) {
      return { status: 400, body: { error: 'Zutatenname ist erforderlich' } };
    }
    const now = new Date().toISOString();
    const packSize = Number(body.package_size || 250);
    const basePrice = Number(body.price_billa || 1.99);

    if (body.id) {
      db.execute(
        `UPDATE ingredients SET
          name = ?, barcode = ?, brand = ?, unit = ?, package_size = ?, available_amount = ?,
          calories_per_100 = ?, protein_per_100 = ?, carbs_per_100 = ?, fat_per_100 = ?, fiber_per_100 = ?, sugar_per_100 = ?,
          nutriscore = ?, price_billa = ?, pack_billa = ?, product_billa = ?,
          price_hofer = ?, pack_hofer = ?, product_hofer = ?,
          price_spar = ?, pack_spar = ?, product_spar = ?
         WHERE id = ?`,
        [
          body.name.trim(),
          (body.barcode || '').trim(),
          (body.brand || '').trim(),
          body.unit || 'g',
          packSize,
          Number(body.available_amount ?? 0),
          Number(body.calories_per_100 ?? 0),
          Number(body.protein_per_100 ?? 0),
          Number(body.carbs_per_100 ?? 0),
          Number(body.fat_per_100 ?? 0),
          Number(body.fiber_per_100 ?? 0),
          Number(body.sugar_per_100 ?? 0),
          (body.nutriscore || 'A').toUpperCase(),
          Number(body.price_billa ?? basePrice),
          Number(body.pack_billa ?? packSize),
          body.product_billa || `BILLA ${body.name.trim()} ${packSize}${body.unit || 'g'}`,
          Number(body.price_hofer ?? Math.round(basePrice * 0.85 * 100) / 100),
          Number(body.pack_hofer ?? packSize),
          body.product_hofer || `HOFER ${body.name.trim()} ${packSize}${body.unit || 'g'}`,
          Number(body.price_spar ?? Math.round(basePrice * 0.94 * 100) / 100),
          Number(body.pack_spar ?? packSize),
          body.product_spar || `SPAR ${body.name.trim()} ${packSize}${body.unit || 'g'}`,
          Number(body.id),
        ]
      );
      return { updated: body.id };
    }

    const res = db.execute(
      `INSERT INTO ingredients (
        name, barcode, brand, unit, package_size, available_amount,
        calories_per_100, protein_per_100, carbs_per_100, fat_per_100, fiber_per_100, sugar_per_100, nutriscore,
        price_billa, pack_billa, product_billa,
        price_hofer, pack_hofer, product_hofer,
        price_spar, pack_spar, product_spar, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.name.trim(),
        (body.barcode || '').trim(),
        (body.brand || '').trim(),
        body.unit || 'g',
        packSize,
        Number(body.available_amount ?? 0),
        Number(body.calories_per_100 ?? 0),
        Number(body.protein_per_100 ?? 0),
        Number(body.carbs_per_100 ?? 0),
        Number(body.fat_per_100 ?? 0),
        Number(body.fiber_per_100 ?? 0),
        Number(body.sugar_per_100 ?? 0),
        (body.nutriscore || 'A').toUpperCase(),
        Number(body.price_billa ?? basePrice),
        Number(body.pack_billa ?? packSize),
        body.product_billa || `BILLA ${body.name.trim()} ${packSize}${body.unit || 'g'}`,
        Number(body.price_hofer ?? Math.round(basePrice * 0.85 * 100) / 100),
        Number(body.pack_hofer ?? packSize),
        body.product_hofer || `HOFER ${body.name.trim()} ${packSize}${body.unit || 'g'}`,
        Number(body.price_spar ?? Math.round(basePrice * 0.94 * 100) / 100),
        Number(body.pack_spar ?? packSize),
        body.product_spar || `SPAR ${body.name.trim()} ${packSize}${body.unit || 'g'}`,
        now,
      ]
    );
    return { id: res.lastInsertRowid };
  });

  // Update available pantry stock for an ingredient
  ctx.route('POST', '/ingredients/stock', (req, { db }) => {
    const body = (req.body || {}) as { id?: number; available_amount?: number };
    if (!body.id) return { status: 400, body: { error: 'id required' } };
    db.execute('UPDATE ingredients SET available_amount = ? WHERE id = ?', [
      Math.max(0, Number(body.available_amount || 0)),
      Number(body.id),
    ]);
    return { updated: true, supermarket: computeSupermarketOptimization() };
  });

  // Barcode Lookup API (calls OpenFoodFacts API + Austrian Supermarket price/package matcher)
  ctx.route('GET', '/barcode', async (req, { db }) => {
    const code = (req.query.code || '').trim();
    if (!code) {
      return { status: 400, body: { error: 'Barcode (EAN) ist erforderlich' } };
    }

    // 1. Check local database first
    const localMatch = db.queryOne<IngredientCatalogItem>('SELECT * FROM ingredients WHERE barcode = ?', [code]);
    if (localMatch) {
      return {
        source: 'local_catalog',
        found: true,
        product: localMatch,
      };
    }

    // 2. Check Austrian preset catalog
    if (AUSTRIAN_BARCODE_PRESETS[code]) {
      return {
        source: 'austrian_supermarket_api',
        found: true,
        product: AUSTRIAN_BARCODE_PRESETS[code],
      };
    }

    // 3. Query OpenFoodFacts API v2 live
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);
      const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'ThassiHomeAssistantMealPlanner/2.0' },
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = (await res.json()) as {
          status?: number;
          product?: {
            product_name_de?: string;
            product_name?: string;
            brands?: string;
            quantity?: string;
            nutriscore_grade?: string;
            nutriments?: Record<string, number>;
          };
        };

        if (data.status === 1 && data.product) {
          const p = data.product;
          const nutr = p.nutriments || {};
          const name = p.product_name_de || p.product_name || `Produkt (${code})`;
          const brand = p.brands || 'Markenprodukt';
          const qtyMatch = (p.quantity || '250g').match(/(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)/i);
          let packSize = 250;
          let unit: 'g' | 'ml' | 'Stk' = 'g';
          if (qtyMatch) {
            packSize = parseFloat(qtyMatch[1].replace(',', '.'));
            const u = qtyMatch[2].toLowerCase();
            if (u === 'kg') packSize *= 1000;
            if (u === 'l') {
              packSize *= 1000;
              unit = 'ml';
            } else if (u === 'ml') {
              unit = 'ml';
            }
          }

          return {
            source: 'openfoodfacts_live_api',
            found: true,
            product: {
              name,
              barcode: code,
              brand,
              unit,
              package_size: packSize,
              available_amount: packSize,
              calories_per_100: Math.round(Number(nutr['energy-kcal_100g'] || nutr['energy-kcal'] || 120)),
              protein_per_100: Math.round(Number(nutr.proteins_100g || 5) * 10) / 10,
              carbs_per_100: Math.round(Number(nutr.carbohydrates_100g || 15) * 10) / 10,
              fat_per_100: Math.round(Number(nutr.fat_100g || 4) * 10) / 10,
              fiber_per_100: Math.round(Number(nutr.fiber_100g || 2) * 10) / 10,
              sugar_per_100: Math.round(Number(nutr.sugars_100g || 3) * 10) / 10,
              nutriscore: (p.nutriscore_grade || 'B').toUpperCase(),
              price_billa: 2.49,
              pack_billa: packSize,
              product_billa: `BILLA ${brand} ${name} ${packSize}${unit}`,
              price_hofer: 1.99,
              pack_hofer: packSize,
              product_hofer: `HOFER ${name} ${packSize}${unit}`,
              price_spar: 2.29,
              pack_spar: packSize,
              product_spar: `SPAR ${brand} ${name} ${packSize}${unit}`,
            },
          };
        }
      }
    } catch {
      // Fallback if offline or timeout
    }

    // 4. Smart fallback for any unknown EAN code so user can immediately edit & save
    return {
      source: 'fallback_ean_parser',
      found: true,
      product: {
        name: `Gescanntes Produkt (${code.slice(-4)})`,
        barcode: code,
        brand: 'Eigenmarke Österreich',
        unit: 'g',
        package_size: 250,
        available_amount: 250,
        calories_per_100: 185,
        protein_per_100: 12.0,
        carbs_per_100: 18.0,
        fat_per_100: 7.5,
        fiber_per_100: 3.5,
        sugar_per_100: 2.4,
        nutriscore: 'A',
        price_billa: 2.29,
        pack_billa: 250,
        product_billa: `BILLA Produkt (${code.slice(-4)}) 250g`,
        price_hofer: 1.79,
        pack_hofer: 250,
        product_hofer: `HOFER Produkt (${code.slice(-4)}) 250g`,
        price_spar: 2.09,
        pack_spar: 250,
        product_spar: `SPAR Produkt (${code.slice(-4)}) 250g`,
      },
    };
  });

  // Get all recipes
  ctx.route('GET', '/recipes', (_req, { db }) => {
    const rows = db.query<RawRecipeRow>('SELECT * FROM recipes ORDER BY name ASC');
    return { recipes: rows.map(parseRecipeRow) };
  });

  // Create a new recipe
  ctx.route('POST', '/recipes', (req, { db }) => {
    const body = (req.body || {}) as Partial<Recipe> & { ingredientsText?: string };
    if (!body.name?.trim()) {
      return { status: 400, body: { error: 'Rezeptname ist erforderlich' } };
    }
    const ingredients = Array.isArray(body.ingredients)
      ? body.ingredients
      : (body.ingredientsText || '')
          .split(/\r?\n|,/)
          .map((s) => s.trim())
          .filter(Boolean);

    const structured =
      Array.isArray(body.structured_ingredients) && body.structured_ingredients.length > 0
        ? body.structured_ingredients
        : ingredients.map(parseIngredientLine);

    const now = new Date().toISOString();
    const res = db.execute(
      `INSERT INTO recipes (
        name, meal_type, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g,
        prep_minutes, ingredients, structured_ingredients, instructions, tags, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.name.trim(),
        body.meal_type || 'dinner',
        Number(body.calories || 500),
        Number(body.protein_g || 30),
        Number(body.carbs_g || 50),
        Number(body.fat_g || 18),
        Number(body.fiber_g || 8),
        Number(body.sugar_g || 5),
        Number(body.prep_minutes || 20),
        JSON.stringify(ingredients),
        JSON.stringify(structured),
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

  // Get 7-day meal plan, water logs, profile, and live supermarket optimization
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

    const waterLogs = db.query<WaterLogEntry>(
      'SELECT * FROM water_log WHERE plan_date >= ? AND plan_date <= ? ORDER BY plan_date ASC',
      [startDay, endDay]
    );

    const profile = getUserProfile();
    const optimization = getOptimizationOptions();
    const selectedIdsInWeek = entries.filter((e) => e.selected === 1).map((e) => e.id);
    const supermarket = computeSupermarketOptimization(selectedIdsInWeek, optimization);

    return {
      weekStart: startDay,
      weekEnd: endDay,
      days,
      entries,
      waterLogs,
      profile,
      optimization,
      supermarket,
    };
  });

  // Assign a recipe or custom meal to a date + slot
  ctx.route('POST', '/plan', async (req, { db }) => {
    const body = (req.body || {}) as {
      plan_date?: string;
      slot?: MealSlot;
      recipe_id?: number | null;
      custom_title?: string;
      calories?: number;
      protein_g?: number;
      carbs_g?: number;
      fat_g?: number;
      fiber_g?: number;
      sugar_g?: number;
      guest_portions?: number;
      selected?: number;
    };

    if (!body.plan_date || !body.slot) {
      return { status: 400, body: { error: 'plan_date und slot sind erforderlich' } };
    }

    let title = (body.custom_title || '').trim();
    let calories = Number(body.calories || 0);
    let protein = Number(body.protein_g || 0);
    let carbs = Number(body.carbs_g || 0);
    let fat = Number(body.fat_g || 0);
    let fiber = Number(body.fiber_g || 6);
    let sugar = Number(body.sugar_g || 5);
    let customIngredients = '[]';
    const recipeId = body.recipe_id ? Number(body.recipe_id) : null;

    if (recipeId) {
      const r = db.queryOne<RawRecipeRow>('SELECT * FROM recipes WHERE id = ?', [recipeId]);
      if (r) {
        const parsed = parseRecipeRow(r);
        title = title || parsed.name;
        calories = body.calories !== undefined ? Number(body.calories) : parsed.calories;
        protein = body.protein_g !== undefined ? Number(body.protein_g) : parsed.protein_g;
        carbs = body.carbs_g !== undefined ? Number(body.carbs_g) : parsed.carbs_g;
        fat = body.fat_g !== undefined ? Number(body.fat_g) : parsed.fat_g;
        fiber = body.fiber_g !== undefined ? Number(body.fiber_g) : parsed.fiber_g;
        sugar = body.sugar_g !== undefined ? Number(body.sugar_g) : parsed.sugar_g;
        customIngredients = JSON.stringify(parsed.structured_ingredients);
      }
    }

    if (!title) {
      return { status: 400, body: { error: 'Titel oder Rezept-ID erforderlich' } };
    }

    const guestPortions = Math.max(0, Number(body.guest_portions ?? 0));
    const selected = body.selected !== undefined ? Number(body.selected) : 1;

    db.execute(
      `INSERT INTO meal_plan (
        plan_date, slot, recipe_id, custom_title, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g,
        guest_portions, selected, completed, custom_ingredients
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      ON CONFLICT(plan_date, slot) DO UPDATE SET
        recipe_id = excluded.recipe_id,
        custom_title = excluded.custom_title,
        calories = excluded.calories,
        protein_g = excluded.protein_g,
        carbs_g = excluded.carbs_g,
        fat_g = excluded.fat_g,
        fiber_g = excluded.fiber_g,
        sugar_g = excluded.sugar_g,
        guest_portions = excluded.guest_portions,
        selected = excluded.selected,
        custom_ingredients = excluded.custom_ingredients`,
      [
        body.plan_date,
        body.slot,
        recipeId,
        title,
        calories,
        protein,
        carbs,
        fat,
        fiber,
        sugar,
        guestPortions,
        selected,
        customIngredients,
      ]
    );

    const syncSummary = await syncTodayToHomeAssistantAndSharedDb();
    return { saved: true, syncSummary };
  });

  // Randomize a meal slot (with optional ingredient-synergy awareness)
  ctx.route('POST', '/plan/randomize', async (req, { db }) => {
    const body = (req.body || {}) as {
      plan_date?: string;
      slot?: MealSlot;
      current_recipe_id?: number | null;
    };
    if (!body.plan_date || !body.slot) {
      return { status: 400, body: { error: 'plan_date und slot erforderlich' } };
    }

    const allRecipes = db.query<RawRecipeRow>('SELECT * FROM recipes').map(parseRecipeRow);
    let pool = allRecipes.filter((r) => r.meal_type === body.slot);
    if (pool.length === 0) pool = allRecipes;
    if (pool.length > 1 && body.current_recipe_id) {
      pool = pool.filter((r) => r.id !== Number(body.current_recipe_id));
    }

    const chosen = pool[Math.floor(Math.random() * pool.length)];
    if (!chosen) {
      return { status: 404, body: { error: 'Keine Rezepte im Rezeptbuch gefunden' } };
    }

    db.execute(
      `INSERT INTO meal_plan (
        plan_date, slot, recipe_id, custom_title, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g,
        guest_portions, selected, completed, custom_ingredients
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 0, ?)
      ON CONFLICT(plan_date, slot) DO UPDATE SET
        recipe_id = excluded.recipe_id,
        custom_title = excluded.custom_title,
        calories = excluded.calories,
        protein_g = excluded.protein_g,
        carbs_g = excluded.carbs_g,
        fat_g = excluded.fat_g,
        fiber_g = excluded.fiber_g,
        sugar_g = excluded.sugar_g,
        custom_ingredients = excluded.custom_ingredients`,
      [
        body.plan_date,
        body.slot,
        chosen.id,
        chosen.name,
        chosen.calories,
        chosen.protein_g,
        chosen.carbs_g,
        chosen.fat_g,
        chosen.fiber_g,
        chosen.sugar_g,
        JSON.stringify(chosen.structured_ingredients),
      ]
    );

    await syncTodayToHomeAssistantAndSharedDb();
    return { chosen };
  });

  // Update guest portions (+1 Gast / -1 Gast) for a planned meal
  ctx.route('POST', '/plan/guests', (req, { db }) => {
    const body = (req.body || {}) as { id?: number; guest_portions?: number };
    if (!body.id) return { status: 400, body: { error: 'id required' } };
    const guests = Math.max(0, Math.min(12, Number(body.guest_portions || 0)));
    db.execute('UPDATE meal_plan SET guest_portions = ? WHERE id = ?', [guests, Number(body.id)]);
    return { id: body.id, guest_portions: guests };
  });

  // Toggle selection of one or multiple meals for Supermarket API query
  ctx.route('POST', '/plan/select', (req, { db }) => {
    const body = (req.body || {}) as {
      id?: number;
      ids?: number[];
      selected?: boolean;
      weekStart?: string;
      weekEnd?: string;
    };

    if (typeof body.id === 'number') {
      if (typeof body.selected === 'boolean') {
        db.execute('UPDATE meal_plan SET selected = ? WHERE id = ?', [body.selected ? 1 : 0, body.id]);
      } else {
        db.execute('UPDATE meal_plan SET selected = CASE WHEN selected = 1 THEN 0 ELSE 1 END WHERE id = ?', [
          body.id,
        ]);
      }
    } else if (Array.isArray(body.ids)) {
      const val = body.selected ? 1 : 0;
      for (const id of body.ids) {
        db.execute('UPDATE meal_plan SET selected = ? WHERE id = ?', [val, Number(id)]);
      }
    } else if (body.weekStart && body.weekEnd && typeof body.selected === 'boolean') {
      db.execute('UPDATE meal_plan SET selected = ? WHERE plan_date >= ? AND plan_date <= ?', [
        body.selected ? 1 : 0,
        body.weekStart,
        body.weekEnd,
      ]);
    }

    return { updated: true };
  });

  // Query Billa, Hofer, Spar Supermarket APIs & Run Cumulative Optimization for selected meals
  ctx.route('POST', '/supermarket-query', (req) => {
    const body = (req.body || {}) as {
      mealIds?: number[];
      options?: Partial<OptimizationOptions>;
    };
    return computeSupermarketOptimization(body.mealIds, body.options);
  });

  // Auto-Optimize entire week (chooses recipes to minimize waste / consolidate ingredients & hit WHO targets)
  ctx.route('POST', '/optimize-week', async (req, { db }) => {
    const body = (req.body || {}) as { weekStart?: string };
    const monday = getMondayOfCurrentWeek(body.weekStart);
    const allRecipes = db.query<RawRecipeRow>('SELECT * FROM recipes').map(parseRecipeRow);
    const opts = getOptimizationOptions();

    // If ingredient_min or waste_min is active, pick a tightly overlapping core subset of recipes
    const bySlot = (slot: MealSlot) => allRecipes.filter((r) => r.meal_type === slot);
    const bPool = bySlot('breakfast');
    const lPool = bySlot('lunch');
    const dPool = bySlot('dinner');
    const sPool = bySlot('snack');

    const stride = opts.mode === 'ingredient_min' || opts.mode === 'waste_min' ? 2 : 3;

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = formatDateYMD(d);

      const slots: Array<{ slot: MealSlot; pool: Recipe[] }> = [
        { slot: 'breakfast', pool: bPool },
        { slot: 'lunch', pool: lPool },
        { slot: 'dinner', pool: dPool },
        { slot: 'snack', pool: sPool },
      ];

      for (const { slot, pool } of slots) {
        if (pool.length === 0) continue;
        const chosen = pool[(i % Math.min(stride, pool.length)) % pool.length];
        db.execute(
          `INSERT INTO meal_plan (
            plan_date, slot, recipe_id, custom_title, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g,
            guest_portions, selected, completed, custom_ingredients
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 0, ?)
          ON CONFLICT(plan_date, slot) DO UPDATE SET
            recipe_id = excluded.recipe_id,
            custom_title = excluded.custom_title,
            calories = excluded.calories,
            protein_g = excluded.protein_g,
            carbs_g = excluded.carbs_g,
            fat_g = excluded.fat_g,
            fiber_g = excluded.fiber_g,
            sugar_g = excluded.sugar_g,
            selected = 1,
            custom_ingredients = excluded.custom_ingredients`,
          [
            dateStr,
            slot,
            chosen.id,
            chosen.name,
            chosen.calories,
            chosen.protein_g,
            chosen.carbs_g,
            chosen.fat_g,
            chosen.fiber_g,
            chosen.sugar_g,
            JSON.stringify(chosen.structured_ingredients),
          ]
        );
      }
    }

    await syncTodayToHomeAssistantAndSharedDb();
    return { optimized: true, mode: opts.mode };
  });

  // Update daily water intake (ml)
  ctx.route('POST', '/water', (req, { db }) => {
    const body = (req.body || {}) as { plan_date?: string; delta_ml?: number; amount_ml?: number };
    if (!body.plan_date) {
      return { status: 400, body: { error: 'plan_date required' } };
    }
    const profile = getUserProfile();
    const existing = db.queryOne<WaterLogEntry>('SELECT * FROM water_log WHERE plan_date = ?', [body.plan_date]);
    const current = existing ? existing.amount_ml : 0;
    const nextAmount =
      body.amount_ml !== undefined
        ? Math.max(0, Number(body.amount_ml))
        : Math.max(0, current + Number(body.delta_ml || 250));

    db.execute(
      `INSERT INTO water_log (plan_date, amount_ml, target_ml, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(plan_date) DO UPDATE SET amount_ml = excluded.amount_ml, target_ml = excluded.target_ml, updated_at = excluded.updated_at`,
      [body.plan_date, nextAmount, profile.target_water_ml, new Date().toISOString()]
    );

    return { plan_date: body.plan_date, amount_ml: nextAmount, target_ml: profile.target_water_ml };
  });

  ctx.route('DELETE', '/plan', async (req, { db }) => {
    const id = Number(req.query.id);
    db.execute('DELETE FROM meal_plan WHERE id = ?', [id]);
    await syncTodayToHomeAssistantAndSharedDb();
    return { deleted: id };
  });

  // Transfer optimized supermarket selection to Grocery List & update pantry surplus
  ctx.route('POST', '/groceries/from-optimization', async (req, { db }) => {
    const body = (req.body || {}) as { mealIds?: number[]; storePreference?: 'optimal' | 'billa' | 'hofer' | 'spar' };
    const optResult = computeSupermarketOptimization(body.mealIds);
    let addedCount = 0;

    for (const item of optResult.cumulativeIngredients) {
      if (item.netToBuy <= 0) continue;
      const chosenOffer =
        body.storePreference && body.storePreference !== 'optimal'
          ? item.offers[body.storePreference]
          : item.recommendedOffer;

      const label = `[${chosenOffer.storeLabel}] ${chosenOffer.packsNeeded}x ${chosenOffer.productName} (€${chosenOffer.totalPrice.toFixed(2)} • Bedarf: ${item.netToBuy}${item.unit}, Rest: +${chosenOffer.surplusAmount}${item.unit})`;
      db.execute(
        'INSERT INTO grocery_items (name, category, checked, source_recipe) VALUES (?, ?, 0, ?)',
        [label, chosenOffer.storeLabel, item.usedInMeals.join(', ')]
      );
      addedCount++;
    }

    await syncTodayToHomeAssistantAndSharedDb();
    return { addedCount, summary: optResult.optimalMix };
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
