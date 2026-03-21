import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import * as store from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { X, MessageSquare } from "lucide-react";
import type { ProgramExercise, ExerciseFeedback } from "@shared/schema";

type Rating = "poor" | "okay" | "good" | "great";

const RATING_COLORS: Record<Rating, string> = {
  poor: "bg-red-500/20 text-red-400 border-red-500/40",
  okay: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
  good: "bg-green-500/20 text-green-400 border-green-500/40",
  great: "bg-blue-500/20 text-blue-400 border-blue-500/40",
};

const RATING_LABELS: Rating[] = ["poor", "okay", "good", "great"];

interface MetricRowProps {
  label: string;
  value: Rating | "";
  onChange: (r: Rating) => void;
}

function MetricRow({ label, value, onChange }: MetricRowProps) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <div className="flex gap-2">
        {RATING_LABELS.map((r) => (
          <button
            key={r}
            onClick={() => onChange(r)}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold border capitalize transition-all ${
              value === r
                ? RATING_COLORS[r]
                : "bg-muted text-muted-foreground border-transparent hover:border-border"
            }`}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}

interface Props {
  sessionId: string;
  exercise: ProgramExercise;
  onClose: () => void;
}

export default function ExerciseFeedbackSheet({ sessionId, exercise, onClose }: Props) {
  const [workload, setWorkload] = useState<Rating | "">("");
  const [mmc, setMmc] = useState<Rating | "">("");
  const [pump, setPump] = useState<Rating | "">("");
  const [stamina, setStamina] = useState<Rating | "">("");

  const isComplete = workload && mmc && pump && stamina;

  const saveMutation = useMutation({
    mutationFn: () => {
      const feedback: Omit<ExerciseFeedback, "id"> = {
        sessionId,
        exerciseId: exercise.id,
        exerciseName: exercise.exerciseName,
        workload: workload as Rating,
        mmc: mmc as Rating,
        pump: pump as Rating,
        stamina: stamina as Rating,
        loggedAt: new Date().toISOString(),
      };
      store.createExerciseFeedback(feedback);
      return Promise.resolve();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feedback", sessionId] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-background rounded-t-3xl p-6 space-y-5 max-h-[85vh] overflow-y-auto pb-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            <div>
              <p className="micro-label">Exercise Feedback</p>
              <h2 className="text-sm font-bold mt-0.5">{exercise.exerciseName}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          Rate how this exercise felt. This feeds into next session's suggestions.
        </p>

        <div className="space-y-4">
          <MetricRow label="Overall Workload" value={workload} onChange={setWorkload} />
          <MetricRow label="Mind-Muscle Connection" value={mmc} onChange={setMmc} />
          <MetricRow label="Pump" value={pump} onChange={setPump} />
          <MetricRow label="Stamina" value={stamina} onChange={setStamina} />
        </div>

        <div className="flex gap-3 pt-1">
          <Button
            variant="ghost"
            className="flex-1 rounded-xl h-11 text-muted-foreground"
            onClick={onClose}
          >
            Skip
          </Button>
          <Button
            className="flex-1 rounded-xl h-11"
            disabled={!isComplete || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            Save Feedback
          </Button>
        </div>
      </div>
    </div>
  );
}
