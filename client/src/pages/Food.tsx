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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import MacroBar from "@/components/MacroBar";
import * as store from "@/lib/storage";
import { searchFoods, lookupBarcode, type FoodSearchResult } from "@/lib/foodApi";
import { MACRO_COLORS } from "@/lib/macroColors";
import type { FoodEntry, Meal, NutritionGoals } from "@shared/schema";
import {
  UtensilsCrossed,
  Plus,
  Scan,
  ChevronDown,
  ChevronUp,
  Trash2,
  Settings2,
  Search,
  LoaderCircle,
  ChevronLeft,
  GlassWater,
  Clock,
  RotateCcw,
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

/**
 * Returns a human-readable serving amount for a food entry row.
 * Liquids (detected by "ml" or "fl oz" in servingSizeLabel) are shown as
 * number-of-servings when a ml denominator can be parsed, otherwise in fl oz.
 * Solid foods are shown in grams, rounded to a whole number.
 */
function formatServingDisplay(servingG: number, servingSizeLabel: string): string {
  const label = servingSizeLabel ?? "";
  if (!/\bml\b|fl\.?\s*oz/i.test(label)) {
    return `${Math.round(servingG)}g`;
  }
  // Liquid: try to express as number of default servings using the mL in the label
  const mlM = label.match(/(\d+(?:\.\d+)?)\s*ml/i);
  if (mlM) {
    const denom = parseFloat(mlM[1]);
    if (denom > 0) {
      const n = Math.round((servingG / denom) * 10) / 10;
      if (n > 0) return `${n} srv`;
    }
  }
  // Try fl oz denomination in the label
  const flozM = label.match(/(\d+(?:\.\d+)?)\s*fl\.?\s*oz/i);
  if (flozM) {
    const denomFloz = parseFloat(flozM[1]);
    if (denomFloz > 0) {
      const n = Math.round((servingG / (denomFloz * 29.5735)) * 10) / 10;
      if (n > 0) return `${n} srv`;
    }
  }
  // No usable denomination — fall back to fl oz
  return `${Math.round((servingG / 29.5735) * 10) / 10} fl oz`;
}

/** Convert an ISO timestamp to "HH:MM" for <input type="time"> (local time). */
function isoToTimeInput(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Apply an "HH:MM" time (local) onto an existing ISO timestamp, preserving its date. */
function applyTimeToIso(iso: string, hhmm: string): string {
  const d = new Date(iso);
  const [h, m] = hhmm.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

/** Build a full ISO timestamp from a food-date string ("YYYY-MM-DD") and "HH:MM" local time. */
function buildLoggedAt(date: string, hhmm: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(year, month - 1, day, h, m, 0, 0).toISOString();
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
        <MacroBar label="Carbs"   consumed={totals.carbsG}   target={goals.carbsTargetG}   color={MACRO_COLORS.carbs} />
        <MacroBar label="Protein" consumed={totals.proteinG} target={goals.proteinTargetG} color={MACRO_COLORS.protein} />
        <MacroBar label="Fat"     consumed={totals.fatG}     target={goals.fatTargetG}     color={MACRO_COLORS.fat} />
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
    <div className="rounded-2xl bg-card p-4 pb-6 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GlassWater className="w-4 h-4 text-sky-400" />
          <span className="font-semibold text-sm">Water</span>
        </div>
        <div className="flex items-center gap-2">
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
        {WATER_AMOUNTS.map(({ oz, label }) => (
          <Button
            key={oz}
            size="sm"
            variant="outline"
            className="flex-1 rounded-xl h-10 text-xs"
            onClick={() => addWater(oz)}
          >
            {label}
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
          {formatServingDisplay(entry.servingG, entry.servingSizeLabel)} · {Math.round(entry.calories)} kcal
        </p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 ml-2">
        <div className="text-right hidden sm:block">
          <p className="text-xs text-muted-foreground tabular-nums">
            Carbs {Math.round(entry.carbsG)}g · Protein {Math.round(entry.proteinG)}g · Fat {Math.round(entry.fatG)}g
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
  onUpdateTime,
}: {
  meal: Meal;
  entries: FoodEntry[];
  onDeleteEntry: (id: string) => void;
  onDeleteMeal: (id: string) => void;
  onAddFood: (mealId: string, mealName: string) => void;
  onUpdateTime: (mealId: string, loggedAt: string) => void;
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
      {/* Meal header — clicking anywhere expands/collapses; the time input stops propagation */}
      <div
        className="w-full p-4 flex items-center justify-between text-left cursor-pointer active:bg-white/[0.03]"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="min-w-0">
            <p className="font-semibold text-sm">{meal.name}</p>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3 shrink-0" />
              <input
                type="time"
                value={isoToTimeInput(meal.loggedAt)}
                onClick={(e) => e.stopPropagation()}
                onFocus={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation();
                  if (e.target.value) onUpdateTime(meal.id, applyTimeToIso(meal.loggedAt, e.target.value));
                }}
                className="appearance-none bg-transparent text-xs text-muted-foreground cursor-pointer hover:text-foreground focus:text-foreground focus:outline-none tabular-nums [&::-webkit-date-and-time-value]:text-left"
              />
              <span>· {Math.round(mealTotals.calories)} kcal</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-muted-foreground hidden sm:block tabular-nums">
            Carbs {Math.round(mealTotals.carbsG)} · Protein {Math.round(mealTotals.proteinG)} · Fat {Math.round(mealTotals.fatG)}
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          )}
        </div>
      </div>

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
  onUpdateTime,
}: { entry: FoodEntry; onDelete: () => void; onUpdateTime: (entryId: string, loggedAt: string) => void }) {
  return (
    <div className="rounded-2xl bg-card p-4 flex items-center justify-between group">
      <div className="min-w-0">
        <p className="font-semibold text-sm">{entry.name}</p>
        {entry.brand && (
          <p className="text-xs text-muted-foreground">{entry.brand}</p>
        )}
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatServingDisplay(entry.servingG, entry.servingSizeLabel)} · {Math.round(entry.calories)} kcal ·{" "}
          P {Math.round(entry.proteinG)}g · C {Math.round(entry.carbsG)}g · F {Math.round(entry.fatG)}g
        </p>
        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
          <Clock className="w-3 h-3 shrink-0" />
          <input
            type="time"
            value={isoToTimeInput(entry.loggedAt)}
            onChange={(e) => {
              if (e.target.value) onUpdateTime(entry.id, applyTimeToIso(entry.loggedAt, e.target.value));
            }}
            className="appearance-none bg-transparent text-xs text-muted-foreground cursor-pointer hover:text-foreground focus:text-foreground focus:outline-none tabular-nums [&::-webkit-date-and-time-value]:text-left"
          />
        </div>
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

type ServingUnit = "serving" | "g" | "oz" | "ml" | "floz";

function toGrams(qty: number, unit: ServingUnit, servingSizeG: number): number {
  switch (unit) {
    case "serving": return qty * servingSizeG;
    case "g":       return qty;
    case "oz":      return qty * 28.3495;
    case "ml":      return qty; // 1 ml ≈ 1 g for typical liquids
    case "floz":    return qty * 29.5735;
  }
}

function fromGrams(grams: number, unit: ServingUnit, servingSizeG: number): number {
  switch (unit) {
    case "serving": return grams / servingSizeG;
    case "g":       return grams;
    case "oz":      return grams / 28.3495;
    case "ml":      return grams;
    case "floz":    return grams / 29.5735;
  }
}

function ServingScreen({
  food,
  today,
  context,
  onBack,
  onSave,
}: {
  food: FoodSearchResult;
  today: string;
  context: AddContext;
  onBack: () => void;
  onSave: (servingG: number, loggedAt: string) => void;
}) {
  const defaultServingG = food.servingSizeG || 100;
  const isLiquid = /\bml\b|fl\.?\s*oz/i.test(food.servingSizeLabel ?? "");

  const unitOptions: { key: ServingUnit; label: string }[] = [
    { key: "serving", label: food.servingSizeLabel || `${defaultServingG}g serving` },
    { key: "g",       label: "grams (g)" },
    { key: "oz",      label: "ounces (oz)" },
    ...(isLiquid
      ? [
          { key: "ml"   as ServingUnit, label: "milliliters (ml)" },
          { key: "floz" as ServingUnit, label: "fl oz" },
        ]
      : []),
  ];

  const isInMeal = context.type === "meal";

  const [unit, setUnit] = useState<ServingUnit>("serving");
  const [qty, setQty] = useState<string>("1");

  // If in a meal, we use the meal's time (passed via buildLoggedAt later if needed,
  // but for the UI we show the state of logTime).
  // Actually, for a meal, we should probably just show the meal's current time if we can,
  // or just lock it to whatever the "loggedAt" value will be.
  // The store.createFoodEntry will set the mealId.
  const [logTime, setLogTime] = useState(() => {
    if (context.type === "meal") {
      const meal = store.getMeals().find(m => m.id === context.mealId);
      if (meal) return isoToTimeInput(meal.loggedAt);
    }
    return isoToTimeInput(new Date().toISOString());
  });

  function handleUnitChange(newUnit: ServingUnit) {
    const currentG = toGrams(parseFloat(qty) || 1, unit, defaultServingG);
    const converted = fromGrams(currentG, newUnit, defaultServingG);
    // Round nicely: servings to 2dp, others to 1dp
    const rounded = newUnit === "serving"
      ? Math.round(converted * 100) / 100
      : Math.round(converted * 10) / 10;
    setQty(String(rounded));
    setUnit(newUnit);
  }

  const parsedQty = parseFloat(qty);
  const servingG = !isNaN(parsedQty) && parsedQty > 0
    ? toGrams(parsedQty, unit, defaultServingG)
    : 0;
  const macros = servingG > 0
    ? computeMacros(food, servingG)
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
        <Label htmlFor="serving-qty">Amount</Label>
        <div className="flex gap-2">
          <Input
            id="serving-qty"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="any"
            value={qty}
            onChange={e => setQty(e.target.value)}
            className="rounded-xl flex-1 min-w-0"
            placeholder="1"
            autoFocus
          />
          <div className="relative shrink-0">
            <select
              value={unit}
              onChange={e => handleUnitChange(e.target.value as ServingUnit)}
              className="h-9 appearance-none rounded-xl border border-input bg-background pl-3 pr-8 py-2 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-w-[180px] truncate cursor-pointer"
            >
              {unitOptions.map(o => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          </div>
        </div>
        {unit === "serving" && defaultServingG > 0 && (
          <p className="text-xs text-muted-foreground">
            1 serving = {defaultServingG}g
          </p>
        )}
      </div>

      {/* Live macro preview */}
      <div className="rounded-2xl bg-muted/40 p-4 grid grid-cols-4 gap-2 text-center">
        {[
          { label: "Calories", value: Math.round(macros.calories), unit: "kcal", color: undefined },
          { label: "Carbs",    value: Math.round(macros.carbsG),    unit: "g",   color: MACRO_COLORS.carbs   },
          { label: "Protein",  value: Math.round(macros.proteinG),  unit: "g",   color: MACRO_COLORS.protein },
          { label: "Fat",      value: Math.round(macros.fatG),      unit: "g",   color: MACRO_COLORS.fat     },
        ].map(({ label, value, unit: u, color }) => (
          <div key={label}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-bold text-sm tabular-nums" style={color ? { color } : undefined}>{value}<span className="font-normal opacity-80">{u}</span></p>
          </div>
        ))}
      </div>

      {/* Log time — lets the user back-fill food logged at an earlier time */}
      <div className="space-y-1.5">
        <Label htmlFor="log-time" className={isInMeal ? "opacity-50" : ""}>Time</Label>
        <TooltipProvider>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <div className="relative">
                <Clock className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none ${isInMeal ? "opacity-50" : ""}`} />
                <Input
                  id="log-time"
                  type="time"
                  value={logTime}
                  disabled={isInMeal}
                  onChange={(e) => setLogTime(e.target.value)}
                  className={`rounded-xl pl-9 ${isInMeal ? "bg-muted cursor-not-allowed opacity-50" : ""}`}
                />
              </div>
            </TooltipTrigger>
            {isInMeal && (
              <TooltipContent side="top" className="max-w-[200px] text-center">
                Food time is set to match the meal time
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>

      <Button
        className="w-full rounded-xl h-11"
        disabled={servingG <= 0 || !logTime}
        onClick={() => onSave(servingG, buildLoggedAt(today, logTime))}
      >
        Add to Log
      </Button>
    </div>
  );
}

function computeTDEE(
  gender: UserProfile["gender"],
  weightKg: number,
  heightCm: number,
  ageYears: number,
  activityMultiplier: number
): number {
  let bmr: number;
  if (gender === "male") {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * ageYears + 5;
  } else if (gender === "female") {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * ageYears - 161;
  } else {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * ageYears - 78;
  }
  return Math.round(bmr * activityMultiplier);
}

// ── SegmentedControl ─────────────────────────────────────────────────────────

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-xl overflow-hidden border border-border text-xs font-semibold">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 py-2.5 transition-colors ${
            value === opt.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── GoalsSheet ────────────────────────────────────────────────────────────────

type CalorieMode = "deficit" | "maintenance" | "surplus";

function GoalsSheet({
  open,
  onClose,
  onSaved,
}: { open: boolean; onClose: () => void; onSaved: () => void }) {
  // ── Derived weight/profile info ──
  const profile = store.getProfile();
  const weightKgInput = profile?.weightKg ?? 0;
  const weightLbs = weightKgInput ? Math.round(weightKgInput * 2.20462 * 10) / 10 : null;

  // ── Suggestions ─────────────────────────────────────────────────────────
  const suggestedBase = useMemo(() => {
    if (!profile?.weightKg || !profile?.heightCm || !profile?.ageYears || !profile?.activityLevel) return 2000;
    const multipliers: Record<string, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
    const mult = multipliers[profile.activityLevel] || 1.2;
    const tdee = computeTDEE(profile.gender, profile.weightKg, profile.heightCm, profile.ageYears, mult);
    return Math.round(tdee / 50) * 50;
  }, [profile]);

  // ── State ───────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<CalorieMode>("maintenance");
  const [calorieInput, setCalorieInput] = useState("2000");
  const [customCalories, setCustomCalories] = useState<number | null>(null);
  const [editingCalories, setEditingCalories] = useState(false);
  const [waterOz, setWaterOz] = useState(64);
  const [proteinG, setProteinG] = useState(150);
  const [proteinSet, setProteinSet] = useState(false);
  const [carbsPct, setCarbsPct] = useState(40);
  const [fatPct, setFatPct] = useState(30);
  const [lastAdjusted, setLastAdjusted] = useState<"carbs" | "fat" | null>(null);

  // ── Reactive calorie computation ────────────────────────────────────────
  const suggestedCalories = useMemo(() => {
    if (mode === "maintenance") return suggestedBase;
    const absRate = Math.abs(profile?.weeklyRateLbs ?? 0.5);
    const raw = Math.round((absRate * 3500) / 7);
    const capped = Math.min(raw, 350);
    return suggestedBase + (mode === "surplus" ? capped : -capped);
  }, [mode, suggestedBase, profile?.weeklyRateLbs]);

  const activeCalories = customCalories ?? suggestedCalories;

  useEffect(() => {
    if (!open) return;
    const g = store.getNutritionGoals();
    setCalorieInput(String(g.calorieTarget));
    setWaterOz(g.waterTargetOz);
    setProteinG(g.proteinTargetG);

    if (g.calorieTarget > 0) {
      const bodyGoal = profile?.bodyWeightGoal;
      const initialMode = bodyGoal === "gain" ? "surplus" : bodyGoal === "lose" ? "deficit" : "maintenance";
      setMode(initialMode);
      
      // If the saved target is significantly different from what we'd suggest for that mode, treat it as custom
      // We calculate the delta based on the suggestion for THAT mode
      const absRate = Math.abs(profile?.weeklyRateLbs ?? 0.5);
      const raw = Math.round((absRate * 3500) / 7);
      const capped = Math.min(raw, 350);
      const suggestionForMode = suggestedBase + (initialMode === "surplus" ? capped : initialMode === "deficit" ? -capped : 0);
      
      if (Math.abs(g.calorieTarget - suggestionForMode) > 10) {
         setCustomCalories(g.calorieTarget);
      }

      const cPct = Math.round((g.carbsTargetG * 4 / g.calorieTarget) * 100);
      const fPct = Math.round((g.fatTargetG * 9 / g.calorieTarget) * 100);
      setCarbsPct(cPct);
      setFatPct(fPct);
    }
  }, [open, profile?.bodyWeightGoal, suggestedBase, profile?.weeklyRateLbs]);

  // Handle mode switching with automatic offset adjustment
  const handleModeChange = (newMode: CalorieMode) => {
    if (customCalories !== null && mode !== newMode) {
      const absRate = Math.abs(profile?.weeklyRateLbs ?? 0.5);
      const offset = Math.min(Math.round((absRate * 3500) / 7), 350);
      
      let newCustom = customCalories;
      // First, "back out" of current mode to maintenance
      if (mode === "surplus") newCustom -= offset;
      else if (mode === "deficit") newCustom += offset;
      
      // Then, apply new mode offset from maintenance
      if (newMode === "surplus") newCustom += offset;
      else if (newMode === "deficit") newCustom -= offset;
      
      setCustomCalories(Math.round(newCustom / 50) * 50);
    }
    setMode(newMode);
  };

  useEffect(() => {
    setCalorieInput(String(activeCalories));
  }, [activeCalories]);

  // ── Macro calculations ──────────────────────────────────────────────────
  const proteinPct = Math.round((proteinG * 4 / activeCalories) * 100);
  const proteinPerLbDisplay = weightLbs ? (proteinG / weightLbs).toFixed(2).replace(/\.?0+$/, "") : null;
  const fatG = Math.round((activeCalories * fatPct) / 100 / 9);
  const carbsG = Math.round((activeCalories * carbsPct) / 100 / 4);
  const splitTotal = proteinPct + carbsPct + fatPct;

  // ── Handlers ───────────────────────────────────────────────────────────
  const commitEdit = () => {
    const val = parseInt(calorieInput);
    if (!isNaN(val) && val > 500 && val < 10000) {
      const rounded = Math.round(val / 50) * 50;
      setCustomCalories(rounded);
    }
    setEditingCalories(false);
  };
  function snapTo5(val: number, delta: number): number {
    if (val % 5 !== 0) return delta > 0 ? Math.ceil(val / 5) * 5 : Math.floor(val / 5) * 5;
    return val + delta;
  }
  function adjustPct(macro: "carbs" | "fat", delta: number) {
    if (macro === "carbs") setCarbsPct((p) => Math.max(5, Math.min(90, snapTo5(p, delta))));
    else setFatPct((p) => Math.max(5, Math.min(90, snapTo5(p, delta))));
    setLastAdjusted(macro);
  }
  function autoFillPct(macro: "carbs" | "fat") {
    const other = macro === "carbs" ? fatPct : carbsPct;
    const filled = Math.max(5, 100 - proteinPct - other);
    if (macro === "carbs") setCarbsPct(filled);
    else setFatPct(filled);
    setLastAdjusted(macro);
  }

  function save() {
    store.saveNutritionGoals({
      calorieTarget: activeCalories,
      waterTargetOz: waterOz,
      proteinTargetG: proteinG,
      carbsTargetG: carbsG,
      fatTargetG: fatG,
    });
    onSaved();
    onClose();
  }

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[90vh] overflow-y-auto">
        <SheetHeader className="mb-5">
          <SheetTitle>Daily Goals</SheetTitle>
        </SheetHeader>
        <div className="space-y-6">

          {/* Deficit / Maintenance / Surplus */}
          <SegmentedControl
            options={[
              { label: "Deficit",     value: "deficit" },
              { label: "Maintenance", value: "maintenance" },
              { label: "Surplus",     value: "surplus" },
            ]}
            value={mode}
            onChange={handleModeChange}
          />

          <div className="rounded-2xl bg-muted/30 p-4 space-y-6 relative">
            {customCalories !== null && (
              <button 
                type="button" 
                onClick={() => setCustomCalories(null)}
                className="absolute top-4 right-4 text-muted-foreground/60 hover:text-primary transition-colors p-1"
                aria-label="Reset to suggestion"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}

            {/* Calorie target — tappable big number */}
            <div className="flex flex-col items-center text-center">
              {editingCalories ? (
                <input
                  type="number"
                  inputMode="numeric"
                  value={calorieInput}
                  autoFocus
                  onChange={(e) => setCalorieInput(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingCalories(false); }}
                  className="text-5xl font-bold tabular-nums leading-none tracking-tighter w-40 text-center bg-transparent border-b-2 border-primary outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingCalories(true)}
                  className="text-5xl font-bold tabular-nums leading-none tracking-tighter hover:text-primary transition-colors"
                >
                  {activeCalories}
                </button>
              )}
              <p className="text-[10px] text-muted-foreground mt-1.5 uppercase tracking-widest font-semibold text-primary/80">kcal / day</p>
              {!editingCalories && customCalories === null && (
                <p className="text-[10px] text-muted-foreground/50 mt-1">Tap to edit</p>
              )}
            </div>

            {/* Split total indicator */}
            <div className="flex justify-between text-xs border-t border-border/50 pt-4">
              <span className="text-muted-foreground font-medium">Total split</span>
              <span className={splitTotal === 100 ? "text-green-400 font-semibold" : "text-red-400 font-semibold"}>
                {splitTotal}%{splitTotal !== 100 && ` (${splitTotal > 100 ? "+" : ""}${splitTotal - 100}%)`}
              </span>
            </div>

            {/* Protein row — direct gram stepper */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold" style={{ color: MACRO_COLORS.protein }}>
                  Protein
                  {proteinPerLbDisplay && (
                    <span className="ml-1.5 text-muted-foreground/60 font-normal">
                      ({proteinPerLbDisplay}g / lb) {proteinPerLbDisplay === "0.9" && <span className="text-[10px] text-primary/70 font-semibold ml-0.5">(recommended)</span>}
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">{proteinG}g · {proteinPct}%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center font-bold text-lg leading-none hover:bg-muted/70 active:scale-95 transition-all disabled:opacity-40"
                  onClick={() => setProteinG((g) => Math.max(50, (Math.ceil((g - 4) / 5) * 5)))}
                  disabled={proteinG <= 50}
                >−</button>
                <div className="flex-1 relative">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={proteinG}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val)) setProteinG(Math.min(400, val));
                    }}
                    className="w-full h-8 rounded-lg bg-muted border border-transparent focus:border-primary focus:bg-background outline-none text-center text-sm font-mono font-bold transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground pointer-events-none">g</span>
                </div>
                <button
                  className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center font-bold text-lg leading-none hover:bg-muted/70 active:scale-95 transition-all disabled:opacity-40"
                  onClick={() => setProteinG((g) => Math.min(400, (Math.floor((g + 5) / 5) * 5)))}
                  disabled={proteinG >= 400}
                >+</button>
                <div className="w-14 flex-shrink-0">
                  {!proteinSet && (
                    <button
                      className="w-full h-8 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 active:scale-95 transition-all"
                      onClick={() => setProteinSet(true)}
                    >
                      Set
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Carbs row — % stepper */}
            <div className={`space-y-1.5 transition-opacity ${!proteinSet ? "opacity-40 pointer-events-none" : ""}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold" style={{ color: MACRO_COLORS.carbs }}>Carbs</span>
                <span className="text-xs text-muted-foreground tabular-nums">{carbsG}g</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center font-bold text-lg leading-none hover:bg-muted/70 active:scale-95 transition-all disabled:opacity-40"
                  onClick={() => adjustPct("carbs", -5)}
                  disabled={carbsPct <= 5}
                >−</button>
                <div className="flex-1 relative">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={carbsPct}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val)) {
                        setCarbsPct(Math.min(90, val));
                        setLastAdjusted("carbs");
                      }
                    }}
                    className="w-full h-8 rounded-lg bg-muted border border-transparent focus:border-primary focus:bg-background outline-none text-center text-sm font-mono font-bold transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground pointer-events-none">%</span>
                </div>
                <button
                  className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center font-bold text-lg leading-none hover:bg-muted/70 active:scale-95 transition-all disabled:opacity-40"
                  onClick={() => adjustPct("carbs", 5)}
                  disabled={carbsPct >= 90}
                >+</button>
                <div className="w-14 flex-shrink-0">
                  {(splitTotal !== 100 && lastAdjusted !== "carbs") && (
                    <button
                      className="w-full h-8 rounded-lg bg-primary/15 text-primary text-xs font-semibold hover:bg-primary/25 active:scale-95 transition-all"
                      onClick={() => autoFillPct("carbs")}
                    >Auto</button>
                  )}
                </div>
              </div>
            </div>

            {/* Fat row — % stepper */}
            <div className={`space-y-1.5 transition-opacity ${!proteinSet ? "opacity-40 pointer-events-none" : ""}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold" style={{ color: MACRO_COLORS.fat }}>Fat</span>
                <span className="text-xs text-muted-foreground tabular-nums">{fatG}g</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center font-bold text-lg leading-none hover:bg-muted/70 active:scale-95 transition-all disabled:opacity-40"
                  onClick={() => adjustPct("fat", -5)}
                  disabled={fatPct <= 5}
                >−</button>
                <div className="flex-1 relative">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={fatPct}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val)) {
                        setFatPct(Math.min(90, val));
                        setLastAdjusted("fat");
                      }
                    }}
                    className="w-full h-8 rounded-lg bg-muted border border-transparent focus:border-primary focus:bg-background outline-none text-center text-sm font-mono font-bold transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground pointer-events-none">%</span>
                </div>
                <button
                  className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center font-bold text-lg leading-none hover:bg-muted/70 active:scale-95 transition-all disabled:opacity-40"
                  onClick={() => adjustPct("fat", 5)}
                  disabled={fatPct >= 90}
                >+</button>
                <div className="w-14 flex-shrink-0">
                  {(splitTotal !== 100 && lastAdjusted !== "fat") && (
                    <button
                      className="w-full h-8 rounded-lg bg-primary/15 text-primary text-xs font-semibold hover:bg-primary/25 active:scale-95 transition-all"
                      onClick={() => autoFillPct("fat")}
                    >Auto</button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Water */}
          <div className="space-y-1.5">
            <Label htmlFor="goal-water">Daily Water (oz)</Label>
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
            className="w-full rounded-xl h-12 mt-2"
            disabled={splitTotal !== 100}
            onClick={save}
          >
            Save Goals
          </Button>
          {splitTotal !== 100 && (
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
  const [showAll, setShowAll] = useState(false);
  const [searchError, setSearchError] = useState<'search_unavailable' | null>(null);
  const [selectedFood, setSelectedFood] = useState<FoodSearchResult | null>(null);
  const [showRefine, setShowRefine] = useState(false);
  const [refineBrand, setRefineBrand] = useState("");
  const [refineItem, setRefineItem] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Reset on open/close
  useEffect(() => {
    if (!open) {
      setScreen("search");
      setQuery("");
      setResults([]);
      setSelectedFood(null);
      setIsSearching(false);
      setShowAll(false);
      setSearchError(null);
      setShowRefine(false);
      setRefineBrand("");
      setRefineItem("");
    }
  }, [open]);

  // Sync refine fields → combined query (used only when one field is blank)
  useEffect(() => {
    if (!showRefine) return;
    const brandT = refineBrand.trim();
    const itemT  = refineItem.trim();
    // When both fields have content, the search effect handles them directly —
    // no need to update `query` (avoids double-firing).
    if (brandT && itemT) return;
    const combined = [brandT, itemT].filter(Boolean).join(" ");
    setQuery(combined);
  }, [showRefine, refineBrand, refineItem]);

  // Debounced search — shows OFF results early via onPartial, then merges USDA results.
  // In refine mode (both brand + item filled), fires parallel multi-query search.
  useEffect(() => {
    const brandT = showRefine ? refineBrand.trim() : "";
    const itemT  = showRefine ? refineItem.trim()  : "";
    const isRefineMode = brandT.length > 0 && itemT.length > 0;

    const q = isRefineMode
      ? [brandT, itemT].join(" ")
      : query.trim();

    if (!q || q.length < 3) {
      setResults([]);
      setIsSearching(false);
      setShowAll(false);
      setSearchError(null);
      return;
    }
    setShowAll(false);
    setSearchError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const ctrl = abortRef.current;
      setIsSearching(true);
      try {
        await searchFoods(
          q,
          ctrl.signal,
          (partial) => { if (!ctrl.signal.aborted) setResults(partial); },
          (errorType) => { if (!ctrl.signal.aborted) setSearchError(errorType); },
          isRefineMode ? brandT : undefined,
          isRefineMode ? itemT  : undefined,
        );
      } catch (e) {
        // AbortError = superseded by a newer query, keep showing stale results
        if ((e as Error)?.name !== "AbortError") setResults([]);
      } finally {
        if (!ctrl.signal.aborted) setIsSearching(false);
      }
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, showRefine, refineBrand, refineItem]);

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

  function saveFood(servingG: number, loggedAt: string) {
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
      loggedAt,
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
            today={today}
            context={context}
            onBack={() => setScreen("search")}
            onSave={saveFood}
          />
        )}

        {screen === "search" && (
          <div className="space-y-4">
            {/* Search bar / Refine mode */}
            {showRefine ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Refine Search</p>
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => { setShowRefine(false); setRefineBrand(""); setRefineItem(""); setQuery(""); }}
                  >
                    ✕ Clear
                  </button>
                </div>
                <Input
                  className="rounded-xl"
                  placeholder="Brand / Restaurant (e.g. In-N-Out)"
                  value={refineBrand}
                  onChange={e => setRefineBrand(e.target.value)}
                  autoFocus
                />
                <Input
                  className="rounded-xl"
                  placeholder="Item name (e.g. Double Double)"
                  value={refineItem}
                  onChange={e => setRefineItem(e.target.value)}
                />
              </div>
            ) : (
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
            )}

            {/* Results list with progressive updates and "Show more" */}
            {results.length > 0 && (
              <div className="divide-y divide-border/40 rounded-2xl bg-muted/30 overflow-hidden">
                {results.slice(0, showAll ? results.length : 8).map(r => (
                  <button
                    key={r.id}
                    className="w-full text-left px-4 py-3 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors"
                    onClick={() => { setSelectedFood(r); setScreen("serving"); }}
                  >
                    <p className="text-sm font-medium leading-snug">{r.name}</p>
                    <p className="text-xs text-muted-foreground mb-1.5">
                      {r.brand && `${r.brand} · `}{r.servingSizeLabel}
                    </p>
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-semibold text-foreground">
                        {Math.round(r.caloriesPer100g * r.servingSizeG / 100)} kcal
                      </span>
                      <span className="text-xs" style={{ color: MACRO_COLORS.carbs }}>Carbs {Math.round(r.carbsPer100g * r.servingSizeG / 100)}g</span>
                      <span className="text-xs" style={{ color: MACRO_COLORS.protein }}>Protein {Math.round(r.proteinPer100g * r.servingSizeG / 100)}g</span>
                      <span className="text-xs" style={{ color: MACRO_COLORS.fat }}>Fat {Math.round(r.fatPer100g * r.servingSizeG / 100)}g</span>
                    </div>
                  </button>
                ))}
                {!showAll && results.length > 8 && (
                  <button
                    className="w-full px-4 py-3 text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors text-center"
                    onClick={() => setShowAll(true)}
                  >
                    Show {results.length - 8} more results
                  </button>
                )}
                {!showRefine && (
                  <button
                    className="w-full px-4 py-3 text-xs text-center text-blue-400 hover:text-blue-300 transition-colors"
                    onClick={() => setShowRefine(true)}
                  >
                    Not what you're looking for? Refine search
                  </button>
                )}
              </div>
            )}

            {/* Spinner: only shown when there are no results at all yet */}
            {isSearching && results.length === 0 && (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
                <LoaderCircle className="w-4 h-4 animate-spin" />
                Searching…
              </div>
            )}

            {!isSearching && query.trim().length >= 3 && results.length === 0 && (
              <div className="text-center py-8 space-y-2">
                <p className="text-sm text-muted-foreground">
                  {searchError === 'search_unavailable'
                    ? "Search temporarily unavailable — please wait a moment and try again."
                    : "No results found."}
                </p>
                {!showRefine && (
                  <button
                    className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                    onClick={() => setShowRefine(true)}
                  >
                    Refine search
                  </button>
                )}
              </div>
            )}

            {query.trim().length < 3 && (
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

  function createMeal() {
    store.createMeal({
      name: "",
      loggedAt: new Date().toISOString(),
      date: today,
    });
    refresh();
  }

  function handleDeleteEntry(id: string) {
    store.deleteFoodEntry(id);
    refresh();
  }

  function handleDeleteMeal(id: string) {
    store.deleteMeal(id);
    refresh();
  }

  function handleUpdateMealTime(id: string, loggedAt: string) {
    store.updateMeal(id, { loggedAt });
    refresh();
  }

  function handleUpdateEntryTime(id: string, loggedAt: string) {
    store.updateFoodEntry(id, { loggedAt });
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

        {/* Log header */}
        <div className="flex items-center justify-between pt-1">
          <h2 className="font-semibold text-sm">Today's Log</h2>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl h-8 text-xs"
              onClick={createMeal}
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Meal
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
                    onUpdateTime={handleUpdateMealTime}
                  />
                );
              }
              return (
                <StandaloneFoodCard
                  key={item.entry.id}
                  entry={item.entry}
                  onDelete={() => handleDeleteEntry(item.entry.id)}
                  onUpdateTime={handleUpdateEntryTime}
                />
              );
            })}
          </div>
        )}

        {/* Water bar */}
        <WaterBar
          goals={goals}
          carbsConsumedG={totals.carbsG}
          today={today}
          onRefresh={refresh}
        />
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
