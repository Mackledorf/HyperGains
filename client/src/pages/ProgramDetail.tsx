import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import * as store from "@/lib/storage";
import { useParams, useLocation } from "wouter";
import AppShell from "@/components/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft } from "lucide-react";
import type { Program, ProgramExercise, MuscleGroupEmphasis } from "@shared/schema";
import { getDifficultyForExercise, getRepRange } from "@/lib/exerciseTiers";
import { getTargetSetsForEmphasis } from "@/lib/volumeLandmarks";
import { getMuscleTagStyle } from "@/lib/muscleColors";

export default function ProgramDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: program, isLoading: loadingProgram } = useQuery<Program | undefined>({
    queryKey: ["programs", id],
    queryFn: () => store.getProgram(id!),
  });

  const { data: exercises, isLoading: loadingExercises } = useQuery<ProgramExercise[]>({
    queryKey: ["exercises", id],
    enabled: !!id,
    queryFn: () => store.getProgramExercises(id!),
  });

  const { data: emphases } = useQuery<MuscleGroupEmphasis[]>({
    queryKey: ["emphasis", id],
    enabled: !!id,
    queryFn: () => store.getMuscleGroupEmphases(id!),
  });

  const emphasisMap = Object.fromEntries(
    (emphases || []).map((e) => [e.muscleGroup.toLowerCase(), e.emphasis])
  );

  // Derive unique muscle groups from exercises
  const muscleGroups = Array.from(
    new Set((exercises || []).map((e) => e.muscleGroup))
  ).sort();

  const updateEmphasisMutation = useMutation({
    mutationFn: ({
      muscleGroup,
      emphasis,
    }: {
      muscleGroup: string;
      emphasis: MuscleGroupEmphasis["emphasis"];
    }) => {
      store.upsertMuscleGroupEmphasis(id!, muscleGroup, emphasis);
      return Promise.resolve();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emphasis", id] });
    },
    onError: () => {
      toast({ title: "Failed to save emphasis", variant: "destructive" });
    },
  });

  if (loadingProgram || loadingExercises) {
    return (
      <AppShell>
        <div className="space-y-4">
          <Skeleton className="h-8 w-48 rounded-xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      </AppShell>
    );
  }

  if (!program) {
    return (
      <AppShell>
        <p className="text-center text-muted-foreground py-20">Program not found</p>
      </AppShell>
    );
  }

  const dayLabels = program.dayLabels as string[];

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="w-8 h-8 rounded-xl flex items-center justify-center bg-card transition-colors active:bg-muted"
            data-testid="button-back"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-lg font-bold" data-testid="text-program-name">
              {program.name}
            </h1>
            <p className="micro-label">
              {program.splitType} · {program.durationWeeks} weeks · {program.daysPerWeek} days/week
            </p>
          </div>
        </div>

        {/* Muscle Group Emphasis */}
        <div className="space-y-2">
          <p className="micro-label px-1">Muscle Group Emphasis</p>
          {muscleGroups.length === 0 ? (
            <div className="rounded-2xl bg-card p-4 text-center text-xs text-muted-foreground">
              No exercises in this program yet.
            </div>
          ) : (
            <div className="rounded-2xl bg-card overflow-hidden divide-y divide-border/50">
              {muscleGroups.map((mg) => {
                const current =
                  (emphasisMap[mg.toLowerCase()] as MuscleGroupEmphasis["emphasis"]) ??
                  "grow";
                const target = getTargetSetsForEmphasis(mg, current);

                const barCount = current === "maintain" ? 1 : current === "grow" ? 2 : 3;
                const activeBarClass = current === "maintain"
                  ? "bg-green-500"
                  : current === "grow"
                  ? "bg-yellow-400"
                  : "bg-brandRed";
                return (
                  <div key={mg} className="p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span
                        className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide"
                        style={getMuscleTagStyle(mg)}
                      >
                        {mg}
                      </span>
                      <button
                        onClick={() => {
                          const cycle: ("maintain" | "grow" | "emphasize")[] = ["maintain", "grow", "emphasize"];
                          const next = cycle[(cycle.indexOf(current) + 1) % 3];
                          updateEmphasisMutation.mutate({ muscleGroup: mg, emphasis: next });
                        }}
                        className="flex items-center gap-2 rounded-xl px-3 py-2 bg-muted/50 hover:bg-muted active:scale-95 transition-all"
                      >
                        <div className="flex gap-0.5 items-center">
                          {[1, 2, 3].map(i => (
                            <div
                              key={i}
                              className={`w-2 h-4 rounded-sm transition-colors ${i <= barCount ? activeBarClass : "bg-muted-foreground/20"}`}
                            />
                          ))}
                        </div>
                        <span className="text-xs font-semibold capitalize text-foreground w-[62px] text-left">{current}</span>
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <p>
                        {current === "maintain" && "Preserve muscle, no growth emphasis"}
                        {current === "grow" && "Balanced growth & recovery"}
                        {current === "emphasize" && "Maximum hypertrophy priority"}
                      </p>
                      <span className="tabular-nums font-mono shrink-0 ml-2">
                        {target.min}–{target.max} sets/wk
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {dayLabels.map((label, dayIdx) => {
          const dayExercises = (exercises || []).filter(e => e.dayIndex === dayIdx);

          return (
            <div key={dayIdx} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-bold">{label}</h2>
                <span className="micro-label">{dayExercises.length} exercises</span>
              </div>

              {dayExercises.length > 0 ? (
                <div className="rounded-2xl bg-card overflow-hidden divide-y divide-border/50">
                  {dayExercises.map(ex => {
                    const diff = getDifficultyForExercise(ex.exerciseName);
                    const range = getRepRange(diff);
                    return (
                      <div key={ex.id} className="p-3.5 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold">{ex.exerciseName}</p>
                          <p className="text-xs text-muted-foreground">
                            {ex.muscleGroup} · {range.min}–{range.max} reps
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground tabular-nums font-mono font-medium">
                          {ex.targetSets} × {ex.targetReps}
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground pl-1">No exercises added</p>
              )}
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
