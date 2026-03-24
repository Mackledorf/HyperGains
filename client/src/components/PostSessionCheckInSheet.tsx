import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import * as store from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { X, ClipboardCheck, AlertTriangle } from "lucide-react";
import type { ProgramExercise } from "@shared/schema";

type Rating = "poor" | "okay" | "good" | "great";
type Difficulty = "too-easy" | "just-right" | "too-hard";

const RATING_COLORS: Record<Rating, string> = {
  poor: "bg-brandRed/20 text-brandRed border-brandRed/40",
  okay: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
  good: "bg-green-500/20 text-green-400 border-green-500/40",
  great: "bg-blue-500/20 text-blue-400 border-blue-500/40",
};

const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  "too-easy": "bg-green-500/20 text-green-400 border-green-500/40",
  "just-right": "bg-blue-500/20 text-blue-400 border-blue-500/40",
  "too-hard": "bg-brandRed/20 text-brandRed border-brandRed/40",
};

const DIFFICULTY_LABELS: { key: Difficulty; label: string }[] = [
  { key: "too-easy", label: "Too Easy" },
  { key: "just-right", label: "Just Right" },
  { key: "too-hard", label: "Too Hard" },
];

const RATING_LABELS: Rating[] = ["poor", "okay", "good", "great"];

interface Props {
  sessionId: string;
  programId: string;
  exercises: ProgramExercise[];
  onClose: () => void;
}

export default function PostSessionCheckInSheet({
  sessionId,
  programId,
  exercises,
  onClose,
}: Props) {
  const [difficulty, setDifficulty] = useState<Difficulty | "">("");
  const [motivation, setMotivation] = useState<Rating | "">("");
  const [fatigue, setFatigue] = useState<Rating | "">("");
  const [jointFlags, setJointFlags] = useState<Record<string, boolean>>({});

  const isComplete = difficulty && motivation && fatigue;

  const toggleJoint = (exerciseId: string) => {
    setJointFlags((prev) => ({
      ...prev,
      [exerciseId]: !prev[exerciseId],
    }));
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      store.createCheckIn({
        sessionId,
        programId,
        sessionDifficulty: difficulty as Difficulty,
        motivation: motivation as Rating,
        fatigue: fatigue as Rating,
        jointFlags,
        loggedAt: new Date().toISOString(),
      });
      return Promise.resolve();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checkIns", programId] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-background rounded-t-3xl p-6 space-y-5 max-h-[90vh] overflow-y-auto pb-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-primary" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Post-Session Check-In
              </p>
              <h2 className="text-sm font-bold mt-0.5">How did it go?</h2>
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
          This adjusts next session's intensity to match your recovery.
        </p>

        <div className="space-y-4">
          {/* Session Difficulty */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Session Difficulty
            </p>
            <div className="flex gap-2">
              {DIFFICULTY_LABELS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setDifficulty(key)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                    difficulty === key
                      ? DIFFICULTY_COLORS[key]
                      : "bg-muted text-muted-foreground border-transparent hover:border-border"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Motivation */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Motivation / Mood
            </p>
            <div className="flex gap-2">
              {RATING_LABELS.map((r) => (
                <button
                  key={r}
                  onClick={() => setMotivation(r)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold border capitalize transition-all ${
                    motivation === r
                      ? RATING_COLORS[r]
                      : "bg-muted text-muted-foreground border-transparent hover:border-border"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Fatigue */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Overall Fatigue
            </p>
            <div className="flex gap-2">
              {RATING_LABELS.map((r) => (
                <button
                  key={r}
                  onClick={() => setFatigue(r)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold border capitalize transition-all ${
                    fatigue === r
                      ? RATING_COLORS[r]
                      : "bg-muted text-muted-foreground border-transparent hover:border-border"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Joint/Pain Flags */}
          {exercises.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Joint / Pain Flags
              </p>
              <p className="text-[11px] text-muted-foreground">
                Tap any exercise that caused joint discomfort.
              </p>
              <div className="flex flex-wrap gap-2 mt-1">
                {exercises.map((ex) => (
                  <button
                    key={ex.id}
                    onClick={() => toggleJoint(ex.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5 ${
                      jointFlags[ex.id]
                        ? "bg-orange-500/20 text-orange-400 border-orange-500/40"
                        : "bg-muted text-muted-foreground border-transparent hover:border-border"
                    }`}
                  >
                    {jointFlags[ex.id] && <AlertTriangle className="w-3 h-3" />}
                    {ex.exerciseName}
                  </button>
                ))}
              </div>
            </div>
          )}
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
            Save Check-In
          </Button>
        </div>
      </div>
    </div>
  );
}
