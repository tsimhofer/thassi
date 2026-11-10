import React, { useEffect, useRef, useState } from 'react';
import { createAppClient } from '@thassi/sdk/client';

const api = createAppClient('meal-planner');

type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
type ActiveTab = 'day' | 'week' | 'groceries' | 'catalog' | 'profile';

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
  who_profile:
    | 'who_standard'
    | 'who_mediterranean'
    | 'who_high_protein'
    | 'who_plant_based'
    | 'who_metabolic';
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

const SLOTS: Array<{ key: MealSlot; label: string; code: string }> = [
  { key: 'breakfast', label: 'Frühstück', code: 'SLOT 01' },
  { key: 'lunch', label: 'Mittagessen', code: 'SLOT 02' },
  { key: 'dinner', label: 'Abendessen', code: 'SLOT 03' },
  { key: 'snack', label: 'Snack', code: 'SLOT 04' },
];

const DAY_NAMES_DE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const DAY_SHORT_DE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const WHO_PROFILES: Record<
  UserProfile['who_profile'],
  { code: string; label: string; desc: string }
> = {
  who_standard: {
    code: 'WHO-STD',
    label: 'WHO Standard-Richtlinie',
    desc: '<10% freier Zucker, <30% Fett, >=25g Ballaststoffe, >=400g Obst & Gemüse/Tag',
  },
  who_high_protein: {
    code: 'WHO-PRO',
    label: 'WHO High-Protein & Muskelerhalt',
    desc: 'Erhöhter Proteinanteil (27%), <7% freier Zucker, >=30g Ballaststoffe – ideal bei Gewichtsreduktion',
  },
  who_mediterranean: {
    code: 'WHO-MED',
    label: 'WHO Mediterran & Kardioprotektiv',
    desc: 'Fokus auf ungesättigte Fette (Olivenöl, Nüsse, Omega-3), >=32g Ballaststoffe, wenig Zucker',
  },
  who_plant_based: {
    code: 'WHO-PLT',
    label: 'WHO Pflanzlich / Whole-Food',
    desc: 'Hülsenfrüchte, Vollkorn & Samen, >=38g Ballaststoffe, hohe Mikronährstoffdichte',
  },
  who_metabolic: {
    code: 'WHO-MET',
    label: 'WHO Metabolisch / Blutzucker-Optimal',
    desc: 'Strenges WHO-Zuckerlimit (<5% kcal), moderat Low-Carb (38%), >=35g Ballaststoffe',
  },
};

const OPTIMIZATION_MODES: Record<
  OptimizationOptions['mode'],
  { code: string; label: string; desc: string }
> = {
  waste_min: {
    code: 'WASTE-MIN',
    label: 'Verschwendung minimieren (Zero-Waste)',
    desc: 'Kumuliert alle Zutaten der Auswahl, zieht Vorräte ab und wählt Packungsgrößen (Billa/Hofer/Spar) mit minimalem Restüberschuss.',
  },
  ingredient_min: {
    code: 'SYNERGY',
    label: 'Menge an Zutaten bündeln (Synergie)',
    desc: 'Minimiert die Anzahl unterschiedlicher Zutaten über die Woche durch Rezept-Synergien und Mehrfachverwendung.',
  },
  price_min: {
    code: 'BEST-PRICE',
    label: 'Günstigster Preis (Bestpreis-Mix)',
    desc: 'Wählt für jede kumulierte Zutat das günstigste Angebot zwischen Billa, Hofer und Spar.',
  },
  balanced: {
    code: 'BALANCED',
    label: 'Ausgewogen (Preis & Packungs-Effizienz)',
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

function formatFullDateDE(dateStr: string): string {
  if (!dateStr || dateStr.length < 10) return dateStr;
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}

function formatTimeDE(isoOrDate: Date): string {
  return isoOrDate.toLocaleTimeString('de-AT', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('day');
  const [weekStart, setWeekStart] = useState<string>('');
  const [weekEnd, setWeekEnd] = useState<string>('');
  const [days, setDays] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [waterLogs, setWaterLogs] = useState<WaterLogEntry[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredientsCatalog, setIngredientsCatalog] = useState<IngredientCatalogItem[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [optimization, setOptimization] = useState<OptimizationOptions | null>(null);
  const [supermarket, setSupermarket] = useState<SupermarketOptimizationResult | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [queryingApi, setQueryingApi] = useState<boolean>(false);
  const [lastSyncAt, setLastSyncAt] = useState<string>('—');

  // Collapsible ingredients per meal entry (`${dayStr}_${slot}`)
  const [expandedMealIngredients, setExpandedMealIngredients] = useState<Record<string, boolean>>(
    {}
  );

  // Slot inspector / assignment target (`day` or `week` tab)
  const [chooseTarget, setChooseTarget] = useState<{ dayStr: string; slot: MealSlot } | null>(null);
  const [chooseSearch, setChooseSearch] = useState<string>('');
  const [chooseFilterSlot, setChooseFilterSlot] = useState<string>('all');
  const [customTitleInput, setCustomTitleInput] = useState<string>('');
  const [customKcalInput, setCustomKcalInput] = useState<string>('500');
  const [customProtInput, setCustomProtInput] = useState<string>('30');

  // Catalog sub-states
  const [showNewRecipeForm, setShowNewRecipeForm] = useState<boolean>(false);
  const [showIngredientForm, setShowIngredientForm] = useState<boolean>(false);
  const [recipeSearch, setRecipeSearch] = useState<string>('');
  const [recipeSlotFilter, setRecipeSlotFilter] = useState<string>('all');
  const [ingredientSearch, setIngredientSearch] = useState<string>('');

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
    setTimeout(() => setToast(null), 4000);
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
    setLastSyncAt(formatTimeDE(new Date()));

    const todayIso = new Date().toISOString().slice(0, 10);
    if (weekRes.days.length > 0) {
      setSelectedDate((prev) => {
        if (weekRes.days.includes(prev)) return prev;
        if (weekRes.days.includes(todayIso)) return todayIso;
        return weekRes.days[0];
      });
    }
  };

  useEffect(() => {
    void loadAll('');
  }, []);

  useEffect(() => {
    if (activeTab !== 'catalog' && cameraActive) {
      stopCameraScanner();
    }
  }, [activeTab]);

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
      const BarcodeDetectorCtor = (
        window as unknown as {
          BarcodeDetector?: new (opts: { formats: string[] }) => {
            detect: (el: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
          };
        }
      ).BarcodeDetector;
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
      notify('Kamera-Zugriff nicht verfügbar – bitte EAN-Code direkt eingeben.');
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
      setShowIngredientForm(true);
      const sourceLabel =
        res.source === 'openfoodfacts_live_api'
          ? 'OpenFoodFacts Live-API + AT-Marktabgleich'
          : res.source === 'austrian_supermarket_api'
            ? 'Österreichischer Supermarkt-Katalog (Billa/Hofer/Spar)'
            : res.source === 'local_catalog'
              ? 'Lokale Vorrats-Datenbank'
              : 'EAN-Parser';
      setBarcodeSourceInfo(`Quelle: ${sourceLabel}`);
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
    notify(
      `Zutat "${scannedIngredient.name}" (${scannedIngredient.available_amount}${scannedIngredient.unit} Vorrat) gespeichert.`
    );
    setShowIngredientForm(false);
    await loadAll();
  };

  const shiftWeek = async (deltaDays: number) => {
    if (!weekStart) return;
    const d = new Date(`${weekStart}T12:00:00`);
    d.setDate(d.getDate() + deltaDays);
    const nextStart = d.toISOString().slice(0, 10);
    await loadAll(nextStart);
  };

  const handleRandomizeSlot = async (
    dayStr: string,
    slot: MealSlot,
    currentRecipeId?: number | null
  ) => {
    const res = await api.post<{ chosen: Recipe }>('/plan/randomize', {
      plan_date: dayStr,
      slot,
      current_recipe_id: currentRecipeId,
    });
    notify(`${res.chosen.name} für ${formatShortDateDE(dayStr)} (${slot}) zugewiesen.`);
    await loadAll();
  };

  const handleAssignRecipeToSlot = async (
    recipe: Recipe,
    targetOverride?: { dayStr: string; slot: MealSlot }
  ) => {
    const target = targetOverride || chooseTarget;
    if (!target) return;
    await api.post('/plan', {
      plan_date: target.dayStr,
      slot: target.slot,
      recipe_id: recipe.id,
      selected: 1,
    });
    notify(`"${recipe.name}" für ${formatShortDateDE(target.dayStr)} eingeplant.`);
    setChooseTarget(null);
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
    setChooseTarget(null);
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
          ? 'Alle Mahlzeiten der Woche selektiert – Supermarkt-Optimierung aktualisiert.'
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
      setLastSyncAt(formatTimeDE(new Date()));
      notify(
        `Supermarkt-API Abfrage (Billa, Hofer, Spar) für ${res.selectedMealsCount} Mahlzeiten (${res.totalPortions} Portionen) abgeschlossen.`
      );
    } finally {
      setQueryingApi(false);
    }
  };

  const handleSyncHa = async () => {
    setQueryingApi(true);
    try {
      await api.post('/sync-ha');
      setLastSyncAt(formatTimeDE(new Date()));
      notify('Home Assistant Sensoren & Einkaufsliste synchronisiert.');
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
    setShowNewRecipeForm(false);
    notify(`Rezept "${recName}" gespeichert.`);
    await loadAll();
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    const res = await api.post<{ profile: UserProfile }>('/profile', profile);
    setProfile(res.profile);
    notify(
      `WHO-Profil aktualisiert: Ziel ${res.profile.target_calories} kcal/Tag · ${res.profile.target_protein_g}g Protein (${res.profile.target_weight_kg} kg Zielgewicht)`
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
    setQueryingApi(true);
    try {
      await api.post('/optimize-week', { weekStart });
      notify('Wochenplan wurde auf minimale Verschwendung, Zutaten-Synergie & WHO-Makros optimiert.');
      await loadAll();
    } finally {
      setQueryingApi(false);
    }
  };

  const handleTransferToGroceryList = async (storePref: 'optimal' | 'billa' | 'hofer' | 'spar') => {
    setQueryingApi(true);
    try {
      const selectedIds = entries.filter((e) => e.selected === 1).map((e) => e.id);
      const res = await api.post<{ addedCount: number }>('/groceries/from-optimization', {
        mealIds: selectedIds,
        storePreference: storePref,
      });
      await api.post('/sync-ha');
      setLastSyncAt(formatTimeDE(new Date()));
      notify(
        `${res.addedCount} kumulierte Supermarkt-Packungen (${storePref.toUpperCase()}) an Home Assistant übertragen.`
      );
    } finally {
      setQueryingApi(false);
    }
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

  // Selected Day Calculations
  const activeDayStr = selectedDate || days[0] || new Date().toISOString().slice(0, 10);
  const activeDayIdx = Math.max(0, days.indexOf(activeDayStr));
  const selectedDayEntries = entries.filter((e) => e.plan_date === activeDayStr);
  const selectedWaterEntry = waterLogs.find((w) => w.plan_date === activeDayStr);
  const selectedWaterMl = selectedWaterEntry ? selectedWaterEntry.amount_ml : 1750;
  const waterTargetMl = activeProfile.target_water_ml || 2800;

  const selectedDayKcal = selectedDayEntries.reduce((s, e) => s + (e.calories || 0), 0);
  const selectedDayProt = selectedDayEntries.reduce((s, e) => s + (e.protein_g || 0), 0);
  const selectedDayCarbs = selectedDayEntries.reduce((s, e) => s + (e.carbs_g || 0), 0);
  const selectedDayFat = selectedDayEntries.reduce((s, e) => s + (e.fat_g || 0), 0);
  const selectedDayFiber = selectedDayEntries.reduce((s, e) => s + (e.fiber_g || 0), 0);
  const selectedDaySugar = selectedDayEntries.reduce((s, e) => s + (e.sugar_g || 0), 0);

  // User Input / Action Required Evaluation for Selected Day & Week
  const missingMainSlots = (['breakfast', 'lunch', 'dinner'] as MealSlot[]).filter(
    (s) => !selectedDayEntries.some((e) => e.slot === s)
  );
  const missingSlotLabels = missingMainSlots.map(
    (s) => SLOTS.find((item) => item.key === s)?.label || s
  );
  const waterDeficitMl = Math.max(0, waterTargetMl - selectedWaterMl);
  const proteinDeficitG = Math.max(0, activeProfile.target_protein_g - selectedDayProt);
  const netItemsToBuyCount =
    supermarket?.cumulativeIngredients.filter((i) => i.netToBuy > 0).length || 0;

  const actionItems: string[] = [];
  if (missingSlotLabels.length > 0) {
    actionItems.push(`Offene Mahlzeiten (${formatShortDateDE(activeDayStr)}): ${missingSlotLabels.join(', ')}`);
  }
  if (waterDeficitMl >= 500) {
    actionItems.push(`Hydration: noch ${waterDeficitMl} ml bis Tagesziel (${waterTargetMl} ml)`);
  }
  if (selectedDayEntries.length > 0 && proteinDeficitG > 20) {
    actionItems.push(`Protein: ${selectedDayProt}g / ${activeProfile.target_protein_g}g (−${proteinDeficitG}g offen)`);
  }
  if (netItemsToBuyCount > 0) {
    actionItems.push(`Einkauf: ${netItemsToBuyCount} Netto-Zutaten für ${selectedCount} Mahlzeiten offen`);
  }

  const requiresAttention = missingSlotLabels.length > 0 || waterDeficitMl >= 500;

  // Nutritional assessment hints for the selected day
  const dayHints: Array<{ status: 'ok' | 'warn' | 'err'; domain: string; text: string }> = [];
  const kcalDiff = selectedDayKcal - activeProfile.target_calories;
  if (selectedDayEntries.length === 0) {
    dayHints.push({
      status: 'warn',
      domain: 'PLAN',
      text: 'Noch keine Mahlzeiten für diesen Tag eingeplant.',
    });
  } else {
    if (Math.abs(kcalDiff) <= 180) {
      dayHints.push({
        status: 'ok',
        domain: 'KCAL',
        text: `Kalorienziel für Zielgewicht (${activeProfile.target_weight_kg} kg) erreicht (${selectedDayKcal} / ${activeProfile.target_calories} kcal).`,
      });
    } else if (kcalDiff > 180) {
      dayHints.push({
        status: 'warn',
        domain: 'KCAL',
        text: `+${kcalDiff} kcal über Tagesziel (${activeProfile.target_calories} kcal).`,
      });
    } else {
      dayHints.push({
        status: 'warn',
        domain: 'KCAL',
        text: `${Math.abs(kcalDiff)} kcal unter Tagesziel (${activeProfile.target_calories} kcal).`,
      });
    }

    if (selectedDayProt >= activeProfile.target_protein_g * 0.9) {
      dayHints.push({
        status: 'ok',
        domain: 'PROT',
        text: `WHO-Proteinziel erreicht (${selectedDayProt}g / ${activeProfile.target_protein_g}g).`,
      });
    } else {
      dayHints.push({
        status: 'warn',
        domain: 'PROT',
        text: `Protein unter Richtwert (${selectedDayProt}g / ${activeProfile.target_protein_g}g).`,
      });
    }

    if (selectedDayFiber >= activeProfile.target_fiber_g) {
      dayHints.push({
        status: 'ok',
        domain: 'FIBER',
        text: `Ballaststoffe WHO-konform (${selectedDayFiber}g >= ${activeProfile.target_fiber_g}g).`,
      });
    } else {
      dayHints.push({
        status: 'warn',
        domain: 'FIBER',
        text: `Ballaststoffe (${selectedDayFiber}g / ${activeProfile.target_fiber_g}g) unter WHO-Zielwert.`,
      });
    }

    if (selectedDaySugar > activeProfile.max_sugar_g) {
      dayHints.push({
        status: 'err',
        domain: 'SUGAR',
        text: `Zucker (${selectedDaySugar}g) überschreitet WHO-Obergrenze (<${activeProfile.max_sugar_g}g).`,
      });
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-canvas)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-sans)',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <div
        style={{
          maxWidth: 1440,
          margin: '0 auto',
          padding: '32px 48px 64px',
        }}
      >
        {/* ===================================================================
            1. HEADER ZONE (System Summary + Data Freshness + HA Sync)
           =================================================================== */}
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            flexWrap: 'wrap',
            gap: 16,
            paddingBottom: 16,
            borderBottom: '1px solid var(--line-hairline)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
            <h1
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 500,
                letterSpacing: '-0.025em',
                color: 'var(--text-primary)',
              }}
            >
              Meal Planner
            </h1>
            <span
              style={{
                fontSize: 13,
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              KW {kwNumber} ({formatShortDateDE(weekStart)}–{formatFullDateDE(weekEnd)}) ·{' '}
              {WHO_PROFILES[activeProfile.who_profile].code} · {recipes.length} Rezepte ·{' '}
              {ingredientsCatalog.length} Vorrats-Artikel
            </span>
          </div>

          {/* Right: Explicit Data Recency, Active Plan Date, HA Sync */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-secondary)',
              }}
            >
              <span style={statusDot(queryingApi ? '#f59e0b' : '#10b981')} />
              <span>Stand: {lastSyncAt}</span>
              <span style={{ color: 'var(--text-muted)' }}>|</span>
              <span>Fokus: {formatFullDateDE(activeDayStr)}</span>
            </div>

            <button
              type="button"
              onClick={() => void loadAll()}
              style={btnGhost}
              title="Daten neu laden"
            >
              Aktualisieren
            </button>

            <button
              type="button"
              onClick={() => void handleSyncHa()}
              style={btnGhost}
              title="Mit Home Assistant synchronisieren"
            >
              HA Sync
            </button>
          </div>
        </header>

        {/* ===================================================================
            2. EXPLICIT USER INPUT / ACTION REQUIRED BANNER
           =================================================================== */}
        <section
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
            padding: '12px 0',
            borderBottom: '1px solid var(--line-hairline)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={statusDot(requiresAttention ? '#f59e0b' : '#10b981')} />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: requiresAttention ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              {requiresAttention ? 'EINGABE ERFORDERLICH' : 'TAGESPLAN VOLLSTÄNDIG'}
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {actionItems.length > 0
                ? actionItems.join(' · ')
                : `Alle Hauptmahlzeiten und Hydration für ${formatFullDateDE(activeDayStr)} sind im Zielbereich.`}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => void handleAutoOptimizeWeek()}
              style={btnPrimary}
            >
              Woche automatisch planen
            </button>
            <button
              type="button"
              onClick={() => void handleAdjustWater(activeDayStr, 250)}
              style={btnGhost}
            >
              +250ml Wasser
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('week')}
              style={btnGhost}
            >
              Zum Wochenplan
            </button>
          </div>
        </section>

        {/* Toast Status Line (if active) */}
        {toast && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              background: 'var(--bg-elevated)',
              borderBottom: '1px solid var(--line-focus)',
              fontSize: 12.5,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-primary)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={statusDot('#10b981')} />
              <span>{toast}</span>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: 11,
              }}
            >
              Schließen
            </button>
          </div>
        )}

        {/* ===================================================================
            3. TOP 4-COLUMN HAIRLINE KPI STRIP (Selected Day & Week Status)
           =================================================================== */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(200px, 1fr))',
            borderBottom: '1px solid var(--line-hairline)',
          }}
        >
          {/* KPI 1: KALORIEN (HEUTE / ZIEL) */}
          <div
            style={{
              padding: '20px 24px 20px 0',
              borderRight: '1px solid var(--line-hairline)',
            }}
          >
            <div style={sectionLabelStyle}>
              KALORIEN ({formatShortDateDE(activeDayStr)} / ZIEL)
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 8,
                marginTop: 8,
              }}
            >
              <span style={heroMetricStyle}>{selectedDayKcal}</span>
              <span
                style={{
                  fontSize: 14,
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                / {activeProfile.target_calories} kcal
              </span>
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span
                style={statusDot(
                  selectedDayEntries.length === 0
                    ? '#f59e0b'
                    : Math.abs(kcalDiff) <= 200
                      ? '#10b981'
                      : '#f59e0b'
                )}
              />
              <span>
                {kcalDiff >= 0 ? `+${kcalDiff}` : kcalDiff} kcal Differenz · Zielgewicht{' '}
                {activeProfile.target_weight_kg} kg
              </span>
            </div>
          </div>

          {/* KPI 2: MAKROS (PROTEIN / KH / FETT) */}
          <div
            style={{
              padding: '20px 24px',
              borderRight: '1px solid var(--line-hairline)',
            }}
          >
            <div style={sectionLabelStyle}>MAKROS (PROTEIN / KH / FETT)</div>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 10,
                marginTop: 8,
              }}
            >
              <span style={heroMetricStyle}>{selectedDayProt}g</span>
              <span
                style={{
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                P · {selectedDayCarbs}g KH · {selectedDayFat}g F
              </span>
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span
                style={statusDot(
                  selectedDayProt >= activeProfile.target_protein_g * 0.9 ? '#10b981' : '#f59e0b'
                )}
              />
              <span>
                Ziel {activeProfile.target_protein_g}g P · Ballastst. {selectedDayFiber}/
                {activeProfile.target_fiber_g}g · Zucker {selectedDaySugar}g
              </span>
            </div>
          </div>

          {/* KPI 3: HYDRATION (WASSER) */}
          <div
            style={{
              padding: '20px 24px',
              borderRight: '1px solid var(--line-hairline)',
            }}
          >
            <div style={sectionLabelStyle}>HYDRATION (WASSER)</div>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 8,
                marginTop: 8,
              }}
            >
              <span style={heroMetricStyle}>{(selectedWaterMl / 1000).toFixed(2)}</span>
              <span
                style={{
                  fontSize: 14,
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                / {(waterTargetMl / 1000).toFixed(1)} L ({selectedWaterMl} ml)
              </span>
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span
                style={statusDot(selectedWaterMl >= waterTargetMl * 0.8 ? '#10b981' : '#f59e0b')}
              />
              <span>
                {Math.round((selectedWaterMl / Math.max(1, waterTargetMl)) * 100)}% vom Tagesziel
              </span>
            </div>
          </div>

          {/* KPI 4: WOCHENPLAN & EINKAUF */}
          <div
            style={{
              padding: '20px 0 20px 24px',
            }}
          >
            <div style={sectionLabelStyle}>WOCHENPLAN & EINKAUF</div>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 8,
                marginTop: 8,
              }}
            >
              <span style={heroMetricStyle}>
                {supermarket ? `€${supermarket.optimalMix.totalPrice.toFixed(2)}` : '—'}
              </span>
              <span
                style={{
                  fontSize: 13,
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                Optimal-Mix ({supermarket?.optimalMix.efficiencyPct ?? 100}% Eff.)
              </span>
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={statusDot(selectedCount > 0 ? '#10b981' : '#f59e0b')} />
              <span>
                {selectedCount} Mahlzeiten selektiert · {netItemsToBuyCount} Einkaufs-Positionen
              </span>
            </div>
          </div>
        </section>

        {/* ===================================================================
            4. CLEAN TEXT-LINK TABS (DESIGN.md Section 5.3)
           =================================================================== */}
        <nav
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            borderBottom: '1px solid var(--line-hairline)',
            marginBottom: 24,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            {(
              [
                { id: 'day', label: 'Tagesplan & Hydration' },
                { id: 'week', label: 'Wochenplan & Optimizer' },
                { id: 'groceries', label: 'Einkauf & Supermarkt-Preise' },
                {
                  id: 'catalog',
                  label: `Rezepte & Vorrat (${recipes.length} / ${ingredientsCatalog.length})`,
                },
                { id: 'profile', label: 'Profil & WHO-Ziele' },
              ] as Array<{ id: ActiveTab; label: string }>
            ).map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    borderBottom: active ? '1px solid var(--text-primary)' : '1px solid transparent',
                    marginBottom: -1,
                    padding: '14px 0',
                    fontSize: 13.5,
                    fontWeight: 500,
                    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Compact Week Switcher always accessible on the tab bar right */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
            <button type="button" onClick={() => void shiftWeek(-7)} style={btnGhostSm}>
              &lt; KW −1
            </button>
            <button
              type="button"
              onClick={() => {
                void loadAll('');
                setSelectedDate(new Date().toISOString().slice(0, 10));
              }}
              style={btnGhostSm}
            >
              Heute
            </button>
            <button type="button" onClick={() => void shiftWeek(7)} style={btnGhostSm}>
              KW +1 &gt;
            </button>
          </div>
        </nav>

        {/* ===================================================================
            TAB 1: TAGESPLAN & HYDRATION
           =================================================================== */}
        {activeTab === 'day' && (
          <div>
            {/* Day Strip across the 7 days of current week */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                borderBottom: '1px solid var(--line-hairline)',
                marginBottom: 24,
              }}
            >
              {days.map((dStr, idx) => {
                const isSelected = dStr === activeDayStr;
                const isToday = dStr === new Date().toISOString().slice(0, 10);
                const dEntries = entries.filter((e) => e.plan_date === dStr);
                const dKcal = dEntries.reduce((s, e) => s + (e.calories || 0), 0);
                const mainCount = (['breakfast', 'lunch', 'dinner'] as MealSlot[]).filter((s) =>
                  dEntries.some((e) => e.slot === s)
                ).length;

                return (
                  <button
                    key={dStr}
                    type="button"
                    onClick={() => setSelectedDate(dStr)}
                    style={{
                      background: isSelected ? 'var(--bg-elevated)' : 'transparent',
                      border: 'none',
                      borderBottom: isSelected
                        ? '1px solid var(--text-primary)'
                        : '1px solid transparent',
                      borderRight: idx < 6 ? '1px solid var(--line-hairline)' : 'none',
                      padding: '12px 14px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      color: 'var(--text-primary)',
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
                          fontSize: 12.5,
                          fontWeight: 500,
                          color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                        }}
                      >
                        {DAY_SHORT_DE[idx]} {formatShortDateDE(dStr)}
                      </span>
                      <span
                        style={statusDot(
                          mainCount === 3 ? '#10b981' : mainCount > 0 ? '#f59e0b' : '#ef4444'
                        )}
                      />
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11.5,
                        color: 'var(--text-muted)',
                      }}
                    >
                      {dKcal} kcal · {mainCount}/3 Slots{isToday ? ' · HEUTE' : ''}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Master-Detail Split: Left = 4 Meal Slots + Hydration; Right = Inspector / Recipe Picker */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: chooseTarget ? '1.35fr 1fr' : '1fr',
                gap: 32,
                alignItems: 'start',
              }}
            >
              {/* Left Main Area */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingBottom: 12,
                    borderBottom: '1px solid var(--line-hairline)',
                  }}
                >
                  <div>
                    <span style={sectionLabelStyle}>
                      TAGESPLAN · {DAY_NAMES_DE[activeDayIdx]?.toUpperCase()} (
                      {formatFullDateDE(activeDayStr)})
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => {
                        const allSelected =
                          selectedDayEntries.length > 0 &&
                          selectedDayEntries.every((e) => e.selected === 1);
                        void handleSelectDayMeals(activeDayStr, !allSelected);
                      }}
                      style={btnGhostSm}
                    >
                      Tag für Einkauf umschalten
                    </button>
                  </div>
                </div>

                {/* 4 Hairline Rows for Meal Slots */}
                <div>
                  {SLOTS.map(({ key: slot, label: slotLabel, code: slotCode }) => {
                    const entry = selectedDayEntries.find((e) => e.slot === slot);
                    const cardKey = `${activeDayStr}_${slot}`;
                    const isExpanded = !!expandedMealIngredients[cardKey];
                    const isSelected = entry?.selected === 1;
                    const guests = entry?.guest_portions || 0;
                    const totalPortions = 1 + guests;
                    const ingList = entry ? getRecipeIngredientsForEntry(entry) : [];
                    const isAssigningThis =
                      chooseTarget?.dayStr === activeDayStr && chooseTarget?.slot === slot;

                    return (
                      <div
                        key={slot}
                        style={{
                          borderBottom: '1px solid var(--line-hairline)',
                          background: isAssigningThis ? 'var(--bg-elevated)' : 'transparent',
                          padding: '16px 0',
                        }}
                      >
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '150px 1fr auto',
                            gap: 16,
                            alignItems: 'center',
                          }}
                        >
                          {/* Col 1: Status dot + Domain/Slot Code + Slot Label */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={statusDot(entry ? '#10b981' : '#f59e0b')} />
                            <div>
                              <div
                                style={{
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: 11,
                                  color: 'var(--text-muted)',
                                }}
                              >
                                {slotCode}
                              </div>
                              <div
                                style={{
                                  fontSize: 13.5,
                                  fontWeight: 500,
                                  color: 'var(--text-primary)',
                                }}
                              >
                                {slotLabel}
                              </div>
                            </div>
                          </div>

                          {/* Col 2: Planned Meal Details or Empty Prompt */}
                          <div>
                            {entry ? (
                              <div>
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    flexWrap: 'wrap',
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => void handleToggleSelectMeal(entry)}
                                    style={{ cursor: 'pointer' }}
                                    title="Für Supermarkt-API & Einkauf berücksichtigen"
                                  />
                                  <span
                                    style={{
                                      fontSize: 14,
                                      fontWeight: 500,
                                      color: 'var(--text-primary)',
                                    }}
                                  >
                                    {entry.custom_title}
                                  </span>
                                  {guests > 0 && (
                                    <span
                                      style={{
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: 11,
                                        color: 'var(--text-secondary)',
                                        border: '1px solid var(--line-hairline)',
                                        padding: '1px 6px',
                                        borderRadius: 4,
                                      }}
                                    >
                                      +{guests} Gast ({totalPortions} Port.)
                                    </span>
                                  )}
                                </div>

                                <div
                                  style={{
                                    marginTop: 4,
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: 12,
                                    color: 'var(--text-secondary)',
                                    display: 'flex',
                                    gap: 14,
                                    flexWrap: 'wrap',
                                  }}
                                >
                                  <span>{entry.calories} kcal</span>
                                  <span>{entry.protein_g}g P</span>
                                  <span>{entry.carbs_g || 45}g KH</span>
                                  <span>{entry.fat_g || 15}g F</span>
                                  <span>{entry.fiber_g || 6}g Ballastst.</span>
                                  {ingList.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedMealIngredients((prev) => ({
                                          ...prev,
                                          [cardKey]: !prev[cardKey],
                                        }))
                                      }
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        padding: 0,
                                        color: 'var(--text-primary)',
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: 12,
                                        cursor: 'pointer',
                                        textDecoration: 'underline',
                                      }}
                                    >
                                      {isExpanded
                                        ? `Zutaten ausblenden (${ingList.length})`
                                        : `Zutaten anzeigen (${ingList.length})`}
                                    </button>
                                  )}
                                </div>

                                {isExpanded && ingList.length > 0 && (
                                  <div
                                    style={{
                                      marginTop: 10,
                                      padding: '8px 12px',
                                      background: 'var(--bg-elevated)',
                                      border: '1px solid var(--line-hairline)',
                                      fontFamily: 'var(--font-mono)',
                                      fontSize: 12,
                                      color: 'var(--text-secondary)',
                                      display: 'grid',
                                      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                      gap: 6,
                                    }}
                                  >
                                    {ingList.map((ing, i) => {
                                      const scaledAmt =
                                        Math.round(ing.amount * totalPortions * 10) / 10;
                                      return (
                                        <div
                                          key={i}
                                          style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            gap: 8,
                                          }}
                                        >
                                          <span>{ing.name}</span>
                                          <span style={{ color: 'var(--text-primary)' }}>
                                            {scaledAmt}
                                            {ing.unit}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div
                                style={{
                                  fontSize: 13,
                                  color: 'var(--text-muted)',
                                }}
                              >
                                Kein Gericht zugewiesen — Rezept wählen oder per Zufall planen.
                              </div>
                            )}
                          </div>

                          {/* Col 3: Actions (Randomize, Choose/Edit, Guests, Delete) */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <button
                              type="button"
                              onClick={() =>
                                void handleRandomizeSlot(activeDayStr, slot, entry?.recipe_id)
                              }
                              style={btnGhostSm}
                            >
                              Random
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setChooseTarget({ dayStr: activeDayStr, slot });
                                setChooseFilterSlot(slot);
                                setChooseSearch('');
                              }}
                              style={isAssigningThis ? btnPrimarySm : btnGhostSm}
                            >
                              Auswählen
                            </button>

                            {entry && (
                              <>
                                {guests > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => void handleChangeGuestPortions(entry, -1)}
                                    style={btnGhostSm}
                                    title="Gast-Portion reduzieren"
                                  >
                                    −Gast
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void handleChangeGuestPortions(entry, 1)}
                                  style={btnGhostSm}
                                  title="Gast-Portion hinzufügen"
                                >
                                  +Gast
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await api.delete(`/plan?id=${entry.id}`);
                                    await loadAll();
                                  }}
                                  style={btnGhostSm}
                                  title="Mahlzeit entfernen"
                                >
                                  Entfernen
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Hydration & WHO Assessment Strip below the 4 slots */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 32,
                    marginTop: 24,
                    paddingTop: 16,
                  }}
                >
                  {/* Hydration Controls */}
                  <div>
                    <div style={sectionLabelStyle}>HYDRATION TRACKER ({formatShortDateDE(activeDayStr)})</div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: 12,
                        paddingBottom: 12,
                        borderBottom: '1px solid var(--line-hairline)',
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 16,
                            color: 'var(--text-primary)',
                          }}
                        >
                          {selectedWaterMl} / {waterTargetMl} ml
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                          WHO-Richtwert basierend auf Körpergewicht ({activeProfile.current_weight_kg} kg)
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => void handleAdjustWater(activeDayStr, -250)}
                          style={btnGhostSm}
                        >
                          −250 ml
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleAdjustWater(activeDayStr, 250)}
                          style={btnPrimarySm}
                        >
                          +250 ml
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleAdjustWater(activeDayStr, 500)}
                          style={btnGhostSm}
                        >
                          +500 ml
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* WHO Nutritional Hints */}
                  <div>
                    <div style={sectionLabelStyle}>WHO-ERNÄHRUNGS-STATUS</div>
                    <div style={{ marginTop: 10 }}>
                      {dayHints.map((h, i) => (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '6px 0',
                            borderBottom: '1px solid var(--line-hairline)',
                            fontSize: 12.5,
                          }}
                        >
                          <span
                            style={statusDot(
                              h.status === 'ok'
                                ? '#10b981'
                                : h.status === 'warn'
                                  ? '#f59e0b'
                                  : '#ef4444'
                            )}
                          />
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 11,
                              color: 'var(--text-muted)',
                              width: 48,
                            }}
                          >
                            {h.domain}
                          </span>
                          <span style={{ color: 'var(--text-secondary)' }}>{h.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Inspector Column (when assigning a meal slot) */}
              {chooseTarget && (
                <aside
                  style={{
                    borderLeft: '1px solid var(--line-hairline)',
                    paddingLeft: 24,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingBottom: 12,
                      borderBottom: '1px solid var(--line-hairline)',
                      marginBottom: 16,
                    }}
                  >
                    <div>
                      <div style={sectionLabelStyle}>SLOT ZUWEISUNG</div>
                      <div style={{ fontSize: 14, fontWeight: 500, marginTop: 2 }}>
                        {SLOTS.find((s) => s.key === chooseTarget.slot)?.label} ·{' '}
                        {formatFullDateDE(chooseTarget.dayStr)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setChooseTarget(null)}
                      style={btnGhostSm}
                    >
                      Schließen
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <input
                      value={chooseSearch}
                      onChange={(e) => setChooseSearch(e.target.value)}
                      placeholder="/ Rezept oder Zutat filtern..."
                      style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
                    />
                    <select
                      value={chooseFilterSlot}
                      onChange={(e) => setChooseFilterSlot(e.target.value)}
                      style={{ ...inputStyle, marginBottom: 0, width: 130 }}
                    >
                      <option value="all">Alle Slots</option>
                      <option value="breakfast">Frühstück</option>
                      <option value="lunch">Mittagessen</option>
                      <option value="dinner">Abendessen</option>
                      <option value="snack">Snack</option>
                    </select>
                  </div>

                  <div
                    style={{
                      maxHeight: 360,
                      overflowY: 'auto',
                      borderTop: '1px solid var(--line-hairline)',
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
                          onClick={() => void handleAssignRecipeToSlot(r)}
                          style={{
                            padding: '10px 8px',
                            borderBottom: '1px solid var(--line-hairline)',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 12,
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 500,
                                color: 'var(--text-primary)',
                              }}
                            >
                              {r.name}
                            </div>
                            <div
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: 11.5,
                                color: 'var(--text-muted)',
                                marginTop: 2,
                              }}
                            >
                              {r.calories} kcal · {r.protein_g}g P · {r.carbs_g}g KH · {r.fat_g}g F
                            </div>
                          </div>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 11,
                              color: 'var(--text-secondary)',
                            }}
                          >
                            Wählen -&gt;
                          </span>
                        </div>
                      ))}
                  </div>

                  {/* Custom Entry Form */}
                  <form onSubmit={handleAssignCustomMealToSlot}>
                    <div style={{ ...sectionLabelStyle, marginBottom: 8 }}>
                      FREIE MAHLZEIT EINTRAGEN
                    </div>
                    <input
                      value={customTitleInput}
                      onChange={(e) => setCustomTitleInput(e.target.value)}
                      placeholder="Bezeichnung (z.B. Auswärts essen)"
                      style={inputStyle}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={labelStyle}>Kalorien (kcal)</label>
                        <input
                          type="number"
                          value={customKcalInput}
                          onChange={(e) => setCustomKcalInput(e.target.value)}
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Protein (g)</label>
                        <input
                          type="number"
                          value={customProtInput}
                          onChange={(e) => setCustomProtInput(e.target.value)}
                          style={inputStyle}
                        />
                      </div>
                    </div>
                    <button type="submit" style={{ ...btnPrimary, width: '100%' }}>
                      Freie Mahlzeit einplanen
                    </button>
                  </form>
                </aside>
              )}
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 2: WOCHENPLAN & OPTIMIZER
           =================================================================== */}
        {activeTab === 'week' && (
          <div>
            {/* Top Action Bar for Week Plan */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
                paddingBottom: 16,
                borderBottom: '1px solid var(--line-hairline)',
              }}
            >
              <div>
                <div style={sectionLabelStyle}>
                  7-TAGE-MATRIX · KW {kwNumber} ({formatShortDateDE(weekStart)} –{' '}
                  {formatFullDateDE(weekEnd)})
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                  Modus: {OPTIMIZATION_MODES[activeOpt.mode].label} · {selectedCount} von{' '}
                  {entries.length} Mahlzeiten für Einkauf selektiert
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => void handleSelectWeekMeals(selectedCount < entries.length)}
                  style={btnGhost}
                >
                  {selectedCount < entries.length
                    ? 'Alle Mahlzeiten auswählen'
                    : 'Auswahl aufheben'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleAutoOptimizeWeek()}
                  style={btnPrimary}
                >
                  Woche optimieren (Batch & Zero-Waste)
                </button>
              </div>
            </div>

            {/* 7-Day Hairline Table */}
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  textAlign: 'left',
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line-hairline)' }}>
                    <th style={thStyle}>TAG</th>
                    <th style={thStyle}>FRÜHSTÜCK</th>
                    <th style={thStyle}>MITTAGESSEN</th>
                    <th style={thStyle}>ABENDESSEN</th>
                    <th style={thStyle}>SNACK</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>MAKROS / TAG</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>AKTION</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((dStr, idx) => {
                    const dEntries = entries.filter((e) => e.plan_date === dStr);
                    const dKcal = dEntries.reduce((s, e) => s + (e.calories || 0), 0);
                    const dProt = dEntries.reduce((s, e) => s + (e.protein_g || 0), 0);
                    const isToday = dStr === new Date().toISOString().slice(0, 10);
                    const allDaySelected =
                      dEntries.length > 0 && dEntries.every((e) => e.selected === 1);

                    return (
                      <tr
                        key={dStr}
                        style={{
                          borderBottom: '1px solid var(--line-hairline)',
                          background: dStr === activeDayStr ? 'var(--bg-elevated)' : 'transparent',
                        }}
                      >
                        {/* Day cell */}
                        <td style={{ padding: '14px 12px 14px 0', verticalAlign: 'top', width: 130 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span
                              style={statusDot(
                                dEntries.length >= 3
                                  ? '#10b981'
                                  : dEntries.length > 0
                                    ? '#f59e0b'
                                    : '#ef4444'
                              )}
                            />
                            <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                              {DAY_NAMES_DE[idx]}
                            </span>
                          </div>
                          <div
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 11.5,
                              color: 'var(--text-muted)',
                              marginTop: 2,
                              paddingLeft: 14,
                            }}
                          >
                            {formatShortDateDE(dStr)}
                            {isToday ? ' · HEUTE' : ''}
                          </div>
                        </td>

                        {/* 4 Slot cells */}
                        {SLOTS.map(({ key: slot }) => {
                          const entry = dEntries.find((e) => e.slot === slot);
                          return (
                            <td
                              key={slot}
                              style={{
                                padding: '14px 12px',
                                verticalAlign: 'top',
                                borderLeft: '1px solid var(--line-hairline)',
                              }}
                            >
                              {entry ? (
                                <div>
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'flex-start',
                                      justifyContent: 'space-between',
                                      gap: 6,
                                    }}
                                  >
                                    <label
                                      style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: 6,
                                        cursor: 'pointer',
                                      }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={entry.selected === 1}
                                        onChange={() => void handleToggleSelectMeal(entry)}
                                        style={{ marginTop: 2 }}
                                      />
                                      <span
                                        style={{
                                          fontSize: 12.5,
                                          fontWeight: 500,
                                          color: 'var(--text-primary)',
                                          lineHeight: 1.35,
                                        }}
                                      >
                                        {entry.custom_title}
                                      </span>
                                    </label>
                                  </div>
                                  <div
                                    style={{
                                      fontFamily: 'var(--font-mono)',
                                      fontSize: 11,
                                      color: 'var(--text-muted)',
                                      marginTop: 4,
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                    }}
                                  >
                                    <span>
                                      {entry.calories} kcal · {entry.protein_g}g P
                                      {entry.guest_portions > 0
                                        ? ` · +${entry.guest_portions}G`
                                        : ''}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleRandomizeSlot(dStr, slot, entry.recipe_id)
                                      }
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        color: 'var(--text-secondary)',
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: 11,
                                        cursor: 'pointer',
                                        padding: 0,
                                      }}
                                      title="Neu auswürfeln"
                                    >
                                      [Random]
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                  }}
                                >
                                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
                                  <button
                                    type="button"
                                    onClick={() => void handleRandomizeSlot(dStr, slot, null)}
                                    style={btnGhostSm}
                                  >
                                    + Planen
                                  </button>
                                </div>
                              )}
                            </td>
                          );
                        })}

                        {/* Daily Totals */}
                        <td
                          style={{
                            padding: '14px 12px',
                            verticalAlign: 'top',
                            textAlign: 'right',
                            fontFamily: 'var(--font-mono)',
                            borderLeft: '1px solid var(--line-hairline)',
                            width: 140,
                          }}
                        >
                          <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                            {dKcal} kcal
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                            {dProt}g Protein
                          </div>
                        </td>

                        {/* Actions */}
                        <td
                          style={{
                            padding: '14px 0 14px 12px',
                            verticalAlign: 'top',
                            textAlign: 'right',
                            borderLeft: '1px solid var(--line-hairline)',
                            width: 150,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => void handleSelectDayMeals(dStr, !allDaySelected)}
                              style={btnGhostSm}
                            >
                              {allDaySelected ? 'Abwählen' : 'Tag wählen'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedDate(dStr);
                                setActiveTab('day');
                              }}
                              style={btnGhostSm}
                            >
                              Details
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Optimizer Configuration Panel below Week Table */}
            <div
              style={{
                marginTop: 32,
                paddingTop: 24,
                borderTop: '1px solid var(--line-hairline)',
                display: 'grid',
                gridTemplateColumns: '1.3fr 1fr',
                gap: 32,
              }}
            >
              <div>
                <div style={sectionLabelStyle}>OPTIMIERUNGS-MODUS (BATCH-COOK & PACKUNGS-LOGIK)</div>
                <div style={{ marginTop: 12 }}>
                  {(Object.keys(OPTIMIZATION_MODES) as Array<OptimizationOptions['mode']>).map(
                    (mKey) => {
                      const m = OPTIMIZATION_MODES[mKey];
                      const isSelected = activeOpt.mode === mKey;
                      return (
                        <div
                          key={mKey}
                          onClick={() => void handleUpdateOptimization({ mode: mKey })}
                          style={{
                            padding: '12px 14px',
                            borderBottom: '1px solid var(--line-hairline)',
                            background: isSelected ? 'var(--bg-elevated)' : 'transparent',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: 16,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                            <span
                              style={{
                                ...statusDot(isSelected ? '#10b981' : '#52525b'),
                                marginTop: 5,
                              }}
                            />
                            <div>
                              <div
                                style={{
                                  fontSize: 13.5,
                                  fontWeight: 500,
                                  color: 'var(--text-primary)',
                                }}
                              >
                                {m.label}
                              </div>
                              <div
                                style={{
                                  fontSize: 12,
                                  color: 'var(--text-secondary)',
                                  marginTop: 2,
                                }}
                              >
                                {m.desc}
                              </div>
                            </div>
                          </div>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 11,
                              color: isSelected ? 'var(--text-primary)' : 'var(--text-muted)',
                            }}
                          >
                            {m.code}
                          </span>
                        </div>
                      );
                    }
                  )}
                </div>
              </div>

              <div>
                <div style={sectionLabelStyle}>VORRATS- & SUPERMARKT-PARAMETER</div>
                <div
                  style={{
                    marginTop: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 0',
                      borderBottom: '1px solid var(--line-hairline)',
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={activeOpt.use_pantry_stock}
                      onChange={(e) =>
                        void handleUpdateOptimization({ use_pantry_stock: e.target.checked })
                      }
                    />
                    <span>
                      Verfügbare Vorratsmengen (`available_amount`) vor dem Einkauf automatisch abziehen
                    </span>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 0',
                      borderBottom: '1px solid var(--line-hairline)',
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={activeOpt.auto_accumulate_packages}
                      onChange={(e) =>
                        void handleUpdateOptimization({
                          auto_accumulate_packages: e.target.checked,
                        })
                      }
                    />
                    <span>
                      Packungsmengen über alle selektierten Mahlzeiten kumulieren (inkl. Gäste)
                    </span>
                  </label>

                  <div
                    style={{
                      padding: '10px 0',
                      borderBottom: '1px solid var(--line-hairline)',
                    }}
                  >
                    <div style={{ ...labelStyle, marginBottom: 8 }}>AKTIVE SUPERMARKT-APIS</div>
                    <div style={{ display: 'flex', gap: 16 }}>
                      {(['billa', 'hofer', 'spar'] as Array<'billa' | 'hofer' | 'spar'>).map(
                        (store) => {
                          const checked = activeOpt.preferred_stores.includes(store);
                          return (
                            <label
                              key={store}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                fontFamily: 'var(--font-mono)',
                                fontSize: 12.5,
                                cursor: 'pointer',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  const next = checked
                                    ? activeOpt.preferred_stores.filter((s) => s !== store)
                                    : [...activeOpt.preferred_stores, store];
                                  if (next.length > 0) {
                                    void handleUpdateOptimization({ preferred_stores: next });
                                  }
                                }}
                              />
                              {store.toUpperCase()}
                            </label>
                          );
                        }
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 3: EINKAUF & SUPERMARKT-PREISE
           =================================================================== */}
        {activeTab === 'groceries' && (
          <div>
            {/* Action Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
                paddingBottom: 16,
                borderBottom: '1px solid var(--line-hairline)',
              }}
            >
              <div>
                <div style={sectionLabelStyle}>
                  KUMULIERTER EINKAUFSBEDARF & AT-SUPERMARKT-PREISVERGLEICH
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {supermarket
                    ? `${supermarket.selectedMealsCount} Mahlzeiten (${supermarket.totalPortions} Portionen) · ${supermarket.uniqueIngredientsCount} Zutaten (${supermarket.multiUseIngredientsCount}x mehrfach genutzt) · Vorrat genutzt: ${supermarket.totalPantryUsed}g`
                    : 'Keine Supermarkt-Berechnung geladen.'}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => void handleTriggerSupermarketApi()}
                  style={btnGhost}
                >
                  {queryingApi ? 'API lädt...' : 'Preise neu berechnen (/supermarket-query)'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleTransferToGroceryList('optimal')}
                  style={btnPrimary}
                >
                  Optimal-Mix an HA Einkaufsliste übertragen
                </button>
              </div>
            </div>

            {supermarket && (
              <>
                {/* 4-Column Store Comparison Strip */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    borderBottom: '1px solid var(--line-hairline)',
                    marginBottom: 24,
                  }}
                >
                  {(['billa', 'hofer', 'spar'] as Array<'billa' | 'hofer' | 'spar'>).map(
                    (st, i) => {
                      const s = supermarket.stores[st];
                      const isBest = supermarket.optimalMix.bestSingleStore === st;
                      return (
                        <div
                          key={st}
                          style={{
                            padding: '16px 20px',
                            paddingLeft: i === 0 ? 0 : 20,
                            borderRight: '1px solid var(--line-hairline)',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <span style={sectionLabelStyle}>{st.toUpperCase()} GESAMT</span>
                            <span style={statusDot(isBest ? '#10b981' : '#52525b')} />
                          </div>
                          <div
                            style={{
                              fontSize: 22,
                              fontWeight: 400,
                              fontFamily: 'var(--font-mono)',
                              marginTop: 6,
                            }}
                          >
                            €{s.totalPrice.toFixed(2)}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: 'var(--text-secondary)',
                              fontFamily: 'var(--font-mono)',
                              marginTop: 4,
                            }}
                          >
                            {s.totalPacks} Packungen · Rest {s.totalSurplus}g ({s.efficiencyPct}% Eff.)
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleTransferToGroceryList(st)}
                            style={{ ...btnGhostSm, marginTop: 10 }}
                          >
                            Nur {st.toUpperCase()} an HA senden
                          </button>
                        </div>
                      );
                    }
                  )}

                  {/* Optimal Mix Column */}
                  <div style={{ padding: '16px 0 16px 20px' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span style={sectionLabelStyle}>OPTIMAL-MIX (BILLA / HOFER / SPAR)</span>
                      <span style={statusDot('#10b981')} />
                    </div>
                    <div
                      style={{
                        fontSize: 22,
                        fontWeight: 400,
                        fontFamily: 'var(--font-mono)',
                        marginTop: 6,
                      }}
                    >
                      €{supermarket.optimalMix.totalPrice.toFixed(2)}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-mono)',
                        marginTop: 4,
                      }}
                    >
                      {supermarket.optimalMix.totalPacks} Packungen · Rest{' '}
                      {supermarket.optimalMix.totalSurplus}g (−
                      {supermarket.totalWasteSavedByAccumulation}g Überschuss gespart)
                    </div>
                  </div>
                </div>

                {/* Cumulative Ingredients Table */}
                <div style={{ overflowX: 'auto' }}>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: 12.5,
                      textAlign: 'left',
                    }}
                  >
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--line-hairline)' }}>
                        <th style={thStyle}>ZUTAT</th>
                        <th style={thStyle}>VERWENDET IN</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>BRUTTO</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>VORRAT</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>NETTO KAUF</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>BILLA</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>HOFER</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>SPAR</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>ÜBERSCHUSS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {supermarket.cumulativeIngredients.map((item, idx) => (
                        <tr
                          key={idx}
                          style={{
                            borderBottom: '1px solid var(--line-hairline)',
                          }}
                        >
                          <td style={{ padding: '10px 8px 10px 0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span
                                style={statusDot(item.netToBuy === 0 ? '#10b981' : '#f59e0b')}
                              />
                              <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                                {item.name}
                              </span>
                              {item.mealOccurrences > 1 && (
                                <span
                                  style={{
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: 11,
                                    color: 'var(--text-muted)',
                                  }}
                                >
                                  [{item.mealOccurrences}x]
                                </span>
                              )}
                            </div>
                          </td>
                          <td
                            style={{
                              padding: '10px 8px',
                              color: 'var(--text-secondary)',
                              maxWidth: 240,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {item.usedInMeals.join(', ')}
                          </td>
                          <td
                            style={{
                              padding: '10px 8px',
                              textAlign: 'right',
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {item.grossRequired}
                            {item.unit}
                          </td>
                          <td
                            style={{
                              padding: '10px 8px',
                              textAlign: 'right',
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--text-muted)',
                            }}
                          >
                            {item.pantryUsed > 0 ? `−${item.pantryUsed}${item.unit}` : '0'}
                          </td>
                          <td
                            style={{
                              padding: '10px 8px',
                              textAlign: 'right',
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 500,
                              color: 'var(--text-primary)',
                            }}
                          >
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
                                    padding: '10px 8px',
                                    textAlign: 'right',
                                    fontFamily: 'var(--font-mono)',
                                    background: isRec ? 'var(--bg-elevated)' : 'transparent',
                                    color: isRec ? 'var(--text-primary)' : 'var(--text-secondary)',
                                  }}
                                >
                                  {off.packsNeeded === 0 ? (
                                    <span style={{ color: 'var(--text-muted)' }}>Vorrat</span>
                                  ) : (
                                    <span>
                                      {off.packsNeeded}x {off.packSize}
                                      {item.unit} · €{off.totalPrice.toFixed(2)}
                                    </span>
                                  )}
                                </td>
                              );
                            }
                          )}
                          <td
                            style={{
                              padding: '10px 0 10px 8px',
                              textAlign: 'right',
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--text-muted)',
                            }}
                          >
                            +{item.recommendedOffer.surplusAmount}
                            {item.unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* ===================================================================
            TAB 4: REZEPTE & VORRAT (2-Column Hairline Split)
           =================================================================== */}
        {activeTab === 'catalog' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 32,
              alignItems: 'start',
            }}
          >
            {/* LEFT COLUMN: RECIPES */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingBottom: 12,
                  borderBottom: '1px solid var(--line-hairline)',
                  marginBottom: 16,
                }}
              >
                <span style={sectionLabelStyle}>REZEPTBUCH ({recipes.length})</span>
                <button
                  type="button"
                  onClick={() => setShowNewRecipeForm(!showNewRecipeForm)}
                  style={showNewRecipeForm ? btnGhostSm : btnPrimarySm}
                >
                  {showNewRecipeForm ? 'Formular schließen' : '+ Neues Rezept'}
                </button>
              </div>

              {showNewRecipeForm && (
                <form
                  onSubmit={handleCreateRecipe}
                  style={{
                    paddingBottom: 20,
                    marginBottom: 20,
                    borderBottom: '1px solid var(--line-hairline)',
                  }}
                >
                  <label style={labelStyle}>Rezept-Titel</label>
                  <input
                    value={recName}
                    onChange={(e) => setRecName(e.target.value)}
                    placeholder="z.B. Steirischer Käferbohnen-Salat mit Kernöl"
                    style={inputStyle}
                  />

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={labelStyle}>Kategorie</label>
                      <select
                        value={recType}
                        onChange={(e) => setRecType(e.target.value as MealSlot)}
                        style={inputStyle}
                      >
                        <option value="breakfast">Frühstück</option>
                        <option value="lunch">Mittagessen</option>
                        <option value="dinner">Abendessen</option>
                        <option value="snack">Snack</option>
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

                  <label style={labelStyle}>Zutaten mit Mengenangabe (pro Zeile)</label>
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
              )}

              {/* Filter Bar */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  value={recipeSearch}
                  onChange={(e) => setRecipeSearch(e.target.value)}
                  placeholder="/ Rezept suchen..."
                  style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
                />
                <select
                  value={recipeSlotFilter}
                  onChange={(e) => setRecipeSlotFilter(e.target.value)}
                  style={{ ...inputStyle, marginBottom: 0, width: 140 }}
                >
                  <option value="all">Alle Kategorien</option>
                  <option value="breakfast">Frühstück</option>
                  <option value="lunch">Mittagessen</option>
                  <option value="dinner">Abendessen</option>
                  <option value="snack">Snack</option>
                </select>
              </div>

              {/* Hairline Recipe List */}
              <div style={{ borderTop: '1px solid var(--line-hairline)' }}>
                {recipes
                  .filter((r) =>
                    recipeSlotFilter === 'all' ? true : r.meal_type === recipeSlotFilter
                  )
                  .filter(
                    (r) =>
                      !recipeSearch.trim() ||
                      r.name.toLowerCase().includes(recipeSearch.toLowerCase()) ||
                      r.ingredients.some((i) =>
                        i.toLowerCase().includes(recipeSearch.toLowerCase())
                      )
                  )
                  .map((r) => (
                    <div
                      key={r.id}
                      style={{
                        padding: '12px 0',
                        borderBottom: '1px solid var(--line-hairline)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 12,
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 11,
                              color: 'var(--text-muted)',
                              textTransform: 'uppercase',
                            }}
                          >
                            {r.meal_type}
                          </span>
                          <span
                            style={{
                              fontSize: 13.5,
                              fontWeight: 500,
                              color: 'var(--text-primary)',
                            }}
                          >
                            {r.name}
                          </span>
                        </div>
                        <div
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 12,
                            color: 'var(--text-secondary)',
                            marginTop: 4,
                          }}
                        >
                          {r.calories} kcal · {r.protein_g}g P · {r.carbs_g}g KH · {r.fat_g}g F ·{' '}
                          {r.fiber_g}g Ballastst. · {r.prep_minutes} Min
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: 'var(--text-muted)',
                            marginTop: 4,
                          }}
                        >
                          {r.ingredients.join(', ')}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() =>
                            void handleAssignRecipeToSlot(r, {
                              dayStr: activeDayStr,
                              slot: r.meal_type,
                            })
                          }
                          style={btnGhostSm}
                          title={`Für ${formatShortDateDE(activeDayStr)} einplanen`}
                        >
                          Einplanen ({formatShortDateDE(activeDayStr)})
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await api.delete(`/recipes?id=${r.id}`);
                            await loadAll();
                          }}
                          style={btnGhostSm}
                        >
                          Löschen
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* RIGHT COLUMN: INGREDIENTS & PANTRY STOCK + BARCODE SCANNER */}
            <div
              style={{
                borderLeft: '1px solid var(--line-hairline)',
                paddingLeft: 32,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingBottom: 12,
                  borderBottom: '1px solid var(--line-hairline)',
                  marginBottom: 16,
                }}
              >
                <span style={sectionLabelStyle}>
                  VORRATSKAMMER & BARCODE-SCANNER ({ingredientsCatalog.length})
                </span>
                <button
                  type="button"
                  onClick={() => setShowIngredientForm(!showIngredientForm)}
                  style={showIngredientForm ? btnGhostSm : btnPrimarySm}
                >
                  {showIngredientForm ? 'Formular schließen' : '+ Zutat erfassen'}
                </button>
              </div>

              {/* Barcode Lookup Bar */}
              <div
                style={{
                  paddingBottom: 16,
                  marginBottom: 16,
                  borderBottom: '1px solid var(--line-hairline)',
                }}
              >
                <div style={{ ...labelStyle, marginBottom: 6 }}>
                  EAN-BARCODE ABFRAGE (OPENFOODFACTS & AT-KATALOG)
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    placeholder="EAN-13 / EAN-8 Barcode..."
                    style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={() => void handleBarcodeLookup()}
                    style={btnPrimary}
                  >
                    EAN abfragen
                  </button>
                  <button
                    type="button"
                    onClick={cameraActive ? stopCameraScanner : startCameraScanner}
                    style={btnGhost}
                  >
                    {cameraActive ? 'Kamera stoppen' : 'Kamera-Scan'}
                  </button>
                </div>

                {barcodeSourceInfo && (
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11.5,
                      color: 'var(--text-secondary)',
                      marginTop: 6,
                    }}
                  >
                    {barcodeSourceInfo}
                  </div>
                )}

                {cameraActive && (
                  <div style={{ marginTop: 10 }}>
                    <video
                      ref={videoRef}
                      style={{
                        width: '100%',
                        maxHeight: 180,
                        background: '#000',
                        border: '1px solid var(--line-focus)',
                      }}
                      muted
                      playsInline
                    />
                  </div>
                )}

                <div
                  style={{
                    marginTop: 8,
                    display: 'flex',
                    gap: 6,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>AT-Beispiele:</span>
                  {SAMPLE_BARCODES.map((b) => (
                    <button
                      key={b.code}
                      type="button"
                      onClick={() => {
                        setBarcodeInput(b.code);
                        void handleBarcodeLookup(b.code);
                      }}
                      style={btnGhostSm}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Collapsible Ingredient Edit/Create Form */}
              {showIngredientForm && (
                <form
                  onSubmit={handleSaveScannedIngredient}
                  style={{
                    paddingBottom: 20,
                    marginBottom: 20,
                    borderBottom: '1px solid var(--line-hairline)',
                  }}
                >
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
                      <label style={labelStyle}>Marke</label>
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
                        <option value="g">g</option>
                        <option value="ml">ml</option>
                        <option value="Stk">Stk</option>
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
                      <label style={labelStyle}>Vorrat ({scannedIngredient.unit})</label>
                      <input
                        type="number"
                        value={scannedIngredient.available_amount}
                        onChange={(e) =>
                          setScannedIngredient({
                            ...scannedIngredient,
                            available_amount: Number(e.target.value),
                          })
                        }
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Nutri-Score</label>
                      <input
                        value={scannedIngredient.nutriscore}
                        onChange={(e) =>
                          setScannedIngredient({
                            ...scannedIngredient,
                            nutriscore: e.target.value,
                          })
                        }
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    <div>
                      <label style={labelStyle}>Billa (€ / Pack)</label>
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
                          style={inputStyle}
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
                          style={inputStyle}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Hofer (€ / Pack)</label>
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
                          style={inputStyle}
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
                          style={inputStyle}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Spar (€ / Pack)</label>
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
                          style={inputStyle}
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
                          style={inputStyle}
                        />
                      </div>
                    </div>
                  </div>

                  <button type="submit" style={{ ...btnPrimary, width: '100%' }}>
                    Zutat & Vorratsmenge speichern
                  </button>
                </form>
              )}

              {/* Pantry Filter */}
              <input
                value={ingredientSearch}
                onChange={(e) => setIngredientSearch(e.target.value)}
                placeholder="/ Vorrat nach Name oder Barcode filtern..."
                style={inputStyle}
              />

              {/* Hairline Pantry List */}
              <div style={{ borderTop: '1px solid var(--line-hairline)' }}>
                {ingredientsCatalog
                  .filter(
                    (ing) =>
                      !ingredientSearch.trim() ||
                      ing.name.toLowerCase().includes(ingredientSearch.toLowerCase()) ||
                      ing.barcode.includes(ingredientSearch.trim())
                  )
                  .map((ing) => (
                    <div
                      key={ing.id ?? ing.name}
                      style={{
                        padding: '10px 0',
                        borderBottom: '1px solid var(--line-hairline)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={statusDot(ing.available_amount > 0 ? '#10b981' : '#52525b')}
                          />
                          <span
                            style={{
                              fontSize: 13.5,
                              fontWeight: 500,
                              color: 'var(--text-primary)',
                            }}
                          >
                            {ing.name}
                          </span>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 11,
                              color: 'var(--text-muted)',
                            }}
                          >
                            {ing.barcode}
                          </span>
                        </div>
                        <div
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 11.5,
                            color: 'var(--text-secondary)',
                            marginTop: 2,
                            paddingLeft: 14,
                          }}
                        >
                          Billa €{ing.price_billa.toFixed(2)} ({ing.pack_billa}
                          {ing.unit}) · Hofer €{ing.price_hofer.toFixed(2)} ({ing.pack_hofer}
                          {ing.unit}) · Spar €{ing.price_spar.toFixed(2)} ({ing.pack_spar}
                          {ing.unit})
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 11,
                            color: 'var(--text-muted)',
                          }}
                        >
                          Vorrat:
                        </span>
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
                            ...inputStyle,
                            marginBottom: 0,
                            width: 76,
                            padding: '4px 8px',
                            textAlign: 'right',
                          }}
                        />
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 11.5,
                            color: 'var(--text-secondary)',
                            width: 24,
                          }}
                        >
                          {ing.unit}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 5: PROFIL & WHO-ZIELE
           =================================================================== */}
        {activeTab === 'profile' && profile && (
          <form
            onSubmit={handleSaveProfile}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 48,
              alignItems: 'start',
            }}
          >
            {/* Left Column: Anthropometric Data & Weight Goal */}
            <div>
              <div
                style={{
                  ...sectionLabelStyle,
                  paddingBottom: 12,
                  borderBottom: '1px solid var(--line-hairline)',
                  marginBottom: 16,
                }}
              >
                KÖRPERDATEN & GEWICHTSZIEL
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Name</label>
                  <input
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Alter (Jahre)</label>
                  <input
                    type="number"
                    value={profile.age}
                    onChange={(e) => setProfile({ ...profile, age: Number(e.target.value) })}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Körpergröße (cm)</label>
                  <input
                    type="number"
                    value={profile.height_cm}
                    onChange={(e) => setProfile({ ...profile, height_cm: Number(e.target.value) })}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
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
                  <label style={labelStyle}>Zielgewicht (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={profile.target_weight_kg}
                    onChange={(e) =>
                      setProfile({ ...profile, target_weight_kg: Number(e.target.value) })
                    }
                    style={inputStyle}
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
                    <option value="-0.6">−0.6 kg/Woche</option>
                    <option value="-0.4">−0.4 kg/Woche</option>
                    <option value="-0.25">−0.25 kg/Woche</option>
                    <option value="0">0.0 kg/Woche (Halten)</option>
                    <option value="0.25">+0.25 kg/Woche</option>
                    <option value="0.5">+0.5 kg/Woche</option>
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

              {/* Computed Targets Readout */}
              <div
                style={{
                  marginTop: 20,
                  paddingTop: 16,
                  borderTop: '1px solid var(--line-hairline)',
                }}
              >
                <div style={sectionLabelStyle}>BERECHNETE TAGES-RICHTWERTE</div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 12,
                    marginTop: 12,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12.5,
                  }}
                >
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>KALORIEN</div>
                    <div style={{ color: 'var(--text-primary)', marginTop: 2 }}>
                      {profile.target_calories} kcal
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>PROTEIN</div>
                    <div style={{ color: 'var(--text-primary)', marginTop: 2 }}>
                      {profile.target_protein_g} g
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>KOHLENHYDRATE</div>
                    <div style={{ color: 'var(--text-primary)', marginTop: 2 }}>
                      {profile.target_carbs_g} g
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>FETT</div>
                    <div style={{ color: 'var(--text-primary)', marginTop: 2 }}>
                      {profile.target_fat_g} g
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>BALLASTSTOFFE</div>
                    <div style={{ color: 'var(--text-primary)', marginTop: 2 }}>
                      &gt;= {profile.target_fiber_g} g
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>WASSER</div>
                    <div style={{ color: 'var(--text-primary)', marginTop: 2 }}>
                      {profile.target_water_ml} ml
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: WHO Profile Selection */}
            <div
              style={{
                borderLeft: '1px solid var(--line-hairline)',
                paddingLeft: 32,
              }}
            >
              <div
                style={{
                  ...sectionLabelStyle,
                  paddingBottom: 12,
                  borderBottom: '1px solid var(--line-hairline)',
                  marginBottom: 12,
                }}
              >
                WHO-ERNÄHRUNGSPROFIL WÄHLEN
              </div>

              <div style={{ marginBottom: 20 }}>
                {(Object.keys(WHO_PROFILES) as Array<UserProfile['who_profile']>).map((key) => {
                  const p = WHO_PROFILES[key];
                  const active = profile.who_profile === key;
                  return (
                    <div
                      key={key}
                      onClick={() => setProfile({ ...profile, who_profile: key })}
                      style={{
                        padding: '12px 14px',
                        borderBottom: '1px solid var(--line-hairline)',
                        background: active ? 'var(--bg-elevated)' : 'transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 12,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <span
                          style={{
                            ...statusDot(active ? '#10b981' : '#52525b'),
                            marginTop: 5,
                          }}
                        />
                        <div>
                          <div
                            style={{
                              fontSize: 13.5,
                              fontWeight: 500,
                              color: 'var(--text-primary)',
                            }}
                          >
                            {p.label}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: 'var(--text-secondary)',
                              marginTop: 2,
                            }}
                          >
                            {p.desc}
                          </div>
                        </div>
                      </div>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                        }}
                      >
                        {p.code}
                      </span>
                    </div>
                  );
                })}
              </div>

              <button type="submit" style={{ ...btnPrimary, width: '100%' }}>
                WHO-Profil & Tagesziele berechnen und speichern
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function statusDot(color: '#10b981' | '#f59e0b' | '#ef4444' | '#52525b'): React.CSSProperties {
  return {
    display: 'inline-block',
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
  };
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
};

const heroMetricStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 400,
  letterSpacing: '-0.03em',
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--text-primary)',
};

const thStyle: React.CSSProperties = {
  padding: '10px 12px 10px 0',
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
};

const btnPrimary: React.CSSProperties = {
  background: '#fafafa',
  color: '#09090b',
  fontSize: 12.5,
  fontWeight: 500,
  padding: '6px 14px',
  borderRadius: 4,
  border: 'none',
  cursor: 'pointer',
};

const btnPrimarySm: React.CSSProperties = {
  ...btnPrimary,
  fontSize: 11.5,
  padding: '4px 10px',
};

const btnGhost: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--text-secondary)',
  border: '1px solid var(--line-hairline)',
  fontSize: 12.5,
  fontWeight: 500,
  padding: '6px 12px',
  borderRadius: 4,
  cursor: 'pointer',
};

const btnGhostSm: React.CSSProperties = {
  ...btnGhost,
  fontSize: 11.5,
  padding: '4px 9px',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--bg-input)',
  border: '1px solid var(--line-hairline)',
  borderRadius: 4,
  padding: '7px 10px',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 12.5,
  marginBottom: 10,
};
