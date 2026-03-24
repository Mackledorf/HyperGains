/**
 * Lifts page — the primary lift hub.
 * Shows the active program + quick-start buttons at the top,
 * then the full programs list at the bottom.
 * (Previously Dashboard.tsx)
 */
import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import * as store from "@/lib/storage";
import { Link, useLocation } from "wouter";
import AppShell from "@/components/AppShell";
import MuscleVisualizer from "@/components/MuscleVisualizer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { getMuscleVolumeInfo } from "@/lib/muscleColors";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  PlusCircle,
  Play,
  Dumbbell,
  ChevronRight,
  Zap,
  CalendarCheck,
  CalendarClock,
  Settings,
  X,
  MoreVertical,
} from "lucide-react";
import type { Program, WorkoutSession, ProgramExercise } from "@shared/schema";

const ALL_MUSCLES = [
  "chest", "back", "shoulders", "biceps", "triceps",
  "quads", "hamstrings", "glutes", "calves", "abs", "traps", "forearms",
];

export default function Lifts() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showEndWeekDialog, setShowEndWeekDialog] = useState(false);
  const [endWeekAcknowledged, setEndWeekAcknowledged] = useState(false);
  const [showProgramMenu, setShowProgramMenu] = useState(false);

  // ── Active program & related data ──────────────────────────────────────────
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

  const { data: inProgressSession } = useQuery<WorkoutSession | null>({
    queryKey: ["inProgress"],
    queryFn: () => store.getInProgressSession() ?? null,
  });

  const { data: weeklySets } = useQuery<Record<string, number>>({
    queryKey: ["weeklySets", activeProgram?.id, activeProgram?.currentWeekNumber],
    enabled: !!activeProgram,
    queryFn: () =>
      store.getActualWeeklySetsPerMuscle(
        activeProgram!.id,
        activeProgram?.currentWeekNumber ?? 1
      ),
  });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const advanceWeekMutation = useMutation({
    mutationFn: () => {
      const result = store.advanceWeek(activeProgram!.id);
      if (!result) throw new Error("Failed to advance week");
      return Promise.resolve(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["programs"] });
      toast({ title: "Week advanced" });
    },
    onError: () => {
      toast({ title: "Failed to end week", variant: "destructive" });
    },
  });

  const startWorkoutMutation = useMutation({
    mutationFn: ({ dayIndex, dayLabel }: { dayIndex: number; dayLabel: string }) => {
      const session = store.createWorkoutSession({
        programId: activeProgram!.id,
        dayIndex,
        dayLabel,
        weekNumber: activeProgram?.currentWeekNumber ?? 1,
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

  const cancelWorkoutMutation = useMutation({
    mutationFn: (sessionId: string) => {
      store.updateWorkoutSession(sessionId, { status: "cancelled" });
      return Promise.resolve();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["inProgress"] });
      toast({ title: "Workout discarded" });
    },
  });

  // ── Derived values ─────────────────────────────────────────────────────────
  const completedCount = sessions?.filter((s) => s.status === "completed").length || 0;
  const currentWeek = activeProgram?.currentWeekNumber ?? 1;
  const progressPct = activeProgram
    ? Math.round((currentWeek / activeProgram.durationWeeks) * 100)
    : 0;

  const muscleData = useMemo(
    () =>
      Object.fromEntries(
        ALL_MUSCLES.map((m) => [m, getMuscleVolumeInfo(m, weeklySets?.[m] ?? 0)])
      ),
    [weeklySets]
  );

  const isNewTrainingWeek = (() => {
    if (!activeProgram?.isDecentralized || !activeProgram.weekStartedAt) return false;
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysFromMonday = (dayOfWeek + 6) % 7;
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() - daysFromMonday);
    thisMonday.setHours(0, 0, 0, 0);
    return new Date(activeProgram.weekStartedAt) < thisMonday;
  })();

  if (loadingProgram) {
    return (
      <AppShell>
        <div className="space-y-4">
          <Skeleton className="h-8 w-48 rounded-xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-5 pb-4">

        {/* ── In-progress session banner (always visible) ── */}
        {inProgressSession && (
          <div className="rounded-2xl bg-primary/10 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <button
                className="flex-1 text-left min-w-0"
                onClick={() => navigate(`/workout/${inProgressSession.id}`)}
                data-testid="card-resume-workout"
              >
                <p className="font-semibold text-sm text-foreground">Resume Workout</p>
                <p className="text-xs text-muted-foreground truncate">
                  {inProgressSession.dayLabel}{!inProgressSession.isAdHoc && ` — Week ${inProgressSession.weekNumber}`}
                </p>
              </button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                    aria-label="Discard workout"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Discard workout?</AlertDialogTitle>
                    <AlertDialogDescription>
                      "{inProgressSession.dayLabel}" will be discarded and any logged sets will be lost.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep Going</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => cancelWorkoutMutation.mutate(inProgressSession.id)}
                    >
                      Discard
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        )}

        {/* ── Active program section ── */}
        {activeProgram ? (
          <>
            {/* Program header */}
            <div className="flex items-start justify-between">
              <div>
                <p className="micro-label mb-1">{activeProgram.splitType}</p>
                <h1 className="text-lg font-bold" data-testid="text-program-name">
                  {activeProgram.name}
                </h1>
              </div>
              <div className="flex items-center gap-1">
                <AlertDialog open={showEndWeekDialog} onOpenChange={(v) => { setShowEndWeekDialog(v); if (!v) setEndWeekAcknowledged(false); }}>
                  <AlertDialogTrigger asChild>
                    <button
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => {
                        if (inProgressSession) {
                          toast({
                            title: "Finish your active workout first",
                            description: "Complete or discard the current session before ending the week.",
                          });
                        } else {
                          setEndWeekAcknowledged(false);
                          setShowEndWeekDialog(true);
                        }
                      }}
                      disabled={advanceWeekMutation.isPending}
                      data-testid="button-end-week"
                    >
                      <CalendarCheck className="w-4 h-4" />
                    </button>
                  </AlertDialogTrigger>
                  {!inProgressSession && (
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>End Week {currentWeek}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will advance your program to Week {currentWeek + 1}. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      {currentWeek === 1 && activeProgram.isDecentralized && (
                        <label className="flex items-start gap-3 cursor-pointer select-none px-1">
                          <input
                            type="checkbox"
                            checked={endWeekAcknowledged}
                            onChange={e => setEndWeekAcknowledged(e.target.checked)}
                            className="mt-0.5 accent-primary w-4 h-4 flex-shrink-0"
                          />
                          <span className="text-sm text-muted-foreground leading-snug">
                            I understand that ending Week 1 will lock in my training frequency for this program and advance me to Week 2.
                          </span>
                        </label>
                      )}
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          disabled={currentWeek === 1 && activeProgram.isDecentralized && !endWeekAcknowledged}
                          onClick={() => { advanceWeekMutation.mutate(); setShowEndWeekDialog(false); }}
                        >
                          End Week
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  )}
                </AlertDialog>
              </div>
            </div>

            {/* Muscle volume visualizer */}
            <div className="rounded-2xl bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-bold">Weekly Distribution</h2>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Week {currentWeek}
                </span>
              </div>
              <MuscleVisualizer muscleData={muscleData} />
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-card p-3">
                <p className="stat-value text-2xl">
                  {currentWeek}
                  <span className="text-muted-foreground text-sm font-normal">
                    /{activeProgram.durationWeeks}
                  </span>
                </p>
                <p className="micro-label mt-1">Week</p>
              </div>
              <div className="rounded-2xl bg-card p-3">
                <p className="stat-value text-2xl">{completedCount}</p>
                <p className="micro-label mt-1">Sessions</p>
              </div>
              <div className="rounded-2xl bg-card p-3">
                <p className="stat-value text-2xl">
                  {progressPct}
                  <span className="text-muted-foreground text-sm font-normal">%</span>
                </p>
                <p className="micro-label mt-1">Progress</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 bg-card rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {/* New week banner */}
            {isNewTrainingWeek && (
              <div className="rounded-2xl bg-yellow-500/10 border border-yellow-500/20 p-4">
                <div className="flex items-start gap-3">
                  <CalendarClock className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-yellow-300">New week started</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Ready to start Week {currentWeek + 1}?
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="rounded-xl h-8 text-xs flex-shrink-0"
                    onClick={() => advanceWeekMutation.mutate()}
                    disabled={advanceWeekMutation.isPending}
                  >
                    Start Week {currentWeek + 1}
                  </Button>
                </div>
              </div>
            )}

            {/* Resume in-progress session — handled by banner above */}

            {/* Start workout */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <p className="micro-label">Start Workout</p>
                <div className="relative">
                  <button
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowProgramMenu(v => !v)}
                    aria-label="Program options"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  {showProgramMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowProgramMenu(false)} />
                      <div className="absolute right-0 top-8 z-50 min-w-[180px] rounded-xl bg-card border border-border/50 shadow-lg overflow-hidden">
                        <button
                          className="w-full text-left px-4 py-3 text-sm hover:bg-muted/60 transition-colors flex items-center gap-2"
                          onClick={() => {
                            setShowProgramMenu(false);
                            if (inProgressSession) {
                              toast({ title: "Finish current lift first", description: "You have an active session in progress." });
                            } else {
                              navigate("/quick-lift");
                            }
                          }}
                        >
                          <Dumbbell className="w-3.5 h-3.5 text-muted-foreground" />
                          Record Lift
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="rounded-2xl bg-card overflow-hidden divide-y divide-border/50">
                {(activeProgram.dayLabels as string[]).map((label, index) => {
                  const dayExercises =
                    exercises?.filter((e) => e.dayIndex === index) || [];
                  return (
                    <button
                      key={index}
                      className="w-full p-4 text-left flex items-center justify-between transition-all active:bg-white/[0.03]"
                      onClick={() => {
                        if (!inProgressSession) {
                          startWorkoutMutation.mutate({ dayIndex: index, dayLabel: label });
                        } else {
                          toast({
                            title: "Finish current lift first",
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
                            {dayExercises.length} exercise
                            {dayExercises.length !== 1 ? "s" : ""}
                            {dayExercises.length > 0 && (
                              <>
                                {" · "}
                                {dayExercises
                                  .map((e) => e.muscleGroup)
                                  .filter((g, i, arr) => arr.indexOf(g) === i)
                                  .join(", ")}
                              </>
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

            <div className="flex justify-center mt-4">
              <Link href={`/program/${activeProgram.id}`}>
                <button
                  className="group flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-all active:scale-95"
                  data-testid="button-view-program"
                >
                  View Program Details
                  <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </Link>
            </div>
          </>
        ) : (
          /* No active program */
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
              <Dumbbell className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-lg font-bold mb-2" data-testid="text-welcome">
              No active program
            </h1>
            <p className="text-muted-foreground text-sm max-w-xs mb-8">
              Create a training program to start tracking your lifts with
              automatic progressive overload.
            </p>
            <div className="flex flex-col gap-3 w-full max-w-xs">
              <Link href="/create" className="w-full">
                <Button className="rounded-xl px-6 h-11 w-full" data-testid="button-create-program">
                  <PlusCircle className="w-4 h-4 mr-2" />
                  Create Program
                </Button>
              </Link>
              <Link href="/quick-lift" className="w-full">
                <Button variant="outline" className="rounded-xl px-6 h-11 w-full">
                  <Dumbbell className="w-4 h-4 mr-2" />
                  Record Lift
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
