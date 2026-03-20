import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import * as store from "@/lib/storage";
import { Link, useLocation } from "wouter";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  PlusCircle,
  Play,
  Dumbbell,
  ChevronRight,
  Zap,
} from "lucide-react";
import type { Program, WorkoutSession, ProgramExercise } from "@shared/schema";

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: activeProgram, isLoading: loadingProgram } = useQuery<Program | null>({
    queryKey: ["programs", "active"],
    queryFn: () => store.getActiveProgram() ?? null,
  });

  const { data: sessions } = useQuery<WorkoutSession[]>({
    queryKey: ["sessions", activeProgram?.id],
    enabled: !!activeProgram,
    queryFn: () => store.getWorkoutSessions(activeProgram!.id),
  });

  const { data: exercises } = useQuery<ProgramExercise[]>({
    queryKey: ["exercises", activeProgram?.id],
    enabled: !!activeProgram,
    queryFn: () => store.getProgramExercises(activeProgram!.id),
  });

  const startWorkoutMutation = useMutation({
    mutationFn: ({ dayIndex, dayLabel }: { dayIndex: number; dayLabel: string }) => {
      const completedSessions = (sessions || []).filter(s => s.status === "completed");
      const weekNumber = Math.floor(completedSessions.length / (activeProgram?.daysPerWeek || 1)) + 1;

      const session = store.createWorkoutSession({
        programId: activeProgram!.id,
        dayIndex,
        dayLabel,
        weekNumber,
        status: "in_progress",
        startedAt: new Date().toISOString(),
        completedAt: null,
      });
      return Promise.resolve(session);
    },
    onSuccess: (session: WorkoutSession) => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["inProgress"] });
      navigate(`/workout/${session.id}`);
    },
    onError: () => {
      toast({ title: "Failed to start workout", variant: "destructive" });
    },
  });

  const { data: inProgressSession } = useQuery<WorkoutSession | null>({
    queryKey: ["inProgress"],
    queryFn: () => store.getInProgressSession() ?? null,
  });

  const completedCount = sessions?.filter(s => s.status === "completed").length || 0;
  const currentWeek = activeProgram
    ? Math.min(Math.floor(completedCount / (activeProgram.daysPerWeek || 1)) + 1, activeProgram.durationWeeks)
    : 0;

  if (loadingProgram) {
    return (
      <AppShell>
        <div className="space-y-4">
          <Skeleton className="h-8 w-48 rounded-xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      </AppShell>
    );
  }

  if (!activeProgram) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
            <Dumbbell className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-lg font-bold mb-2" data-testid="text-welcome">
            No active program
          </h1>
          <p className="text-muted-foreground text-sm max-w-xs mb-8">
            Create a training program to start tracking your workouts with
            automatic progressive overload.
          </p>
          <Link href="/create">
            <Button className="rounded-xl px-6 h-11" data-testid="button-create-program">
              <PlusCircle className="w-4 h-4 mr-2" />
              Create Program
            </Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  const progressPct = Math.round((currentWeek / activeProgram.durationWeeks) * 100);

  return (
    <AppShell>
      <div className="space-y-5">
        {/* Program header */}
        <div>
          <p className="micro-label mb-1">{activeProgram.splitType}</p>
          <h1 className="text-lg font-bold" data-testid="text-program-name">
            {activeProgram.name}
          </h1>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-card p-3">
            <p className="stat-value text-2xl">{currentWeek}<span className="text-muted-foreground text-sm font-normal">/{activeProgram.durationWeeks}</span></p>
            <p className="micro-label mt-1">Week</p>
          </div>
          <div className="rounded-2xl bg-card p-3">
            <p className="stat-value text-2xl">{completedCount}</p>
            <p className="micro-label mt-1">Sessions</p>
          </div>
          <div className="rounded-2xl bg-card p-3">
            <p className="stat-value text-2xl">{progressPct}<span className="text-muted-foreground text-sm font-normal">%</span></p>
            <p className="micro-label mt-1">Progress</p>
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div className="h-1.5 bg-card rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Resume in-progress session */}
        {inProgressSession && (
          <button
            className="w-full rounded-2xl bg-primary/10 p-4 text-left transition-all active:scale-[0.98]"
            onClick={() => navigate(`/workout/${inProgressSession.id}`)}
            data-testid="card-resume-workout"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-foreground">Resume Workout</p>
                  <p className="text-xs text-muted-foreground">
                    {inProgressSession.dayLabel} — Week {inProgressSession.weekNumber}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </button>
        )}

        {/* Start workout */}
        <div className="space-y-2">
          <p className="micro-label px-1">Start Workout</p>
          <div className="rounded-2xl bg-card overflow-hidden divide-y divide-border/50">
            {(activeProgram.dayLabels as string[]).map((label, index) => {
              const dayExercises = exercises?.filter(e => e.dayIndex === index) || [];
              return (
                <button
                  key={index}
                  className="w-full p-4 text-left flex items-center justify-between transition-all active:bg-white/[0.03]"
                  onClick={() => {
                    if (!inProgressSession) {
                      startWorkoutMutation.mutate({ dayIndex: index, dayLabel: label });
                    } else {
                      toast({
                        title: "Finish current workout first",
                        description: "You have an active session in progress.",
                      });
                    }
                  }}
                  data-testid={`card-start-day-${index}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
                      <Play className="w-4 h-4 text-foreground" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{label}</p>
                      <p className="text-xs text-muted-foreground">
                        {dayExercises.length} exercise{dayExercises.length !== 1 ? "s" : ""}
                        {dayExercises.length > 0 && (
                          <> · {dayExercises.map(e => e.muscleGroup).filter((v, i, a) => a.indexOf(v) === i).join(", ")}</>
                        )}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        </div>

        {/* View program */}
        <Link href={`/program/${activeProgram.id}`}>
          <Button variant="ghost" className="w-full text-muted-foreground hover:text-foreground text-sm" data-testid="button-view-program">
            View Program Details
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </Link>
      </div>
    </AppShell>
  );
}
