/**
 * Home / Dashboard — unified daily hub.
 *
 * Phase 1 (current): Overview of today's nutrition, active workout, and supplements.
 * Phase 2 (planned): Full interactive dashboard with macro rings, mini muscle
 *   visualizer (readiness view), supplement checklist, weight sparkline,
 *   Easy View / Full View toggle, and a food quick-add FAB.
 */
import { useMemo } from "react";
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

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <AppShell>
      <div className="space-y-5">
        {/* Greeting */}
        <div>
          <p className="text-muted-foreground text-sm">{dateLabel}</p>
          <h1 className="text-xl font-bold mt-0.5">{greeting} 👋</h1>
        </div>

        {/* Nutrition card */}
        <Link href="/food">
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
        <Link href="/workouts">
          <div className="rounded-2xl bg-card p-4 active:scale-[0.99] transition-transform cursor-pointer">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center">
                  <Dumbbell className="w-4 h-4 text-primary" />
                </div>
                <span className="font-semibold text-sm">Workouts</span>
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
        <Link href="/supplements">
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
      </div>
    </AppShell>
  );
}
