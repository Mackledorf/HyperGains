import { useQuery } from "@tanstack/react-query";
import * as store from "@/lib/storage";
import { useParams, useLocation } from "wouter";
import AppShell from "@/components/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft } from "lucide-react";
import type { Program, ProgramExercise } from "@shared/schema";
import { getDifficultyForExercise, getRepRange } from "@/lib/exerciseTiers";

export default function ProgramDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  const { data: program, isLoading } = useQuery<Program | undefined>({
    queryKey: ["programs", id],
    queryFn: () => store.getProgram(id!),
  });

  const { data: exercises } = useQuery<ProgramExercise[]>({
    queryKey: ["exercises", id],
    enabled: !!id,
    queryFn: () => store.getProgramExercises(id!),
  });

  if (isLoading) {
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
