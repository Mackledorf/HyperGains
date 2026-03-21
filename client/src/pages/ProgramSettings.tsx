import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import * as store from "@/lib/storage";
import { useParams, useLocation } from "wouter";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft } from "lucide-react";
import { getTargetSetsForEmphasis } from "@/lib/volumeLandmarks";
import type { Program, ProgramExercise, MuscleGroupEmphasis } from "@shared/schema";

const MUSCLE_COLORS: Record<string, string> = {
  Chest: "bg-red-500/15 text-red-400",
  Back: "bg-blue-500/15 text-blue-400",
  Shoulders: "bg-orange-500/15 text-orange-400",
  Biceps: "bg-purple-500/15 text-purple-400",
  Triceps: "bg-pink-500/15 text-pink-400",
  Quads: "bg-emerald-500/15 text-emerald-400",
  Hamstrings: "bg-teal-500/15 text-teal-400",
  Glutes: "bg-amber-500/15 text-amber-400",
  Calves: "bg-lime-500/15 text-lime-400",
  Abs: "bg-cyan-500/15 text-cyan-400",
  Traps: "bg-indigo-500/15 text-indigo-400",
  Forearms: "bg-violet-500/15 text-violet-400",
};

export default function ProgramSettings() {
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

  return (
    <AppShell>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="w-8 h-8 rounded-xl flex items-center justify-center bg-card transition-colors active:bg-muted"
            data-testid="button-back"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-lg font-bold">{program.name}</h1>
            <p className="micro-label">Program Settings</p>
          </div>
        </div>

        {/* Muscle Group Emphasis */}
        <div className="space-y-2">
          <p className="micro-label px-1">Muscle Group Emphasis</p>
          <p className="text-xs text-muted-foreground px-1">
            Controls your weekly set targets based on Dr. Mike Israetel's volume
            landmarks (MEV / MAV / MRV).
          </p>

          {muscleGroups.length === 0 ? (
            <div className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground">
              No exercises in this program yet.
            </div>
          ) : (
            <div className="rounded-2xl bg-card overflow-hidden divide-y divide-border/50">
              {muscleGroups.map((mg) => {
                const current =
                  (emphasisMap[mg.toLowerCase()] as MuscleGroupEmphasis["emphasis"]) ??
                  "grow";
                const target = getTargetSetsForEmphasis(mg, current);

                return (
                  <div key={mg} className="p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${
                          MUSCLE_COLORS[mg] || "bg-muted text-muted-foreground"
                        }`}
                      >
                        {mg}
                      </span>
                      <span className="text-[10px] text-muted-foreground tabular-nums font-mono">
                        {target.min}–{target.max} sets/week
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      {(["maintain", "grow", "emphasize"] as const).map((level) => (
                        <button
                          key={level}
                          onClick={() =>
                            updateEmphasisMutation.mutate({
                              muscleGroup: mg,
                              emphasis: level,
                            })
                          }
                          className={`rounded-xl py-2 text-xs font-semibold capitalize transition-all border ${
                            current === level
                              ? level === "maintain"
                                ? "bg-muted text-foreground border-border"
                                : level === "grow"
                                ? "bg-blue-500/20 text-blue-400 border-blue-500/40"
                                : "bg-primary/20 text-primary border-primary/40"
                              : "bg-muted/50 text-muted-foreground border-transparent hover:border-border"
                          }`}
                          data-testid={`button-emphasis-${mg.toLowerCase()}-${level}`}
                        >
                          {level}
                        </button>
                      ))}
                    </div>

                    <p className="text-[10px] text-muted-foreground">
                      {current === "maintain" &&
                        "Minimum volume — preserve muscle, no growth emphasis"}
                      {current === "grow" &&
                        "MEV → MAV — consistent growth with balanced recovery"}
                      {current === "emphasize" &&
                        "Full MAV — maximum hypertrophy priority this block"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          className="w-full text-muted-foreground hover:text-foreground text-sm"
          onClick={() => navigate(`/program/${id}`)}
          data-testid="button-view-program"
        >
          View Program Details
        </Button>
      </div>
    </AppShell>
  );
}
