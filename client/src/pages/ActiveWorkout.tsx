import { useState, useEffect, useMemo, useRef } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getMuscleTagStyle } from "@/lib/muscleColors";
import { useToast } from "@/hooks/use-toast";
import ExerciseFeedbackSheet from "@/components/ExerciseFeedbackSheet";
import PostSessionCheckInSheet from "@/components/PostSessionCheckInSheet";
import RestTimer from "@/components/RestTimer";
import ExerciseSetCard, { type SetEntry } from "@/components/ExerciseSetCard";
import { applyFeedbackModifiers } from "@/lib/feedbackModifiers";
import { getRepRange, getDifficultyForExercise } from "@/lib/exerciseTiers";
import { MUSCLE_GROUPS, EXERCISE_DB } from "@/lib/exerciseDb";
import {
  ChevronLeft,
  Check,
  Zap,
  Clock,
  AlertTriangle,
  Plus,
  Search,
  MoreVertical,
  Pencil,
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

  // Menu + cancel state
  const [showMenu, setShowMenu] = useState(false);
  const [hideTimer, setHideTimer] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelAcknowledged, setCancelAcknowledged] = useState(false);

  // Ad-hoc: add exercise sheet state
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [exSearch, setExSearch] = useState("");
  const [exPickerMuscle, setExPickerMuscle] = useState("");
  const [exCustomMode, setExCustomMode] = useState(false);
  const [exCustomName, setExCustomName] = useState("");
  const [exCustomMuscle, setExCustomMuscle] = useState("");
  const exSearchRef = useRef<HTMLInputElement>(null);
  const [adHocExercises, setAdHocExercises] = useState<ProgramExercise[]>([]);

  // Workout timer
  useEffect(() => {
    const timer = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const { data: session, isLoading: loadingSession } = useQuery<WorkoutSession | null>({
    queryKey: ["session", sessionId],
    queryFn: () => store.getWorkoutSession(sessionId!) ?? null,
  });

  const isAdHoc = session?.isAdHoc === true;

  // For programmed workouts, load exercises from the program day.
  // For ad-hoc workouts, we maintain adHocExercises in local state (loaded below).
  const { data: programExercises, isLoading: loadingExercises } = useQuery<ProgramExercise[]>({
    queryKey: ["exercises", session?.programId, "day", session?.dayIndex],
    enabled: !!session && !isAdHoc,
    queryFn: () => store.getProgramExercisesByDay(session!.programId!, session!.dayIndex),
  });

  // Load ad-hoc exercises into state once session is ready
  useEffect(() => {
    if (!sessionId || !isAdHoc) return;
    setAdHocExercises(store.getAdHocExercisesForSession(sessionId));
  }, [sessionId, isAdHoc]);

  const exercises = isAdHoc ? adHocExercises : programExercises;
  const loadingExercisesAdHoc = isAdHoc ? false : loadingExercises;

  const { data: existingLogs } = useQuery<SetLog[]>({
    queryKey: ["setlogs", sessionId],
    enabled: !!sessionId,
    queryFn: () => store.getSetLogs(sessionId!),
  });

  // Feedback data for overload modifiers (programmed only)
  const { data: latestCheckIn } = useQuery<PostSessionCheckIn | undefined>({
    queryKey: ["checkIns", session?.programId, "latest"],
    enabled: !!session && !isAdHoc,
    queryFn: () => store.getLatestCheckIn(session!.programId!),
  });

  const { data: emphases } = useQuery<MuscleGroupEmphasis[]>({
    queryKey: ["emphasis", session?.programId],
    enabled: !!session && !isAdHoc,
    queryFn: () => store.getMuscleGroupEmphases(session!.programId!),
  });

  // Compute overload data client-side (programmed sessions only)
  const overloadData = useMemo(() => {
    if (isAdHoc) return undefined;
    if (!session || !exercises || exercises.length === 0) return undefined;

    const emphasisMap = Object.fromEntries(
      (emphases || []).map(e => [e.muscleGroup.toLowerCase(), e.emphasis])
    );

    const results: Record<string, { suggestions: OverloadSuggestion[]; defaultRir: number }> = {};
    for (const ex of exercises) {
      const muscleGroup = ex.muscleGroup;
      const defaultRir = getDefaultRirForExercise(session.weekNumber, muscleGroup);
      const previousLogs = store.getLastSetLogsForExercise(ex.id, session.programId!);
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
  }, [isAdHoc, session, exercises, latestCheckIn, emphases]);

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

  const cancelWorkoutMutation = useMutation({
    mutationFn: () => {
      store.updateWorkoutSession(sessionId!, { status: "cancelled" });
      return Promise.resolve();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["inProgress"] });
      toast({ title: "Workout cancelled" });
      navigate("/");
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
      if (isAdHoc) {
        navigate("/");
      } else {
        setShowCheckIn(true);
      }
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
          rir: lastSet?.rir || (overloadData?.[exerciseId]?.defaultRir?.toString() ?? "2"),
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

  if (loadingSession || loadingExercisesAdHoc) {
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
              <p className="micro-label">
                {isAdHoc
                  ? new Date(session.startedAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
                  : `Week ${session.weekNumber}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!hideTimer && (
              <div className="flex items-center gap-2 bg-card rounded-xl px-3 py-1.5">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="tabular-nums font-mono text-sm font-semibold text-foreground">
                  {formatTime(elapsedSeconds)}
                </span>
              </div>
            )}
            <div className="relative">
              <button
                onClick={() => setShowMenu((m) => !m)}
                className="w-8 h-8 rounded-xl flex items-center justify-center bg-card transition-colors active:bg-muted"
                aria-label="Workout menu"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-10 z-40 w-48 rounded-xl bg-card border border-border shadow-lg py-1 overflow-hidden">
                    <button
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted transition-colors"
                      onClick={() => { setHideTimer((t) => !t); setShowMenu(false); }}
                    >
                      {hideTimer ? "Show Timer" : "Hide Timer"}
                    </button>
                    <div className="h-px bg-border mx-3" />
                    <button
                      className="w-full text-left px-4 py-2.5 text-sm text-destructive hover:bg-muted transition-colors"
                      onClick={() => { setShowMenu(false); setCancelAcknowledged(false); setShowCancelConfirm(true); }}
                    >
                      Cancel Workout
                    </button>
                  </div>
                </>
              )}
            </div>
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

        {/* Add Exercise (ad-hoc only) */}
        {isAdHoc && (
          <Button
            variant="outline"
            className="w-full rounded-xl h-11 text-sm"
            onClick={() => { setExSearch(""); setExPickerMuscle(""); setExCustomMode(false); setExCustomName(""); setExCustomMuscle(""); setShowAddExercise(true); }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Exercise
          </Button>
        )}

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

        {/* Cancel workout confirmation overlay */}
        {showCancelConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-6">
            <div className="w-full max-w-sm rounded-2xl bg-card p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Cancel Workout?</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    This workout will be permanently deleted and cannot be restored.
                  </p>
                </div>
              </div>
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={cancelAcknowledged}
                  onChange={(e) => setCancelAcknowledged(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded accent-destructive shrink-0"
                />
                <span className="text-xs text-muted-foreground leading-snug">
                  I understand this workout will be deleted and this cannot be undone.
                </span>
              </label>
              <div className="space-y-2">
                <Button
                  variant="destructive"
                  className="w-full rounded-xl h-10 text-sm font-semibold"
                  disabled={!cancelAcknowledged || cancelWorkoutMutation.isPending}
                  onClick={() => cancelWorkoutMutation.mutate()}
                >
                  Cancel Workout
                </Button>
                <Button
                  variant="ghost"
                  className="w-full rounded-xl h-10 text-sm font-semibold"
                  onClick={() => { setShowCancelConfirm(false); setCancelAcknowledged(false); }}
                >
                  Go Back
                </Button>
              </div>
            </div>
          </div>
        )}

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

      {/* Post-session check-in sheet (programmed only) */}
      {showCheckIn && !isAdHoc && session && exercises && (
        <PostSessionCheckInSheet
          sessionId={session.id}
          programId={session.programId!}
          exercises={exercises}
          onClose={() => {
            setShowCheckIn(false);
            navigate("/");
          }}
        />
      )}

      {/* Add Exercise sheet (ad-hoc only) */}
      {showAddExercise && (() => {
        const filteredExercises = (() => {
          if (exSearch.trim()) {
            const q = exSearch.toLowerCase();
            const results: { name: string; muscleGroup: string }[] = [];
            for (const [mg, exercises] of Object.entries(EXERCISE_DB)) {
              for (const ex of exercises) {
                if (ex.toLowerCase().includes(q)) results.push({ name: ex, muscleGroup: mg });
              }
            }
            return results;
          }
          if (exPickerMuscle) {
            return (EXERCISE_DB[exPickerMuscle] || []).map(name => ({ name, muscleGroup: exPickerMuscle }));
          }
          return [];
        })();

        const addExercise = (exerciseName: string, muscleGroup: string) => {
          const newEx = store.addAdHocExercise(sessionId!, { exerciseName, muscleGroup });
          setAdHocExercises((prev) => [...prev, newEx]);
          setExerciseSets((prev) => ({
            ...prev,
            [newEx.id]: [
              { setNumber: 1, weight: "", reps: "", rir: "2", completed: false, skipped: false },
              { setNumber: 2, weight: "", reps: "", rir: "2", completed: false, skipped: false },
              { setNumber: 3, weight: "", reps: "", rir: "2", completed: false, skipped: false },
            ],
          }));
          setShowAddExercise(false);
        };

        return (
          <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm">
            <div className="bg-background rounded-t-3xl max-h-[85vh] flex flex-col">
              {/* Sheet header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <h2 className="text-base font-bold">Add Exercise</h2>
                <button
                  className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"
                  onClick={() => setShowAddExercise(false)}
                >
                  <span className="text-sm font-bold leading-none">✕</span>
                </button>
              </div>

              <div className="rounded-2xl bg-card mx-4 mb-4 overflow-hidden flex flex-col min-h-0">
                {/* Search */}
                <div className="p-3 border-b border-border/30">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      ref={exSearchRef}
                      value={exSearch}
                      onChange={(e) => { setExSearch(e.target.value); setExPickerMuscle(""); }}
                      placeholder="Search exercises…"
                      className="pl-9 rounded-xl bg-muted border-0 h-9 text-sm"
                    />
                  </div>
                </div>

                {!exCustomMode && (
                  <>
                    {/* Muscle group chips — only when not searching */}
                    {!exSearch && (
                      <div className="p-3 border-b border-border/30">
                        <div className="flex flex-wrap gap-1.5">
                          {MUSCLE_GROUPS.map(mg => (
                            <button
                              key={mg}
                              onClick={() => { setExPickerMuscle(mg); setExSearch(""); }}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                                exPickerMuscle !== mg ? "bg-muted text-muted-foreground active:bg-muted/80" : ""
                              }`}
                              style={exPickerMuscle === mg ? getMuscleTagStyle(mg) : undefined}
                            >
                              {mg}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Exercise list — shown when search query or muscle chip active */}
                    {(exSearch || exPickerMuscle) && (
                      <div className="overflow-y-auto" style={{ maxHeight: "40vh" }}>
                        {filteredExercises.length > 0 ? (
                          filteredExercises.map((ex, idx) => (
                            <button
                              key={`${ex.muscleGroup}-${ex.name}-${idx}`}
                              onClick={() => addExercise(ex.name, ex.muscleGroup)}
                              className="w-full px-4 py-2.5 text-left flex items-center justify-between hover:bg-white/[0.03] active:bg-white/[0.06] transition-colors border-t border-border/20 first:border-0"
                            >
                              <span className="text-sm font-medium">{ex.name}</span>
                              {exSearch && (
                                <span
                                  className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide"
                                  style={getMuscleTagStyle(ex.muscleGroup)}
                                >
                                  {ex.muscleGroup}
                                </span>
                              )}
                            </button>
                          ))
                        ) : (
                          <div className="p-4 text-center text-sm text-muted-foreground">
                            No exercises found
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Custom exercise form */}
                {exCustomMode && (
                  <div className="p-3 space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Exercise Name</Label>
                      <Input
                        placeholder="e.g. Reverse Pec Deck"
                        value={exCustomName}
                        onChange={e => setExCustomName(e.target.value)}
                        className="rounded-xl bg-muted border-0 h-9 text-sm"
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Muscle Group</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {MUSCLE_GROUPS.map(mg => (
                          <button
                            key={mg}
                            onClick={() => setExCustomMuscle(mg)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                              exCustomMuscle !== mg ? "bg-muted text-muted-foreground" : ""
                            }`}
                            style={exCustomMuscle === mg ? getMuscleTagStyle(mg) : undefined}
                          >
                            {mg}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Button
                      onClick={() => {
                        if (exCustomName.trim() && exCustomMuscle) {
                          addExercise(exCustomName.trim(), exCustomMuscle);
                        }
                      }}
                      disabled={!exCustomName.trim() || !exCustomMuscle}
                      className="w-full rounded-xl h-9 text-sm"
                    >
                      Add Custom Exercise
                    </Button>
                  </div>
                )}

                {/* Footer */}
                <div className="p-3 border-t border-border/30 flex items-center justify-between">
                  <button
                    onClick={() => { setExCustomMode(!exCustomMode); setExCustomName(""); setExCustomMuscle(""); }}
                    className="flex items-center gap-1.5 text-xs font-medium text-primary"
                  >
                    <Pencil className="w-3 h-3" />
                    {exCustomMode ? "Browse Exercises" : "Custom Exercise"}
                  </button>
                  <button
                    onClick={() => setShowAddExercise(false)}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </AppShell>
  );
}
