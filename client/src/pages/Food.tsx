/**
 * Food tracker — Phase 1.
 *
 * Layout (top → bottom):
 *  • CalorieSummary card — kcal remaining, P/C/F macro bars (grams remaining)
 *  • WaterBar — consumed oz / dynamic target (base + carb-surplus × 0.12oz)
 *  • Log section — interleaved Meals and standalone FoodEntries, newest first
 *    - MealCard: expandable, contains FoodEntryRow items, "+ Add to meal" button
 *    - StandaloneFoodCard: single entry, swipe/tap to delete
 *  • AddFoodSheet (Shadcn Sheet, bottom): search → results → serving screen
 *    - Barcode button mounts BarcodeScanner → lookupBarcode → serving screen
 *  • GoalsSheet: edit calorie / macro / water targets
 */
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import * as store from "@/lib/storage";
import { searchFoods, lookupBarcode, type FoodSearchResult } from "@/lib/foodApi";
import type { FoodEntry, Meal, NutritionGoals } from "@shared/schema";
import {
  UtensilsCrossed,
  Plus,
  Scan,
  ChevronDown,
  ChevronUp,
  Trash2,
  Settings2,
  Droplets,
  Search,
  LoaderCircle,
  ChevronLeft,
} from "lucide-react";
import BarcodeScanner from "@/components/BarcodeScanner";

// ── helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function computeMacros(food: FoodSearchResult, servingG: number) {
  const m = servingG / 100;
  return {
    calories: Math.round(food.caloriesPer100g * m * 10) / 10,
    proteinG: Math.round(food.proteinPer100g * m * 10) / 10,
    carbsG:   Math.round(food.carbsPer100g * m * 10) / 10,
    fatG:     Math.round(food.fatPer100g * m * 10) / 10,
  };
}

// ── MacroBar ─────────────────────────────────────────────────────────────────

function MacroBar({
  label, consumed, target, color,
}: { label: string; consumed: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min(100, (consumed / target) * 100) : 0;
  const remaining = Math.max(0, target - consumed);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{Math.round(remaining)}g left</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ── CalorieSummary ────────────────────────────────────────────────────────────

function CalorieSummary({
  goals,
  totals,
  onEditGoals,
}: {
  goals: NutritionGoals;
  totals: { calories: number; proteinG: number; carbsG: number; fatG: number };
  onEditGoals: () => void;
}) {
  const calRemaining = Math.max(0, goals.calorieTarget - totals.calories);
  const calOver = totals.calories > goals.calorieTarget
    ? Math.round(totals.calories - goals.calorieTarget)
    : 0;

  return (
    <div className="rounded-2xl bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-orange-500/15 flex items-center justify-center">
            <UtensilsCrossed className="w-4 h-4 text-orange-400" />
          </div>
          <span className="font-semibold text-sm">Nutrition</span>
        </div>
        <button
          onClick={onEditGoals}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Edit goals"
        >
          <Settings2 className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-end gap-1">
        <span className="text-4xl font-bold tabular-nums leading-none">
          {Math.round(calRemaining)}
        </span>
        <span className="text-muted-foreground text-sm mb-1">
          {calOver > 0 ? `kcal over (${calOver} surplus)` : "kcal remaining"}
        </span>
      </div>

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{Math.round(totals.calories)} eaten</span>
        <span>{goals.calorieTarget} goal</span>
      </div>

      <div className="space-y-2.5">
        <MacroBar label="Protein" consumed={totals.proteinG} target={goals.proteinTargetG} color="#f97316" />
        <MacroBar label="Carbs"   consumed={totals.carbsG}   target={goals.carbsTargetG}   color="#eab308" />
        <MacroBar label="Fat"     consumed={totals.fatG}     target={goals.fatTargetG}     color="#3b82f6" />
      </div>
    </div>
  );
}

// ── WaterBar ──────────────────────────────────────────────────────────────────

function WaterBar({
  goals,
  carbsConsumedG,
  today,
  onRefresh,
}: {
  goals: NutritionGoals;
  carbsConsumedG: number;
  today: string;
  onRefresh: () => void;
}) {
  const waterEntries = store.getWaterEntriesForDate(today);
  const consumedOz = waterEntries.reduce((sum, e) => sum + e.amountOz, 0);

  // Dynamic target: base + excess carbs × 0.12 oz
  const excessCarbs = Math.max(0, carbsConsumedG - goals.carbsTargetG);
  const targetOz = Math.round(goals.waterTargetOz + excessCarbs * 0.12);

  const pct = targetOz > 0 ? Math.min(100, (consumedOz / targetOz) * 100) : 0;

  function addWater(oz: number) {
    store.addWaterEntry(oz);
    onRefresh();
  }

  return (
    <div className="rounded-2xl bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Droplets className="w-4 h-4 text-sky-400" />
          <span className="font-semibold text-sm">Water</span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {Math.round(consumedOz)} / {targetOz} oz
          {excessCarbs > 0 && (
            <span className="text-sky-400 ml-1">(+{Math.round(excessCarbs * 0.12)} from carbs)</span>
          )}
        </span>
      </div>

      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-sky-400 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 rounded-xl h-8 text-xs"
          onClick={() => addWater(8)}
        >
          +8 oz
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 rounded-xl h-8 text-xs"
          onClick={() => addWater(16)}
        >
          +16 oz
        </Button>
      </div>
    </div>
  );
}

// ── FoodEntryRow (inside MealCard) ────────────────────────────────────────────

function FoodEntryRow({
  entry,
  onDelete,
}: { entry: FoodEntry; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-between py-2.5 px-1 group">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{entry.name}</p>
        <p className="text-xs text-muted-foreground">
          {entry.servingG}g · {Math.round(entry.calories)} kcal
        </p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 ml-2">
        <div className="text-right hidden sm:block">
          <p className="text-xs text-muted-foreground tabular-nums">
            P {Math.round(entry.proteinG)}g · C {Math.round(entry.carbsG)}g · F {Math.round(entry.fatG)}g
          </p>
        </div>
        <button
          onClick={onDelete}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
          aria-label="Delete food"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── MealCard ──────────────────────────────────────────────────────────────────

function MealCard({
  meal,
  entries,
  onDeleteEntry,
  onDeleteMeal,
  onAddFood,
}: {
  meal: Meal;
  entries: FoodEntry[];
  onDeleteEntry: (id: string) => void;
  onDeleteMeal: (id: string) => void;
  onAddFood: (mealId: string, mealName: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const mealTotals = entries.reduce(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      proteinG: acc.proteinG + e.proteinG,
      carbsG: acc.carbsG + e.carbsG,
      fatG: acc.fatG + e.fatG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  );

  return (
    <div className="rounded-2xl bg-card overflow-hidden">
      {/* Meal header */}
      <button
        className="w-full p-4 flex items-center justify-between text-left active:bg-white/[0.03]"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm">{meal.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatTime(meal.loggedAt)} · {Math.round(mealTotals.calories)} kcal
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden sm:block tabular-nums">
            P {Math.round(mealTotals.proteinG)} · C {Math.round(mealTotals.carbsG)} · F {Math.round(mealTotals.fatG)}
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          )}
        </div>
      </button>

      {/* Expanded entries */}
      {expanded && (
        <div className="px-4 pb-3 space-y-0 border-t border-border/30">
          {entries.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3">No foods added yet</p>
          ) : (
            <div className="divide-y divide-border/30">
              {entries.map(e => (
                <FoodEntryRow
                  key={e.id}
                  entry={e}
                  onDelete={() => onDeleteEntry(e.id)}
                />
              ))}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl h-8 text-xs"
              onClick={() => onAddFood(meal.id, meal.name)}
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Food
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="rounded-xl h-8 text-xs text-muted-foreground hover:text-destructive"
              onClick={() => onDeleteMeal(meal.id)}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete Meal
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── StandaloneFoodCard ────────────────────────────────────────────────────────

function StandaloneFoodCard({
  entry,
  onDelete,
}: { entry: FoodEntry; onDelete: () => void }) {
  return (
    <div className="rounded-2xl bg-card p-4 flex items-center justify-between group">
      <div className="min-w-0">
        <p className="font-semibold text-sm">{entry.name}</p>
        {entry.brand && (
          <p className="text-xs text-muted-foreground">{entry.brand}</p>
        )}
        <p className="text-xs text-muted-foreground mt-0.5">
          {entry.servingG}g · {Math.round(entry.calories)} kcal ·{" "}
          P {Math.round(entry.proteinG)}g · C {Math.round(entry.carbsG)}g · F {Math.round(entry.fatG)}g
        </p>
        <p className="text-xs text-muted-foreground">{formatTime(entry.loggedAt)}</p>
      </div>
      <button
        onClick={onDelete}
        className="ml-3 w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        aria-label="Delete food"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── ServingScreen (inside AddFoodSheet) ───────────────────────────────────────

function ServingScreen({
  food,
  onBack,
  onSave,
}: {
  food: FoodSearchResult;
  onBack: () => void;
  onSave: (servingG: number) => void;
}) {
  const [servingG, setServingG] = useState<string>(
    String(food.servingSizeG || 100)
  );

  const parsed = parseFloat(servingG);
  const macros = !isNaN(parsed) && parsed > 0
    ? computeMacros(food, parsed)
    : { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };

  return (
    <div className="space-y-5">
      <button
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        onClick={onBack}
      >
        <ChevronLeft className="w-4 h-4" /> Back
      </button>

      <div>
        <p className="font-semibold">{food.name}</p>
        {food.brand && <p className="text-sm text-muted-foreground">{food.brand}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="serving-g">Serving size (grams)</Label>
        <Input
          id="serving-g"
          type="number"
          inputMode="decimal"
          min="1"
          value={servingG}
          onChange={e => setServingG(e.target.value)}
          className="rounded-xl"
          placeholder="100"
          autoFocus
        />
        {food.servingSizeLabel && (
          <p className="text-xs text-muted-foreground">
            Typical serving: {food.servingSizeLabel} ({food.servingSizeG}g)
          </p>
        )}
      </div>

      {/* Live macro preview */}
      <div className="rounded-2xl bg-muted/40 p-4 grid grid-cols-4 gap-2 text-center">
        {[
          { label: "Calories", value: Math.round(macros.calories), unit: "kcal" },
          { label: "Protein",  value: Math.round(macros.proteinG),  unit: "g"    },
          { label: "Carbs",    value: Math.round(macros.carbsG),    unit: "g"    },
          { label: "Fat",      value: Math.round(macros.fatG),      unit: "g"    },
        ].map(({ label, value, unit }) => (
          <div key={label}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-bold text-sm tabular-nums">{value}<span className="text-muted-foreground font-normal">{unit}</span></p>
          </div>
        ))}
      </div>

      <Button
        className="w-full rounded-xl h-11"
        disabled={isNaN(parsed) || parsed <= 0}
        onClick={() => onSave(parsed)}
      >
        Add to Log
      </Button>
    </div>
  );
}

// ── GoalsSheet ────────────────────────────────────────────────────────────────

function GoalsSheet({
  open,
  onClose,
  onSaved,
}: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [goals, setGoals] = useState(() => store.getNutritionGoals());

  useEffect(() => {
    if (open) setGoals(store.getNutritionGoals());
  }, [open]);

  function field(
    key: keyof NutritionGoals,
    label: string,
    unit: string
  ) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={`goal-${key}`}>{label} ({unit})</Label>
        <Input
          id={`goal-${key}`}
          type="number"
          inputMode="decimal"
          min="0"
          value={goals[key] as number}
          onChange={e =>
            setGoals(g => ({ ...g, [key]: parseFloat(e.target.value) || 0 }))
          }
          className="rounded-xl"
        />
      </div>
    );
  }

  function save() {
    store.saveNutritionGoals(goals);
    onSaved();
    onClose();
  }

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto">
        <SheetHeader className="mb-5">
          <SheetTitle>Daily Goals</SheetTitle>
        </SheetHeader>
        <div className="space-y-4">
          {field("calorieTarget",  "Calories",  "kcal")}
          {field("proteinTargetG", "Protein",   "g"   )}
          {field("carbsTargetG",   "Carbs",     "g"   )}
          {field("fatTargetG",     "Fat",       "g"   )}
          {field("waterTargetOz",  "Water",     "oz"  )}
          <Button className="w-full rounded-xl h-11 mt-2" onClick={save}>
            Save Goals
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── AddFoodSheet ──────────────────────────────────────────────────────────────

type AddContext =
  | { type: "standalone" }
  | { type: "meal"; mealId: string; mealName: string };

function AddFoodSheet({
  open,
  context,
  today,
  onClose,
  onSaved,
}: {
  open: boolean;
  context: AddContext;
  today: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [screen, setScreen] = useState<"search" | "serving" | "scanner">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedFood, setSelectedFood] = useState<FoodSearchResult | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset on open/close
  useEffect(() => {
    if (!open) {
      setScreen("search");
      setQuery("");
      setResults([]);
      setSelectedFood(null);
      setIsSearching(false);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const r = await searchFoods(query.trim());
        setResults(r);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  async function handleBarcode(barcode: string) {
    setScreen("search");
    setIsSearching(true);
    try {
      const r = await lookupBarcode(barcode);
      if (r) {
        setSelectedFood(r);
        setScreen("serving");
      } else {
        setQuery(barcode);
      }
    } catch {
      setQuery(barcode);
    } finally {
      setIsSearching(false);
    }
  }

  function saveFood(servingG: number) {
    if (!selectedFood) return;
    const macros = computeMacros(selectedFood, servingG);
    store.createFoodEntry({
      mealId: context.type === "meal" ? context.mealId : null,
      customFoodId: null,
      name: selectedFood.name,
      brand: selectedFood.brand,
      servingG,
      servingSizeLabel: selectedFood.servingSizeLabel,
      calories: macros.calories,
      proteinG: macros.proteinG,
      carbsG: macros.carbsG,
      fatG: macros.fatG,
      loggedAt: new Date().toISOString(),
      date: today,
    });
    onSaved();
    onClose();
  }

  const title = context.type === "meal"
    ? `Add to ${context.mealName}`
    : "Add Food";

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[90vh] overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>

        {screen === "scanner" && (
          <div className="space-y-4">
            <BarcodeScanner onDetect={handleBarcode} onError={() => setScreen("search")} />
            <Button
              variant="outline"
              className="w-full rounded-xl"
              onClick={() => setScreen("search")}
            >
              Cancel
            </Button>
          </div>
        )}

        {screen === "serving" && selectedFood && (
          <ServingScreen
            food={selectedFood}
            onBack={() => setScreen("search")}
            onSave={saveFood}
          />
        )}

        {screen === "search" && (
          <div className="space-y-4">
            {/* Search bar */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  className="pl-9 rounded-xl"
                  placeholder="Search food or brand…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  autoFocus
                />
              </div>
              <Button
                size="icon"
                variant="outline"
                className="rounded-xl flex-shrink-0"
                aria-label="Scan barcode"
                onClick={() => setScreen("scanner")}
              >
                <Scan className="w-4 h-4" />
              </Button>
            </div>

            {/* Results */}
            {isSearching && (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
                <LoaderCircle className="w-4 h-4 animate-spin" />
                Searching…
              </div>
            )}

            {!isSearching && results.length > 0 && (
              <div className="divide-y divide-border/40 rounded-2xl bg-muted/30 overflow-hidden">
                {results.map(r => (
                  <button
                    key={r.id}
                    className="w-full text-left px-4 py-3 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors"
                    onClick={() => { setSelectedFood(r); setScreen("serving"); }}
                  >
                    <p className="text-sm font-medium leading-snug">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.brand && `${r.brand} · `}
                      {Math.round(r.caloriesPer100g)} kcal/100g
                    </p>
                  </button>
                ))}
              </div>
            )}

            {!isSearching && query.trim() && results.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">
                No results found. Try a different name.
              </p>
            )}

            {!query.trim() && (
              <p className="text-center text-sm text-muted-foreground py-8">
                Type to search, or tap <Scan className="inline w-3.5 h-3.5 mx-1" /> to scan a barcode.
              </p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Main Food page ────────────────────────────────────────────────────────────

export default function Food() {
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);

  const today = useMemo(() => store.getFoodDate(), [tick]);
  const goals = useMemo(() => store.getNutritionGoals(), [tick]);
  const meals = useMemo(() => store.getMealsForDate(today), [today, tick]);
  const allEntries = useMemo(() => store.getFoodEntriesForDate(today), [today, tick]);

  const totals = useMemo(() => {
    return allEntries.reduce(
      (acc, e) => ({
        calories: acc.calories + e.calories,
        proteinG: acc.proteinG + e.proteinG,
        carbsG:   acc.carbsG   + e.carbsG,
        fatG:     acc.fatG     + e.fatG,
      }),
      { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
    );
  }, [allEntries]);

  // Sheet state
  const [addOpen, setAddOpen] = useState(false);
  const [addContext, setAddContext] = useState<AddContext>({ type: "standalone" });
  const [goalsOpen, setGoalsOpen] = useState(false);

  function openAddStandalone() {
    setAddContext({ type: "standalone" });
    setAddOpen(true);
  }

  function openAddToMeal(mealId: string, mealName: string) {
    setAddContext({ type: "meal", mealId, mealName });
    setAddOpen(true);
  }

  function createMealAndAdd() {
    const meal = store.createMeal({
      name: "",
      loggedAt: new Date().toISOString(),
      date: today,
    });
    refresh();
    openAddToMeal(meal.id, meal.name);
  }

  function handleDeleteEntry(id: string) {
    store.deleteFoodEntry(id);
    refresh();
  }

  function handleDeleteMeal(id: string) {
    store.deleteMeal(id);
    refresh();
  }

  // Build merged + sorted log items (newest first) ─ Meals and standalone entries
  const standaloneEntries = allEntries.filter(e => e.mealId === null);

  type LogItem =
    | { kind: "meal"; meal: Meal; entries: FoodEntry[]; sortKey: number }
    | { kind: "standalone"; entry: FoodEntry; sortKey: number };

  const logItems: LogItem[] = [
    ...meals.map(meal => ({
      kind: "meal" as const,
      meal,
      entries: allEntries.filter(e => e.mealId === meal.id),
      sortKey: new Date(meal.loggedAt).getTime(),
    })),
    ...standaloneEntries.map(entry => ({
      kind: "standalone" as const,
      entry,
      sortKey: new Date(entry.loggedAt).getTime(),
    })),
  ].sort((a, b) => b.sortKey - a.sortKey);

  return (
    <AppShell>
      <div className="space-y-4">
        {/* Calorie summary */}
        <CalorieSummary
          goals={goals}
          totals={totals}
          onEditGoals={() => setGoalsOpen(true)}
        />

        {/* Water bar */}
        <WaterBar
          goals={goals}
          carbsConsumedG={totals.carbsG}
          today={today}
          onRefresh={refresh}
        />

        {/* Log header */}
        <div className="flex items-center justify-between pt-1">
          <h2 className="font-semibold text-sm">Today's Log</h2>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl h-8 text-xs"
              onClick={createMealAndAdd}
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> New Meal
            </Button>
            <Button
              size="sm"
              className="rounded-xl h-8 text-xs"
              onClick={openAddStandalone}
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Food
            </Button>
          </div>
        </div>

        {/* Log items */}
        {logItems.length === 0 ? (
          <div className="rounded-2xl bg-card p-8 text-center">
            <UtensilsCrossed className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No food logged yet today.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Tap "+ Add Food" or "+ New Meal" to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {logItems.map(item => {
              if (item.kind === "meal") {
                return (
                  <MealCard
                    key={item.meal.id}
                    meal={item.meal}
                    entries={item.entries}
                    onDeleteEntry={handleDeleteEntry}
                    onDeleteMeal={handleDeleteMeal}
                    onAddFood={openAddToMeal}
                  />
                );
              }
              return (
                <StandaloneFoodCard
                  key={item.entry.id}
                  entry={item.entry}
                  onDelete={() => handleDeleteEntry(item.entry.id)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Sheets */}
      <AddFoodSheet
        open={addOpen}
        context={addContext}
        today={today}
        onClose={() => setAddOpen(false)}
        onSaved={refresh}
      />
      <GoalsSheet
        open={goalsOpen}
        onClose={() => setGoalsOpen(false)}
        onSaved={refresh}
      />
    </AppShell>
  );
}
