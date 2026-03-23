/**
 * Home / Dashboard — unified daily hub.
 *
 * Phase 1 (current): Overview of today's nutrition, active workout, and supplements.
 * Phase 2 (planned): Full interactive dashboard with macro rings, mini muscle
 *   visualizer (readiness view), supplement checklist, weight sparkline,
 *   Easy View / Full View toggle, and a food quick-add FAB.
 */
import { useMemo, useState, useEffect } from "react";
import { Link } from "wouter";
import AppShell from "@/components/AppShell";
import MacroBar from "@/components/MacroBar";
import * as store from "@/lib/storage";
import { UtensilsCrossed, Dumbbell, Pill, ChevronRight, Zap, TrendingUp } from "lucide-react";

export default function Dashboard() {
  const today = store.getFoodDate();
  const goals = useMemo(() => store.getNutritionGoals(), []);
  const foodEntries = useMemo(() => store.getFoodEntriesForDate(today), [today]);
  const activeProgram = useMemo(() => store.getActiveProgram(), []);
  const inProgressSession = useMemo(() => store.getInProgressSession(), []);

  const totals = useMemo(() => {
    return foodEntries.reduce(
      (acc, e) => ({
        calories: acc.calories + e.calories,
        proteinG: acc.proteinG + e.proteinG,
        carbsG: acc.carbsG + e.carbsG,
        fatG: acc.fatG + e.fatG,
      }),
      { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
    );
  }, [foodEntries]);

  const calRemaining = Math.max(0, goals.calorieTarget - totals.calories);

  const hasWeighedToday = useMemo(() => {
    const history = store.getWeightHistory();
    if (history.length === 0) return false;
    const todayStr = new Date().toLocaleDateString();
    return new Date(history[0].recordedAt).toLocaleDateString() === todayStr;
  }, []);

  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  );
  useEffect(() => {
    const id = setInterval(() =>
      setTime(new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }))
    , 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <AppShell>
      <div className="space-y-5">
        {/* Date + Clock */}
        <div className="flex items-center gap-3 font-mono text-sm text-muted-foreground">
          <span className="tabular-nums">{time}</span>
          <span className="text-border">·</span>
          <span>{dateLabel}</span>
        </div>

        {/* Nutrition card */}
        <Link href="/food" className="block">
          <div className="rounded-2xl bg-card p-4 space-y-4 active:scale-[0.99] transition-transform cursor-pointer">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-orange-500/15 flex items-center justify-center">
                  <UtensilsCrossed className="w-4 h-4 text-orange-400" />
                </div>
                <span className="font-semibold text-sm">Nutrition</span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>

            <div className="flex items-end gap-1">
              <span className="text-4xl font-bold tabular-nums leading-none">
                {Math.round(calRemaining)}
              </span>
              <span className="text-muted-foreground text-sm mb-1">kcal remaining</span>
            </div>

            <div className="space-y-2.5">
              <MacroBar
                label="Protein"
                consumed={totals.proteinG}
                target={goals.proteinTargetG}
                color="#f97316"
              />
              <MacroBar
                label="Carbs"
                consumed={totals.carbsG}
                target={goals.carbsTargetG}
                color="#eab308"
              />
              <MacroBar
                label="Fat"
                consumed={totals.fatG}
                target={goals.fatTargetG}
                color="#3b82f6"
              />
            </div>
          </div>
        </Link>

        {/* Workout card */}
        <Link href="/workouts" className="block">
          <div className="rounded-2xl bg-card p-4 active:scale-[0.99] transition-transform cursor-pointer">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center">
                  <Dumbbell className="w-4 h-4 text-primary" />
                </div>
                <span className="font-semibold text-sm">Lifts</span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="mt-3 flex items-center gap-2">
              {inProgressSession ? (
                <>
                  <Zap className="w-4 h-4 text-primary" />
                  <span className="text-sm text-primary font-medium">
                    {inProgressSession.dayLabel} in progress
                  </span>
                </>
              ) : activeProgram ? (
                <>
                  <TrendingUp className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {activeProgram.name} · Week {activeProgram.currentWeekNumber}
                  </span>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">No active program</span>
              )}
            </div>
          </div>
        </Link>

        {/* Supplements card */}
        <Link href="/supplements" className="block">
          <div className="rounded-2xl bg-card p-4 active:scale-[0.99] transition-transform cursor-pointer">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple-500/15 flex items-center justify-center">
                  <Pill className="w-4 h-4 text-purple-400" />
                </div>
                <span className="font-semibold text-sm">Supplements</span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground mt-3">Coming soon</p>
          </div>
        </Link>

        {/* Weight nudge */}
        {!hasWeighedToday && (
          <Link href="/profile" className="block">
            <div className="rounded-2xl bg-card p-4 active:scale-[0.99] transition-transform cursor-pointer">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Have you weighed yourself today?</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          </Link>
        )}
      </div>
    </AppShell>
  );
}
