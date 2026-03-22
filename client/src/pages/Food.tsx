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
import MacroBar from "@/components/MacroBar";
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
  GlassWater,
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
  const isOver = totals.calories > goals.calorieTarget;
  const remaining = Math.round(goals.calorieTarget - totals.calories);

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

      {/* Goal − Food = Remaining equation */}
      <div className="grid grid-cols-5 items-center text-center">
        <div className="col-span-1">
          <p className="text-2xl font-bold tabular-nums leading-none">{goals.calorieTarget}</p>
          <p className="text-[10px] text-muted-foreground mt-1">kcal goal</p>
        </div>
        <div className="col-span-1 text-lg text-muted-foreground font-light">−</div>
        <div className="col-span-1">
          <p className="text-2xl font-bold tabular-nums leading-none">{Math.round(totals.calories)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">kcal eaten</p>
        </div>
        <div className="col-span-1 text-lg text-muted-foreground font-light">=</div>
        <div className="col-span-1">
          <p className={`text-2xl font-bold tabular-nums leading-none ${isOver ? "text-red-400" : "text-green-400"}`}>
            {Math.abs(remaining)}
          </p>
          <p className={`text-[10px] mt-1 ${isOver ? "text-red-400/70" : "text-muted-foreground"}`}>
            {isOver ? "kcal over" : "kcal left"}
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        <MacroBar label="Carbs"   consumed={totals.carbsG}   target={goals.carbsTargetG}   color="#eab308" />
        <MacroBar label="Protein" consumed={totals.proteinG} target={goals.proteinTargetG} color="#f97316" />
        <MacroBar label="Fat"     consumed={totals.fatG}     target={goals.fatTargetG}     color="#3b82f6" />
      </div>
    </div>
  );
}

// ── WaterBar ──────────────────────────────────────────────────────────────────

const WATER_AMOUNTS = [
  { oz: 8,  label: "+8 oz",  Icon: GlassWater },
  { oz: 16, label: "+16 oz", Icon: GlassWater },
  { oz: 32, label: "+32 oz", Icon: GlassWater },
  { oz: 64, label: "+64 oz", Icon: GlassWater },
];

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
  const [useEmoji, setUseEmoji] = useState(false);
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
        <div className="flex items-center gap-2">
          {/* Unit toggle */}
          <button
            className="relative flex h-6 rounded-full bg-muted overflow-hidden"
            style={{ width: "56px" }}
            onClick={() => setUseEmoji(v => !v)}
            aria-label="Toggle display units"
          >
            <div
              className="absolute top-[2px] h-5 w-[24px] rounded-full bg-sky-400 shadow transition-all duration-200"
              style={{ left: useEmoji ? "2px" : "30px" }}
            />
            <div className="relative w-1/2 h-full flex items-center justify-center z-10">
              <GlassWater className="w-3 h-3 text-foreground" />
            </div>
            <div className="relative w-1/2 h-full flex items-center justify-center z-10">
              <span className="text-[10px] font-bold text-foreground leading-none">oz</span>
            </div>
          </button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {Math.round(consumedOz)} / {targetOz} oz
            {excessCarbs > 0 && (
              <span className="text-sky-400 ml-1">(+{Math.round(excessCarbs * 0.12)})</span>
            )}
          </span>
        </div>
      </div>

      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-sky-400 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {WATER_AMOUNTS.map(({ oz, label, Icon }) => (
          <Button
            key={oz}
            size="sm"
            variant="outline"
            className="flex-1 rounded-xl h-10 text-xs flex flex-col items-center justify-center gap-0.5 px-0"
            onClick={() => addWater(oz)}
          >
            {useEmoji
              ? <Icon className="w-5 h-5 text-sky-300" />
              : <span className="text-xs font-medium">{label}</span>
            }
          </Button>
        ))}
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
  const [mode, setMode] = useState<"percent" | "grams">("percent");
  const [calorieInput, setCalorieInput] = useState("2000");
  const [waterOz, setWaterOz] = useState(64);
  const [splits, setSplits] = useState({ carbs: "50", protein: "20", fat: "30" });
  const [lastChanged, setLastChanged] = useState<"carbs" | "protein" | "fat" | null>(null);
  const [gramGoals, setGramGoals] = useState({ carbs: 250, protein: 100, fat: 67 });

  useEffect(() => {
    if (!open) return;
    const g = store.getNutritionGoals();
    setCalorieInput(String(g.calorieTarget));
    setWaterOz(g.waterTargetOz);
    if (g.calorieTarget > 0) {
      const cPct = Math.round((g.carbsTargetG * 4 / g.calorieTarget) * 100);
      const pPct = Math.round((g.proteinTargetG * 4 / g.calorieTarget) * 100);
      const fPct = Math.round((g.fatTargetG * 9 / g.calorieTarget) * 100);
      const sum = cPct + pPct + fPct;
      setSplits(sum >= 95 && sum <= 105
        ? { carbs: String(cPct), protein: String(pPct), fat: String(fPct) }
        : { carbs: "50", protein: "20", fat: "30" });
    } else {
      setSplits({ carbs: "50", protein: "20", fat: "30" });
    }
    setLastChanged(null);
    setMode("percent");
  }, [open]);

  const calories = parseFloat(calorieInput) || 0;
  function parseSplit(v: string) { const n = parseInt(v, 10); return isNaN(n) ? 0 : Math.max(0, Math.min(100, n)); }
  const splitTotal = parseSplit(splits.carbs) + parseSplit(splits.protein) + parseSplit(splits.fat);

  function calcGrams(macro: "carbs" | "protein" | "fat") {
    return Math.round((calories * parseSplit(splits[macro]) / 100) / (macro === "fat" ? 9 : 4));
  }

  function adjustSplit(macro: "carbs" | "protein" | "fat", delta: number) {
    setSplits(s => ({ ...s, [macro]: String(Math.max(0, Math.min(100, parseSplit(s[macro]) + delta))) }));
    setLastChanged(macro);
  }

  function typeSplit(macro: "carbs" | "protein" | "fat", val: string) {
    // Allow empty string so user can fully clear the field
    setSplits(s => ({ ...s, [macro]: val }));
    setLastChanged(macro);
  }

  function autoFill(macro: "carbs" | "protein" | "fat") {
    const others = (["carbs", "protein", "fat"] as const).filter(m => m !== macro);
    const otherSum = others.reduce((sum, m) => sum + parseSplit(splits[m]), 0);
    setSplits(s => ({ ...s, [macro]: String(Math.max(0, 100 - otherSum)) }));
    setLastChanged(macro);
  }

  function switchToGrams() {
    setGramGoals({ carbs: calcGrams("carbs"), protein: calcGrams("protein"), fat: calcGrams("fat") });
    setMode("grams");
  }

  function save() {
    const base = store.getNutritionGoals();
    store.saveNutritionGoals({
      ...base,
      calorieTarget: calories,
      waterTargetOz: waterOz,
      ...(mode === "percent"
        ? { carbsTargetG: calcGrams("carbs"), proteinTargetG: calcGrams("protein"), fatTargetG: calcGrams("fat") }
        : { carbsTargetG: gramGoals.carbs, proteinTargetG: gramGoals.protein, fatTargetG: gramGoals.fat }
      ),
    });
    onSaved();
    onClose();
  }

  const macroConfig: Array<{ macro: "carbs" | "protein" | "fat"; label: string; color: string }> = [
    { macro: "carbs",   label: "Carbs",   color: "#eab308" },
    { macro: "protein", label: "Protein", color: "#f97316" },
    { macro: "fat",     label: "Fat",     color: "#3b82f6" },
  ];

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto">
        <SheetHeader className="mb-5">
          <SheetTitle>Daily Goals</SheetTitle>
        </SheetHeader>
        <div className="space-y-5">

          {/* Calories */}
          <div className="space-y-1.5">
            <Label htmlFor="goal-calories">Calories (kcal)</Label>
            <Input
              id="goal-calories"
              type="number"
              inputMode="decimal"
              min="0"
              value={calorieInput}
              onChange={e => setCalorieInput(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* Mode toggle */}
          <div className="flex gap-1 p-1 bg-muted rounded-xl">
            <button
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                mode === "percent" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
              onClick={() => setMode("percent")}
            >% Split</button>
            <button
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                mode === "grams" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
              onClick={switchToGrams}
            >Custom Grams</button>
          </div>

          {/* Percent split mode */}
          {mode === "percent" && (
            <div className="space-y-4">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Total split</span>
                <span className={splitTotal === 100 ? "text-green-400 font-semibold" : "text-red-400 font-semibold"}>
                  {splitTotal}%{splitTotal !== 100 && ` (${splitTotal > 100 ? "+" : ""}${splitTotal - 100}%)`}
                </span>
              </div>

              {macroConfig.map(({ macro, label, color }) => {
                const pct = splits[macro];
                const pctNum = parseSplit(pct);
                const grams = calcGrams(macro);
                const showAuto = splitTotal !== 100 && macro !== lastChanged;
                return (
                  <div key={macro} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold" style={{ color }}>{label}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{grams}g</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center font-bold text-lg leading-none hover:bg-muted/70 active:scale-95 transition-all disabled:opacity-40"
                        onClick={() => adjustSplit(macro, -5)}
                        disabled={pctNum <= 0}
                      >−</button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max="100"
                        value={pct}
                        onChange={e => typeSplit(macro, e.target.value)}
                        className="flex-1 h-8 rounded-lg bg-muted text-center text-sm font-mono border border-transparent focus:border-primary focus:outline-none focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                      <button
                        className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center font-bold text-lg leading-none hover:bg-muted/70 active:scale-95 transition-all disabled:opacity-40"
                        onClick={() => adjustSplit(macro, 5)}
                        disabled={pctNum >= 100}
                      >+</button>
                      <div className="w-14 flex-shrink-0">
                        {showAuto && (
                          <button
                            className="w-full h-8 rounded-lg bg-primary/15 text-primary text-xs font-semibold hover:bg-primary/25 active:scale-95 transition-all"
                            onClick={() => autoFill(macro)}
                          >Auto</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Custom grams mode */}
          {mode === "grams" && (
            <div className="space-y-3">
              {macroConfig.map(({ macro, label, color }) => (
                <div key={macro} className="space-y-1.5">
                  <Label htmlFor={`goal-g-${macro}`} style={{ color }}>{label} (g)</Label>
                  <Input
                    id={`goal-g-${macro}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={gramGoals[macro]}
                    onChange={e => setGramGoals(g => ({ ...g, [macro]: parseFloat(e.target.value) || 0 }))}
                    className="rounded-xl"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Water */}
          <div className="space-y-1.5">
            <Label htmlFor="goal-water">Water (oz)</Label>
            <Input
              id="goal-water"
              type="number"
              inputMode="decimal"
              min="0"
              value={waterOz}
              onChange={e => setWaterOz(parseFloat(e.target.value) || 0)}
              className="rounded-xl"
            />
          </div>

          <Button
            className="w-full rounded-xl h-11 mt-2"
            disabled={mode === "percent" && splitTotal !== 100}
            onClick={save}
          >
            Save Goals
          </Button>
          {mode === "percent" && splitTotal !== 100 && (
            <p className="text-center text-xs text-red-400 -mt-2">Percentages must sum to 100%</p>
          )}
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
