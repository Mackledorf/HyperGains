/**
 * Workouts page — the primary workout hub.
 * Shows the active program + quick-start buttons at the top,
 * then the full programs list at the bottom.
 * (Previously Dashboard.tsx)
 */
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import * as store from "@/lib/storage";
import { Link, useLocation } from "wouter";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
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
} from "lucide-react";
import type { Program, WorkoutSession, ProgramExercise } from "@shared/schema";

export default function Workouts() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

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

  // ── All programs (for list at bottom) ─────────────────────────────────────
  const { data: allPrograms = [], isLoading: loadingAll } = useQuery<Program[]>({
    queryKey: ["programs", "all"],
    queryFn: () => store.getPrograms(),
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

  // ── Derived values ─────────────────────────────────────────────────────────
  const completedCount = sessions?.filter((s) => s.status === "completed").length || 0;
  const currentWeek = activeProgram?.currentWeekNumber ?? 1;
  const progressPct = activeProgram
    ? Math.round((currentWeek / activeProgram.durationWeeks) * 100)
    : 0;

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
              <Link href={`/program/${activeProgram.id}/settings`}>
                <button className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                  <Settings className="w-4 h-4" />
                </button>
              </Link>
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

            {/* End Week */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full rounded-xl h-11 border-dashed"
                  onClick={() => {
                    if (inProgressSession) {
                      toast({
                        title: "Finish your active workout first",
                        description: "Complete or discard the current session before ending the week.",
                      });
                    }
                  }}
                  disabled={advanceWeekMutation.isPending}
                  data-testid="button-end-week"
                >
                  <CalendarCheck className="w-4 h-4 mr-2" />
                  End Week {currentWeek}
                </Button>
              </AlertDialogTrigger>
              {!inProgressSession && (
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>End Week {currentWeek}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will advance your program to Week {currentWeek + 1}. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => advanceWeekMutation.mutate()}>
                      End Week
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              )}
            </AlertDialog>

            <Link href={`/program/${activeProgram.id}`}>
              <Button
                variant="ghost"
                className="w-full text-muted-foreground hover:text-foreground text-sm"
                data-testid="button-view-program"
              >
                View Program Details
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
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
        )}

        {/* ── All Programs section ── */}
        <section className="space-y-3 pt-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              My Programs
            </h2>
            <Link href="/create">
              <Button size="sm" className="gap-1.5 h-7 text-xs">
                <PlusCircle className="w-3 h-3" />
                New
              </Button>
            </Link>
          </div>

          {loadingAll ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded-2xl" />
              <Skeleton className="h-16 w-full rounded-2xl" />
            </div>
          ) : allPrograms.length === 0 ? (
            <div className="rounded-2xl bg-card p-6 text-center text-muted-foreground">
              <p className="text-xs">No programs yet. Create one above.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {allPrograms.map((program) => (
                <div key={program.id} className="rounded-2xl bg-card overflow-hidden">
                  <div className="p-4 flex items-center gap-3">
                    {/* Icon */}
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

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold truncate">{program.name}</span>
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
                        {program.splitType} · {program.daysPerWeek}d/wk · {program.durationWeeks}wk
                      </p>
                    </div>

                    {/* Actions */}
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
                      <Link href={`/program/${program.id}`}>
                        <button className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
