import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import * as store from "@/lib/storage";
import {
  computeOverloadSuggestions,
  getDefaultRirForExercise,
  RIR_JUNK_THRESHOLD,
} from "@/lib/overload";
import { useLocation, useParams } from "wouter";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import ExerciseFeedbackSheet from "@/components/ExerciseFeedbackSheet";
import PostSessionCheckInSheet from "@/components/PostSessionCheckInSheet";
import { applyFeedbackModifiers } from "@/lib/feedbackModifiers";
import { getRepRange, getDifficultyForExercise } from "@/lib/exerciseTiers";
import {
  ChevronLeft,
  Check,
  Zap,
  TrendingUp,
  Clock,
  Plus,
  Trash2,
  ArrowUp,
  SkipForward,
  AlertTriangle,
} from "lucide-react";
import type {
  WorkoutSession,
  ProgramExercise,
  SetLog,
  OverloadSuggestion,
  PostSessionCheckIn,
  MuscleGroupEmphasis,
} from "@shared/schema";

const RIR_OPTIONS = [
  { label: "0", value: "0" },
  { label: "1", value: "1" },
  { label: "2", value: "2" },
  { label: "3", value: "3" },
  { label: "4+", value: "4" },
];

type SetEntry = {
  id?: string;
  setNumber: number;
  weight: string;
  reps: string;
  rir: string;
  completed: boolean;
  skipped: boolean;
  suggestion?: OverloadSuggestion;
};

function RestTimer({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) {
      onDone();
      return;
    }
    const timer = setTimeout(() => setRemaining(r => r - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining, onDone]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  return (
    <div className="rounded-2xl bg-card p-5 text-center">
      <p className="micro-label mb-2">Rest Timer</p>
      <p className="text-5xl font-bold tabular-nums tracking-tight text-foreground font-mono">
        {mins}:{secs.toString().padStart(2, "0")}
      </p>
      <button
        onClick={onDone}
        className="mt-3 px-5 py-1.5 rounded-lg bg-destructive/10 text-destructive text-sm font-semibold transition-colors hover:bg-destructive/20"
      >
        Skip
      </button>
    </div>
  );
}

export default function ActiveWorkout() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [exerciseSets, setExerciseSets] = useState<Record<string, SetEntry[]>>({});
  const [setsInitialized, setSetsInitialized] = useState(false);
  const [suggestionsApplied, setSuggestionsApplied] = useState(false);
  const [activeRestTimer, setActiveRestTimer] = useState<{ exerciseId: string; seconds: number } | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  // exerciseId that needs post-exercise feedback
  const [feedbackExerciseId, setFeedbackExerciseId] = useState<string | null>(null);
  // Show post-session check-in sheet after completing workout
  const [showCheckIn, setShowCheckIn] = useState(false);

  // Workout timer
  useEffect(() => {
    const timer = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const { data: session, isLoading: loadingSession } = useQuery<WorkoutSession | null>({
    queryKey: ["session", sessionId],
    queryFn: () => store.getWorkoutSession(sessionId!) ?? null,
  });

  const { data: exercises, isLoading: loadingExercises } = useQuery<ProgramExercise[]>({
    queryKey: ["exercises", session?.programId, "day", session?.dayIndex],
    enabled: !!session,
    queryFn: () => store.getProgramExercisesByDay(session!.programId, session!.dayIndex),
  });

  const { data: existingLogs } = useQuery<SetLog[]>({
    queryKey: ["setlogs", sessionId],
    enabled: !!sessionId,
    queryFn: () => store.getSetLogs(sessionId!),
  });

  // Feedback data for overload modifiers
  const { data: latestCheckIn } = useQuery<PostSessionCheckIn | undefined>({
    queryKey: ["checkIns", session?.programId, "latest"],
    enabled: !!session,
    queryFn: () => store.getLatestCheckIn(session!.programId),
  });

  const { data: emphases } = useQuery<MuscleGroupEmphasis[]>({
    queryKey: ["emphasis", session?.programId],
    enabled: !!session,
    queryFn: () => store.getMuscleGroupEmphases(session!.programId),
  });

  // Compute overload data client-side
  const overloadData = useMemo(() => {
    if (!session || !exercises || exercises.length === 0) return undefined;

    const emphasisMap = Object.fromEntries(
      (emphases || []).map(e => [e.muscleGroup.toLowerCase(), e.emphasis])
    );

    const results: Record<string, { suggestions: OverloadSuggestion[]; defaultRir: number }> = {};
    for (const ex of exercises) {
      const muscleGroup = ex.muscleGroup;
      const defaultRir = getDefaultRirForExercise(session.weekNumber, muscleGroup);
      const previousLogs = store.getLastSetLogsForExercise(ex.id, session.programId);
      const emphasis = (emphasisMap[muscleGroup.toLowerCase()] ?? "grow") as "maintain" | "grow" | "emphasize";

      if (previousLogs.length === 0) {
        results[ex.id] = { suggestions: [], defaultRir };
      } else {
        const raw = computeOverloadSuggestions(
          previousLogs,
          ex.targetReps,
          session.weekNumber,
          muscleGroup,
          getDifficultyForExercise(ex.exerciseName),
          emphasis
        );
        // Apply feedback modifiers from the most recent check-in
        const repRange = getRepRange(getDifficultyForExercise(ex.exerciseName));
        const suggestions = applyFeedbackModifiers(
          raw,
          latestCheckIn,
          repRange.max
        );
        results[ex.id] = { suggestions, defaultRir };
      }
    }
    return results;
  }, [session, exercises, latestCheckIn, emphases]);

  const allSuggestions = overloadData
    ? Object.fromEntries(Object.entries(overloadData).map(([id, d]) => [id, d.suggestions]))
    : undefined;

  // Initialize sets when exercises load
  useEffect(() => {
    if (!exercises || exercises.length === 0) return;
    if (setsInitialized) return;

    const initial: Record<string, SetEntry[]> = {};
    for (const ex of exercises) {
      const exLogs = (existingLogs || []).filter(l => l.exerciseId === ex.id);
      const sets: SetEntry[] = [];
      for (let i = 0; i < ex.targetSets; i++) {
        const existingLog = exLogs.find(l => l.setNumber === i + 1);
        if (existingLog) {
          sets.push({
            id: existingLog.id,
            setNumber: i + 1,
            weight: existingLog.weight.toString(),
            reps: existingLog.reps.toString(),
            rir: existingLog.rir?.toString() || "",
            completed: true,
            skipped: false,
          });
        } else {
          sets.push({
            setNumber: i + 1,
            weight: "",
            reps: "",
            rir: "",
            completed: false,
            skipped: false,
          });
        }
      }
      initial[ex.id] = sets;
    }
    setExerciseSets(initial);
    setSetsInitialized(true);
  }, [exercises, existingLogs, setsInitialized]);

  // Apply overload suggestions + default RIR
  useEffect(() => {
    if (!overloadData || !setsInitialized || suggestionsApplied) return;

    setExerciseSets(prev => {
      const updated = { ...prev };
      for (const [exerciseId, data] of Object.entries(overloadData)) {
        const sets = updated[exerciseId];
        if (!sets) continue;
        const { suggestions, defaultRir } = data;

        updated[exerciseId] = sets.map(set => {
          if (set.completed) return set;
          const suggestion = suggestions.find(s => s.setNumber === set.setNumber);
          if (suggestion) {
            return {
              ...set,
              weight: set.weight || suggestion.suggestedWeight.toString(),
              reps: set.reps || suggestion.suggestedReps.toString(),
              // null suggestedRir = above-range recalibration — leave blank for user
              rir: set.rir || (suggestion.suggestedRir != null ? suggestion.suggestedRir.toString() : ""),
              suggestion,
            };
          }
          return {
            ...set,
            rir: set.rir || defaultRir.toString(),
          };
        });
      }
      return updated;
    });
    setSuggestionsApplied(true);
  }, [overloadData, setsInitialized, suggestionsApplied]);

  const logSetMutation = useMutation({
    mutationFn: ({
      exerciseId,
      exerciseName,
      setNumber,
      weight,
      reps,
      rir,
    }: {
      exerciseId: string;
      exerciseName: string;
      setNumber: number;
      weight: number;
      reps: number;
      rir: number | null;
    }) => {
      const hasSuggestion = allSuggestions?.[exerciseId]?.some(s => s.setNumber === setNumber);
      const log = store.createSetLog({
        sessionId: sessionId!,
        exerciseId,
        exerciseName,
        setNumber,
        weight,
        reps,
        rir,
        isProgressed: !!hasSuggestion,
      });
      return Promise.resolve(log);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["setlogs", sessionId] });
    },
  });

  const completeWorkoutMutation = useMutation({
    mutationFn: () => {
      const updated = store.updateWorkoutSession(sessionId!, {
        status: "completed",
        completedAt: new Date().toISOString(),
      });
      return Promise.resolve(updated);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["inProgress"] });
      queryClient.invalidateQueries({ queryKey: ["session"] });
      toast({ title: "Workout completed" });
      setShowCheckIn(true);
    },
  });

  const completeSet = (exerciseId: string, setIdx: number, restSeconds: number) => {
    const sets = exerciseSets[exerciseId];
    if (!sets) return;
    const set = sets[setIdx];
    const weight = parseFloat(set.weight);
    const reps = parseInt(set.reps);
    if (isNaN(weight) || isNaN(reps)) {
      toast({ title: "Enter weight and reps", variant: "destructive" });
      return;
    }

    const exercise = exercises?.find(e => e.id === exerciseId);
    if (!exercise) return;

    logSetMutation.mutate({
      exerciseId,
      exerciseName: exercise.exerciseName,
      setNumber: set.setNumber,
      weight,
      reps,
      rir: set.rir ? parseInt(set.rir) : null,
    });

    const updatedSets = [...sets];
    updatedSets[setIdx] = { ...updatedSets[setIdx], completed: true };
    setExerciseSets({ ...exerciseSets, [exerciseId]: updatedSets });

    setActiveRestTimer({ exerciseId, seconds: restSeconds });

    // If all sets for this exercise are now done, prompt for feedback
    const allDone = updatedSets.every(s => s.completed || s.skipped);
    if (allDone) {
      setFeedbackExerciseId(exerciseId);
    }
  };

  const updateSetField = (exerciseId: string, setIdx: number, field: keyof SetEntry, value: string) => {
    const sets = exerciseSets[exerciseId];
    if (!sets) return;
    const updated = [...sets];
    updated[setIdx] = { ...updated[setIdx], [field]: value };
    setExerciseSets({ ...exerciseSets, [exerciseId]: updated });
  };

  const skipSet = (exerciseId: string, setIdx: number) => {
    const sets = exerciseSets[exerciseId];
    if (!sets) return;
    const updatedSets = [...sets];
    updatedSets[setIdx] = { ...updatedSets[setIdx], skipped: true };
    setExerciseSets({ ...exerciseSets, [exerciseId]: updatedSets });
  };

  const addSet = (exerciseId: string) => {
    const sets = exerciseSets[exerciseId] || [];
    const lastSet = sets.length > 0 ? sets[sets.length - 1] : null;
    setExerciseSets({
      ...exerciseSets,
      [exerciseId]: [
        ...sets,
        {
          setNumber: sets.length + 1,
          weight: lastSet?.weight || "",
          reps: "",
          rir: lastSet?.rir || (overloadData?.[exerciseId]?.defaultRir?.toString() ?? ""),
          completed: false,
          skipped: false,
        },
      ],
    });
  };

  const removeSet = (exerciseId: string, setIdx: number) => {
    const sets = exerciseSets[exerciseId] || [];
    if (sets.length <= 1) return;
    const updated = sets.filter((_, i) => i !== setIdx).map((s, i) => ({ ...s, setNumber: i + 1 }));
    setExerciseSets({ ...exerciseSets, [exerciseId]: updated });
  };

  const allSetsCompleted = exercises
    ? exercises.every(ex => {
        const sets = exerciseSets[ex.id] || [];
        return sets.every(s => s.completed || s.skipped);
      })
    : false;

  const hasIncompleteSets = exercises
    ? exercises.some(ex => {
        const sets = exerciseSets[ex.id] || [];
        return sets.some(s => !s.completed && !s.skipped);
      })
    : false;

  const remainingSetCount = exercises
    ? exercises.reduce((total, ex) => {
        const sets = exerciseSets[ex.id] || [];
        return total + sets.filter(s => !s.completed && !s.skipped).length;
      }, 0)
    : 0;

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (loadingSession || loadingExercises) {
    return (
      <AppShell>
        <div className="space-y-4">
          <Skeleton className="h-8 w-48 rounded-xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      </AppShell>
    );
  }

  if (!session || session.status === "completed") {
    return (
      <AppShell>
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--set-complete-bg))] flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-[hsl(var(--set-complete-text))]" />
          </div>
          <h1 className="text-lg font-bold mb-2">Workout Completed</h1>
          <Button onClick={() => navigate("/")} variant="ghost" className="text-muted-foreground rounded-xl">
            Back to Dashboard
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/")}
              className="w-8 h-8 rounded-xl flex items-center justify-center bg-card transition-colors active:bg-muted"
              data-testid="button-back-workout"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-lg font-bold" data-testid="text-workout-title">
                {session.dayLabel}
              </h1>
              <p className="micro-label">Week {session.weekNumber}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-card rounded-xl px-3 py-1.5">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="tabular-nums font-mono text-sm font-semibold text-foreground">
              {formatTime(elapsedSeconds)}
            </span>
          </div>
        </div>

        {/* Rest timer */}
        {activeRestTimer && (
          <RestTimer
            seconds={activeRestTimer.seconds}
            onDone={() => setActiveRestTimer(null)}
          />
        )}

        {/* Exercises */}
        {exercises?.map(exercise => {
          const sets = exerciseSets[exercise.id] || [];
          const doneSets = sets.filter(s => s.completed || s.skipped).length;
          const hasSuggestions = (allSuggestions?.[exercise.id] || []).length > 0;

          return (
            <div key={exercise.id} className="rounded-2xl bg-card overflow-hidden" data-testid={`card-exercise-${exercise.id}`}>
              {/* Exercise header */}
              <div className="px-4 pt-4 pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold">{exercise.exerciseName}</h2>
                      {hasSuggestions && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-semibold">
                          <TrendingUp className="w-3 h-3" />
                          Overloaded
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {exercise.muscleGroup} · target {exercise.targetReps} reps · {exercise.restSeconds}s rest
                      {overloadData?.[exercise.id] && (
                        <span className="text-primary/70"> · {overloadData[exercise.id].defaultRir} RIR target</span>
                      )}
                    </p>
                  </div>
                  <span className="text-xs tabular-nums font-mono text-muted-foreground font-semibold">
                    {doneSets}/{sets.length}
                  </span>
                </div>
              </div>

              {/* Set rows */}
              <div>
                <div className="grid grid-cols-[36px_1fr_1fr_56px_56px] gap-1.5 px-4 py-2 border-t border-border/50">
                  <span className="micro-label">Set</span>
                  <span className="micro-label">Lbs</span>
                  <span className="micro-label">Reps</span>
                  <span className="micro-label">RIR</span>
                  <span></span>
                </div>

                {sets.map((set, idx) => (
                  <div
                    key={idx}
                    className={`grid grid-cols-[36px_1fr_1fr_56px_56px] gap-1.5 px-4 py-2 items-center transition-colors ${
                      set.completed
                        ? "bg-[hsl(var(--set-complete-bg))]"
                        : set.skipped
                          ? "bg-muted/30 opacity-50"
                          : idx % 2 === 1 ? "bg-white/[0.02]" : ""
                    }`}
                    data-testid={`set-row-${exercise.id}-${idx}`}
                  >
                    <span className={`text-sm font-bold tabular-nums ${
                      set.completed ? "text-[hsl(var(--set-complete-text))]" : set.skipped ? "text-muted-foreground line-through" : "text-muted-foreground"
                    }`}>
                      {set.setNumber}
                    </span>
                    {set.skipped ? (
                      <span className="col-span-3 text-xs text-muted-foreground italic">Skipped</span>
                    ) : (
                      <>
                        <div className="relative">
                          <Input
                            type="number"
                            step="2.5"
                            value={set.weight}
                            onChange={e => updateSetField(exercise.id, idx, "weight", e.target.value)}
                            disabled={set.completed}
                            className={`h-8 text-sm tabular-nums font-mono rounded-lg border-0 ${
                              set.completed
                                ? "bg-transparent text-[hsl(var(--set-complete-text))] font-semibold"
                                : "bg-muted"
                            }`}
                            placeholder="-"
                            data-testid={`input-weight-${exercise.id}-${idx}`}
                          />
                          {set.suggestion && !set.completed && set.suggestion.previousWeight > 0 && set.suggestion.suggestedWeight !== set.suggestion.previousWeight && (
                            <div className="absolute -top-4 left-0 flex items-center gap-0.5 text-[9px] text-primary font-semibold">
                              <ArrowUp className="w-2.5 h-2.5" />
                              was {set.suggestion.previousWeight}
                            </div>
                          )}
                        </div>
                        <Input
                          type="number"
                          value={set.reps}
                          onChange={e => updateSetField(exercise.id, idx, "reps", e.target.value)}
                          disabled={set.completed}
                          className={`h-8 text-sm tabular-nums font-mono rounded-lg border-0 ${
                            set.completed
                              ? "bg-transparent text-[hsl(var(--set-complete-text))] font-semibold"
                              : "bg-muted"
                          }`}
                          placeholder="-"
                          data-testid={`input-reps-${exercise.id}-${idx}`}
                        />
                        <div className="relative">
                          {/* RIR dropdown — 0, 1, 2, 3, 4+ */}
                          <select
                            value={set.rir}
                            onChange={e => updateSetField(exercise.id, idx, "rir", e.target.value)}
                            disabled={set.completed}
                            className={`h-8 w-full text-sm tabular-nums font-mono rounded-lg border-0 px-2 appearance-none ${
                              set.completed
                                ? "bg-transparent text-[hsl(var(--set-complete-text))] font-semibold"
                                : "bg-muted text-foreground"
                            }`}
                            data-testid={`select-rir-${exercise.id}-${idx}`}
                          >
                            <option value="" disabled>-</option>
                            {RIR_OPTIONS.map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                          {set.suggestion && !set.completed && set.suggestion.previousRir !== null && set.suggestion.suggestedRir !== set.suggestion.previousRir && (
                            <div className="absolute -top-4 left-0 flex items-center gap-0.5 text-[9px] text-primary font-semibold">
                              <ArrowUp className="w-2.5 h-2.5" />
                              was {set.suggestion.previousRir >= RIR_JUNK_THRESHOLD ? "4+" : set.suggestion.previousRir}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                    <div className="flex justify-center gap-1">
                      {set.completed ? (
                        <div className="w-7 h-7 rounded-lg bg-[hsl(var(--set-complete-text))]/20 flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 text-[hsl(var(--set-complete-text))]" />
                        </div>
                      ) : set.skipped ? (
                        <div className="w-7 h-7 rounded-lg bg-muted/50 flex items-center justify-center">
                          <SkipForward className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => completeSet(exercise.id, idx, exercise.restSeconds)}
                            className="w-7 h-7 rounded-lg bg-muted hover:bg-primary hover:text-primary-foreground flex items-center justify-center transition-colors"
                            data-testid={`button-complete-set-${exercise.id}-${idx}`}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => skipSet(exercise.id, idx)}
                            className="w-7 h-7 rounded-lg bg-transparent hover:bg-muted flex items-center justify-center transition-colors"
                            data-testid={`button-skip-set-${exercise.id}-${idx}`}
                            title="Skip set"
                          >
                            <SkipForward className="w-3 h-3 text-muted-foreground" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add/remove set */}
              <div className="flex items-center gap-3 px-4 py-2.5 border-t border-border/50">
                <button
                  onClick={() => addSet(exercise.id)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors font-medium"
                  data-testid={`button-add-set-${exercise.id}`}
                >
                  <Plus className="w-3 h-3" />
                  Add Set
                </button>
                {sets.length > 1 && !sets[sets.length - 1].completed && (
                  <button
                    onClick={() => removeSet(exercise.id, sets.length - 1)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors font-medium"
                    data-testid={`button-remove-set-${exercise.id}`}
                  >
                    <Trash2 className="w-3 h-3" />
                    Remove
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* End / Complete workout */}
        <Button
          onClick={() => {
            if (hasIncompleteSets) {
              setShowEndConfirm(true);
            } else {
              completeWorkoutMutation.mutate();
            }
          }}
          disabled={completeWorkoutMutation.isPending}
          className={`w-full rounded-xl h-12 text-sm font-bold ${
            allSetsCompleted ? "" : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
          variant={allSetsCompleted ? "default" : "secondary"}
          data-testid="button-complete-workout"
        >
          {completeWorkoutMutation.isPending ? (
            "Saving..."
          ) : allSetsCompleted ? (
            <>
              <Zap className="w-4 h-4 mr-2" />
              Complete Workout
            </>
          ) : (
            "End Workout"
          )}
        </Button>

        {/* End workout confirmation overlay */}
        {showEndConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-6">
            <div className="w-full max-w-sm rounded-2xl bg-card p-6 space-y-4" data-testid="dialog-end-workout">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">End Workout?</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Ending your workout will skip {remainingSetCount} remaining {remainingSetCount === 1 ? "set" : "sets"}. Are you sure?
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="ghost"
                  className="flex-1 rounded-xl h-10 text-sm font-semibold"
                  onClick={() => setShowEndConfirm(false)}
                  data-testid="button-cancel-end"
                >
                  Keep Going
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1 rounded-xl h-10 text-sm font-semibold"
                  onClick={() => {
                    setShowEndConfirm(false);
                    completeWorkoutMutation.mutate();
                  }}
                  data-testid="button-confirm-end"
                >
                  End Workout
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Post-exercise feedback sheet */}
      {feedbackExerciseId && session && exercises && (
        <ExerciseFeedbackSheet
          sessionId={session.id}
          exercise={exercises.find(e => e.id === feedbackExerciseId)!}
          onClose={() => setFeedbackExerciseId(null)}
        />
      )}

      {/* Post-session check-in sheet */}
      {showCheckIn && session && exercises && (
        <PostSessionCheckInSheet
          sessionId={session.id}
          programId={session.programId}
          exercises={exercises}
          onClose={() => {
            setShowCheckIn(false);
            navigate("/");
          }}
        />
      )}
    </AppShell>
  );
}
