import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import * as store from "@/lib/storage";
import AppShell from "@/components/AppShell";
import MuscleVisualizer from "@/components/MuscleVisualizer";
import CalendarView, { type SessionDayInfo } from "@/components/CalendarView";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Clock, TrendingUp, Dumbbell, Check } from "lucide-react";
import { getMuscleVolumeInfo } from "@/lib/muscleColors";
import { deriveSessionFeeling, FEELING_COLORS } from "@/lib/sessionFeeling";
import type {
  Program,
  WorkoutSession,
  SetLog,
  ExerciseFeedback,
  PostSessionCheckIn,
} from "@shared/schema";

const ALL_MUSCLES = [
  "chest", "back", "shoulders", "biceps", "triceps",
  "quads", "hamstrings", "glutes", "calves", "abs", "traps", "forearms",
];

// ── Session card (Sessions tab) ──────────────────────────────────────────────

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
      data-testid={`card-session-${session.id}`}
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
                {startDate.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
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
            <div
              key={name}
              className="px-4 py-3 border-b border-border/30 last:border-0"
            >
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

// ── Helpers ────────────────────────────────────────────────────────────────

/** Returns YYYY-MM-DD in the user's local timezone, avoiding UTC-date mismatch. */
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
    if (!feedbacksBySession.has(f.sessionId))
      feedbacksBySession.set(f.sessionId, []);
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

// ── Main History / Progress page ─────────────────────────────────────────────

export default function History() {
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());

  // Active program (for week number + sessions tab)
  const { data: activeProgram } = useQuery<Program | null>({
    queryKey: ["programs", "active"],
    queryFn: () => store.getActiveProgram() ?? null,
  });

  // Sessions for the Sessions tab (active program only)
  const { data: sessions, isLoading: sessionsLoading, isError: sessionsError } = useQuery<WorkoutSession[]>({
    queryKey: ["sessions", activeProgram?.id],
    enabled: !!activeProgram,
    queryFn: () => store.getWorkoutSessions(activeProgram!.id),
  });

  // Actual weekly sets for the muscle visualizer (current program week)
  const { data: weeklySets } = useQuery<Record<string, number>>({
    queryKey: ["weeklySets", activeProgram?.id, activeProgram?.currentWeekNumber],
    enabled: !!activeProgram,
    queryFn: () =>
      store.getActualWeeklySetsPerMuscle(
        activeProgram!.id,
        activeProgram!.currentWeekNumber ?? 1
      ),
  });

  // Completed sessions in the displayed calendar month (all programs)
  const { data: monthSessions } = useQuery<WorkoutSession[]>({
    queryKey: ["sessions", "month", calYear, calMonth],
    queryFn: () => store.getCompletedSessionsForMonth(calYear, calMonth),
  });

  // All check-ins (for calendar feeling colors)
  const { data: allCheckIns = [] } = useQuery<PostSessionCheckIn[]>({
    queryKey: ["checkIns", "all"],
    queryFn: () => store.getAllCheckIns(),
  });

  // All exercise feedbacks (for calendar feeling colors)
  const { data: allFeedbacks = [] } = useQuery<ExerciseFeedback[]>({
    queryKey: ["feedbacks", "all"],
    queryFn: () => store.getAllExerciseFeedbacks(),
  });

  // ── Derived: muscle volume data ──────────────────────────────────────────
  const muscleData = useMemo(
    () =>
      Object.fromEntries(
        ALL_MUSCLES.map((m) => [m, getMuscleVolumeInfo(m, weeklySets?.[m] ?? 0)])
      ),
    [weeklySets]
  );

  // ── Derived: calendar day map ────────────────────────────────────────────
  const calendarSessions = useMemo(
    () => buildCalendarSessionMap(monthSessions ?? [], allCheckIns, allFeedbacks),
    [monthSessions, allCheckIns, allFeedbacks]
  );

  const completedSessions = (sessions ?? []).filter(
    (s) => s.status === "completed"
  );

  return (
    <AppShell>
      <div className="space-y-4">
        {/* Page header */}
        <div>
          <h1 className="text-lg font-bold" data-testid="text-history-title">
            Progress
          </h1>
          <p className="micro-label mt-0.5">
            {activeProgram ? activeProgram.name : "No active program"}
          </p>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="w-full">
            <TabsTrigger value="overview" className="flex-1">
              Overview
            </TabsTrigger>
            <TabsTrigger value="sessions" className="flex-1">
              Sessions
            </TabsTrigger>
          </TabsList>

          {/* ── OVERVIEW TAB ──────────────────────────────────── */}
          <TabsContent value="overview" className="space-y-4 mt-4">
            {/* Muscle volume visualizer */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-bold">Weekly Volume</h2>
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

            {/* Calendar */}
            <div>
              <h2 className="text-sm font-bold mb-2">Training Log</h2>
              <div className="rounded-2xl bg-card p-4">
                <CalendarView
                  year={calYear}
                  month={calMonth}
                  sessions={calendarSessions}
                  onMonthChange={(y, m) => {
                    setCalYear(y);
                    setCalMonth(m);
                  }}
                />
              </div>
            </div>
          </TabsContent>

          {/* ── SESSIONS TAB ──────────────────────────────────── */}
          <TabsContent value="sessions" className="space-y-4 mt-4">
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

            {sessionsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full rounded-2xl" />
                <Skeleton className="h-20 w-full rounded-2xl" />
              </div>
            ) : sessionsError ? (
              <div className="text-center py-16 text-muted-foreground">
                <p className="text-sm font-semibold mb-1">Failed to load sessions</p>
                <p className="text-xs">Please reload the page.</p>
              </div>
            ) : completedSessions.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Dumbbell className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-semibold mb-1">No workouts yet</p>
                <p className="text-xs">
                  Complete a workout to see your history here.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {completedSessions.map((session) => (
                  <SessionCard key={session.id} session={session} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

