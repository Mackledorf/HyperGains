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
import { MACRO_COLORS } from "@/lib/macroColors";
import * as store from "@/lib/storage";
import { UtensilsCrossed, Dumbbell, Pill, ChevronRight, Zap, TrendingUp, TrendingDown, Minus, Flame, NotebookText } from "lucide-react";

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

  const weightHistory = useMemo(() => store.getWeightHistory(), []);
  const profile = useMemo(() => store.getProfile(), []);
  const unitSystem = profile?.unitSystem ?? "imperial";
  const allFoodEntries = useMemo(() => store.getAllFoodEntries(), []);
  const recentSessions = useMemo(() => store.getAllRecentSessions(50), []);

  const weightTrend = useMemo((): "up" | "down" | "stable" | null => {
    if (weightHistory.length < 2) return null;
    const latest = weightHistory[0].weightKg;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const oldEntry = weightHistory.find((e) => new Date(e.recordedAt) <= sevenDaysAgo);
    const prev = oldEntry?.weightKg ?? weightHistory[1].weightKg;
    const diff = latest - prev;
    if (diff > 0.4) return "up";
    if (diff < -0.4) return "down";
    return "stable";
  }, [weightHistory]);

  const avgWeeklyKcal = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const e of allFoodEntries) {
      byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.calories);
    }
    const activeDays = Array.from(byDate.entries()).filter(([, c]) => c > 0);
    if (activeDays.length === 0) return null;
    const getMonday = (d: Date) => {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const m = new Date(d);
      m.setDate(diff);
      return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-${String(m.getDate()).padStart(2, "0")}`;
    };
    const byWeek = new Map<string, number[]>();
    for (const [dateStr, cals] of activeDays) {
      const wk = getMonday(new Date(dateStr + "T12:00:00"));
      const arr = byWeek.get(wk) ?? [];
      arr.push(cals);
      byWeek.set(wk, arr);
    }
    const weeklyTotals = Array.from(byWeek.values()).map((w) => w.reduce((s, c) => s + c, 0));
    return Math.round(weeklyTotals.reduce((s, t) => s + t, 0) / weeklyTotals.length);
  }, [allFoodEntries]);

  const sessionsThisWeek = useMemo(() => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return recentSessions.filter(
      (s) => s.status === "completed" && s.completedAt && new Date(s.completedAt) >= sevenDaysAgo
    ).length;
  }, [recentSessions]);

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
                label="Carbs"
                consumed={totals.carbsG}
                target={goals.carbsTargetG}
                color={MACRO_COLORS.carbs}
              />
              <MacroBar
                label="Protein"
                consumed={totals.proteinG}
                target={goals.proteinTargetG}
                color={MACRO_COLORS.protein}
              />
              <MacroBar
                label="Fat"
                consumed={totals.fatG}
                target={goals.fatTargetG}
                color={MACRO_COLORS.fat}
              />
            </div>
          </div>
        </Link>

        {/* ── Quick Overview ── */}
        <div className="-mx-5 bg-gradient-to-b from-primary/8 to-transparent px-5 pt-1 pb-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3">
            Quick Overview
          </p>
          <div className="grid grid-cols-2 gap-3">
            {/* Weight block */}
            <Link
              href="/stats#weight"
              className="rounded-2xl bg-card/90 backdrop-blur border border-border/50 p-4 text-left active:scale-[0.97] transition-transform hover:border-primary/30 block"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Weight
                </span>
                {weightTrend === "up" && <TrendingUp className="w-3.5 h-3.5 text-orange-400" />}
                {weightTrend === "down" && <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />}
                {weightTrend === "stable" && <Minus className="w-3.5 h-3.5 text-muted-foreground" />}
              </div>
              {weightHistory.length > 0 ? (
                <p className="text-2xl font-bold tabular-nums leading-none">
                  {unitSystem === "imperial"
                    ? Math.round(weightHistory[0].weightKg * 2.20462 * 10) / 10
                    : Math.round(weightHistory[0].weightKg * 10) / 10}
                  <span className="text-xs font-medium text-muted-foreground ml-1">
                    {unitSystem === "imperial" ? "lbs" : "kg"}
                  </span>
                </p>
              ) : (
                <p className="text-2xl font-bold text-muted-foreground/30">—</p>
              )}
              <div className="flex items-center gap-1 mt-2">
                <span className="text-[10px] text-muted-foreground/60 tracking-tight">Update your weight</span>
                <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
              </div>
            </Link>

            {/* Avg Weekly Calories block */}
            <Link
              href="/stats#eating"
              className="rounded-2xl bg-card/90 backdrop-blur border border-border/50 p-4 text-left active:scale-[0.97] transition-transform hover:border-primary/30 block"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Avg Weekly Cal
                </span>
                <Flame className="w-3.5 h-3.5 text-orange-400/70" />
              </div>
              {avgWeeklyKcal !== null ? (
                <p className="text-2xl font-bold tabular-nums leading-none">
                  {avgWeeklyKcal.toLocaleString()}
                  <span className="text-xs font-medium text-muted-foreground ml-1">kcal</span>
                </p>
              ) : (
                <p className="text-2xl font-bold text-muted-foreground/30">—</p>
              )}
              <div className="flex items-center gap-1 mt-2">
                <span className="text-[10px] text-muted-foreground/60 tracking-tight">View your weekly habits</span>
                <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
              </div>
            </Link>

            {/* Training Log jump — full width */}
            <Link
              href="/stats"
              className="col-span-2 rounded-2xl bg-card/90 backdrop-blur border border-border/50 p-4 text-left active:scale-[0.97] transition-transform hover:border-primary/30 block"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <NotebookText className="w-[18px] h-[18px] text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">Training Log</p>
                    <p className="text-xs text-muted-foreground">
                      {activeProgram ? activeProgram.name : "View stats"}
                      {sessionsThisWeek > 0 && (
                        <span className="ml-2 text-primary font-semibold">
                          · {sessionsThisWeek} this week
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
              </div>
            </Link>
          </div>
        </div>

        {/* Lift card */}
        <Link href="/lifts" className="block">
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

        {/* Weight nudge — kept for later re-use
        {!hasWeighedToday && (
          <Link href="/stats" className="block">
            <div className="rounded-2xl bg-card p-4 active:scale-[0.99] transition-transform cursor-pointer">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Have you weighed yourself today?</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          </Link>
        )}
        */}
      </div>
    </AppShell>
  );
}
