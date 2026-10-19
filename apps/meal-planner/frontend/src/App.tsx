import React, { useEffect, useRef, useState } from 'react';
import { createAppClient } from '@thassi/sdk/client';

const api = createAppClient('meal-planner');

type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

interface StructuredIngredient {
  name: string;
  amount: number;
  unit: 'g' | 'ml' | 'Stk';
}

interface Recipe {
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
}

interface IngredientCatalogItem {
  id?: number;
  name: string;
  barcode: string;
  brand: string;
  unit: 'g' | 'ml' | 'Stk';
  package_size: number;
  available_amount: number;
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
}

interface MealPlanEntry {
  id: number;
  plan_date: string;
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
  custom_ingredients: string;
}

interface WaterLogEntry {
  plan_date: string;
  amount_ml: number;
  target_ml: number;
}

interface UserProfile {
  name: string;
  age: number;
  gender: 'male' | 'female' | 'diverse';
  height_cm: number;
  current_weight_kg: number;
  target_weight_kg: number;
  activity_level: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  who_profile: 'who_standard' | 'who_mediterranean' | 'who_high_protein' | 'who_plant_based' | 'who_metabolic';
  weekly_goal_kg: number;
  target_calories: number;
  target_protein_g: number;
  target_carbs_g: number;
  target_fat_g: number;
  target_fiber_g: number;
  max_sugar_g: number;
  target_water_ml: number;
}

interface OptimizationOptions {
  mode: 'waste_min' | 'ingredient_min' | 'price_min' | 'balanced';
  preferred_stores: Array<'billa' | 'hofer' | 'spar'>;
  use_pantry_stock: boolean;
  auto_accumulate_packages: boolean;
  max_unique_ingredients_per_week: number;
  prefer_bio: boolean;
}

interface StorePackageCalc {
  store: 'billa' | 'hofer' | 'spar';
  storeLabel: string;
  productName: string;
  packSize: number;
  unitPrice: number;
  packsNeeded: number;
  purchasedAmount: number;
  totalPrice: number;
  surplusAmount: number;
  wasteRatio: number;
  singleMealPacksWithoutAccumulation: number;
}

interface CumulativeIngredientResult {
  ingredientId: number | null;
  name: string;
  unit: 'g' | 'ml' | 'Stk';
  mealOccurrences: number;
  usedInMeals: string[];
  grossRequired: number;
  availableInPantry: number;
  pantryUsed: number;
  netToBuy: number;
  offers: Record<'billa' | 'hofer' | 'spar', StorePackageCalc>;
  recommendedStore: 'billa' | 'hofer' | 'spar';
  recommendedOffer: StorePackageCalc;
  wasteSavedByAccumulation: number;
}

interface StoreSummary {
  store: 'billa' | 'hofer' | 'spar';
  totalPrice: number;
  totalPurchased: number;
  totalSurplus: number;
  totalPacks: number;
  efficiencyPct: number;
}

interface SupermarketOptimizationResult {
  queriedAt: string;
  optimizationMode: OptimizationOptions['mode'];
  selectedMealsCount: number;
  totalPortions: number;
  uniqueIngredientsCount: number;
  multiUseIngredientsCount: number;
  totalPantryUsed: number;
  totalWasteSavedByAccumulation: number;
  stores: {
    billa: StoreSummary;
    hofer: StoreSummary;
    spar: StoreSummary;
  };
  optimalMix: {
    totalPrice: number;
    totalPurchased: number;
    totalSurplus: number;
    totalPacks: number;
    efficiencyPct: number;
    bestSingleStore: 'billa' | 'hofer' | 'spar';
  };
  cumulativeIngredients: CumulativeIngredientResult[];
}

const SLOTS: Array<{ key: MealSlot; label: string; icon: string }> = [
  { key: 'breakfast', label: 'Frühstück', icon: '🌅' },
  { key: 'lunch', label: 'Mittag', icon: '☀️' },
  { key: 'dinner', label: 'Abend', icon: '🌙' },
  { key: 'snack', label: 'Snacks', icon: '🍎' },
];

const DAY_NAMES_DE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

const WHO_PROFILES: Record<UserProfile['who_profile'], { label: string; desc: string }> = {
  who_standard: {
    label: 'WHO Standard-Richtlinie',
    desc: '<10% freier Zucker, <30% Fett, ≥25g Ballaststoffe, ≥400g Obst & Gemüse/Tag',
  },
  who_high_protein: {
    label: 'WHO High-Protein & Muskelerhalt',
    desc: 'Erhöhter Proteinanteil (27%), <7% freier Zucker, ≥30g Ballaststoffe – ideal bei Gewichtsreduktion',
  },
  who_mediterranean: {
    label: 'WHO Mediterran & Kardioprotektiv',
    desc: 'Fokus auf ungesättigte Fette (Olivenöl, Nüsse, Omega-3), ≥32g Ballaststoffe, wenig Zucker',
  },
  who_plant_based: {
    label: 'WHO Pflanzlich / Whole-Food',
    desc: 'Hülsenfrüchte, Vollkorn & Samen, ≥38g Ballaststoffe, hohe Mikronährstoffdichte',
  },
  who_metabolic: {
    label: 'WHO Metabolisch / Blutzucker-Optimal',
    desc: 'Strenges WHO-Zuckerlimit (<5% kcal), moderat Low-Carb (38%), ≥35g Ballaststoffe',
  },
};

const OPTIMIZATION_MODES: Record<OptimizationOptions['mode'], { label: string; badge: string; desc: string }> = {
  waste_min: {
    label: 'Verschwendung minimieren (Zero-Waste)',
    badge: '♻️ Waste-Min',
    desc: 'Kumuliert alle Zutaten der Auswahl, zieht Vorräte ab und wählt Packungsgrößen (Billa/Hofer/Spar) mit minimalem Restüberschuss.',
  },
  ingredient_min: {
    label: 'Menge an Zutaten bündeln (Synergie)',
    badge: '🧩 Zutaten-Min',
    desc: 'Minimiert die Anzahl unterschiedlicher Zutaten über die Woche durch Rezept-Synergien und Mehrfachverwendung.',
  },
  price_min: {
    label: 'Günstigster Preis (Bestpreis-Mix)',
    badge: '💶 Bestpreis',
    desc: 'Wählt für jede kumulierte Zutat das günstigste Angebot zwischen Billa, Hofer und Spar.',
  },
  balanced: {
    label: 'Ausgewogen (Preis & Packungs-Effizienz)',
    badge: '⚖️ Balanced',
    desc: 'Optimale Balance aus geringem Verpackungsüberschuss und niedrigem Gesamtpreis.',
  },
};

const SAMPLE_BARCODES = [
  { code: '9002100045123', label: 'NÖM PRO Skyr Natur 400g' },
  { code: '9002233001122', label: 'Ja! Natürlich Bio-Haferflocken 500g' },
  { code: '9002515000019', label: 'Schärdinger Bergbaron Leicht 200g' },
  { code: '9002859087127', label: 'Ja! Natürlich Bio-Kichererbsen 240g' },
  { code: '9001414002117', label: 'Darbo Naturrein Marille 250g' },
  { code: '9004445556667', label: 'Hofstädter / FairHOF Hühnerfilet' },
];

function getIsoWeekNumber(dateStr: string): number {
  if (!dateStr) return 1;
  const d = new Date(`${dateStr}T12:00:00`);
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function formatShortDateDE(dateStr: string): string {
  if (!dateStr || dateStr.length < 10) return dateStr;
  const [, m, d] = dateStr.split('-');
  return `${d}.${m}.`;
}

export default function App() {
  const [weekStart, setWeekStart] = useState<string>('');
  const [weekEnd, setWeekEnd] = useState<string>('');
  const [days, setDays] = useState<string[]>([]);
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [waterLogs, setWaterLogs] = useState<WaterLogEntry[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredientsCatalog, setIngredientsCatalog] = useState<IngredientCatalogItem[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [optimization, setOptimization] = useState<OptimizationOptions | null>(null);
  const [supermarket, setSupermarket] = useState<SupermarketOptimizationResult | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [queryingApi, setQueryingApi] = useState<boolean>(false);

  // Collapsible ingredients per meal card (`${dayStr}_${slot}`)
  const [expandedMealIngredients, setExpandedMealIngredients] = useState<Record<string, boolean>>({});

  // Active Toolbar Modals
  const [activeModal, setActiveModal] = useState<
    null | 'recipe' | 'barcode' | 'profile' | 'optimization' | 'choose_meal'
  >(null);

  // Status bar detail drawer open/closed
  const [statusDrawerOpen, setStatusDrawerOpen] = useState<boolean>(false);

  // "Wählen aus..." modal target slot
  const [chooseTarget, setChooseTarget] = useState<{ dayStr: string; slot: MealSlot } | null>(null);
  const [chooseSearch, setChooseSearch] = useState<string>('');
  const [chooseFilterSlot, setChooseFilterSlot] = useState<string>('slot');
  const [customTitleInput, setCustomTitleInput] = useState<string>('');
  const [customKcalInput, setCustomKcalInput] = useState<string>('500');
  const [customProtInput, setCustomProtInput] = useState<string>('30');

  // New Recipe Form State
  const [recName, setRecName] = useState('');
  const [recType, setRecType] = useState<MealSlot>('dinner');
  const [recCalories, setRecCalories] = useState('560');
  const [recProtein, setRecProtein] = useState('38');
  const [recCarbs, setRecCarbs] = useState('52');
  const [recFat, setRecFat] = useState('18');
  const [recFiber, setRecFiber] = useState('9');
  const [recSugar, setRecSugar] = useState('5');
  const [recPrep, setRecPrep] = useState('20');
  const [recIngredients, setRecIngredients] = useState(
    '180g Hühnerbrustfilet\n150g Brokkoli\n80g Quinoa / Naturreis'
  );
  const [recInstructions, setRecInstructions] = useState('');

  // Barcode Scanner & New Ingredient Form State
  const [barcodeInput, setBarcodeInput] = useState('9002100045123');
  const [barcodeSourceInfo, setBarcodeSourceInfo] = useState<string>('');
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [scannedIngredient, setScannedIngredient] = useState<IngredientCatalogItem>({
    name: '',
    barcode: '',
    brand: '',
    unit: 'g',
    package_size: 250,
    available_amount: 250,
    calories_per_100: 120,
    protein_per_100: 10,
    carbs_per_100: 12,
    fat_per_100: 3,
    fiber_per_100: 2,
    sugar_per_100: 2,
    nutriscore: 'A',
    price_billa: 2.19,
    pack_billa: 250,
    product_billa: '',
    price_hofer: 1.69,
    pack_hofer: 250,
    product_hofer: '',
    price_spar: 1.99,
    pack_spar: 250,
    product_spar: '',
  });

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4200);
  };

  const loadAll = async (targetStart?: string) => {
    const startParam = targetStart !== undefined ? targetStart : weekStart;
    const [weekRes, recRes, ingRes] = await Promise.all([
      api.get<{
        weekStart: string;
        weekEnd: string;
        days: string[];
        entries: MealPlanEntry[];
        waterLogs: WaterLogEntry[];
        profile: UserProfile;
        optimization: OptimizationOptions;
        supermarket: SupermarketOptimizationResult;
      }>(`/week${startParam ? `?start=${encodeURIComponent(startParam)}` : ''}`),
      api.get<{ recipes: Recipe[] }>('/recipes'),
      api.get<{ ingredients: IngredientCatalogItem[] }>('/ingredients'),
    ]);

    setWeekStart(weekRes.weekStart);
    setWeekEnd(weekRes.weekEnd);
    setDays(weekRes.days);
    setEntries(weekRes.entries);
    setWaterLogs(weekRes.waterLogs);
    setProfile(weekRes.profile);
    setOptimization(weekRes.optimization);
    setSupermarket(weekRes.supermarket);
    setRecipes(recRes.recipes);
    setIngredientsCatalog(ingRes.ingredients);
  };

  useEffect(() => {
    void loadAll('');
  }, []);

  // Stop camera stream when closing barcode modal
  useEffect(() => {
    if (activeModal !== 'barcode' && cameraActive) {
      stopCameraScanner();
    }
  }, [activeModal]);

  const startCameraScanner = async () => {
    try {
      setCameraActive(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      // Use Web BarcodeDetector API if supported by the browser
      const BarcodeDetectorCtor = (window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => { detect: (el: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
      if (BarcodeDetectorCtor) {
        const detector = new BarcodeDetectorCtor({ formats: ['ean_13', 'ean_8', 'upc_a'] });
        const interval = setInterval(async () => {
          if (!videoRef.current || !videoRef.current.srcObject) {
            clearInterval(interval);
            return;
          }
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0 && codes[0].rawValue) {
              clearInterval(interval);
              setBarcodeInput(codes[0].rawValue);
              stopCameraScanner();
              void handleBarcodeLookup(codes[0].rawValue);
            }
          } catch {
            // frame not ready
          }
        }, 500);
      }
    } catch {
      setCameraActive(false);
      notify('Kamera-Zugriff im Browser nicht verfügbar – nutze den Direkt-Scanner / EAN-Eingabe.');
    }
  };

  const stopCameraScanner = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const handleBarcodeLookup = async (overrideCode?: string) => {
    const code = (overrideCode ?? barcodeInput).trim();
    if (!code) return;
    setQueryingApi(true);
    try {
      const res = await api.get<{
        source: string;
        found: boolean;
        product: IngredientCatalogItem;
      }>(`/barcode?code=${encodeURIComponent(code)}`);
      setScannedIngredient(res.product);
      const sourceLabel =
        res.source === 'openfoodfacts_live_api'
          ? '🌐 OpenFoodFacts Live-API + AT-Marktabgleich'
          : res.source === 'austrian_supermarket_api'
            ? '🇦🇹 Österreichischer Supermarkt-Katalog (Billa/Hofer/Spar)'
            : res.source === 'local_catalog'
              ? '🏠 Lokale Vorrats-Datenbank'
              : '🔍 EAN-Parser';
      setBarcodeSourceInfo(`Gefunden via ${sourceLabel}`);
      notify(`Barcode ${code} geladen: ${res.product.name}`);
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err));
    } finally {
      setQueryingApi(false);
    }
  };

  const handleSaveScannedIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scannedIngredient.name.trim()) return;
    await api.post('/ingredients', scannedIngredient);
    notify(`Zutat "${scannedIngredient.name}" (${scannedIngredient.available_amount}${scannedIngredient.unit} Vorrat) gespeichert!`);
    await loadAll();
  };

  const shiftWeek = async (deltaDays: number) => {
    if (!weekStart) return;
    const d = new Date(`${weekStart}T12:00:00`);
    d.setDate(d.getDate() + deltaDays);
    const nextStart = d.toISOString().slice(0, 10);
    await loadAll(nextStart);
  };

  const handleRandomizeSlot = async (dayStr: string, slot: MealSlot, currentRecipeId?: number | null) => {
    const res = await api.post<{ chosen: Recipe }>('/plan/randomize', {
      plan_date: dayStr,
      slot,
      current_recipe_id: currentRecipeId,
    });
    notify(`🎲 ${res.chosen.name} für ${formatShortDateDE(dayStr)} (${slot}) ausgewürfelt!`);
    await loadAll();
  };

  const handleAssignRecipeToSlot = async (recipe: Recipe) => {
    if (!chooseTarget) return;
    await api.post('/plan', {
      plan_date: chooseTarget.dayStr,
      slot: chooseTarget.slot,
      recipe_id: recipe.id,
      selected: 1,
    });
    notify(`"${recipe.name}" eingeplant!`);
    setActiveModal(null);
    await loadAll();
  };

  const handleAssignCustomMealToSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chooseTarget || !customTitleInput.trim()) return;
    await api.post('/plan', {
      plan_date: chooseTarget.dayStr,
      slot: chooseTarget.slot,
      recipe_id: null,
      custom_title: customTitleInput.trim(),
      calories: Number(customKcalInput || 450),
      protein_g: Number(customProtInput || 25),
      selected: 1,
    });
    setCustomTitleInput('');
    setActiveModal(null);
    await loadAll();
  };

  const handleChangeGuestPortions = async (entry: MealPlanEntry, delta: number) => {
    const nextGuests = Math.max(0, (entry.guest_portions || 0) + delta);
    await api.post('/plan/guests', { id: entry.id, guest_portions: nextGuests });
    await loadAll();
  };

  const handleToggleSelectMeal = async (entry: MealPlanEntry) => {
    setQueryingApi(true);
    try {
      await api.post('/plan/select', { id: entry.id, selected: entry.selected !== 1 });
      await loadAll();
    } finally {
      setQueryingApi(false);
    }
  };

  const handleSelectDayMeals = async (dayStr: string, selectAll: boolean) => {
    const ids = entries.filter((e) => e.plan_date === dayStr).map((e) => e.id);
    if (ids.length === 0) return;
    setQueryingApi(true);
    try {
      await api.post('/plan/select', { ids, selected: selectAll });
      await loadAll();
    } finally {
      setQueryingApi(false);
    }
  };

  const handleSelectWeekMeals = async (selectAll: boolean) => {
    setQueryingApi(true);
    try {
      await api.post('/plan/select', { weekStart, weekEnd, selected: selectAll });
      await loadAll();
      notify(
        selectAll
          ? 'Alle Mahlzeiten der Woche selektiert – Billa, Hofer & Spar API-Optimierung berechnet!'
          : 'Mahlzeiten-Selektion zurückgesetzt.'
      );
    } finally {
      setQueryingApi(false);
    }
  };

  const handleTriggerSupermarketApi = async () => {
    setQueryingApi(true);
    try {
      const selectedIds = entries.filter((e) => e.selected === 1).map((e) => e.id);
      const res = await api.post<SupermarketOptimizationResult>('/supermarket-query', {
        mealIds: selectedIds,
      });
      setSupermarket(res);
      setStatusDrawerOpen(true);
      notify(
        `Supermarkt-API Abfrage (Billa, Hofer, Spar) für ${res.selectedMealsCount} Mahlzeiten (${res.totalPortions} Portionen) abgeschlossen!`
      );
    } finally {
      setQueryingApi(false);
    }
  };

  const handleAdjustWater = async (dayStr: string, deltaMl: number) => {
    await api.post('/water', { plan_date: dayStr, delta_ml: deltaMl });
    await loadAll();
  };

  const handleCreateRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recName.trim()) return;
    await api.post('/recipes', {
      name: recName.trim(),
      meal_type: recType,
      calories: Number(recCalories || 500),
      protein_g: Number(recProtein || 30),
      carbs_g: Number(recCarbs || 50),
      fat_g: Number(recFat || 18),
      fiber_g: Number(recFiber || 8),
      sugar_g: Number(recSugar || 5),
      prep_minutes: Number(recPrep || 20),
      ingredientsText: recIngredients,
      instructions: recInstructions,
    });
    setRecName('');
    notify(`Rezept "${recName}" gespeichert!`);
    await loadAll();
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    const res = await api.post<{ profile: UserProfile }>('/profile', profile);
    setProfile(res.profile);
    setActiveModal(null);
    notify(
      `WHO-Profil aktualisiert: Ziel ${res.profile.target_calories} kcal/Tag • ${res.profile.target_protein_g}g Protein (${res.profile.target_weight_kg} kg Zielgewicht)`
    );
    await loadAll();
  };

  const handleUpdateOptimization = async (partial: Partial<OptimizationOptions>) => {
    if (!optimization) return;
    const next = { ...optimization, ...partial };
    setOptimization(next);
    const res = await api.post<{
      optimization: OptimizationOptions;
      supermarket: SupermarketOptimizationResult;
    }>('/optimization-options', next);
    setOptimization(res.optimization);
    setSupermarket(res.supermarket);
  };

  const handleAutoOptimizeWeek = async () => {
    await api.post('/optimize-week', { weekStart });
    setActiveModal(null);
    notify('✨ Wochenplan wurde auf minimale Verschwendung, Zutaten-Synergie & WHO-Makros optimiert!');
    await loadAll();
  };

  const handleTransferToGroceryList = async (storePref: 'optimal' | 'billa' | 'hofer' | 'spar') => {
    const selectedIds = entries.filter((e) => e.selected === 1).map((e) => e.id);
    const res = await api.post<{ addedCount: number }>('/groceries/from-optimization', {
      mealIds: selectedIds,
      storePreference: storePref,
    });
    await api.post('/sync-ha');
    notify(
      `🛒 ${res.addedCount} kumulierte Supermarkt-Packungen in Einkaufsliste & Home Assistant Sensor übertragen!`
    );
  };

  const getRecipeIngredientsForEntry = (entry: MealPlanEntry): StructuredIngredient[] => {
    const rec = entry.recipe_id ? recipes.find((r) => r.id === entry.recipe_id) : undefined;
    if (rec && rec.structured_ingredients && rec.structured_ingredients.length > 0) {
      return rec.structured_ingredients;
    }
    if (entry.custom_ingredients) {
      try {
        const parsed = JSON.parse(entry.custom_ingredients);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // ignore
      }
    }
    return [];
  };

  const activeProfile: UserProfile = profile || {
    name: 'User',
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

  const activeOpt: OptimizationOptions = optimization || {
    mode: 'waste_min',
    preferred_stores: ['billa', 'hofer', 'spar'],
    use_pantry_stock: true,
    auto_accumulate_packages: true,
    max_unique_ingredients_per_week: 18,
    prefer_bio: true,
  };

  const selectedCount = entries.filter((e) => e.selected === 1).length;
  const kwNumber = getIsoWeekNumber(weekStart);

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        boxSizing: 'border-box',
        background: '#0b1120',
        color: '#f8fafc',
        paddingBottom: statusDrawerOpen ? 420 : 96,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* =====================================================================
          1. OBEN, VOLLE BREITE: TOOLBAR
         ===================================================================== */}
      <header
        style={{
          width: '100%',
          boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
          borderBottom: '1px solid #334155',
          padding: '12px 20px',
          position: 'sticky',
          top: 0,
          zIndex: 40,
          boxShadow: '0 4px 20px rgba(0,0,0,0.45)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
            width: '100%',
          }}
        >
          {/* Left: App Brand & Week Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 22 }}>🥗</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: '#38bdf8', letterSpacing: 0.2 }}>
                  THASSI MEAL PLANNER
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  WHO-Ernährungssteuerung & Supermarkt-Optimierer
                </div>
              </div>
            </div>

            {/* Woche weiterschalten */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: '#0f172a',
                padding: '5px 10px',
                borderRadius: 10,
                border: '1px solid #334155',
              }}
            >
              <button
                onClick={() => shiftWeek(-7)}
                style={toolbarIconBtn}
                title="Vorherige Woche"
              >
                ◀
              </button>
              <button
                onClick={() => loadAll('')}
                style={{ ...toolbarIconBtn, fontSize: 11, padding: '4px 8px', color: '#38bdf8' }}
                title="Zur aktuellen Woche springen"
              >
                Heute
              </button>
              <button
                onClick={() => shiftWeek(7)}
                style={toolbarIconBtn}
                title="Nächste Woche"
              >
                ▶
              </button>
              <div style={{ paddingLeft: 6, paddingRight: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#f8fafc' }}>
                  KW {kwNumber} • {formatShortDateDE(weekStart)} – {formatShortDateDE(weekEnd)}
                  {weekEnd.slice(0, 4)}
                </div>
              </div>
            </div>
          </div>

          {/* Center / Right: Full-Width Action Toolbar Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Neues Rezept hinzufügen */}
            <button
              onClick={() => setActiveModal(activeModal === 'recipe' ? null : 'recipe')}
              style={activeModal === 'recipe' ? btnToolbarActive : btnToolbar}
            >
              ➕ Neues Rezept ({recipes.length})
            </button>

            {/* Neue Zutat (Barcode-Scanner mit API Call) */}
            <button
              onClick={() => {
                setActiveModal(activeModal === 'barcode' ? null : 'barcode');
                if (activeModal !== 'barcode' && !scannedIngredient.name) {
                  void handleBarcodeLookup('9002100045123');
                }
              }}
              style={activeModal === 'barcode' ? btnToolbarActive : btnToolbar}
            >
              📷 Neue Zutat (Barcode-Scanner)
            </button>

            {/* User-Profil anpassen (WHO-Ernährungsprofil, Gewichtsziel) */}
            <button
              onClick={() => setActiveModal(activeModal === 'profile' ? null : 'profile')}
              style={activeModal === 'profile' ? btnToolbarActive : btnToolbar}
            >
              👤 User-Profil:{' '}
              <span style={{ color: '#38bdf8' }}>
                {activeProfile.current_weight_kg}→{activeProfile.target_weight_kg}kg
              </span>{' '}
              • <span style={{ color: '#4ade80' }}>{activeProfile.target_calories} kcal</span>
            </button>

            {/* Optimierungsoptionen (Menge an Zutaten, Verschwendung minimieren, etc.) */}
            <button
              onClick={() => setActiveModal(activeModal === 'optimization' ? null : 'optimization')}
              style={activeModal === 'optimization' ? btnToolbarActive : btnToolbar}
            >
              ⚙️ Optimierung:{' '}
              <span style={{ color: '#fbbf24' }}>{OPTIMIZATION_MODES[activeOpt.mode].badge}</span>
            </button>

            {/* Selektion & Supermarkt-API (Billa, Hofer, Spar) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                background: '#0f172a',
                padding: '4px 8px',
                borderRadius: 10,
                border: '1px solid #334155',
              }}
            >
              <button
                onClick={() => handleSelectWeekMeals(selectedCount < entries.length)}
                style={{
                  ...toolbarIconBtn,
                  fontSize: 11,
                  padding: '5px 8px',
                  color: selectedCount > 0 ? '#38bdf8' : '#94a3b8',
                }}
                title="Alle geplanten Mahlzeiten der Woche auswählen / abwählen"
              >
                {selectedCount > 0 ? `☑️ Auswahl (${selectedCount})` : '⬜ Alle wählen'}
              </button>
              <button
                onClick={handleTriggerSupermarketApi}
                style={{
                  padding: '6px 12px',
                  borderRadius: 7,
                  border: 'none',
                  background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {queryingApi ? '⏳ API lädt...' : '🛒 Supermarkt-API (Billa•Hofer•Spar)'}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 72,
            right: 24,
            zIndex: 90,
            background: '#0284c7',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: 10,
            fontWeight: 600,
            fontSize: 13,
            boxShadow: '0 8px 25px rgba(0,0,0,0.5)',
            border: '1px solid #38bdf8',
          }}
        >
          {toast}
        </div>
      )}

      {/* =====================================================================
          2. DARUNTER: WOCHENTAGE HORIZONTAL, VOLLE BREITE
             Pro Tag: Mahlzeiten (Frühstück, Mittag, Abend, Snacks, Wasser) vertikal
             Darunter: Tages-Makros (Balken-Diagramm), Ernährungs-Hinweise
         ===================================================================== */}
      <main style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(235px, 1fr))',
            gap: 12,
            width: '100%',
            overflowX: 'auto',
            alignItems: 'stretch',
          }}
        >
          {days.map((dayStr, dayIdx) => {
            const dayEntries = entries.filter((e) => e.plan_date === dayStr);
            const waterEntry = waterLogs.find((w) => w.plan_date === dayStr);
            const waterMl = waterEntry ? waterEntry.amount_ml : 1750;
            const waterTargetMl = activeProfile.target_water_ml || 2800;

            // User's personal daily macro intake (1 personal portion per planned meal)
            const dayKcal = dayEntries.reduce((s, e) => s + (e.calories || 0), 0);
            const dayProt = dayEntries.reduce((s, e) => s + (e.protein_g || 0), 0);
            const dayCarbs = dayEntries.reduce((s, e) => s + (e.carbs_g || 0), 0);
            const dayFat = dayEntries.reduce((s, e) => s + (e.fat_g || 0), 0);
            const dayFiber = dayEntries.reduce((s, e) => s + (e.fiber_g || 0), 0);
            const daySugar = dayEntries.reduce((s, e) => s + (e.sugar_g || 0), 0);

            const isToday = dayStr === new Date().toISOString().slice(0, 10);
            const allDaySelected =
              dayEntries.length > 0 && dayEntries.every((e) => e.selected === 1);

            // Generate WHO & Weight-Goal Nutritional Hints for this day
            const hints: Array<{ type: 'ok' | 'warn' | 'info'; text: string }> = [];
            const kcalDiff = dayKcal - activeProfile.target_calories;
            if (dayEntries.length === 0) {
              hints.push({ type: 'info', text: 'Noch keine Mahlzeiten für diesen Tag geplant.' });
            } else {
              if (Math.abs(kcalDiff) <= 180) {
                hints.push({
                  type: 'ok',
                  text: `Kalorienziel für Gewichtsziel (${activeProfile.target_weight_kg}kg) optimal getroffen (${dayKcal} kcal).`,
                });
              } else if (kcalDiff > 180) {
                hints.push({
                  type: 'warn',
                  text: `+${kcalDiff} kcal über Tagesziel (${activeProfile.target_calories} kcal).`,
                });
              } else {
                hints.push({
                  type: 'info',
                  text: `${Math.abs(kcalDiff)} kcal unter Tagesziel – Platz für gesunden Snack.`,
                });
              }

              if (dayProt >= activeProfile.target_protein_g * 0.9) {
                hints.push({
                  type: 'ok',
                  text: `WHO-Proteinziel erreicht (${dayProt}g / ${activeProfile.target_protein_g}g).`,
                });
              } else {
                hints.push({
                  type: 'warn',
                  text: `Protein niedrig (${dayProt}g / ${activeProfile.target_protein_g}g) – Skyr, Hülsenfrüchte oder Fisch ergänzen.`,
                });
              }

              if (dayFiber >= activeProfile.target_fiber_g) {
                hints.push({
                  type: 'ok',
                  text: `Ballaststoffe WHO-konform (${dayFiber}g ≥ ${activeProfile.target_fiber_g}g).`,
                });
              } else {
                hints.push({
                  type: 'warn',
                  text: `Ballaststoffe (${dayFiber}g / ${activeProfile.target_fiber_g}g) unter WHO-Richtwert.`,
                });
              }

              if (daySugar > activeProfile.max_sugar_g) {
                hints.push({
                  type: 'warn',
                  text: `Zucker (${daySugar}g) überschreitet WHO-Empfehlung (<${activeProfile.max_sugar_g}g).`,
                });
              }

              if (waterMl < waterTargetMl * 0.75) {
                hints.push({
                  type: 'warn',
                  text: `Trinkmenge (${(waterMl / 1000).toFixed(2)}L) unter Ziel (${(waterTargetMl / 1000).toFixed(1)}L).`,
                });
              }
            }

            return (
              <div
                key={dayStr}
                style={{
                  background: '#151f32',
                  border: isToday ? '2px solid #38bdf8' : '1px solid #26354d',
                  borderRadius: 12,
                  padding: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: isToday ? '0 0 18px rgba(56, 189, 248, 0.15)' : 'none',
                }}
              >
                {/* DAY HEADER */}
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingBottom: 8,
                      marginBottom: 8,
                      borderBottom: '1px solid #26354d',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            fontWeight: 800,
                            fontSize: 14,
                            color: isToday ? '#38bdf8' : '#f8fafc',
                          }}
                        >
                          {DAY_NAMES_DE[dayIdx]}
                        </span>
                        {isToday && (
                          <span
                            style={{
                              fontSize: 9,
                              background: '#0284c7',
                              color: '#fff',
                              padding: '1px 5px',
                              borderRadius: 4,
                              fontWeight: 700,
                            }}
                          >
                            HEUTE
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>
                        {formatShortDateDE(dayStr)}
                        {dayStr.slice(0, 4)}
                      </div>
                    </div>

                    {/* Select all meals of this day for Supermarket API */}
                    <button
                      onClick={() => handleSelectDayMeals(dayStr, !allDaySelected)}
                      style={{
                        background: allDaySelected ? 'rgba(56, 189, 248, 0.16)' : '#0f172a',
                        border: allDaySelected ? '1px solid #38bdf8' : '1px solid #334155',
                        color: allDaySelected ? '#38bdf8' : '#94a3b8',
                        borderRadius: 6,
                        padding: '3px 7px',
                        fontSize: 10,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                      title="Alle Mahlzeiten dieses Tages für Supermarkt-API selektieren"
                    >
                      {allDaySelected ? '☑️ Tag gewählt' : '⬜ Tag wählen'}
                    </button>
                  </div>

                  {/* VERTICAL MEAL CARDS: Frühstück, Mittag, Abend, Snacks */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {SLOTS.map(({ key: slot, label: slotLabel, icon: slotIcon }) => {
                      const entry = dayEntries.find((e) => e.slot === slot);
                      const cardKey = `${dayStr}_${slot}`;
                      const isExpanded = !!expandedMealIngredients[cardKey];
                      const isSelected = entry?.selected === 1;
                      const guests = entry?.guest_portions || 0;
                      const totalPortions = 1 + guests;
                      const ingList = entry ? getRecipeIngredientsForEntry(entry) : [];

                      return (
                        <div
                          key={slot}
                          style={{
                            background: isSelected ? '#0f2138' : '#0b1322',
                            border: isSelected ? '1px solid #0284c7' : '1px solid #1e293b',
                            borderRadius: 9,
                            padding: '8px 9px',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {/* Row 1: Slot Header + Selection Checkbox + Guest Portion Badge */}
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: 4,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {entry && (
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleSelectMeal(entry)}
                                  style={{ cursor: 'pointer', accentColor: '#0284c7', width: 14, height: 14 }}
                                  title="Mahlzeit für Supermarkt-API (Billa, Hofer, Spar) & Mengen-Kumulierung auswählen"
                                />
                              )}
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  letterSpacing: 0.4,
                                  color: isSelected ? '#38bdf8' : '#94a3b8',
                                }}
                              >
                                {slotIcon} {slotLabel}
                              </span>
                            </div>

                            {/* Guest portions indicator & Delete button */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              {entry && guests > 0 && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    background: '#7c2d12',
                                    color: '#fed7aa',
                                    padding: '1px 6px',
                                    borderRadius: 99,
                                    fontWeight: 700,
                                  }}
                                  title={`1 Person + ${guests} Gast/Gäste = ${totalPortions} Portionen (Zutatenmengen x${totalPortions})`}
                                >
                                  👥 +{guests} Gast ({totalPortions}P)
                                </span>
                              )}
                              {entry && (
                                <button
                                  onClick={async () => {
                                    await api.delete(`/plan?id=${entry.id}`);
                                    await loadAll();
                                  }}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#64748b',
                                    cursor: 'pointer',
                                    fontSize: 11,
                                    padding: '0 2px',
                                  }}
                                  title="Mahlzeit entfernen"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Row 2: Meal Title & Macros */}
                          {entry ? (
                            <>
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: '#f8fafc',
                                  lineHeight: 1.3,
                                  marginBottom: 5,
                                }}
                              >
                                {entry.custom_title}
                              </div>

                              {/* Makros Row */}
                              <div
                                style={{
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  gap: 4,
                                  marginBottom: 6,
                                  fontSize: 10,
                                }}
                              >
                                <span style={macroPill('#0369a1', '#e0f2fe')}>
                                  🔥 {entry.calories} kcal
                                </span>
                                <span style={macroPill('#15803d', '#dcfce7')}>
                                  💪 {entry.protein_g}g P
                                </span>
                                <span style={macroPill('#b45309', '#fef3c7')}>
                                  🌾 {entry.carbs_g || 45}g KH
                                </span>
                                <span style={macroPill('#6d28d9', '#ede9fe')}>
                                  🥑 {entry.fat_g || 15}g F
                                </span>
                              </div>

                              {/* Collapsible Ingredients ("Zutaten zum Aufklappen") */}
                              <div style={{ marginBottom: 6 }}>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedMealIngredients((prev) => ({
                                      ...prev,
                                      [cardKey]: !prev[cardKey],
                                    }))
                                  }
                                  style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    background: '#162238',
                                    border: '1px solid #26354d',
                                    color: '#cbd5e1',
                                    borderRadius: 6,
                                    padding: '3px 7px',
                                    fontSize: 10,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                  }}
                                >
                                  <span>
                                    {isExpanded ? '▾' : '▸'} Zutaten ({ingList.length})
                                    {totalPortions > 1 ? ` • skaliert x${totalPortions}` : ''}
                                  </span>
                                  <span style={{ color: '#38bdf8', fontSize: 9 }}>
                                    {isExpanded ? 'zuklappen' : 'aufklappen'}
                                  </span>
                                </button>

                                {isExpanded && (
                                  <div
                                    style={{
                                      marginTop: 4,
                                      padding: '6px 8px',
                                      background: '#090f1d',
                                      borderRadius: 6,
                                      border: '1px solid #1e293b',
                                      fontSize: 10,
                                      color: '#cbd5e1',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: 3,
                                    }}
                                  >
                                    {ingList.length === 0 ? (
                                      <span style={{ color: '#64748b' }}>Keine Einzelzutaten hinterlegt</span>
                                    ) : (
                                      ingList.map((ing, i) => {
                                        const scaledAmt = Math.round(ing.amount * totalPortions * 10) / 10;
                                        return (
                                          <div
                                            key={i}
                                            style={{
                                              display: 'flex',
                                              justifyContent: 'space-between',
                                              borderBottom:
                                                i < ingList.length - 1 ? '1px dashed #1e293b' : 'none',
                                              paddingBottom: 2,
                                            }}
                                          >
                                            <span>{ing.name}</span>
                                            <strong style={{ color: '#38bdf8' }}>
                                              {scaledAmt}
                                              {ing.unit}
                                            </strong>
                                          </div>
                                        );
                                      })
                                    )}
                                  </div>
                                )}
                              </div>
                            </>
                          ) : (
                            <div
                              style={{
                                fontSize: 11,
                                color: '#64748b',
                                fontStyle: 'italic',
                                padding: '6px 0',
                              }}
                            >
                              Keine Mahlzeit geplant
                            </div>
                          )}

                          {/* Row 3: Meal Functions: Randomizer, Wählen aus..., Zusätzliche Portion (für Gast) */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 4,
                              paddingTop: 4,
                              borderTop: '1px solid #1e293b',
                            }}
                          >
                            {/* Randomizer */}
                            <button
                              type="button"
                              onClick={() => handleRandomizeSlot(dayStr, slot, entry?.recipe_id)}
                              style={mealActionBtn}
                              title="Zufälliges passendes Rezept auswählen (Randomizer)"
                            >
                              🎲 Random
                            </button>

                            {/* Wählen aus... */}
                            <button
                              type="button"
                              onClick={() => {
                                setChooseTarget({ dayStr, slot });
                                setChooseFilterSlot(slot);
                                setChooseSearch('');
                                setActiveModal('choose_meal');
                              }}
                              style={mealActionBtn}
                              title="Rezept aus Rezeptbuch wählen oder eigene Mahlzeit eintragen"
                            >
                              📋 Wählen aus...
                            </button>

                            {/* Zusätzliche Portion (für Gast) */}
                            {entry && (
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 2,
                                  background: '#162238',
                                  borderRadius: 5,
                                  border: '1px solid #26354d',
                                  padding: '1px 3px',
                                }}
                                title="Zusätzliche Portion für Gast hinzufügen/entfernen (skaliert Supermarkt-Zutaten)"
                              >
                                {guests > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => handleChangeGuestPortions(entry, -1)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#f87171',
                                      fontSize: 10,
                                      fontWeight: 800,
                                      cursor: 'pointer',
                                      padding: '1px 3px',
                                    }}
                                  >
                                    −
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleChangeGuestPortions(entry, 1)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: guests > 0 ? '#fbbf24' : '#94a3b8',
                                    fontSize: 10,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    padding: '1px 4px',
                                  }}
                                >
                                  +Gast{guests > 0 ? ` (${guests})` : ''}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* 5th Vertical Slot per Day: WASSER (Hydration Tracker) */}
                    <div
                      style={{
                        background: '#0b192e',
                        border: '1px solid #1e3a5f',
                        borderRadius: 9,
                        padding: '8px 9px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 4,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            color: '#38bdf8',
                          }}
                        >
                          💧 Wasser
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#e0f2fe' }}>
                          {(waterMl / 1000).toFixed(2)} / {(waterTargetMl / 1000).toFixed(1)} L
                        </span>
                      </div>

                      <div
                        style={{
                          width: '100%',
                          height: 6,
                          background: '#0f172a',
                          borderRadius: 99,
                          overflow: 'hidden',
                          marginBottom: 6,
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(100, Math.round((waterMl / waterTargetMl) * 100))}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #0284c7, #38bdf8)',
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          type="button"
                          onClick={() => handleAdjustWater(dayStr, -250)}
                          style={{ ...mealActionBtn, flex: 1, textAlign: 'center' }}
                        >
                          −250ml
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAdjustWater(dayStr, 250)}
                          style={{
                            ...mealActionBtn,
                            flex: 1.3,
                            textAlign: 'center',
                            color: '#38bdf8',
                            borderColor: '#0284c7',
                          }}
                        >
                          +250ml Glas
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAdjustWater(dayStr, 500)}
                          style={{ ...mealActionBtn, flex: 1, textAlign: 'center' }}
                        >
                          +500ml
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ===============================================================
                    DARUNTER (PRO TAG): TAGES-MAKROS (BALKEN-DIAGRAMM) & ERNÄHRUNGS-HINWEISE
                   =============================================================== */}
                <div
                  style={{
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: '2px solid #26354d',
                  }}
                >
                  {/* TAGES-MAKROS (Balken-Diagramm) */}
                  <div
                    style={{
                      background: '#0b1322',
                      border: '1px solid #1e293b',
                      borderRadius: 9,
                      padding: '8px 9px',
                      marginBottom: 8,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        color: '#94a3b8',
                        marginBottom: 6,
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>📊 Tages-Makros (WHO-Profil)</span>
                      <span style={{ color: '#38bdf8' }}>
                        {Math.round((dayKcal / Math.max(1, activeProfile.target_calories)) * 100)}%
                      </span>
                    </div>

                    {[
                      {
                        label: 'Kalorien',
                        val: dayKcal,
                        target: activeProfile.target_calories,
                        unit: 'kcal',
                        color: dayKcal > activeProfile.target_calories * 1.1 ? '#ef4444' : '#38bdf8',
                      },
                      {
                        label: 'Protein',
                        val: dayProt,
                        target: activeProfile.target_protein_g,
                        unit: 'g',
                        color: '#22c55e',
                      },
                      {
                        label: 'Kohlenhydr.',
                        val: dayCarbs,
                        target: activeProfile.target_carbs_g,
                        unit: 'g',
                        color: '#f59e0b',
                      },
                      {
                        label: 'Fett',
                        val: dayFat,
                        target: activeProfile.target_fat_g,
                        unit: 'g',
                        color: '#a855f7',
                      },
                      {
                        label: 'Ballastst.',
                        val: dayFiber,
                        target: activeProfile.target_fiber_g,
                        unit: 'g',
                        color: '#14b8a6',
                      },
                    ].map((m) => {
                      const pct = Math.min(100, Math.round((m.val / Math.max(1, m.target)) * 100));
                      return (
                        <div key={m.label} style={{ marginBottom: 5 }}>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              fontSize: 10,
                              marginBottom: 2,
                            }}
                          >
                            <span style={{ color: '#cbd5e1' }}>{m.label}</span>
                            <span style={{ color: '#94a3b8', fontWeight: 600 }}>
                              <strong style={{ color: '#f8fafc' }}>{m.val}</strong> / {m.target} {m.unit}
                            </span>
                          </div>
                          <div
                            style={{
                              width: '100%',
                              height: 6,
                              background: '#1e293b',
                              borderRadius: 99,
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                width: `${pct}%`,
                                height: '100%',
                                background: m.color,
                                borderRadius: 99,
                                transition: 'width 0.25s ease',
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* ERNÄHRUNGS-HINWEISE */}
                  <div
                    style={{
                      background: '#0b1322',
                      border: '1px solid #1e293b',
                      borderRadius: 9,
                      padding: '7px 9px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        color: '#94a3b8',
                        marginBottom: 5,
                      }}
                    >
                      🩺 Ernährungs-Hinweise
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {hints.slice(0, 3).map((h, i) => (
                        <div
                          key={i}
                          style={{
                            fontSize: 10,
                            lineHeight: 1.3,
                            padding: '4px 6px',
                            borderRadius: 5,
                            background:
                              h.type === 'ok'
                                ? 'rgba(34, 197, 94, 0.12)'
                                : h.type === 'warn'
                                  ? 'rgba(245, 158, 11, 0.14)'
                                  : 'rgba(56, 189, 248, 0.12)',
                            color:
                              h.type === 'ok'
                                ? '#86efac'
                                : h.type === 'warn'
                                  ? '#fde68a'
                                  : '#bae6fd',
                            borderLeft: `3px solid ${
                              h.type === 'ok' ? '#22c55e' : h.type === 'warn' ? '#f59e0b' : '#38bdf8'
                            }`,
                          }}
                        >
                          {h.type === 'ok' ? '✓ ' : h.type === 'warn' ? '⚠ ' : 'ℹ '}
                          {h.text}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* =====================================================================
          3. MODALS FÜR TOOLBAR-FUNKTIONEN & "WÄHLEN AUS..."
         ===================================================================== */}

      {/* MODAL: WÄHLEN AUS... (Rezept für Slot auswählen) */}
      {activeModal === 'choose_meal' && chooseTarget && (
        <div style={modalBackdrop} onClick={() => setActiveModal(null)}>
          <div style={modalContainer(700)} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeader}>
              <h3 style={{ margin: 0, color: '#38bdf8' }}>
                📋 Mahlzeit wählen für {formatShortDateDE(chooseTarget.dayStr)} (
                {SLOTS.find((s) => s.key === chooseTarget.slot)?.label})
              </h3>
              <button onClick={() => setActiveModal(null)} style={closeBtn}>
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                value={chooseSearch}
                onChange={(e) => setChooseSearch(e.target.value)}
                placeholder="Rezept oder Zutat suchen (z.B. Lachs, Skyr, Linsen)..."
                style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
              />
              <select
                value={chooseFilterSlot}
                onChange={(e) => setChooseFilterSlot(e.target.value)}
                style={{ ...inputStyle, marginBottom: 0, width: 170 }}
              >
                <option value="all">Alle Kategorien</option>
                <option value="breakfast">🌅 Frühstück</option>
                <option value="lunch">☀️ Mittag</option>
                <option value="dinner">🌙 Abend</option>
                <option value="snack">🍎 Snacks</option>
              </select>
            </div>

            <div
              style={{
                maxHeight: 330,
                overflowY: 'auto',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
                marginBottom: 16,
              }}
            >
              {recipes
                .filter((r) =>
                  chooseFilterSlot === 'all' ? true : r.meal_type === chooseFilterSlot
                )
                .filter(
                  (r) =>
                    !chooseSearch.trim() ||
                    r.name.toLowerCase().includes(chooseSearch.toLowerCase()) ||
                    r.ingredients.some((i) =>
                      i.toLowerCase().includes(chooseSearch.toLowerCase())
                    )
                )
                .map((r) => (
                  <div
                    key={r.id}
                    onClick={() => handleAssignRecipeToSlot(r)}
                    style={{
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: 10,
                      padding: 12,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#f8fafc', marginBottom: 4 }}>
                      {r.name}
                    </div>
                    <div style={{ fontSize: 11, color: '#38bdf8', marginBottom: 6 }}>
                      🔥 {r.calories} kcal • 💪 {r.protein_g}g P • 🌾 {r.carbs_g}g KH • 🥑 {r.fat_g}g F
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      {r.structured_ingredients
                        .map((i) => `${i.amount}${i.unit} ${i.name}`)
                        .join(', ')}
                    </div>
                  </div>
                ))}
            </div>

            <form
              onSubmit={handleAssignCustomMealToSlot}
              style={{
                borderTop: '1px solid #334155',
                paddingTop: 12,
                display: 'flex',
                gap: 8,
                alignItems: 'flex-end',
              }}
            >
              <div style={{ flex: 2 }}>
                <label style={labelStyle}>Oder freie Mahlzeit eintragen</label>
                <input
                  value={customTitleInput}
                  onChange={(e) => setCustomTitleInput(e.target.value)}
                  placeholder="z.B. Auswärts essen / Resteessen"
                  style={{ ...inputStyle, marginBottom: 0 }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Kalorien (kcal)</label>
                <input
                  type="number"
                  value={customKcalInput}
                  onChange={(e) => setCustomKcalInput(e.target.value)}
                  style={{ ...inputStyle, marginBottom: 0 }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Protein (g)</label>
                <input
                  type="number"
                  value={customProtInput}
                  onChange={(e) => setCustomProtInput(e.target.value)}
                  style={{ ...inputStyle, marginBottom: 0 }}
                />
              </div>
              <button type="submit" style={btnPrimary}>
                Einplanen
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NEUES REZEPT HINZUFÜGEN */}
      {activeModal === 'recipe' && (
        <div style={modalBackdrop} onClick={() => setActiveModal(null)}>
          <div style={modalContainer(820)} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeader}>
              <h3 style={{ margin: 0, color: '#38bdf8' }}>➕ Neues Rezept hinzufügen & Rezeptbuch</h3>
              <button onClick={() => setActiveModal(null)} style={closeBtn}>
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 18 }}>
              <form onSubmit={handleCreateRecipe}>
                <label style={labelStyle}>Rezept-Titel</label>
                <input
                  value={recName}
                  onChange={(e) => setRecName(e.target.value)}
                  placeholder="z.B. Steirischer Käferbohnen-Salat mit Kernöl & Ei"
                  style={inputStyle}
                />

                <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 8 }}>
                  <div>
                    <label style={labelStyle}>Mahlzeiten-Kategorie</label>
                    <select
                      value={recType}
                      onChange={(e) => setRecType(e.target.value as MealSlot)}
                      style={inputStyle}
                    >
                      <option value="breakfast">🌅 Frühstück</option>
                      <option value="lunch">☀️ Mittag</option>
                      <option value="dinner">🌙 Abend</option>
                      <option value="snack">🍎 Snacks</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Zubereitungszeit (Min)</label>
                    <input
                      type="number"
                      value={recPrep}
                      onChange={(e) => setRecPrep(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  <div>
                    <label style={labelStyle}>Kalorien (kcal)</label>
                    <input
                      type="number"
                      value={recCalories}
                      onChange={(e) => setRecCalories(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Protein (g)</label>
                    <input
                      type="number"
                      value={recProtein}
                      onChange={(e) => setRecProtein(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Kohlenhydrate (g)</label>
                    <input
                      type="number"
                      value={recCarbs}
                      onChange={(e) => setRecCarbs(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Fett (g)</label>
                    <input
                      type="number"
                      value={recFat}
                      onChange={(e) => setRecFat(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Ballaststoffe (g)</label>
                    <input
                      type="number"
                      value={recFiber}
                      onChange={(e) => setRecFiber(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Zucker (g)</label>
                    <input
                      type="number"
                      value={recSugar}
                      onChange={(e) => setRecSugar(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                </div>

                <label style={labelStyle}>
                  Zutaten mit Mengenangabe (pro Zeile, z.B. „180g Hühnerbrustfilet“)
                </label>
                <textarea
                  rows={4}
                  value={recIngredients}
                  onChange={(e) => setRecIngredients(e.target.value)}
                  style={inputStyle}
                />

                <label style={labelStyle}>Zubereitungshinweise</label>
                <textarea
                  rows={2}
                  value={recInstructions}
                  onChange={(e) => setRecInstructions(e.target.value)}
                  style={inputStyle}
                />

                <button type="submit" style={{ ...btnPrimary, width: '100%' }}>
                  Rezept speichern
                </button>
              </form>

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 8 }}>
                  Gespeicherte Rezepte ({recipes.length})
                </div>
                <div
                  style={{
                    maxHeight: 410,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {recipes.map((r) => (
                    <div
                      key={r.id}
                      style={{
                        background: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: 8,
                        padding: 10,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <strong style={{ fontSize: 12 }}>{r.name}</strong>
                        <button
                          onClick={async () => {
                            await api.delete(`/recipes?id=${r.id}`);
                            await loadAll();
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#ef4444',
                            fontSize: 11,
                            cursor: 'pointer',
                          }}
                        >
                          Löschen
                        </button>
                      </div>
                      <div style={{ fontSize: 11, color: '#38bdf8', marginTop: 2 }}>
                        {r.calories} kcal • {r.protein_g}g P • {r.carbs_g}g KH • {r.fat_g}g F •{' '}
                        {r.fiber_g}g Ballastst.
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                        {r.ingredients.join(', ')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: NEUE ZUTAT & BARCODE-SCANNER MIT API-CALL */}
      {activeModal === 'barcode' && (
        <div style={modalBackdrop} onClick={() => setActiveModal(null)}>
          <div style={modalContainer(900)} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeader}>
              <h3 style={{ margin: 0, color: '#38bdf8' }}>
                📷 Neue Zutat scannen (Barcode-Scanner & OpenFoodFacts / Supermarkt-API)
              </h3>
              <button onClick={() => setActiveModal(null)} style={closeBtn}>
                ✕
              </button>
            </div>

            {/* Barcode Scanner Strip */}
            <div
              style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 10,
                padding: 12,
                marginBottom: 14,
              }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  placeholder="EAN-13 / EAN-8 Barcode eingeben..."
                  style={{ ...inputStyle, marginBottom: 0, width: 220, fontWeight: 700 }}
                />
                <button
                  type="button"
                  onClick={() => handleBarcodeLookup()}
                  style={btnPrimary}
                >
                  🔍 Barcode per API abfragen
                </button>
                <button
                  type="button"
                  onClick={cameraActive ? stopCameraScanner : startCameraScanner}
                  style={btnToolbar}
                >
                  {cameraActive ? '⏹ Kamera stoppen' : '📹 Kamera-Scanner starten'}
                </button>
                {barcodeSourceInfo && (
                  <span style={{ fontSize: 11, color: '#4ade80', fontWeight: 600 }}>
                    {barcodeSourceInfo}
                  </span>
                )}
              </div>

              {cameraActive && (
                <div style={{ marginTop: 10 }}>
                  <video
                    ref={videoRef}
                    style={{
                      width: '100%',
                      maxHeight: 200,
                      background: '#000',
                      borderRadius: 8,
                      border: '1px solid #38bdf8',
                    }}
                    muted
                    playsInline
                  />
                </div>
              )}

              {/* Quick Test Barcodes */}
              <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>Schnell-Scan (AT-Produkte):</span>
                {SAMPLE_BARCODES.map((b) => (
                  <button
                    key={b.code}
                    type="button"
                    onClick={() => {
                      setBarcodeInput(b.code);
                      void handleBarcodeLookup(b.code);
                    }}
                    style={{
                      background: '#1e293b',
                      border: '1px solid #334155',
                      color: '#cbd5e1',
                      borderRadius: 6,
                      padding: '3px 8px',
                      fontSize: 10,
                      cursor: 'pointer',
                    }}
                  >
                    ║▌║ {b.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
              {/* Scanned Ingredient Form */}
              <form onSubmit={handleSaveScannedIngredient}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 8 }}>
                  <div>
                    <label style={labelStyle}>Produkt / Zutatenname</label>
                    <input
                      value={scannedIngredient.name}
                      onChange={(e) =>
                        setScannedIngredient({ ...scannedIngredient, name: e.target.value })
                      }
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Marke / Hersteller</label>
                    <input
                      value={scannedIngredient.brand}
                      onChange={(e) =>
                        setScannedIngredient({ ...scannedIngredient, brand: e.target.value })
                      }
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  <div>
                    <label style={labelStyle}>Einheit</label>
                    <select
                      value={scannedIngredient.unit}
                      onChange={(e) =>
                        setScannedIngredient({
                          ...scannedIngredient,
                          unit: e.target.value as 'g' | 'ml' | 'Stk',
                        })
                      }
                      style={inputStyle}
                    >
                      <option value="g">Gramm (g)</option>
                      <option value="ml">Milliliter (ml)</option>
                      <option value="Stk">Stück (Stk)</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Packung ({scannedIngredient.unit})</label>
                    <input
                      type="number"
                      value={scannedIngredient.package_size}
                      onChange={(e) =>
                        setScannedIngredient({
                          ...scannedIngredient,
                          package_size: Number(e.target.value),
                        })
                      }
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, color: '#4ade80' }}>
                      🏠 Vorrat verfügbar ({scannedIngredient.unit})
                    </label>
                    <input
                      type="number"
                      value={scannedIngredient.available_amount}
                      onChange={(e) =>
                        setScannedIngredient({
                          ...scannedIngredient,
                          available_amount: Number(e.target.value),
                        })
                      }
                      style={{ ...inputStyle, borderColor: '#22c55e' }}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Nutri-Score</label>
                    <input
                      value={scannedIngredient.nutriscore}
                      onChange={(e) =>
                        setScannedIngredient({ ...scannedIngredient, nutriscore: e.target.value })
                      }
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>
                  Nährwerte pro 100{scannedIngredient.unit} (aus Barcode-API)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
                  <div>
                    <label style={labelStyle}>kcal</label>
                    <input
                      type="number"
                      value={scannedIngredient.calories_per_100}
                      onChange={(e) =>
                        setScannedIngredient({
                          ...scannedIngredient,
                          calories_per_100: Number(e.target.value),
                        })
                      }
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Protein</label>
                    <input
                      type="number"
                      step="0.1"
                      value={scannedIngredient.protein_per_100}
                      onChange={(e) =>
                        setScannedIngredient({
                          ...scannedIngredient,
                          protein_per_100: Number(e.target.value),
                        })
                      }
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>KH</label>
                    <input
                      type="number"
                      step="0.1"
                      value={scannedIngredient.carbs_per_100}
                      onChange={(e) =>
                        setScannedIngredient({
                          ...scannedIngredient,
                          carbs_per_100: Number(e.target.value),
                        })
                      }
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Fett</label>
                    <input
                      type="number"
                      step="0.1"
                      value={scannedIngredient.fat_per_100}
                      onChange={(e) =>
                        setScannedIngredient({
                          ...scannedIngredient,
                          fat_per_100: Number(e.target.value),
                        })
                      }
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Ballast.</label>
                    <input
                      type="number"
                      step="0.1"
                      value={scannedIngredient.fiber_per_100}
                      onChange={(e) =>
                        setScannedIngredient({
                          ...scannedIngredient,
                          fiber_per_100: Number(e.target.value),
                        })
                      }
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Zucker</label>
                    <input
                      type="number"
                      step="0.1"
                      value={scannedIngredient.sugar_per_100}
                      onChange={(e) =>
                        setScannedIngredient({
                          ...scannedIngredient,
                          sugar_per_100: Number(e.target.value),
                        })
                      }
                      style={inputStyle}
                    />
                  </div>
                </div>

                {/* Supermarket Pack Sizes & Prices */}
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>
                  Supermarkt-Packungsgrößen & Preise (Billa / Hofer / Spar)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  <div style={{ background: '#0f172a', padding: 8, borderRadius: 8, border: '1px solid #eab308' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#facc15', marginBottom: 4 }}>
                      🟨 BILLA
                    </div>
                    <label style={labelStyle}>Preis (€) / Packung ({scannedIngredient.unit})</label>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input
                        type="number"
                        step="0.01"
                        value={scannedIngredient.price_billa}
                        onChange={(e) =>
                          setScannedIngredient({
                            ...scannedIngredient,
                            price_billa: Number(e.target.value),
                          })
                        }
                        style={{ ...inputStyle, marginBottom: 0 }}
                      />
                      <input
                        type="number"
                        value={scannedIngredient.pack_billa}
                        onChange={(e) =>
                          setScannedIngredient({
                            ...scannedIngredient,
                            pack_billa: Number(e.target.value),
                          })
                        }
                        style={{ ...inputStyle, marginBottom: 0 }}
                      />
                    </div>
                  </div>

                  <div style={{ background: '#0f172a', padding: 8, borderRadius: 8, border: '1px solid #3b82f6' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#60a5fa', marginBottom: 4 }}>
                      🟦 HOFER
                    </div>
                    <label style={labelStyle}>Preis (€) / Packung ({scannedIngredient.unit})</label>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input
                        type="number"
                        step="0.01"
                        value={scannedIngredient.price_hofer}
                        onChange={(e) =>
                          setScannedIngredient({
                            ...scannedIngredient,
                            price_hofer: Number(e.target.value),
                          })
                        }
                        style={{ ...inputStyle, marginBottom: 0 }}
                      />
                      <input
                        type="number"
                        value={scannedIngredient.pack_hofer}
                        onChange={(e) =>
                          setScannedIngredient({
                            ...scannedIngredient,
                            pack_hofer: Number(e.target.value),
                          })
                        }
                        style={{ ...inputStyle, marginBottom: 0 }}
                      />
                    </div>
                  </div>

                  <div style={{ background: '#0f172a', padding: 8, borderRadius: 8, border: '1px solid #ef4444' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#f87171', marginBottom: 4 }}>
                      🟥 SPAR
                    </div>
                    <label style={labelStyle}>Preis (€) / Packung ({scannedIngredient.unit})</label>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input
                        type="number"
                        step="0.01"
                        value={scannedIngredient.price_spar}
                        onChange={(e) =>
                          setScannedIngredient({
                            ...scannedIngredient,
                            price_spar: Number(e.target.value),
                          })
                        }
                        style={{ ...inputStyle, marginBottom: 0 }}
                      />
                      <input
                        type="number"
                        value={scannedIngredient.pack_spar}
                        onChange={(e) =>
                          setScannedIngredient({
                            ...scannedIngredient,
                            pack_spar: Number(e.target.value),
                          })
                        }
                        style={{ ...inputStyle, marginBottom: 0 }}
                      />
                    </div>
                  </div>
                </div>

                <button type="submit" style={{ ...btnPrimary, width: '100%', marginTop: 12 }}>
                  Zutat & Vorratsmenge speichern
                </button>
              </form>

              {/* Existing Pantry & Ingredient Stock List */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 8 }}>
                  🏠 Vorratskammer & Verfügbare Zutatenmengen ({ingredientsCatalog.length})
                </div>
                <div
                  style={{
                    maxHeight: 390,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  {ingredientsCatalog.map((ing) => (
                    <div
                      key={ing.id}
                      style={{
                        background: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: 8,
                        padding: '8px 10px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#f8fafc' }}>
                          {ing.name}{' '}
                          <span style={{ fontSize: 10, color: '#64748b' }}>({ing.barcode})</span>
                        </div>
                        <div style={{ fontSize: 10, color: '#94a3b8' }}>
                          Billa €{ing.price_billa.toFixed(2)} ({ing.pack_billa}
                          {ing.unit}) • Hofer €{ing.price_hofer.toFixed(2)} ({ing.pack_hofer}
                          {ing.unit}) • Spar €{ing.price_spar.toFixed(2)} ({ing.pack_spar}
                          {ing.unit})
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>Vorrat:</span>
                        <input
                          type="number"
                          value={ing.available_amount}
                          onChange={async (e) => {
                            const val = Number(e.target.value || 0);
                            await api.post('/ingredients/stock', {
                              id: ing.id,
                              available_amount: val,
                            });
                            await loadAll();
                          }}
                          style={{
                            width: 65,
                            padding: '4px 6px',
                            borderRadius: 5,
                            border: '1px solid #22c55e',
                            background: '#0b1120',
                            color: '#4ade80',
                            fontWeight: 700,
                            fontSize: 11,
                          }}
                        />
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>{ing.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: USER-PROFIL ANPASSEN (WHO-ERNÄHRUNGSPROFIL & GEWICHTSZIEL) */}
      {activeModal === 'profile' && profile && (
        <div style={modalBackdrop} onClick={() => setActiveModal(null)}>
          <div style={modalContainer(680)} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeader}>
              <h3 style={{ margin: 0, color: '#38bdf8' }}>
                👤 User-Profil anpassen (WHO-Ernährungsprofil & Gewichtsziel)
              </h3>
              <button onClick={() => setActiveModal(null)} style={closeBtn}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProfile}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Name</label>
                  <input
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Alter</label>
                  <input
                    type="number"
                    value={profile.age}
                    onChange={(e) => setProfile({ ...profile, age: Number(e.target.value) })}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Größe (cm)</label>
                  <input
                    type="number"
                    value={profile.height_cm}
                    onChange={(e) => setProfile({ ...profile, height_cm: Number(e.target.value) })}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Geschlecht</label>
                  <select
                    value={profile.gender}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        gender: e.target.value as UserProfile['gender'],
                      })
                    }
                    style={inputStyle}
                  >
                    <option value="male">Männlich</option>
                    <option value="female">Weiblich</option>
                    <option value="diverse">Divers</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Aktuelles Gewicht (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={profile.current_weight_kg}
                    onChange={(e) =>
                      setProfile({ ...profile, current_weight_kg: Number(e.target.value) })
                    }
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ ...labelStyle, color: '#38bdf8', fontWeight: 700 }}>
                    🎯 Gewichtsziel (kg)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={profile.target_weight_kg}
                    onChange={(e) =>
                      setProfile({ ...profile, target_weight_kg: Number(e.target.value) })
                    }
                    style={{ ...inputStyle, borderColor: '#38bdf8' }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Wochenziel (kg/Woche)</label>
                  <select
                    value={String(profile.weekly_goal_kg)}
                    onChange={(e) =>
                      setProfile({ ...profile, weekly_goal_kg: Number(e.target.value) })
                    }
                    style={inputStyle}
                  >
                    <option value="-0.6">-0,6 kg/Woche (Intensives Defizit)</option>
                    <option value="-0.4">-0,4 kg/Woche (Gesundes Abnehmen)</option>
                    <option value="-0.25">-0,25 kg/Woche (Sanfte Reduktion)</option>
                    <option value="0">0,0 kg/Woche (Gewicht halten)</option>
                    <option value="0.25">+0,25 kg/Woche (Lean Muskelaufbau)</option>
                    <option value="0.5">+0,5 kg/Woche (Masseaufbau)</option>
                  </select>
                </div>
              </div>

              <label style={labelStyle}>Aktivitätslevel (PAL-Faktor)</label>
              <select
                value={profile.activity_level}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    activity_level: e.target.value as UserProfile['activity_level'],
                  })
                }
                style={inputStyle}
              >
                <option value="sedentary">Sitzend / Büroarbeit (PAL 1.2)</option>
                <option value="light">Leicht aktiv – 1–2x Sport/Woche (PAL 1.375)</option>
                <option value="moderate">Moderat aktiv – 3–4x Training/Woche (PAL 1.55)</option>
                <option value="active">Sehr aktiv – 5–6x Sport/Woche (PAL 1.725)</option>
                <option value="very_active">Leistungssport / Körperliche Arbeit (PAL 1.9)</option>
              </select>

              <label style={{ ...labelStyle, color: '#4ade80', fontWeight: 700 }}>
                🌍 WHO-Ernährungsprofil wählen
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                {(Object.keys(WHO_PROFILES) as Array<UserProfile['who_profile']>).map((key) => {
                  const p = WHO_PROFILES[key];
                  const active = profile.who_profile === key;
                  return (
                    <div
                      key={key}
                      onClick={() => setProfile({ ...profile, who_profile: key })}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 8,
                        background: active ? 'rgba(2, 132, 199, 0.2)' : '#0f172a',
                        border: active ? '1px solid #38bdf8' : '1px solid #334155',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#f8fafc' }}>
                        {active ? '🔘 ' : '⚪ '}
                        {p.label}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{p.desc}</div>
                    </div>
                  );
                })}
              </div>

              <button type="submit" style={{ ...btnPrimary, width: '100%' }}>
                WHO-Profil & Tagesziele berechnen und speichern
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: OPTIMIERUNGSOPTIONEN (MENGE AN ZUTATEN, VERSCHWENDUNG MINIMIEREN, ETC.) */}
      {activeModal === 'optimization' && optimization && (
        <div style={modalBackdrop} onClick={() => setActiveModal(null)}>
          <div style={modalContainer(680)} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeader}>
              <h3 style={{ margin: 0, color: '#38bdf8' }}>
                ⚙️ Optimierungsoptionen (Mengen-Kumulierung, Zero-Waste & Supermärkte)
              </h3>
              <button onClick={() => setActiveModal(null)} style={closeBtn}>
                ✕
              </button>
            </div>

            <label style={labelStyle}>Primäres Optimierungs-Ziel</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {(Object.keys(OPTIMIZATION_MODES) as Array<OptimizationOptions['mode']>).map((mKey) => {
                const m = OPTIMIZATION_MODES[mKey];
                const isSelected = optimization.mode === mKey;
                return (
                  <div
                    key={mKey}
                    onClick={() => handleUpdateOptimization({ mode: mKey })}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: isSelected ? 'rgba(251, 191, 36, 0.14)' : '#0f172a',
                      border: isSelected ? '1px solid #fbbf24' : '1px solid #334155',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#f8fafc' }}>
                      {isSelected ? '🔘 ' : '⚪ '}
                      {m.label}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{m.desc}</div>
                  </div>
                );
              })}
            </div>

            <div
              style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 8,
                padding: 12,
                marginBottom: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={optimization.use_pantry_stock}
                  onChange={(e) =>
                    handleUpdateOptimization({ use_pantry_stock: e.target.checked })
                  }
                />
                <span>
                  🏠 <strong>Verfügbare Zutatenmengen (Vorratskammer)</strong> vor dem Einkauf automatisch abziehen
                </span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={optimization.auto_accumulate_packages}
                  onChange={(e) =>
                    handleUpdateOptimization({ auto_accumulate_packages: e.target.checked })
                  }
                />
                <span>
                  📦 <strong>Packungsmengen über alle selektierten Mahlzeiten kumulieren</strong> (inkl. Gäste-Portionen)
                </span>
              </label>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>Aktive Supermarkt-APIs:</span>
                {(['billa', 'hofer', 'spar'] as Array<'billa' | 'hofer' | 'spar'>).map((store) => {
                  const checked = optimization.preferred_stores.includes(store);
                  return (
                    <label
                      key={store}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? optimization.preferred_stores.filter((s) => s !== store)
                            : [...optimization.preferred_stores, store];
                          if (next.length > 0) {
                            void handleUpdateOptimization({ preferred_stores: next });
                          }
                        }}
                      />
                      {store.toUpperCase()}
                    </label>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={handleAutoOptimizeWeek}
                style={{ ...btnPrimary, flex: 1, background: '#16a34a' }}
              >
                ✨ Ganze Woche automatisch auf minimale Verschwendung & Synergie optimieren
              </button>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                style={btnToolbar}
              >
                Fertig
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          4. UNTEN, VOLLE BREITE: STATUSLEISTE FÜR SELEKTION, KUMULIERUNG & SUPERMARKT-APIS (BILLA, HOFER, SPAR)
         ===================================================================== */}
      {supermarket && (
        <footer
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 50,
            background: 'rgba(15, 23, 42, 0.97)',
            backdropFilter: 'blur(12px)',
            borderTop: '2px solid #0284c7',
            boxShadow: '0 -8px 30px rgba(0,0,0,0.6)',
            padding: '10px 20px',
          }}
        >
          {/* Expandable Detailed Cumulative Ingredients & Store Comparison Drawer */}
          {statusDrawerOpen && (
            <div
              style={{
                maxHeight: 300,
                overflowY: 'auto',
                marginBottom: 12,
                paddingBottom: 12,
                borderBottom: '1px solid #334155',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <div>
                  <strong style={{ color: '#38bdf8', fontSize: 13 }}>
                    📦 Kumulierte Zutaten & Packungs-Optimierung ({supermarket.selectedMealsCount}{' '}
                    selektierte Mahlzeiten • {supermarket.totalPortions} Portionen inkl. Gäste)
                  </strong>
                  <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 10 }}>
                    Modus: {OPTIMIZATION_MODES[supermarket.optimizationMode].label}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => handleTransferToGroceryList('optimal')}
                    style={{ ...btnPrimary, padding: '5px 10px', fontSize: 11 }}
                  >
                    🛒 Optimalen Mix in Einkaufsliste & HA übertragen
                  </button>
                  <button
                    onClick={() => setStatusDrawerOpen(false)}
                    style={{ ...btnToolbar, padding: '5px 10px', fontSize: 11 }}
                  >
                    Details einklappen ▼
                  </button>
                </div>
              </div>

              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 11,
                  textAlign: 'left',
                }}
              >
                <thead>
                  <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                    <th style={{ padding: '6px 8px' }}>Kumulierte Zutat</th>
                    <th style={{ padding: '6px 8px' }}>Verwendet in</th>
                    <th style={{ padding: '6px 8px' }}>Gesamt-Bedarf</th>
                    <th style={{ padding: '6px 8px' }}>Aus Vorrat</th>
                    <th style={{ padding: '6px 8px' }}>Netto Einkauf</th>
                    <th style={{ padding: '6px 8px', color: '#facc15' }}>🟨 BILLA API</th>
                    <th style={{ padding: '6px 8px', color: '#60a5fa' }}>🟦 HOFER API</th>
                    <th style={{ padding: '6px 8px', color: '#f87171' }}>🟥 SPAR API</th>
                    <th style={{ padding: '6px 8px', color: '#4ade80' }}>♻️ Restmenge (Überschuss)</th>
                  </tr>
                </thead>
                <tbody>
                  {supermarket.cumulativeIngredients.map((item, idx) => (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: '1px solid #1e293b',
                        background: idx % 2 === 0 ? '#0b1322' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '6px 8px', fontWeight: 700, color: '#f8fafc' }}>
                        {item.name}
                        {item.mealOccurrences > 1 && (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: 9,
                              background: '#0369a1',
                              color: '#e0f2fe',
                              padding: '1px 5px',
                              borderRadius: 4,
                            }}
                          >
                            {item.mealOccurrences}x kumuliert
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '6px 8px', color: '#94a3b8', maxWidth: 220 }}>
                        {item.usedInMeals.join(', ')}
                      </td>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>
                        {item.grossRequired}
                        {item.unit}
                      </td>
                      <td style={{ padding: '6px 8px', color: '#4ade80' }}>
                        {item.pantryUsed > 0 ? `−${item.pantryUsed}${item.unit}` : '0'}
                      </td>
                      <td style={{ padding: '6px 8px', fontWeight: 700, color: '#38bdf8' }}>
                        {item.netToBuy}
                        {item.unit}
                      </td>
                      {(['billa', 'hofer', 'spar'] as Array<'billa' | 'hofer' | 'spar'>).map(
                        (st) => {
                          const off = item.offers[st];
                          const isRec = item.recommendedStore === st;
                          return (
                            <td
                              key={st}
                              style={{
                                padding: '6px 8px',
                                background: isRec ? 'rgba(34, 197, 94, 0.12)' : 'transparent',
                                borderLeft: isRec ? '2px solid #22c55e' : 'none',
                              }}
                            >
                              {off.packsNeeded === 0 ? (
                                <span style={{ color: '#4ade80' }}>Im Vorrat gedeckt</span>
                              ) : (
                                <>
                                  <strong>
                                    {off.packsNeeded}x {off.packSize}
                                    {item.unit}
                                  </strong>{' '}
                                  = €{off.totalPrice.toFixed(2)}
                                </>
                              )}
                            </td>
                          );
                        }
                      )}
                      <td style={{ padding: '6px 8px', color: '#fbbf24', fontWeight: 600 }}>
                        +{item.recommendedOffer.surplusAmount}
                        {item.unit} Rest
                        {item.wasteSavedByAccumulation > 0 && (
                          <span style={{ color: '#4ade80', marginLeft: 4 }}>
                            ({item.wasteSavedByAccumulation}
                            {item.unit} gespart)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Always-Visible Compact Status Bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            {/* Left: Selection & Accumulation Summary */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div
                style={{
                  background: '#0284c7',
                  color: '#fff',
                  padding: '5px 10px',
                  borderRadius: 8,
                  fontWeight: 800,
                  fontSize: 12,
                }}
              >
                ☑️ {supermarket.selectedMealsCount} Mahlzeiten ({supermarket.totalPortions} Port.)
              </div>

              <div style={{ fontSize: 12, color: '#cbd5e1' }}>
                📦 <strong>{supermarket.uniqueIngredientsCount}</strong> Zutaten kumuliert (
                <span style={{ color: '#38bdf8' }}>
                  {supermarket.multiUseIngredientsCount}x mehrfach genutzt
                </span>
                ) • 🏠 Vorrat genutzt: <strong style={{ color: '#4ade80' }}>{supermarket.totalPantryUsed}g</strong>{' '}
                • ♻️ Verpackungs-Effizienz:{' '}
                <strong style={{ color: '#4ade80' }}>{supermarket.optimalMix.efficiencyPct}%</strong>{' '}
                <span style={{ color: '#94a3b8', fontSize: 11 }}>
                  (−{supermarket.totalWasteSavedByAccumulation}g Überschuss durch Kumulierung gespart)
                </span>
              </div>
            </div>

            {/* Center/Right: Live Supermarket API Results (Billa, Hofer, Spar) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div
                style={storeStatusBadge(
                  '#eab308',
                  supermarket.optimalMix.bestSingleStore === 'billa'
                )}
              >
                🟨 <strong>BILLA:</strong> €{supermarket.stores.billa.totalPrice.toFixed(2)}{' '}
                <span style={{ fontSize: 10, color: '#cbd5e1' }}>
                  (Rest: {supermarket.stores.billa.totalSurplus}g)
                </span>
              </div>

              <div
                style={storeStatusBadge(
                  '#3b82f6',
                  supermarket.optimalMix.bestSingleStore === 'hofer'
                )}
              >
                🟦 <strong>HOFER:</strong> €{supermarket.stores.hofer.totalPrice.toFixed(2)}{' '}
                <span style={{ fontSize: 10, color: '#cbd5e1' }}>
                  (Rest: {supermarket.stores.hofer.totalSurplus}g)
                </span>
              </div>

              <div
                style={storeStatusBadge(
                  '#ef4444',
                  supermarket.optimalMix.bestSingleStore === 'spar'
                )}
              >
                🟥 <strong>SPAR:</strong> €{supermarket.stores.spar.totalPrice.toFixed(2)}{' '}
                <span style={{ fontSize: 10, color: '#cbd5e1' }}>
                  (Rest: {supermarket.stores.spar.totalSurplus}g)
                </span>
              </div>

              <div
                style={{
                  background: 'rgba(34, 197, 94, 0.16)',
                  border: '1px solid #22c55e',
                  color: '#86efac',
                  padding: '5px 10px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                🏆 Optimal-Mix: €{supermarket.optimalMix.totalPrice.toFixed(2)} (Rest:{' '}
                {supermarket.optimalMix.totalSurplus}g)
              </div>

              <button
                onClick={() => setStatusDrawerOpen(!statusDrawerOpen)}
                style={{
                  ...btnToolbar,
                  padding: '6px 12px',
                  borderColor: '#38bdf8',
                  color: '#38bdf8',
                }}
              >
                {statusDrawerOpen ? '▼ Kumulierung ausblenden' : '▲ Kumulierte Zutaten & Preise'}
              </button>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}

const toolbarIconBtn: React.CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  color: '#e2e8f0',
  borderRadius: 6,
  padding: '4px 8px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};

const btnToolbar: React.CSSProperties = {
  padding: '7px 12px',
  borderRadius: 9,
  border: '1px solid #334155',
  background: '#1e293b',
  color: '#f8fafc',
  fontWeight: 600,
  fontSize: 12,
  cursor: 'pointer',
};

const btnToolbarActive: React.CSSProperties = {
  ...btnToolbar,
  background: '#0284c7',
  borderColor: '#38bdf8',
  color: '#fff',
};

const btnPrimary: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: 'none',
  background: '#0284c7',
  color: '#fff',
  fontWeight: 700,
  fontSize: 12,
  cursor: 'pointer',
};

const mealActionBtn: React.CSSProperties = {
  background: '#162238',
  border: '1px solid #26354d',
  color: '#cbd5e1',
  borderRadius: 5,
  padding: '3px 6px',
  fontSize: 10,
  fontWeight: 600,
  cursor: 'pointer',
};

function macroPill(bg: string, fg: string): React.CSSProperties {
  return {
    background: bg,
    color: fg,
    padding: '1px 5px',
    borderRadius: 4,
    fontWeight: 600,
    fontSize: 9.5,
  };
}

function storeStatusBadge(borderColor: string, isBest: boolean): React.CSSProperties {
  return {
    background: isBest ? 'rgba(56, 189, 248, 0.14)' : '#0f172a',
    border: `1px solid ${borderColor}`,
    color: '#f8fafc',
    padding: '5px 9px',
    borderRadius: 8,
    fontSize: 12,
  };
}

const modalBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(2, 6, 23, 0.78)',
  backdropFilter: 'blur(4px)',
  zIndex: 80,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
};

function modalContainer(maxWidth: number): React.CSSProperties {
  return {
    width: '100%',
    maxWidth,
    maxHeight: '90vh',
    overflowY: 'auto',
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: 14,
    padding: 20,
    boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
  };
}

const modalHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 14,
  paddingBottom: 10,
  borderBottom: '1px solid #334155',
};

const closeBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #475569',
  color: '#cbd5e1',
  borderRadius: 6,
  padding: '4px 9px',
  cursor: 'pointer',
  fontWeight: 700,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  color: '#94a3b8',
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '7px 10px',
  borderRadius: 6,
  border: '1px solid #334155',
  background: '#0f172a',
  color: '#f8fafc',
  fontSize: 12,
  marginBottom: 10,
};
