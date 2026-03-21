import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import * as store from "@/lib/storage";
import {
  computeOverloadSuggestions,
  getDefaultRirForExercise,
} from "@/lib/overload";
import { useLocation, useParams } from "wouter";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import ExerciseFeedbackSheet from "@/components/ExerciseFeedbackSheet";
import PostSessionCheckInSheet from "@/components/PostSessionCheckInSheet";
import RestTimer from "@/components/RestTimer";
import ExerciseSetCard, { type SetEntry } from "@/components/ExerciseSetCard";
import { applyFeedbackModifiers } from "@/lib/feedbackModifiers";
import { getRepRange, getDifficultyForExercise } from "@/lib/exerciseTiers";
import {
  ChevronLeft,
  Check,
  Zap,
  Clock,
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
          const hasSuggestions = (allSuggestions?.[exercise.id] || []).length > 0;
          return (
            <ExerciseSetCard
              key={exercise.id}
              exercise={exercise}
              sets={sets}
              overloadExerciseData={overloadData?.[exercise.id]}
              hasSuggestions={hasSuggestions}
              onCompleteSet={(setIdx) => completeSet(exercise.id, setIdx, exercise.restSeconds)}
              onUpdateField={(setIdx, field, value) => updateSetField(exercise.id, setIdx, field, value)}
              onSkipSet={(setIdx) => skipSet(exercise.id, setIdx)}
              onAddSet={() => addSet(exercise.id)}
              onRemoveSet={(setIdx) => removeSet(exercise.id, setIdx)}
            />
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
