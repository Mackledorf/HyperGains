import { useState, useMemo, useRef } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Scale,
  Check,
  Zap,
  Dumbbell,
  Settings,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  Clock,
  Timer,
  Trash2,
  ChevronRight,
  Flame,
  Activity,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import AppShell from "@/components/AppShell";
import MuscleVisualizer from "@/components/MuscleVisualizer";
import CalendarView, { type SessionDayInfo } from "@/components/CalendarView";
import VolumeCalendarView, { type VolumeDayInfo } from "@/components/VolumeCalendarView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import * as store from "@/lib/storage";
import { queryClient } from "@/lib/queryClient";
import { getMuscleVolumeInfo } from "@/lib/muscleColors";
import { deriveSessionFeeling, FEELING_COLORS } from "@/lib/sessionFeeling";
import type {
  WeightEntry,
  Program,
  WorkoutSession,
  SetLog,
  ExerciseFeedback,
  PostSessionCheckIn,
  FoodEntry,
} from "@shared/schema";

// ── Constants ──────────────────────────────────────────────

const ALL_MUSCLES = [
  "chest", "back", "shoulders", "biceps", "triceps",
  "quads", "hamstrings", "glutes", "calves", "abs", "traps", "forearms",
];

// ── Conversion helpers ─────────────────────────────────────

function kgToLbs(kg: number) { return Math.round(kg * 2.20462 * 10) / 10; }
function lbsToKg(lbs: number) { return Math.round((lbs / 2.20462) * 100) / 100; }
function roundWeight(kg: number) { return Math.round(kg * 10) / 10; }

// ── Eating stats helpers ────────────────────────────────────

function isAteEarlierSentinel(loggedAt: string): boolean {
  const d = new Date(loggedAt);
  return d.getHours() === 0 && d.getMinutes() === 0;
}

function minsToAmPm(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function minsToHhMm(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ""}` : `${m}m`;
}

function computeEatingStats(
  entries: FoodEntry[],
  lookbackDays: number
): { avgFirstMealMins: number | null; avgWindowMins: number | null } {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - lookbackDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const timed = entries.filter(
    (e) => e.date >= cutoffStr && !isAteEarlierSentinel(e.loggedAt)
  );

  const byDate = new Map<string, number[]>();
  for (const e of timed) {
    const d = new Date(e.loggedAt);
    const mins = d.getHours() * 60 + d.getMinutes();
    const arr = byDate.get(e.date) ?? [];
    arr.push(mins);
    byDate.set(e.date, arr);
  }

  if (byDate.size < 3) return { avgFirstMealMins: null, avgWindowMins: null };

  const firstMins: number[] = [];
  const windowMins: number[] = [];

  for (const dayMins of Array.from(byDate.values())) {
    dayMins.sort((a: number, b: number) => a - b);
    firstMins.push(dayMins[0]);
    if (dayMins.length >= 2) windowMins.push(dayMins[dayMins.length - 1] - dayMins[0]);
  }

  const avg = (arr: number[]) => Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
  return {
    avgFirstMealMins: avg(firstMins),
    avgWindowMins: windowMins.length >= 3 ? avg(windowMins) : null,
  };
}

// ── Weekly calorie helpers ─────────────────────────────────

/** Returns the ISO date (YYYY-MM-DD) of the Monday of the week containing `d`. */
function getMondayKey(d: Date): string {
  const day = d.getDay(); // 0 = Sunday
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
}

interface WeeklyCalStat {
  weekKey: string;
  label: string;
  total: number;
  nonZeroDays: number;
}

function calcWeeklyCalorieStats(allEntries: FoodEntry[]): {
  avgWeekly: number | null;
  recentWeeks: WeeklyCalStat[];
} {
  // Group entries by date and sum calories
  const byDate = new Map<string, number>();
  for (const e of allEntries) {
    byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.calories);
  }

  // Filter out zero-calorie days
  const activeDays = Array.from(byDate.entries()).filter(([, cals]) => cals > 0);
  if (activeDays.length === 0) return { avgWeekly: null, recentWeeks: [] };

  // Group by week (Monday-keyed)
  const byWeek = new Map<string, number[]>();
  for (const [dateStr, cals] of activeDays) {
    const d = new Date(dateStr + "T12:00:00");
    const weekKey = getMondayKey(d);
    const arr = byWeek.get(weekKey) ?? [];
    arr.push(cals);
    byWeek.set(weekKey, arr);
  }

  // Build sorted weekly stats
  const weeks: WeeklyCalStat[] = Array.from(byWeek.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekKey, dayCals]) => {
      const monday = new Date(weekKey + "T12:00:00");
      const label = monday.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return {
        weekKey,
        label,
        total: dayCals.reduce((s, c) => s + c, 0),
        nonZeroDays: dayCals.length,
      };
    });

  // Mark this week
  const todayMondayKey = getMondayKey(new Date());
  const recentWeeks = weeks.slice(-8);
  const lastWeek = recentWeeks[recentWeeks.length - 1];
  if (lastWeek && lastWeek.weekKey === todayMondayKey) {
    lastWeek.label = "This wk";
  }

  const avgWeekly = Math.round(
    weeks.reduce((s, w) => s + w.total, 0) / weeks.length
  );

  return { avgWeekly, recentWeeks };
}

// ── Macro average helper ────────────────────────────────────

function calcAvgDailyMacros(allEntries: FoodEntry[]) {
  const byDate = new Map<string, { cal: number; p: number; c: number; f: number }>();
  for (const e of allEntries) {
    const cur = byDate.get(e.date) ?? { cal: 0, p: 0, c: 0, f: 0 };
    byDate.set(e.date, {
      cal: cur.cal + e.calories,
      p: cur.p + e.proteinG,
      c: cur.c + e.carbsG,
      f: cur.f + e.fatG,
    });
  }
  const nonZero = Array.from(byDate.values()).filter((d) => d.cal > 0);
  if (nonZero.length === 0) return null;
  const n = nonZero.length;
  return {
    protein: Math.round(nonZero.reduce((s, d) => s + d.p, 0) / n),
    carbs: Math.round(nonZero.reduce((s, d) => s + d.c, 0) / n),
    fat: Math.round(nonZero.reduce((s, d) => s + d.f, 0) / n),
    calories: Math.round(nonZero.reduce((s, d) => s + d.cal, 0) / n),
  };
}

// ── Calendar helpers ────────────────────────────────────────

function toLocalDateStr(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildCalendarSessionMap(
  monthSessions: WorkoutSession[],
  checkIns: PostSessionCheckIn[],
  feedbacks: ExerciseFeedback[]
): Map<string, SessionDayInfo> {
  const checkInMap = new Map<string, PostSessionCheckIn>(
    checkIns.map((c) => [c.sessionId, c])
  );
  const feedbacksBySession = new Map<string, ExerciseFeedback[]>();
  for (const f of feedbacks) {
    if (!feedbacksBySession.has(f.sessionId)) feedbacksBySession.set(f.sessionId, []);
    feedbacksBySession.get(f.sessionId)!.push(f);
  }

  const result = new Map<string, SessionDayInfo>();
  for (const s of monthSessions) {
    if (!s.completedAt) continue;
    const checkIn = checkInMap.get(s.id);
    const sessionFeedbacks = feedbacksBySession.get(s.id) ?? [];
    const feeling = deriveSessionFeeling(checkIn, sessionFeedbacks);
    const duration = Math.round(
      (new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime()) / 60000
    );
    result.set(toLocalDateStr(s.completedAt), {
      color: FEELING_COLORS[feeling.color],
      dayLabel: s.dayLabel,
      duration,
      feelingLabel: feeling.label,
    });
  }
  return result;
}

// ── SessionCard ─────────────────────────────────────────────

function SessionCard({ session }: { session: WorkoutSession }) {
  const [expanded, setExpanded] = useState(false);

  const { data: logs } = useQuery<SetLog[]>({
    queryKey: ["setlogs", session.id],
    enabled: expanded,
    queryFn: () => store.getSetLogs(session.id),
  });

  const startDate = new Date(session.startedAt);
  const endDate = session.completedAt ? new Date(session.completedAt) : null;
  const durationMin = endDate
    ? Math.round((endDate.getTime() - startDate.getTime()) / 60000)
    : null;

  const groupedLogs = logs
    ? logs.reduce((acc, log) => {
        if (!acc[log.exerciseName]) acc[log.exerciseName] = [];
        acc[log.exerciseName].push(log);
        return acc;
      }, {} as Record<string, SetLog[]>)
    : {};

  return (
    <button
      className="w-full rounded-2xl bg-card overflow-hidden text-left transition-all active:scale-[0.99]"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold">{session.dayLabel}</h3>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
                W{session.weekNumber}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
              {durationMin !== null && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {durationMin} min
                </span>
              )}
            </div>
          </div>
          <div className="w-7 h-7 rounded-lg bg-[hsl(var(--set-complete-bg))] flex items-center justify-center">
            <Check className="w-3.5 h-3.5 text-[hsl(var(--set-complete-text))]" />
          </div>
        </div>
      </div>

      {expanded && logs && (
        <div className="border-t border-border/50">
          {Object.entries(groupedLogs).map(([name, setLogs]) => (
            <div key={name} className="px-4 py-3 border-b border-border/30 last:border-0">
              <p className="micro-label mb-1.5">{name}</p>
              <div className="flex flex-wrap gap-1.5">
                {setLogs
                  .sort((a, b) => a.setNumber - b.setNumber)
                  .map((log) => (
                    <span
                      key={log.id}
                      className={`inline-flex items-center gap-0.5 text-[10px] tabular-nums font-mono font-medium px-2 py-1 rounded-md ${
                        log.isProgressed
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      {log.weight}lb × {log.reps}
                      {log.rir !== null && ` @${log.rir}RIR`}
                      {log.isProgressed && (
                        <TrendingUp className="w-2.5 h-2.5 ml-0.5" />
                      )}
                    </span>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

// ── Main Stats component ────────────────────────────────────

export default function Stats() {
  const { toast } = useToast();

  // Scroll refs for hero nav
  const weightRef = useRef<HTMLElement>(null);
  const eatingRef = useRef<HTMLElement>(null);
  const trainingRef = useRef<HTMLElement>(null);
  const programsRef = useRef<HTMLElement>(null);

  const scrollTo = (ref: React.RefObject<HTMLElement | null>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Profile (for unit system)
  const profile = store.getProfile();
  const unitSystem = profile?.unitSystem ?? "imperial";

  // ── Queries ───────────────────────────────────────────────

  const { data: weightHistory = [] } = useQuery<WeightEntry[]>({
    queryKey: ["weightHistory"],
    queryFn: () => store.getWeightHistory(),
  });

  const { data: programs = [], isLoading: programsLoading } = useQuery<Program[]>({
    queryKey: ["programs", "all"],
    queryFn: () => store.getPrograms(),
  });

  const { data: activeProgram } = useQuery<Program | null>({
    queryKey: ["programs", "active"],
    queryFn: () => store.getActiveProgram() ?? null,
  });

  const { data: sessions, isLoading: sessionsLoading, isError: sessionsError } = useQuery<WorkoutSession[]>({
    queryKey: ["sessions", activeProgram?.id],
    enabled: !!activeProgram,
    queryFn: () => store.getWorkoutSessions(activeProgram!.id),
  });

  const { data: weeklySets } = useQuery<Record<string, number>>({
    queryKey: ["weeklySets", activeProgram?.id, activeProgram?.currentWeekNumber],
    enabled: !!activeProgram,
    queryFn: () =>
      store.getActualWeeklySetsPerMuscle(
        activeProgram!.id,
        activeProgram!.currentWeekNumber ?? 1
      ),
  });

  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [calendarMode, setCalendarMode] = useState<"feeling" | "volume">("feeling");

  const { data: monthSessions } = useQuery<WorkoutSession[]>({
    queryKey: ["sessions", "month", calYear, calMonth],
    queryFn: () => store.getCompletedSessionsForMonth(calYear, calMonth),
  });

  const { data: allCheckIns = [] } = useQuery<PostSessionCheckIn[]>({
    queryKey: ["checkIns", "all"],
    queryFn: () => store.getAllCheckIns(),
  });

  const { data: allFeedbacks = [] } = useQuery<ExerciseFeedback[]>({
    queryKey: ["feedbacks", "all"],
    queryFn: () => store.getAllExerciseFeedbacks(),
  });

  // ── Weight tracking state ─────────────────────────────────

  const [timeOfDay, setTimeOfDay] = useState<"AM" | "PM">("AM");
  const [fed, setFed] = useState(false);
  const [filterTimeOfDay, setFilterTimeOfDay] = useState<"AM" | "PM" | null>(null);
  const [filterFed, setFilterFed] = useState<boolean | null>(null);
  const [weightDisplay, setWeightDisplay] = useState("");

  // ── Programs state ────────────────────────────────────────

  const [programToDelete, setProgramToDelete] = useState<Program | null>(null);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);

  // ── Derived: weight ───────────────────────────────────────

  const filteredHistory = useMemo(() => {
    return weightHistory.filter((e) => {
      if (filterTimeOfDay !== null && e.timeOfDay !== filterTimeOfDay) return false;
      if (filterFed !== null && e.fed !== filterFed) return false;
      return true;
    });
  }, [weightHistory, filterTimeOfDay, filterFed]);

  const chartData = useMemo(() => {
    return [...filteredHistory].reverse().slice(-30).map((e) => ({
      date: new Date(e.recordedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      weight: e.weightKg,
    }));
  }, [filteredHistory]);

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

  // ── Derived: food ─────────────────────────────────────────

  const allFoodEntries = useMemo(() => store.getAllFoodEntries(), []);

  const eatingStats = useMemo(
    () => computeEatingStats(allFoodEntries, 30),
    [allFoodEntries]
  );

  const weeklyCalStats = useMemo(
    () => calcWeeklyCalorieStats(allFoodEntries),
    [allFoodEntries]
  );

  const avgDailyMacros = useMemo(
    () => calcAvgDailyMacros(allFoodEntries),
    [allFoodEntries]
  );

  // ── Derived: training ────────────────────────────────────

  const muscleData = useMemo(
    () =>
      Object.fromEntries(
        ALL_MUSCLES.map((m) => [m, getMuscleVolumeInfo(m, weeklySets?.[m] ?? 0)])
      ),
    [weeklySets]
  );

  const calendarSessions = useMemo(
    () => buildCalendarSessionMap(monthSessions ?? [], allCheckIns, allFeedbacks),
    [monthSessions, allCheckIns, allFeedbacks]
  );

  const completedSessions = useMemo(
    () => (sessions ?? []).filter((s) => s.status === "completed"),
    [sessions]
  );

  const sessionsThisWeek = useMemo(() => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return completedSessions.filter(
      (s) => s.completedAt && new Date(s.completedAt) >= sevenDaysAgo
    ).length;
  }, [completedSessions]);

  // ── Mutations ─────────────────────────────────────────────

  const saveWeightMutation = useMutation({
    mutationFn: () => {
      const val = parseFloat(weightDisplay);
      if (isNaN(val) || val <= 0) return Promise.resolve();
      const rounded = Math.round(val * 10) / 10;
      const weightKg = unitSystem === "imperial" ? lbsToKg(rounded) : rounded;
      store.addWeightEntry(weightKg, timeOfDay, fed);
      const current = store.getProfile();
      if (current) store.saveProfile({ ...current, weightKg });
      return Promise.resolve();
    },
    onSuccess: () => {
      toast({ title: "Weight logged" });
      setWeightDisplay("");
      queryClient.invalidateQueries({ queryKey: ["weightHistory"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  const setActiveMutation = useMutation({
    mutationFn: (programId: string) => {
      store.setActiveProgram(programId);
      return Promise.resolve();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["programs"] });
      toast({ title: "Active program updated" });
    },
  });

  const deleteProgramMutation = useMutation({
    mutationFn: (programId: string) => {
      store.deleteProgram(programId);
      return Promise.resolve();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["programs"] });
      setProgramToDelete(null);
      setDeleteConfirmed(false);
      toast({ title: "Program deleted" });
    },
  });

  // ── Current weight display ────────────────────────────────

  const currentWeightDisplay = useMemo(() => {
    if (weightHistory.length === 0) return null;
    const w = weightHistory[0].weightKg;
    return unitSystem === "imperial"
      ? `${kgToLbs(w)} lbs`
      : `${roundWeight(w)} kg`;
  }, [weightHistory, unitSystem]);

  // ── Render ────────────────────────────────────────────────

  return (
    <AppShell>
      <div className="space-y-6 pb-4">
        {/* ── Page Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Stats</h1>
            <p className="micro-label mt-0.5">Your progress at a glance</p>
          </div>
          <Link href="/settings">
            <button
              className="p-2 rounded-xl border border-border text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </Link>
        </div>

        {/* ── Hero Visualizer ── */}
        {/* Breaks out of page padding to stretch full screen width */}
        <div className="-mx-5 bg-gradient-to-b from-primary/8 to-transparent px-5 pt-1 pb-6">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3">
            Quick Overview
          </p>
          <div className="grid grid-cols-2 gap-3">
            {/* Weight block */}
            <button
              onClick={() => scrollTo(weightRef)}
              className="rounded-2xl bg-card/90 backdrop-blur border border-border/50 p-4 text-left active:scale-[0.97] transition-transform hover:border-primary/30"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Weight
                </span>
                {weightTrend === "up" && (
                  <TrendingUp className="w-3.5 h-3.5 text-orange-400" />
                )}
                {weightTrend === "down" && (
                  <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
                )}
                {weightTrend === "stable" && (
                  <Minus className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </div>
              {currentWeightDisplay ? (
                <p className="text-2xl font-bold tabular-nums leading-none">
                  {unitSystem === "imperial"
                    ? kgToLbs(weightHistory[0].weightKg)
                    : roundWeight(weightHistory[0].weightKg)}
                  <span className="text-xs font-medium text-muted-foreground ml-1">
                    {unitSystem === "imperial" ? "lbs" : "kg"}
                  </span>
                </p>
              ) : (
                <p className="text-2xl font-bold text-muted-foreground/30">—</p>
              )}
              <div className="flex items-center gap-1 mt-2">
                <span className="text-[10px] text-muted-foreground/60">Tap to view log</span>
                <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
              </div>
            </button>

            {/* Avg Weekly Calories block */}
            <button
              onClick={() => scrollTo(eatingRef)}
              className="rounded-2xl bg-card/90 backdrop-blur border border-border/50 p-4 text-left active:scale-[0.97] transition-transform hover:border-primary/30"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Avg Weekly Cal
                </span>
                <Flame className="w-3.5 h-3.5 text-orange-400/70" />
              </div>
              {weeklyCalStats.avgWeekly !== null ? (
                <p className="text-2xl font-bold tabular-nums leading-none">
                  {weeklyCalStats.avgWeekly.toLocaleString()}
                  <span className="text-xs font-medium text-muted-foreground ml-1">
                    kcal
                  </span>
                </p>
              ) : (
                <p className="text-2xl font-bold text-muted-foreground/30">—</p>
              )}
              <div className="flex items-center gap-1 mt-2">
                <span className="text-[10px] text-muted-foreground/60">Tap to view eating</span>
                <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
              </div>
            </button>

            {/* Training Log jump — full width */}
            <button
              onClick={() => scrollTo(trainingRef)}
              className="col-span-2 rounded-2xl bg-card/90 backdrop-blur border border-border/50 p-4 text-left active:scale-[0.97] transition-transform hover:border-primary/30"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Activity className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">Training Log</p>
                    <p className="text-xs text-muted-foreground">
                      {activeProgram
                        ? activeProgram.name
                        : "No active program"}
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
            </button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════ */}
        {/* ── Weight Section ── */}
        {/* ══════════════════════════════════════════════════ */}
        <section ref={weightRef} className="space-y-3 scroll-mt-16">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Weight
          </h2>
          <div className="rounded-2xl bg-card p-4 space-y-4">
            {/* Log form */}
            <div className="space-y-3">
              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <Scale className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={weightDisplay}
                    onChange={(e) => setWeightDisplay(e.target.value)}
                    placeholder={unitSystem === "imperial" ? "185" : "84"}
                    className="rounded-xl bg-background border-border h-10 text-sm pl-9 pr-12"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {unitSystem === "imperial" ? "lbs" : "kg"}
                  </span>
                </div>
                <Button
                  size="sm"
                  className="rounded-xl h-10 px-4 text-xs shrink-0"
                  onClick={() => saveWeightMutation.mutate()}
                  disabled={saveWeightMutation.isPending || !weightDisplay}
                >
                  Log
                </Button>
              </div>
              {/* AM/PM + Fasted/Fed toggles */}
              <div className="flex gap-2">
                <div className="flex-1 flex rounded-xl overflow-hidden border border-border text-xs font-semibold">
                  {(["AM", "PM"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTimeOfDay(t)}
                      className={`flex-1 py-2 transition-colors ${
                        timeOfDay === t
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="flex-1 flex rounded-xl overflow-hidden border border-border text-xs font-semibold">
                  {([false, true] as const).map((v) => (
                    <button
                      key={String(v)}
                      onClick={() => setFed(v)}
                      className={`flex-1 py-2 transition-colors ${
                        fed === v
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {v ? "Fed" : "Fasted"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Filters + chart (only when there are multiple entries) */}
            {weightHistory.length > 1 && (
              <>
                <div className="flex gap-2">
                  <div className="flex-1 flex rounded-xl overflow-hidden border border-border text-xs font-semibold">
                    {([null, "AM", "PM"] as const).map((v) => (
                      <button
                        key={v ?? "all"}
                        onClick={() => setFilterTimeOfDay(v)}
                        className={`flex-1 py-1.5 transition-colors ${
                          filterTimeOfDay === v
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {v ?? "All"}
                      </button>
                    ))}
                  </div>
                  <div className="flex-1 flex rounded-xl overflow-hidden border border-border text-xs font-semibold">
                    {([null, false, true] as const).map((v) => (
                      <button
                        key={v === null ? "all" : String(v)}
                        onClick={() => setFilterFed(v)}
                        className={`flex-1 py-1.5 transition-colors ${
                          filterFed === v
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {v === null ? "All" : v ? "Fed" : "Fasted"}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredHistory.length > 1 ? (
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        domain={["auto", "auto"]}
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v: number) =>
                          unitSystem === "imperial" ? `${kgToLbs(v)}` : `${roundWeight(v)}`
                        }
                      />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 11,
                        }}
                        formatter={(v: number) => [
                          `${unitSystem === "imperial" ? kgToLbs(v) : roundWeight(v)} ${unitSystem === "imperial" ? "lbs" : "kg"}`,
                          "Weight",
                        ]}
                      />
                      <Line
                        type="monotone"
                        dataKey="weight"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ r: 3, strokeWidth: 0, fill: "hsl(var(--primary))" }}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No data for selected filters
                  </p>
                )}
              </>
            )}

            {/* History list */}
            {filteredHistory.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  History
                </p>
                <div className="max-h-48 overflow-y-auto">
                  {filteredHistory.slice(0, 20).map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between py-2 border-b border-border/30 last:border-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {new Date(entry.recordedAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                        {entry.timeOfDay && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {entry.timeOfDay}
                          </span>
                        )}
                        {entry.fed !== undefined && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {entry.fed ? "Fed" : "Fasted"}
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-semibold tabular-nums">
                        {unitSystem === "imperial"
                          ? `${kgToLbs(entry.weightKg)} lbs`
                          : `${roundWeight(entry.weightKg)} kg`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {weightHistory.length === 0 && (
              <p className="text-xs text-muted-foreground">No weight entries yet.</p>
            )}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════ */}
        {/* ── Eating Habits Section ── */}
        {/* ══════════════════════════════════════════════════ */}
        <section ref={eatingRef} className="space-y-3 scroll-mt-16">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Eating Habits
          </h2>

          {/* Avg weekly calories headline */}
          <div className="rounded-2xl bg-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Avg Weekly Intake</p>
                {weeklyCalStats.avgWeekly !== null ? (
                  <p className="text-3xl font-bold tabular-nums mt-0.5">
                    {weeklyCalStats.avgWeekly.toLocaleString()}
                    <span className="text-sm font-medium text-muted-foreground ml-1.5">
                      kcal / wk
                    </span>
                  </p>
                ) : (
                  <p className="text-2xl font-bold text-muted-foreground/30 mt-0.5">—</p>
                )}
                <p className="text-[10px] text-muted-foreground/50 mt-1">
                  Excludes days with no food logged
                </p>
              </div>
              <Flame className="w-8 h-8 text-orange-400/40" />
            </div>

            {/* Weekly calorie bar chart */}
            {weeklyCalStats.recentWeeks.length > 1 && (
              <ResponsiveContainer width="100%" height={130}>
                <BarChart
                  data={weeklyCalStats.recentWeeks}
                  margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                    formatter={(v: number) => [v.toLocaleString() + " kcal", "Weekly Total"]}
                  />
                  <Bar
                    dataKey="total"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                    opacity={0.8}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Avg macros */}
          {avgDailyMacros && (
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-card p-3 text-center">
                <p className="stat-value text-xl text-blue-400">{avgDailyMacros.protein}g</p>
                <p className="micro-label mt-1">Avg Protein</p>
              </div>
              <div className="rounded-2xl bg-card p-3 text-center">
                <p className="stat-value text-xl text-amber-400">{avgDailyMacros.carbs}g</p>
                <p className="micro-label mt-1">Avg Carbs</p>
              </div>
              <div className="rounded-2xl bg-card p-3 text-center">
                <p className="stat-value text-xl text-rose-400">{avgDailyMacros.fat}g</p>
                <p className="micro-label mt-1">Avg Fat</p>
              </div>
            </div>
          )}

          {/* Meal timing stats */}
          <div className="rounded-2xl bg-card p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-muted/40 p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="w-3.5 h-3.5 text-violet-400/70" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider">
                    First Meal
                  </span>
                </div>
                {eatingStats.avgFirstMealMins !== null ? (
                  <p className="text-lg font-bold tabular-nums text-violet-400">
                    {minsToAmPm(eatingStats.avgFirstMealMins)}
                  </p>
                ) : (
                  <>
                    <p className="text-lg font-bold text-muted-foreground/30">—</p>
                    <p className="text-[10px] text-muted-foreground/50">Need 3+ days</p>
                  </>
                )}
              </div>
              <div className="rounded-xl bg-muted/40 p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Timer className="w-3.5 h-3.5 text-violet-400/70" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider">
                    Feeding Window
                  </span>
                </div>
                {eatingStats.avgWindowMins !== null ? (
                  <p className="text-lg font-bold tabular-nums text-violet-400">
                    {minsToHhMm(eatingStats.avgWindowMins)}
                  </p>
                ) : (
                  <>
                    <p className="text-lg font-bold text-muted-foreground/30">—</p>
                    <p className="text-[10px] text-muted-foreground/50">Need 3+ days</p>
                  </>
                )}
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground/50 text-center">
              Based on last 30 days · excludes "ate earlier" entries
            </p>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════ */}
        {/* ── Training Log Section ── */}
        {/* ══════════════════════════════════════════════════ */}
        <section ref={trainingRef} className="space-y-4 scroll-mt-16">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Training Log
            </h2>
            {activeProgram && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {activeProgram.name}
              </p>
            )}
          </div>

          {/* Session stats grid */}
          {activeProgram && (
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-card p-3 text-center">
                <p className="stat-value text-2xl">{completedSessions.length}</p>
                <p className="micro-label mt-1">Sessions</p>
              </div>
              <div className="rounded-2xl bg-card p-3 text-center">
                <p className="stat-value text-2xl">{activeProgram.durationWeeks}</p>
                <p className="micro-label mt-1">Weeks</p>
              </div>
              <div className="rounded-2xl bg-card p-3 text-center">
                <p className="stat-value text-2xl">{activeProgram.daysPerWeek}</p>
                <p className="micro-label mt-1">Days/Wk</p>
              </div>
            </div>
          )}

          {/* Muscle volume visualizer */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold">Weekly Volume</h3>
              {activeProgram && (
                <span className="text-xs text-muted-foreground">
                  Week {activeProgram.currentWeekNumber ?? 1} of{" "}
                  {activeProgram.durationWeeks}
                </span>
              )}
            </div>
            <div className="rounded-2xl bg-card p-4">
              <MuscleVisualizer muscleData={muscleData} />
            </div>
          </div>

          {/* Training Calendar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold">Calendar</h3>
              <div className="flex items-center bg-muted rounded-lg p-0.5 gap-0.5">
                <button
                  onClick={() => setCalendarMode("feeling")}
                  className={`text-[10px] font-semibold px-2.5 py-1 rounded-md transition-colors ${
                    calendarMode === "feeling"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Feeling
                </button>
                <button
                  onClick={() => setCalendarMode("volume")}
                  className={`text-[10px] font-semibold px-2.5 py-1 rounded-md transition-colors ${
                    calendarMode === "volume"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Volume
                </button>
              </div>
            </div>
            <div className="rounded-2xl bg-card p-4">
              {calendarMode === "feeling" ? (
                <CalendarView
                  year={calYear}
                  month={calMonth}
                  sessions={calendarSessions}
                  onMonthChange={(y, m) => {
                    setCalYear(y);
                    setCalMonth(m);
                  }}
                />
              ) : (
                <VolumeCalendarView
                  year={calYear}
                  month={calMonth}
                  days={new Map<string, VolumeDayInfo>()}
                  onMonthChange={(y, m) => {
                    setCalYear(y);
                    setCalMonth(m);
                  }}
                />
              )}
            </div>
          </div>

          {/* Session list */}
          <div>
            <h3 className="text-sm font-bold mb-2">Sessions</h3>
            {sessionsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full rounded-2xl" />
                <Skeleton className="h-20 w-full rounded-2xl" />
              </div>
            ) : sessionsError ? (
              <div className="text-center py-10 text-muted-foreground">
                <p className="text-sm font-semibold mb-1">Failed to load sessions</p>
                <p className="text-xs">Please reload the page.</p>
              </div>
            ) : completedSessions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Dumbbell className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-semibold mb-1">No workouts yet</p>
                <p className="text-xs">Complete a workout to see your history here.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {completedSessions.map((session) => (
                  <SessionCard key={session.id} session={session} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════ */}
        {/* ── Programs Section ── */}
        {/* ══════════════════════════════════════════════════ */}
        <section ref={programsRef} className="space-y-3 scroll-mt-16">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              My Programs
            </h2>
            <Link href="/create">
              <Button size="sm" className="gap-1.5 h-7 text-xs">
                New
              </Button>
            </Link>
          </div>

          {programsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded-2xl" />
              <Skeleton className="h-16 w-full rounded-2xl" />
            </div>
          ) : programs.length === 0 ? (
            <div className="rounded-2xl bg-card p-6 text-center text-muted-foreground">
              <p className="text-xs">No programs yet. Create one above.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {programs.map((program) => (
                <div key={program.id} className="rounded-2xl bg-card overflow-hidden">
                  <div className="p-4 flex items-center gap-3">
                    <Link
                      href={`/program/${program.id}`}
                      className="flex-1 flex items-center gap-3 min-w-0 cursor-pointer"
                    >
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          program.isActive ? "bg-primary/15" : "bg-muted"
                        }`}
                      >
                        {program.isActive ? (
                          <Zap className="w-4 h-4 text-primary" />
                        ) : (
                          <Dumbbell className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-semibold truncate">
                            {program.name}
                          </span>
                          {program.isActive && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-0 flex-shrink-0"
                            >
                              Active
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {program.splitType} · {program.daysPerWeek}d/wk ·{" "}
                          {program.durationWeeks}wk
                        </p>
                      </div>
                    </Link>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!program.isActive && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setActiveMutation.mutate(program.id)}
                          disabled={setActiveMutation.isPending}
                        >
                          Set Active
                        </Button>
                      )}
                      <button
                        className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                        onClick={(e) => {
                          e.preventDefault();
                          setProgramToDelete(program);
                          setDeleteConfirmed(false);
                        }}
                        aria-label={`Delete ${program.name}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Delete program dialog */}
      <AlertDialog
        open={!!programToDelete}
        onOpenChange={(open) => {
          if (!open) {
            setProgramToDelete(null);
            setDeleteConfirmed(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Program?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                Are you sure you want to delete "{programToDelete?.name}"? This will
                permanently remove the program and its planned exercises. Your recorded
                history will not be affected.
              </p>
              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="confirm-delete"
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  checked={deleteConfirmed}
                  onChange={(e) => setDeleteConfirmed(e.target.checked)}
                />
                <label
                  htmlFor="confirm-delete"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  I understand this cannot be undone
                </label>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!deleteConfirmed || deleteProgramMutation.isPending}
              onClick={() => {
                if (programToDelete && deleteConfirmed) {
                  deleteProgramMutation.mutate(programToDelete.id);
                }
              }}
            >
              {deleteProgramMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
