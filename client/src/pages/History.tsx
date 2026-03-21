import { useQuery } from "@tanstack/react-query";
import * as store from "@/lib/storage";
import AppShell from "@/components/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Clock, TrendingUp, Dumbbell, Check } from "lucide-react";
import type { Program, WorkoutSession, SetLog } from "@shared/schema";
import { useState } from "react";

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
            <div key={name} className="px-4 py-3 border-b border-border/30 last:border-0">
              <p className="micro-label mb-1.5">{name}</p>
              <div className="flex flex-wrap gap-1.5">
                {setLogs
                  .sort((a, b) => a.setNumber - b.setNumber)
                  .map(log => (
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

export default function History() {
  const { data: activeProgram } = useQuery<Program | null>({
    queryKey: ["programs", "active"],
    queryFn: () => store.getActiveProgram() ?? null,
  });

  const { data: sessions, isLoading } = useQuery<WorkoutSession[]>({
    queryKey: ["sessions", activeProgram?.id],
    enabled: !!activeProgram,
    queryFn: () => store.getWorkoutSessions(activeProgram!.id),
  });

  const completedSessions = (sessions || []).filter(s => s.status === "completed");
  const totalSessions = completedSessions.length;

  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <h1 className="text-lg font-bold" data-testid="text-history-title">
            History
          </h1>
          <p className="micro-label mt-0.5">
            {activeProgram ? activeProgram.name : "No active program"}
          </p>
        </div>

        {activeProgram && (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-card p-3 text-center">
              <p className="stat-value text-2xl">{totalSessions}</p>
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

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </div>
        ) : completedSessions.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Dumbbell className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-semibold mb-1">No workouts yet</p>
            <p className="text-xs">Complete a workout to see your history here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {completedSessions.map(session => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
