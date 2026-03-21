import { Check, TrendingUp, ArrowUp, SkipForward, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { RIR_JUNK_THRESHOLD } from "@/lib/overload";
import type { ProgramExercise, OverloadSuggestion } from "@shared/schema";

const RIR_OPTIONS = [
  { label: "0", value: "0" },
  { label: "1", value: "1" },
  { label: "2", value: "2" },
  { label: "3", value: "3" },
  { label: "4+", value: "4" },
];

export type SetEntry = {
  id?: string;
  setNumber: number;
  weight: string;
  reps: string;
  rir: string;
  completed: boolean;
  skipped: boolean;
  suggestion?: OverloadSuggestion;
};

interface Props {
  exercise: ProgramExercise;
  sets: SetEntry[];
  overloadExerciseData?: { suggestions: OverloadSuggestion[]; defaultRir: number };
  hasSuggestions: boolean;
  onCompleteSet: (setIdx: number) => void;
  onUpdateField: (setIdx: number, field: keyof SetEntry, value: string) => void;
  onSkipSet: (setIdx: number) => void;
  onAddSet: () => void;
  onRemoveSet: (setIdx: number) => void;
}

export default function ExerciseSetCard({
  exercise,
  sets,
  overloadExerciseData,
  hasSuggestions,
  onCompleteSet,
  onUpdateField,
  onSkipSet,
  onAddSet,
  onRemoveSet,
}: Props) {
  const doneSets = sets.filter(s => s.completed || s.skipped).length;

  return (
    <div className="rounded-2xl bg-card overflow-hidden" data-testid={`card-exercise-${exercise.id}`}>
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
              {overloadExerciseData && (
                <span className="text-primary/70"> · {overloadExerciseData.defaultRir} RIR target</span>
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
                    onChange={e => onUpdateField(idx, "weight", e.target.value)}
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
                  onChange={e => onUpdateField(idx, "reps", e.target.value)}
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
                    onChange={e => onUpdateField(idx, "rir", e.target.value)}
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
                    onClick={() => onCompleteSet(idx)}
                    className="w-7 h-7 rounded-lg bg-muted hover:bg-primary hover:text-primary-foreground flex items-center justify-center transition-colors"
                    data-testid={`button-complete-set-${exercise.id}-${idx}`}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onSkipSet(idx)}
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
          onClick={onAddSet}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors font-medium"
          data-testid={`button-add-set-${exercise.id}`}
        >
          <Plus className="w-3 h-3" />
          Add Set
        </button>
        {sets.length > 1 && !sets[sets.length - 1].completed && (
          <button
            onClick={() => onRemoveSet(sets.length - 1)}
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
}
