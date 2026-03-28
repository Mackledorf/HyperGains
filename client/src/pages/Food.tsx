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
import type { FoodEntry, Meal, NutritionGoals, UserProfile } from "@shared/schema";
import type { RecentFoodEntry } from "@/lib/storage";
import * as gist from "@/lib/gist";
import {
  UtensilsCrossed,
  Plus,
  Minus,
  Scan,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Trash2,
  Settings2,
  Search,
  LoaderCircle,
  ChevronLeft,
  GlassWater,
  Clock,
  RotateCcw,
  PlusCircle,
  Check,
  X,
  Info,
} from "lucide-react";
import BarcodeScanner from "@/components/BarcodeScanner";

// ── types ─────────────────────────────────────────────────────────────────────

type MacroOverrides = {
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
};

/** Per-serving values typed by the user in the "Prepared food" panel. */
type PreparedServingInputs = {
  calories: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
};

// ── helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function isAteEarlierSentinel(iso: string): boolean {
  const d = new Date(iso);
  return d.getHours() === 0 && d.getMinutes() === 0;
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

function ManualEntryScreen({
  initialName = "",
  initialBarcode = "",
  onBack,
  onSave,
}: {
  initialName?: string;
  initialBarcode?: string;
  onBack: () => void;
  onSave: (food: FoodSearchResult) => void;
}) {
  const [name, setName] = useState(initialName);
  const [brand, setBrand] = useState("");
  const [barcode, setBarcode] = useState(initialBarcode);
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [servingSizeG, setServingSizeG] = useState("100");
  const [servingLabel, setServingLabel] = useState("100g");
  const [share, setShare] = useState(true);

  const canSave = name.trim().length > 0 && calories.length > 0;

  function handleSave() {
    if (!canSave) return;

    const kcal = parseFloat(calories) || 0;
    const p = parseFloat(protein) || 0;
    const c = parseFloat(carbs) || 0;
    const f = parseFloat(fat) || 0;
    const sizeG = parseFloat(servingSizeG) || 100;

    // Normalize to 100g
    const m = 100 / sizeG;
    const food = store.saveCustomFood({
      name: name.trim(),
      brand: brand.trim() || undefined,
      barcode: barcode.trim() || undefined,
      caloriesPer100g: Math.round(kcal * m * 10) / 10,
      proteinPer100g: Math.round(p * m * 10) / 10,
      carbsPer100g: Math.round(c * m * 10) / 10,
      fatPer100g: Math.round(f * m * 10) / 10,
      servingSizeG: sizeG,
      servingSizeLabel: servingLabel.trim() || `${sizeG}g`,
      source: "custom",
    }, share);

    // Fire-and-forget Gist sync so the food surfaces in the community library.
    // Silently ignored if no PAT is configured or the user is offline.
    if (share) {
      gist.updateGlobalFoods([food]).catch(() => {});
    }

    onSave(food as FoodSearchResult);
  }

  return (
    <div className="space-y-6 pb-4">
      <div className="flex items-center gap-2 -ml-1">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={onBack}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <h3 className="font-bold text-lg">Create Custom Food</h3>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label>Food Name</Label>
            <Input
              placeholder="e.g. Greek Yogurt"
              value={name}
              onChange={e => setName(e.target.value)}
              className="rounded-xl h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Brand (Optional)</Label>
            <Input
              placeholder="e.g. Fage"
              value={brand}
              onChange={e => setBrand(e.target.value)}
              className="rounded-xl h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Barcode (Optional)</Label>
            <Input
              placeholder="Scan or type..."
              value={barcode}
              onChange={e => setBarcode(e.target.value)}
              className="rounded-xl h-11 text-xs font-mono"
            />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-muted/40 space-y-4 border border-border/50">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Nutrition Info</p>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Serving Weight (g)</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={servingSizeG}
                onChange={e => setServingSizeG(e.target.value)}
                className="rounded-xl h-10 font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Label (e.g. "1 cup")</Label>
              <Input
                placeholder="100g"
                value={servingLabel}
                onChange={e => setServingLabel(e.target.value)}
                className="rounded-xl h-10"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-1 border-t border-border/20">
            <div className="space-y-1.5">
              <Label className="text-xs">Calories (kcal)</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={calories}
                onChange={e => setCalories(e.target.value)}
                className="rounded-xl h-10 font-mono"
              />
            </div>
            <div className="space-y-1.5" style={{ color: MACRO_COLORS.protein }}>
              <Label className="text-xs opacity-80">Protein (g)</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={protein}
                onChange={e => setProtein(e.target.value)}
                className="rounded-xl h-10 font-mono"
              />
            </div>
            <div className="space-y-1.5" style={{ color: MACRO_COLORS.carbs }}>
              <Label className="text-xs opacity-80">Carbs (g)</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={carbs}
                onChange={e => setCarbs(e.target.value)}
                className="rounded-xl h-10 font-mono"
              />
            </div>
            <div className="space-y-1.5" style={{ color: MACRO_COLORS.fat }}>
              <Label className="text-xs opacity-80">Fat (g)</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={fat}
                onChange={e => setFat(e.target.value)}
                className="rounded-xl h-10 font-mono"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 px-1 py-1">
          <button
            onClick={() => setShare(!share)}
            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              share ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30'
            }`}
          >
            {share && <Check className="w-3.5 h-3.5" />}
          </button>
          <div 
            className="flex-1 cursor-pointer" 
            onClick={() => setShare(!share)}
          >
            <p className="text-sm font-medium">Share with community</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Help others by adding this food to the global library.</p>
          </div>
        </div>

        <Button
          className="w-full rounded-2xl h-12 text-base font-bold"
          disabled={!canSave}
          onClick={handleSave}
        >
          Create & Select Food
        </Button>
      </div>
    </div>
  );
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
          <p className={`text-2xl font-bold tabular-nums leading-none ${isOver ? "text-brandRed" : "text-green-400"}`}>
            {Math.abs(remaining)}
          </p>
          <p className={`text-[10px] mt-1 ${isOver ? "text-brandRed/70" : "text-muted-foreground"}`}>
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

const WATER_AMOUNTS = [8, 16, 32, 64] as const;

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
  const [subtractMode, setSubtractMode] = useState(false);

  const waterEntries = store.getWaterEntriesForDate(today);
  const consumedOz = waterEntries.reduce((sum, e) => sum + e.amountOz, 0);

  // Dynamic target: base + excess carbs × 0.12 oz
  const excessCarbs = Math.max(0, carbsConsumedG - goals.carbsTargetG);
  const targetOz = Math.round(goals.waterTargetOz + excessCarbs * 0.12);

  const pct = targetOz > 0 ? Math.min(100, (consumedOz / targetOz) * 100) : 0;
  const isEmpty = consumedOz <= 0;

  function addWater(oz: number) {
    store.addWaterEntry(oz);
    onRefresh();
  }

  function removeWater(oz: number) {
    store.subtractWaterOz(oz, today);
    onRefresh();
  }

  return (
    <div className="rounded-2xl bg-card px-3 py-2.5 flex items-center gap-2.5">
      {/* Icon + label */}
      <GlassWater className="w-4 h-4 text-sky-400 flex-shrink-0" />
      <span className="font-semibold text-xs text-sky-400/90 flex-shrink-0">Water</span>

      {/* Amount */}
      <span className="text-[10px] tabular-nums text-muted-foreground whitespace-nowrap flex-shrink-0">
        {Math.round(consumedOz)}
        <span className="text-muted-foreground/50"> / {targetOz} oz</span>
        {excessCarbs > 0 && (
          <span className="text-sky-400 ml-0.5">·+{Math.round(excessCarbs * 0.12)}</span>
        )}
      </span>

      {/* Quick-add buttons */}
      <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
        {WATER_AMOUNTS.map((oz) => (
          <button
            key={oz}
            disabled={subtractMode && isEmpty}
            className={`h-7 w-9 rounded-lg text-[10px] font-semibold border transition-colors disabled:opacity-30 ${
              subtractMode
                ? "text-red-400 border-red-400/30 hover:border-red-400/60 hover:bg-red-400/10"
                : "text-sky-400 border-sky-400/20 hover:border-sky-400/50 hover:bg-sky-400/10"
            }`}
            onClick={() => subtractMode ? removeWater(oz) : addWater(oz)}
          >
            {subtractMode ? `−${oz}` : `+${oz}`}
          </button>
        ))}
      </div>

      {/* Subtract toggle */}
      <button
        onClick={() => setSubtractMode((m) => !m)}
        aria-label="Toggle subtract mode"
        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 ${
          subtractMode
            ? "bg-red-500/25 text-red-400"
            : "bg-red-500/10 text-red-400/50 hover:bg-red-500/20 hover:text-red-400"
        }`}
      >
        <Minus className="w-3 h-3" />
      </button>
    </div>
  );
}

// ── FoodEntryRow (inside MealCard) ────────────────────────────────────────────

function FoodEntryRow({
  entry,
  onDelete,
  onEdit,
}: { entry: FoodEntry; onDelete: () => void; onEdit: () => void }) {
  return (
    <div
      className="flex items-center justify-between py-2.5 px-1 cursor-pointer active:bg-white/[0.03] group"
      onClick={onEdit}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{entry.name}</p>
        <p className="text-xs text-muted-foreground">
          {formatServingDisplay(entry.servingG, entry.servingSizeLabel)} · {Math.round(entry.calories)} kcal
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        <div className="text-right hidden sm:block">
          <p className="text-xs text-muted-foreground tabular-nums">
            Carbs {Math.round(entry.carbsG)}g · Protein {Math.round(entry.proteinG)}g · Fat {Math.round(entry.fatG)}g
          </p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
          aria-label="Delete food"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <ChevronRight className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
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
  onEditEntry,
}: {
  meal: Meal;
  entries: FoodEntry[];
  onDeleteEntry: (id: string) => void;
  onDeleteMeal: (id: string) => void;
  onAddFood: (mealId: string, mealName: string) => void;
  onUpdateTime: (mealId: string, loggedAt: string) => void;
  onEditEntry: (entry: FoodEntry) => void;
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
              {isAteEarlierSentinel(meal.loggedAt) ? (
                <span className="italic text-muted-foreground/60">No time recorded</span>
              ) : (
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
              )}
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
                  onEdit={() => onEditEntry(e)}
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
  onEdit,
}: { entry: FoodEntry; onDelete: () => void; onUpdateTime: (entryId: string, loggedAt: string) => void; onEdit: () => void }) {
  const noTime = isAteEarlierSentinel(entry.loggedAt);
  return (
    <div
      className="rounded-2xl bg-card p-4 flex items-center gap-3 cursor-pointer active:bg-white/[0.03] group"
      onClick={onEdit}
    >
      <div className="min-w-0 flex-1">
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
          {noTime ? (
            <span className="italic opacity-50">No Time</span>
          ) : (
            <input
              type="time"
              value={isoToTimeInput(entry.loggedAt)}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                if (e.target.value) onUpdateTime(entry.id, applyTimeToIso(entry.loggedAt, e.target.value));
              }}
              className="appearance-none bg-transparent text-xs text-muted-foreground cursor-pointer hover:text-foreground focus:text-foreground focus:outline-none tabular-nums [&::-webkit-date-and-time-value]:text-left"
            />
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          aria-label="Delete food"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
      </div>
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
  initialQtyG,
  initialLoggedAt,
  saveLabel = "Add to Log",
  hideBack = false,
}: {
  food: FoodSearchResult;
  today: string;
  context: AddContext;
  onBack: () => void;
  onSave: (servingG: number, loggedAt: string, overrides?: MacroOverrides) => void;
  initialQtyG?: number;
  initialLoggedAt?: string;
  saveLabel?: string;
  hideBack?: boolean;
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

  const [unit, setUnit] = useState<ServingUnit>(() => {
    if (initialQtyG && defaultServingG > 0) {
      const inServings = initialQtyG / defaultServingG;
      if (Math.abs(Math.round(inServings * 100) / 100 - inServings) < 0.01) return "serving";
      return "g";
    }
    return "serving";
  });
  const [qty, setQty] = useState<string>(() => {
    if (initialQtyG && defaultServingG > 0) {
      const inServings = initialQtyG / defaultServingG;
      if (Math.abs(Math.round(inServings * 100) / 100 - inServings) < 0.01) {
        return String(Math.round(inServings * 100) / 100);
      }
      return String(Math.round(initialQtyG * 10) / 10);
    }
    return "1";
  });
  const [ateEarlier, setAteEarlier] = useState(() =>
    initialLoggedAt !== undefined ? isAteEarlierSentinel(initialLoggedAt) : false
  );
  const [showPreparedOverride, setShowPreparedOverride] = useState(false);
  const [prepServingInputs, setPrepServingInputs] = useState<PreparedServingInputs | null>(null);

  // If in a meal, we use the meal's time (passed via buildLoggedAt later if needed,
  // but for the UI we show the state of logTime).
  // Actually, for a meal, we should probably just show the meal's current time if we can,
  // or just lock it to whatever the "loggedAt" value will be.
  // The store.createFoodEntry will set the mealId.
  const [logTime, setLogTime] = useState(() => {
    if (initialLoggedAt !== undefined) return isoToTimeInput(initialLoggedAt);
    if (context.type === "meal") {
      // getMealsForDate requires the current date — use the today prop passed down
      const meal = store.getMealsForDate(today).find(m => m.id === context.mealId);
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

  // Derive per-100g overrides from the per-serving inputs the user typed
  const overrides: MacroOverrides | null =
    prepServingInputs && defaultServingG > 0
      ? {
          caloriesPer100g: (parseFloat(prepServingInputs.calories) || 0) * 100 / defaultServingG,
          proteinPer100g:  (parseFloat(prepServingInputs.proteinG) || 0) * 100 / defaultServingG,
          carbsPer100g:    (parseFloat(prepServingInputs.carbsG) || 0) * 100 / defaultServingG,
          fatPer100g:      (parseFloat(prepServingInputs.fatG) || 0) * 100 / defaultServingG,
        }
      : null;

  const effectiveFood = overrides ? { ...food, ...overrides } : food;
  const macros = servingG > 0
    ? computeMacros(effectiveFood, servingG)
    : { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };

  function togglePreparedOverride() {
    if (showPreparedOverride) {
      setShowPreparedOverride(false);
      setPrepServingInputs(null);
    } else {
      setShowPreparedOverride(true);
      // Initialize inputs from food's raw macros × canonical serving size
      const sG = defaultServingG;
      setPrepServingInputs({
        calories: String(Math.round(food.caloriesPer100g * sG / 100 * 10) / 10),
        proteinG: String(Math.round(food.proteinPer100g  * sG / 100 * 10) / 10),
        carbsG:   String(Math.round(food.carbsPer100g    * sG / 100 * 10) / 10),
        fatG:     String(Math.round(food.fatPer100g      * sG / 100 * 10) / 10),
      });
    }
  }

  return (
    <div className="space-y-5">
      {!hideBack && (
        <button
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          onClick={onBack}
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
      )}

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

      {/* Prepared food macro override */}
      <div className="rounded-2xl border border-border/60 overflow-hidden">
        <button
          type="button"
          onClick={togglePreparedOverride}
          className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
        >
          <UtensilsCrossed className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="flex-1 text-sm text-muted-foreground">
            Preparing this food? Update its macros.
          </span>
          {showPreparedOverride
            ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
            : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
        </button>

        {showPreparedOverride && prepServingInputs && (
          <div className="px-4 pb-4 pt-1 grid grid-cols-2 gap-3 border-t border-border/60">
            {([
              { key: "calories" as keyof PreparedServingInputs, label: "Calories", unit: "kcal" },
              { key: "proteinG" as keyof PreparedServingInputs, label: "Protein",  unit: "g" },
              { key: "carbsG"   as keyof PreparedServingInputs, label: "Carbs",    unit: "g" },
              { key: "fatG"     as keyof PreparedServingInputs, label: "Fat",      unit: "g" },
            ] as { key: keyof PreparedServingInputs; label: string; unit: string }[]).map(({ key, label, unit: u }) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs">{label} <span className="text-muted-foreground font-normal">per serving ({u})</span></Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={prepServingInputs[key]}
                  onChange={e => {
                    setPrepServingInputs(prev => prev ? { ...prev, [key]: e.target.value } : prev);
                  }}
                  className="rounded-xl h-9"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Log time */}
      <div className="space-y-2">
        {/* Label row: "Time" + info icon + "I ate this earlier" checkbox */}
        <div className="flex items-center justify-between gap-2 overflow-hidden">
          <div className="flex items-center gap-1.5 min-w-0">
            <Label
              htmlFor="log-time"
              className={`shrink-0 ${isInMeal || ateEarlier ? "opacity-50" : ""}`}
            >
              Time
            </Label>

            {/* Info tooltip */}
            <TooltipProvider>
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <span className="cursor-default text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0">
                    <Info className="w-3.5 h-3.5" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[220px] text-center text-xs">
                  You can mark food as eaten earlier in the day. Your exact time won't be logged.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* "I ate this earlier" checkbox — pushed to the right, flex-shrink to prevent clipping */}
          <button
            type="button"
            disabled={isInMeal}
            onClick={() => setAteEarlier(v => !v)}
            className="flex items-center gap-1.5 group disabled:pointer-events-none shrink ml-auto overflow-hidden text-left"
            aria-pressed={ateEarlier}
          >
            <span
              className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                ateEarlier
                  ? "bg-primary border-primary text-primary-foreground"
                  : "border-muted-foreground/30 group-hover:border-muted-foreground/60"
              } ${isInMeal ? "opacity-30" : ""}`}
            >
              {ateEarlier && <Check className="w-2.5 h-2.5" />}
            </span>
            <span className={`text-[11px] leading-tight select-none transition-colors truncate ${
              ateEarlier ? "text-foreground" : "text-muted-foreground"
            } ${isInMeal ? "opacity-30" : ""}`}>
              I ate this earlier
            </span>
          </button>
        </div>

        {/* Time input — disabled when in-meal or "ate earlier" */}
        <TooltipProvider>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <div className="relative w-full">
                <Clock
                  className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none ${
                    isInMeal || ateEarlier ? "opacity-50" : ""
                  }`}
                />
                <Input
                  id="log-time"
                  type="time"
                  value={logTime}
                  disabled={isInMeal || ateEarlier}
                  onChange={(e) => setLogTime(e.target.value)}
                  className={`rounded-xl pl-9 ${
                    isInMeal || ateEarlier ? "bg-muted cursor-not-allowed opacity-50" : ""
                  }`}
                />
              </div>
            </TooltipTrigger>
            {(isInMeal || ateEarlier) && (
              <TooltipContent side="top" className="max-w-[200px] text-center">
                {isInMeal
                  ? "Food time is set to match the meal time"
                  : "Marked as eaten earlier — exact time not logged"}
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>

      <Button
        className="w-full rounded-xl h-11"
        disabled={servingG <= 0 || (!ateEarlier && !logTime)}
        onClick={() =>
          onSave(
            servingG,
            ateEarlier
              ? buildLoggedAt(today, "00:00")
              : buildLoggedAt(today, logTime),
            overrides ?? undefined
          )
        }
      >
        {saveLabel}
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
              <span className={splitTotal === 100 ? "text-green-400 font-semibold" : "text-brandRed font-semibold"}>
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
            <p className="text-center text-xs text-brandRed -mt-2">Percentages must sum to 100%</p>
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
  const [screen, setScreen] = useState<"search" | "serving" | "scanner" | "manual_entry">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [searchError, setSearchError] = useState<'search_unavailable' | 'rate_limited' | null>(null);
  const [selectedFood, setSelectedFood] = useState<FoodSearchResult | null>(null);
  const [showRefine, setShowRefine] = useState(false);
  const [refineBrand, setRefineBrand] = useState("");
  const [refineItem, setRefineItem] = useState("");
  const [barcodeFromScanner, setBarcodeFromScanner] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Recomputed each time the sheet opens so newly added recents appear immediately
  const recentFoods = useMemo(() => store.getRecentFoods(), [open]);

  const [activeTab, setActiveTab] = useState<"search" | "my_foods">("search");
  // My Foods list — refreshed on open and after deletion
  const [myFoodsVersion, setMyFoodsVersion] = useState(0);
  const myFoods = useMemo(() => store.getCustomFoods(), [open, myFoodsVersion]);

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
      setBarcodeFromScanner(null);
      setActiveTab("search");
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
    }, 750);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, showRefine, refineBrand, refineItem]);

  // Wrapped in useCallback so BarcodeScanner's useEffect (empty deps) is
  // never invalidated by parent re-renders (e.g. the setIsSearching call
  // that fires immediately after detection).
  const handleBarcode = useCallback(async (barcode: string) => {
    setScreen("search");
    setIsSearching(true);
    setBarcodeFromScanner(barcode);
    try {
      const r = await lookupBarcode(barcode);
      if (r) {
        store.addRecentFood(r as RecentFoodEntry);
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
  }, []);

  const handleScanError = useCallback(() => setScreen("search"), []);

  function handleManualEntrySave(food: FoodSearchResult) {
    setSelectedFood(food);
    setScreen("serving");
  }

  function saveFood(servingG: number, loggedAt: string, overrides?: MacroOverrides) {
    if (!selectedFood) return;
    const effectiveFood = overrides ? { ...selectedFood, ...overrides } : selectedFood;
    const macros = computeMacros(effectiveFood, servingG);

    // If the user entered prepared macros, permanently save this version to the food library
    let customFoodId: string | null =
      selectedFood.source === "custom" ? selectedFood.id : null;
    if (overrides) {
      const preparedFood = store.upsertCustomFood({
        name: `${selectedFood.name} (prepared)`,
        brand: selectedFood.brand,
        servingSizeG: selectedFood.servingSizeG || 100,
        servingSizeLabel: selectedFood.servingSizeLabel || "1 serving",
        caloriesPer100g: overrides.caloriesPer100g,
        proteinPer100g: overrides.proteinPer100g,
        carbsPer100g: overrides.carbsPer100g,
        fatPer100g: overrides.fatPer100g,
        source: "custom",
      });
      customFoodId = preparedFood.id;
    }

    store.createFoodEntry({
      mealId: context.type === "meal" ? context.mealId : null,
      customFoodId,
      name: overrides ? `${selectedFood.name} (prepared)` : selectedFood.name,
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
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <SheetHeader className="mb-4">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>

        {/* Tab bar — only shown on the main search screen */}
        {screen === "search" && (
          <div className="flex bg-muted rounded-xl p-1 mb-4">
            <button
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "search"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveTab("search")}
            >
              <Search className="w-3.5 h-3.5" /> Search
            </button>
            <button
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "my_foods"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveTab("my_foods")}
            >
              <PlusCircle className="w-3.5 h-3.5" /> My Foods
            </button>
          </div>
        )}

        {screen === "scanner" && (
          <div className="space-y-4">
            {/* Header row — matches rest of app's sheet header style */}
            <div className="flex items-center justify-between">
              <p className="font-semibold">Scan Barcode</p>
              <button
                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Cancel scan"
                onClick={() => setScreen("search")}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              Point camera at a product barcode
            </p>
            <BarcodeScanner onDetect={handleBarcode} onError={handleScanError} />
            <Button
              variant="ghost"
              className="w-full rounded-2xl h-11 text-muted-foreground"
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

        {screen === "manual_entry" && (
          <ManualEntryScreen
            initialName={query}
            initialBarcode={barcodeFromScanner || ""}
            onBack={() => setScreen("search")}
            onSave={handleManualEntrySave}
          />
        )}

        {screen === "search" && activeTab === "my_foods" && (
          <div className="space-y-3">
            {myFoods.length === 0 ? (
              <div className="text-center py-10 px-4 space-y-4 rounded-3xl bg-muted/20 border border-dashed border-border/60">
                <p className="text-sm text-muted-foreground">No custom foods yet.</p>
                <Button
                  variant="outline"
                  className="rounded-2xl h-11 bg-background/50 hover:bg-background border-primary/20 hover:border-primary/40 text-primary font-bold"
                  onClick={() => { setActiveTab("search"); setScreen("manual_entry"); }}
                >
                  <PlusCircle className="w-4 h-4 mr-2" /> Create Custom Food
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border/40 rounded-2xl bg-muted/30 overflow-hidden">
                {myFoods.map((f) => (
                  <div key={f.id} className="flex items-center px-4 py-3 gap-2">
                    <button
                      className="flex-1 text-left min-w-0"
                      onClick={() => {
                        setSelectedFood(f as unknown as FoodSearchResult);
                        setScreen("serving");
                        setActiveTab("search");
                      }}
                    >
                      <p className="text-sm font-medium leading-snug truncate">{f.name}</p>
                      <p className="text-xs text-muted-foreground mb-1">
                        {f.brand && `${f.brand} · `}{f.servingSizeLabel}
                      </p>
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs font-semibold text-foreground">
                          {Math.round(f.caloriesPer100g * f.servingSizeG / 100)} kcal
                        </span>
                        <span className="text-xs" style={{ color: MACRO_COLORS.carbs }}>
                          C {Math.round(f.carbsPer100g * f.servingSizeG / 100)}g
                        </span>
                        <span className="text-xs" style={{ color: MACRO_COLORS.protein }}>
                          P {Math.round(f.proteinPer100g * f.servingSizeG / 100)}g
                        </span>
                        <span className="text-xs" style={{ color: MACRO_COLORS.fat }}>
                          F {Math.round(f.fatPer100g * f.servingSizeG / 100)}g
                        </span>
                      </div>
                    </button>
                    <button
                      className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive transition-colors"
                      aria-label={`Delete ${f.name}`}
                      onClick={() => {
                        store.deleteCustomFood(f.id);
                        setMyFoodsVersion(v => v + 1);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {screen === "search" && activeTab === "search" && (
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
                    onClick={() => { store.addRecentFood(r as RecentFoodEntry); setSelectedFood(r); setScreen("serving"); }}
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
                      {r.source === "custom" && (
                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-500/10 text-[10px] text-blue-400 font-bold ml-auto border border-blue-500/20">
                          LIBRARY
                        </div>
                      )}
                      {r.source === "global" && (
                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/10 text-[10px] text-amber-400 font-bold ml-auto border border-amber-500/20">
                          GLOBAL
                        </div>
                      )}
                    </div>
                  </button>
                ))}
                <button
                  className="w-full text-left px-4 py-4 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors border-t border-border/40 group bg-primary/5"
                  onClick={() => setScreen("manual_entry")}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary/20 transition-colors">
                        <PlusCircle className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-primary">Can't find it?</p>
                        <p className="text-xs text-muted-foreground/80">Create "{query || 'New Food'}" manually</p>
                      </div>
                    </div>
                    <div className="text-xs font-bold text-primary/60 group-hover:text-primary transition-colors">START →</div>
                  </div>
                </button>
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
              <div className="text-center py-10 px-4 space-y-5 rounded-3xl bg-muted/20 border border-dashed border-border/60">
                <div className="space-y-1.5">
                  <UtensilsCrossed className="w-10 h-10 text-muted-foreground/30 mx-auto mb-1" />
                  <p className="text-sm font-medium text-muted-foreground">
                    {searchError === 'search_unavailable'
                      ? "Search temporarily unavailable — try again in a bit."
                      : searchError === 'rate_limited'
                        ? localStorage.getItem("hg_usda_key")
                          ? "USDA rate-limited — searches will resume in about an hour."
                          : "Couldn't find that food. Try a different search term or create a custom entry."
                        : "We couldn't find that food."}
                  </p>
                </div>
                <div className="flex flex-col gap-2.5">
                  <Button 
                    variant="outline"
                    className="rounded-2xl h-12 bg-background/50 hover:bg-background border-primary/20 hover:border-primary/40 text-primary font-bold"
                    onClick={() => setScreen("manual_entry")}
                  >
                    <PlusCircle className="w-4 h-4 mr-2" /> Create Custom Food
                  </Button>
                  {!showRefine && (
                    <button
                      className="text-xs font-semibold text-muted-foreground/60 hover:text-primary transition-colors py-1"
                      onClick={() => setShowRefine(true)}
                    >
                      Wait, let me refine search
                    </button>
                  )}
                </div>
              </div>
            )}

            {query.trim().length < 3 && (
              <div className="space-y-3">
                {recentFoods.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 px-1 mb-2">
                      Recent
                    </p>
                    <div className="divide-y divide-border/40 rounded-2xl bg-muted/30 overflow-hidden">
                      {recentFoods.slice(0, 8).map((r) => (
                        <button
                          key={r.id}
                          className="w-full text-left px-4 py-3 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors"
                          onClick={() => {
                            setSelectedFood(r as FoodSearchResult);
                            setScreen("serving");
                          }}
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
                    </div>
                  </div>
                )}
                <p className="text-center text-sm text-muted-foreground py-4">
                  Type to search, or tap <Scan className="inline w-3.5 h-3.5 mx-1" /> to scan a barcode.
                </p>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── EditFoodSheet ─────────────────────────────────────────────────────────────

function EditFoodSheet({
  entry,
  today,
  open,
  onClose,
  onSaved,
}: {
  entry: FoodEntry | null;
  today: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Reconstruct a FoodSearchResult-like object from the logged entry so
  // ServingScreen can display and edit it properly.
  const food: FoodSearchResult | null = useMemo(() => {
    if (!entry) return null;
    // Prefer the linked custom food record for accurate per-100g values
    if (entry.customFoodId) {
      const customs = store.getCustomFoods();
      const cf = customs.find(f => f.id === entry.customFoodId);
      if (cf) return cf as unknown as FoodSearchResult;
    }
    // Back-calculate per-100g from the values stored on the entry
    const sG = entry.servingG > 0 ? entry.servingG : 100;
    const factor = 100 / sG;
    return {
      id: entry.id,
      name: entry.name,
      brand: entry.brand,
      caloriesPer100g: Math.round(entry.calories * factor * 10) / 10,
      proteinPer100g:  Math.round(entry.proteinG * factor * 10) / 10,
      carbsPer100g:    Math.round(entry.carbsG   * factor * 10) / 10,
      fatPer100g:      Math.round(entry.fatG     * factor * 10) / 10,
      servingSizeG: sG,
      servingSizeLabel: entry.servingSizeLabel || `${Math.round(sG)}g`,
      source: "custom" as const,
    };
  }, [entry]);

  function handleSave(servingG: number, loggedAt: string, overrides?: MacroOverrides) {
    if (!entry || !food) return;
    const effectiveFood = overrides ? { ...food, ...overrides } : food;
    const macros = computeMacros(effectiveFood, servingG);

    let customFoodId: string | null | undefined = entry.customFoodId;
    if (overrides) {
      const baseName = entry.name.replace(/ \(prepared\)$/, "");
      const preparedFood = store.upsertCustomFood({
        name: `${baseName} (prepared)`,
        brand: entry.brand,
        servingSizeG: food.servingSizeG || 100,
        servingSizeLabel: food.servingSizeLabel || "1 serving",
        caloriesPer100g: overrides.caloriesPer100g,
        proteinPer100g:  overrides.proteinPer100g,
        carbsPer100g:    overrides.carbsPer100g,
        fatPer100g:      overrides.fatPer100g,
        source: "custom",
      });
      customFoodId = preparedFood.id;
    }

    store.updateFoodEntry(entry.id, {
      servingG,
      calories: macros.calories,
      proteinG: macros.proteinG,
      carbsG:   macros.carbsG,
      fatG:     macros.fatG,
      loggedAt,
      ...(customFoodId !== undefined ? { customFoodId } : {}),
    });
    onSaved();
    onClose();
  }

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <SheetHeader className="mb-4">
          <SheetTitle>Edit Entry</SheetTitle>
        </SheetHeader>
        {food && entry && (
          <ServingScreen
            key={entry.id}
            food={food}
            today={today}
            context={{ type: "standalone" }}
            onBack={onClose}
            onSave={handleSave}
            initialQtyG={entry.servingG}
            initialLoggedAt={entry.loggedAt}
            saveLabel="Save Changes"
            hideBack
          />
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
  const [editEntry, setEditEntry] = useState<FoodEntry | null>(null);

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

        {/* Water strip */}
        <WaterBar
          goals={goals}
          carbsConsumedG={totals.carbsG}
          today={today}
          onRefresh={refresh}
        />

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
                    onEditEntry={setEditEntry}
                  />
                );
              }
              return (
                <StandaloneFoodCard
                  key={item.entry.id}
                  entry={item.entry}
                  onDelete={() => handleDeleteEntry(item.entry.id)}
                  onUpdateTime={handleUpdateEntryTime}
                  onEdit={() => setEditEntry(item.entry)}
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
      <EditFoodSheet
        entry={editEntry}
        today={today}
        open={editEntry !== null}
        onClose={() => setEditEntry(null)}
        onSaved={refresh}
      />
    </AppShell>
  );
}
