import React, { useEffect, useState } from 'react';
import { createAppClient } from '@thassi/sdk/client';

const api = createAppClient('meal-planner');

interface Recipe {
  id: number;
  name: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  calories: number;
  protein_g: number;
  prep_minutes: number;
  ingredients: string[];
  instructions: string;
  tags: string;
}

interface MealPlanEntry {
  id: number;
  plan_date: string;
  slot: 'breakfast' | 'lunch' | 'dinner';
  recipe_id: number | null;
  custom_title: string;
  calories: number;
  protein_g: number;
  completed: number;
}

interface GroceryItem {
  id: number;
  name: string;
  category: string;
  checked: number;
  source_recipe: string;
}

const SLOTS: Array<'breakfast' | 'lunch' | 'dinner'> = ['breakfast', 'lunch', 'dinner'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function App() {
  const [activeTab, setActiveTab] = useState<'week' | 'recipes' | 'groceries'>('week');
  const [weekStart, setWeekStart] = useState<string>('');
  const [weekEnd, setWeekEnd] = useState<string>('');
  const [days, setDays] = useState<string[]>([]);
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [groceries, setGroceries] = useState<GroceryItem[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  // Modal / Quick-Assign state for a day + slot
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<'breakfast' | 'lunch' | 'dinner'>('dinner');
  const [assignRecipeId, setAssignRecipeId] = useState<string>('');
  const [customMealTitle, setCustomMealTitle] = useState<string>('');
  const [customCalories, setCustomCalories] = useState<string>('');
  const [customProtein, setCustomProtein] = useState<string>('');

  // New Recipe form state
  const [recName, setRecName] = useState('');
  const [recType, setRecType] = useState<'breakfast' | 'lunch' | 'dinner'>('dinner');
  const [recCalories, setRecCalories] = useState('550');
  const [recProtein, setRecProtein] = useState('35');
  const [recPrep, setRecPrep] = useState('20');
  const [recIngredients, setRecIngredients] = useState('');
  const [recInstructions, setRecInstructions] = useState('');

  // New Grocery form state
  const [newGrocery, setNewGrocery] = useState('');

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = async (targetStart?: string) => {
    const startParam = targetStart ?? weekStart;
    const [weekRes, recRes, grocRes] = await Promise.all([
      api.get<{ weekStart: string; weekEnd: string; days: string[]; entries: MealPlanEntry[] }>(
        `/week${startParam ? `?start=${encodeURIComponent(startParam)}` : ''}`
      ),
      api.get<{ recipes: Recipe[] }>('/recipes'),
      api.get<{ items: GroceryItem[] }>('/groceries'),
    ]);

    setWeekStart(weekRes.weekStart);
    setWeekEnd(weekRes.weekEnd);
    setDays(weekRes.days);
    setEntries(weekRes.entries);
    setRecipes(recRes.recipes);
    setGroceries(grocRes.items);
    if (!selectedDay && weekRes.days.length > 0) {
      const todayIso = new Date().toISOString().slice(0, 10);
      setSelectedDay(weekRes.days.includes(todayIso) ? todayIso : weekRes.days[0]);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const shiftWeek = async (deltaDays: number) => {
    if (!weekStart) return;
    const d = new Date(`${weekStart}T12:00:00`);
    d.setDate(d.getDate() + deltaDays);
    const nextStart = d.toISOString().slice(0, 10);
    await loadData(nextStart);
  };

  const handleAssignMeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDay) return;
    try {
      await api.post('/plan', {
        plan_date: selectedDay,
        slot: selectedSlot,
        recipe_id: assignRecipeId ? Number(assignRecipeId) : null,
        custom_title: customMealTitle || undefined,
        calories: customCalories ? Number(customCalories) : undefined,
        protein_g: customProtein ? Number(customProtein) : undefined,
      });
      setCustomMealTitle('');
      setCustomCalories('');
      setCustomProtein('');
      notify(`Planned ${selectedSlot} for ${selectedDay}!`);
      await loadData(weekStart);
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err));
    }
  };

  const handleGenerateGroceries = async () => {
    try {
      const res = await api.post<{ addedCount: number }>('/groceries/generate-from-week', {
        weekStart,
        weekEnd,
      });
      notify(`Added ${res.addedCount} ingredient(s) from this week's recipes to your Grocery List!`);
      await loadData(weekStart);
      setActiveTab('groceries');
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSyncToHa = async () => {
    try {
      const res = await api.post<{
        dinner: string;
        totalCalories: number;
        openGroceries: number;
        haConnected: boolean;
      }>('/sync-ha');
      notify(
        res.haConnected
          ? `Synced to Home Assistant: Dinner="${res.dinner}" (${res.totalCalories} kcal)`
          : `Saved to shared DB: Dinner="${res.dinner}" (${res.totalCalories} kcal). Configure HA_TOKEN in Hub to push HA sensors.`
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCreateRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recName.trim()) return;
    await api.post('/recipes', {
      name: recName,
      meal_type: recType,
      calories: Number(recCalories || 0),
      protein_g: Number(recProtein || 0),
      prep_minutes: Number(recPrep || 20),
      ingredientsText: recIngredients,
      instructions: recInstructions,
    });
    setRecName('');
    setRecIngredients('');
    setRecInstructions('');
    notify('Recipe saved to SQLite!');
    await loadData(weekStart);
  };

  const weeklyCalories = entries.reduce((sum, e) => sum + (e.calories || 0), 0);
  const weeklyProtein = entries.reduce((sum, e) => sum + (e.protein_g || 0), 0);
  const openGroceryCount = groceries.filter((g) => !g.checked).length;

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '24px' }}>
      {/* Header */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 20,
          paddingBottom: 16,
          borderBottom: '1px solid #1e293b',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 24, color: '#38bdf8' }}>🍲 Thassi Meal Planner</h1>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 13 }}>
            Week Total: <strong>{weeklyCalories} kcal</strong> • <strong>{weeklyProtein}g protein</strong> •{' '}
            <strong>{openGroceryCount}</strong> open groceries
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveTab('week')}
            style={activeTab === 'week' ? btnPrimary : btnTab}
          >
            📅 Weekly Schedule
          </button>
          <button
            onClick={() => setActiveTab('recipes')}
            style={activeTab === 'recipes' ? btnPrimary : btnTab}
          >
            📖 Recipe Book ({recipes.length})
          </button>
          <button
            onClick={() => setActiveTab('groceries')}
            style={activeTab === 'groceries' ? btnPrimary : btnTab}
          >
            🛒 Groceries ({openGroceryCount})
          </button>
          <button onClick={handleSyncToHa} style={btnOutline}>
            🏠 Sync Sensors to HA
          </button>
        </div>
      </header>

      {toast && (
        <div
          style={{
            background: '#0284c7',
            color: '#fff',
            padding: '10px 16px',
            borderRadius: 8,
            marginBottom: 16,
            fontWeight: 500,
          }}
        >
          {toast}
        </div>
      )}

      {activeTab === 'week' && (
        <div>
          {/* Week navigation bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
              background: '#1e293b',
              padding: '12px 16px',
              borderRadius: 10,
              border: '1px solid #334155',
            }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={() => shiftWeek(-7)} style={btnTab}>
                ← Prev Week
              </button>
              <button onClick={() => loadData('')} style={btnTab}>
                Today
              </button>
              <button onClick={() => shiftWeek(7)} style={btnTab}>
                Next Week →
              </button>
              <span style={{ marginLeft: 8, fontWeight: 600, color: '#e2e8f0' }}>
                {weekStart} — {weekEnd}
              </span>
            </div>

            <button onClick={handleGenerateGroceries} style={btnPrimary}>
              🛒 Generate Grocery List from Week
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2.6fr 1fr', gap: 20 }}>
            {/* 7-Day Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 12,
              }}
            >
              {days.map((dayStr, idx) => {
                const dayEntries = entries.filter((e) => e.plan_date === dayStr);
                const dayKcal = dayEntries.reduce((s, e) => s + (e.calories || 0), 0);
                const dayProt = dayEntries.reduce((s, e) => s + (e.protein_g || 0), 0);
                const isToday = dayStr === new Date().toISOString().slice(0, 10);

                return (
                  <div
                    key={dayStr}
                    style={{
                      background: '#1e293b',
                      border: isToday ? '2px solid #38bdf8' : '1px solid #334155',
                      borderRadius: 12,
                      padding: 14,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 10,
                        paddingBottom: 6,
                        borderBottom: '1px solid #334155',
                      }}
                    >
                      <div>
                        <strong style={{ color: isToday ? '#38bdf8' : '#f8fafc' }}>
                          {DAY_LABELS[idx]}
                        </strong>{' '}
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>{dayStr.slice(5)}</span>
                      </div>
                      <span style={{ fontSize: 11, color: '#38bdf8' }}>
                        {dayKcal} kcal • {dayProt}g P
                      </span>
                    </div>

                    {SLOTS.map((slot) => {
                      const entry = dayEntries.find((e) => e.slot === slot);
                      return (
                        <div
                          key={slot}
                          onClick={() => {
                            setSelectedDay(dayStr);
                            setSelectedSlot(slot);
                          }}
                          style={{
                            padding: '8px 10px',
                            borderRadius: 8,
                            background: '#0f172a',
                            border:
                              selectedDay === dayStr && selectedSlot === slot
                                ? '1px solid #38bdf8'
                                : '1px solid #1e293b',
                            marginBottom: 8,
                            cursor: 'pointer',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              fontSize: 11,
                              textTransform: 'uppercase',
                              color: '#64748b',
                              marginBottom: 4,
                            }}
                          >
                            <span>{slot}</span>
                            {entry && (
                              <button
                                onClick={async (ev) => {
                                  ev.stopPropagation();
                                  await api.delete(`/plan?id=${entry.id}`);
                                  await loadData(weekStart);
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: '#ef4444',
                                  cursor: 'pointer',
                                  fontSize: 11,
                                  padding: 0,
                                }}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                          {entry ? (
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc' }}>
                                {entry.custom_title}
                              </div>
                              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                {entry.calories} kcal • {entry.protein_g}g protein
                              </div>
                            </div>
                          ) : (
                            <div style={{ fontSize: 12, color: '#475569', fontStyle: 'italic' }}>
                              + Plan {slot}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Assign Meal Side Panel */}
            <form
              onSubmit={handleAssignMeal}
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 12,
                padding: 20,
                alignSelf: 'start',
              }}
            >
              <h3 style={{ marginTop: 0, color: '#38bdf8' }}>Plan a Meal</h3>
              <label style={labelStyle}>Date</label>
              <select
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value)}
                style={inputStyle}
              >
                {days.map((d, i) => (
                  <option key={d} value={d}>
                    {DAY_LABELS[i]} ({d})
                  </option>
                ))}
              </select>

              <label style={labelStyle}>Meal Slot</label>
              <select
                value={selectedSlot}
                onChange={(e) => setSelectedSlot(e.target.value as 'breakfast' | 'lunch' | 'dinner')}
                style={inputStyle}
              >
                <option value="breakfast">🌅 Breakfast</option>
                <option value="lunch">☀️ Lunch</option>
                <option value="dinner">🌙 Dinner</option>
              </select>

              <label style={labelStyle}>Choose from Recipe Book</label>
              <select
                value={assignRecipeId}
                onChange={(e) => setAssignRecipeId(e.target.value)}
                style={inputStyle}
              >
                <option value="">-- Or type a custom meal below --</option>
                {recipes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.calories} kcal, {r.protein_g}g P)
                  </option>
                ))}
              </select>

              <label style={labelStyle}>Custom Meal Name (optional override)</label>
              <input
                value={customMealTitle}
                onChange={(e) => setCustomMealTitle(e.target.value)}
                placeholder="e.g. Leftover Pasta or Eating Out"
                style={inputStyle}
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={labelStyle}>Calories (optional)</label>
                  <input
                    type="number"
                    value={customCalories}
                    onChange={(e) => setCustomCalories(e.target.value)}
                    placeholder="Auto from recipe"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Protein g (optional)</label>
                  <input
                    type="number"
                    value={customProtein}
                    onChange={(e) => setCustomProtein(e.target.value)}
                    placeholder="Auto from recipe"
                    style={inputStyle}
                  />
                </div>
              </div>

              <button type="submit" style={{ ...btnPrimary, width: '100%' }}>
                Save to Meal Plan
              </button>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'recipes' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20 }}>
          <form
            onSubmit={handleCreateRecipe}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 12,
              padding: 20,
              alignSelf: 'start',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Add New Recipe</h3>
            <label style={labelStyle}>Recipe Title</label>
            <input
              value={recName}
              onChange={(e) => setRecName(e.target.value)}
              placeholder="e.g. Thai Green Curry"
              style={inputStyle}
            />
            <label style={labelStyle}>Default Meal Slot</label>
            <select
              value={recType}
              onChange={(e) => setRecType(e.target.value as 'breakfast' | 'lunch' | 'dinner')}
              style={inputStyle}
            >
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
            </select>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div>
                <label style={labelStyle}>Calories</label>
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
                <label style={labelStyle}>Prep (min)</label>
                <input
                  type="number"
                  value={recPrep}
                  onChange={(e) => setRecPrep(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
            <label style={labelStyle}>Ingredients (one per line or comma-separated)</label>
            <textarea
              rows={4}
              value={recIngredients}
              onChange={(e) => setRecIngredients(e.target.value)}
              placeholder="200g Chicken Breast&#10;150g Jasmine Rice&#10;1 Broccoli"
              style={inputStyle}
            />
            <label style={labelStyle}>Instructions</label>
            <textarea
              rows={3}
              value={recInstructions}
              onChange={(e) => setRecInstructions(e.target.value)}
              style={inputStyle}
            />
            <button type="submit" style={{ ...btnPrimary, width: '100%' }}>
              Save Recipe
            </button>
          </form>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {recipes.map((r) => (
              <div
                key={r.id}
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: 12,
                  padding: 16,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: '#38bdf8', textTransform: 'uppercase' }}>
                    {r.meal_type} • {r.prep_minutes} min
                  </span>
                  <button
                    onClick={async () => {
                      await api.delete(`/recipes?id=${r.id}`);
                      await loadData(weekStart);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ef4444',
                      cursor: 'pointer',
                    }}
                  >
                    Delete
                  </button>
                </div>
                <h4 style={{ margin: '6px 0' }}>{r.name}</h4>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
                  🔥 {r.calories} kcal • 💪 {r.protein_g}g protein
                </div>
                <div style={{ fontSize: 12, color: '#cbd5e1', marginBottom: 8 }}>
                  <strong>Ingredients:</strong> {r.ingredients.join(', ')}
                </div>
                {r.instructions && (
                  <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>{r.instructions}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'groceries' && (
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 12,
              padding: 20,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <h3 style={{ margin: 0 }}>🛒 Shopping & Grocery Checklist</h3>
              <button
                onClick={async () => {
                  await api.delete('/groceries/checked');
                  await loadData(weekStart);
                }}
                style={btnTab}
              >
                Clear Checked Items
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newGrocery.trim()) return;
                await api.post('/groceries', { name: newGrocery });
                setNewGrocery('');
                await loadData(weekStart);
              }}
              style={{ display: 'flex', gap: 8, marginBottom: 16 }}
            >
              <input
                value={newGrocery}
                onChange={(e) => setNewGrocery(e.target.value)}
                placeholder="Add grocery item (e.g. Olive Oil, 6 Eggs)..."
                style={{ ...inputStyle, marginBottom: 0 }}
              />
              <button type="submit" style={btnPrimary}>
                Add
              </button>
            </form>

            {groceries.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: 14 }}>
                Your grocery list is empty. Click <strong>"Generate Grocery List from Week"</strong> on the Weekly Schedule tab!
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {groceries.map((g) => (
                  <div
                    key={g.id}
                    onClick={async () => {
                      await api.post('/groceries/toggle', { id: g.id });
                      await loadData(weekStart);
                    }}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 14px',
                      borderRadius: 8,
                      background: '#0f172a',
                      border: '1px solid #334155',
                      cursor: 'pointer',
                      opacity: g.checked ? 0.5 : 1,
                    }}
                  >
                    <div>
                      <span
                        style={{
                          textDecoration: g.checked ? 'line-through' : 'none',
                          fontWeight: 500,
                        }}
                      >
                        {g.checked ? '☑️ ' : '⬜ '}
                        {g.name}
                      </span>
                    </div>
                    {g.source_recipe && (
                      <span style={{ fontSize: 11, color: '#38bdf8' }}>{g.source_recipe}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: '#94a3b8',
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #334155',
  background: '#0f172a',
  color: '#f8fafc',
  marginBottom: 12,
};

const btnPrimary: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  border: 'none',
  background: '#0284c7',
  color: '#fff',
  fontWeight: 600,
  cursor: 'pointer',
};

const btnTab: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid #334155',
  background: '#1e293b',
  color: '#f8fafc',
  fontWeight: 600,
  cursor: 'pointer',
};

const btnOutline: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid #38bdf8',
  background: 'transparent',
  color: '#38bdf8',
  fontWeight: 600,
  cursor: 'pointer',
};
