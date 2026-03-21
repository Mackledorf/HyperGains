import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import * as store from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CalendarCheck, ChevronRight, X } from "lucide-react";
import type { Program, WeeklyReview } from "@shared/schema";

type Metric = "workload" | "mmc" | "pump" | "stamina";
type Rating = "poor" | "okay" | "good" | "great";

const METRICS: { key: Metric; label: string }[] = [
  { key: "workload", label: "Overall Workload" },
  { key: "mmc", label: "Mind-Muscle Connection" },
  { key: "pump", label: "Pump" },
  { key: "stamina", label: "Stamina" },
];

const RATINGS: Rating[] = ["poor", "okay", "good", "great"];

const RATING_COLORS: Record<Rating, string> = {
  poor: "bg-red-500/20 text-red-400 border-red-500/40",
  okay: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
  good: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  great: "bg-green-500/20 text-green-400 border-green-500/40",
};

function RatingButton({
  rating,
  selected,
  onSelect,
}: {
  rating: Rating;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all capitalize ${
        selected
          ? RATING_COLORS[rating]
          : "bg-muted text-muted-foreground border-transparent hover:border-border"
      }`}
    >
      {rating}
    </button>
  );
}

interface Props {
  program: Program;
  weekNumber: number;
  onClose: () => void;
}

export default function WeeklyReviewModal({ program, weekNumber, onClose }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState<"day-ratings" | "performance" | "emphasis">("day-ratings");

  // Day ratings
  const [dayRatings, setDayRatings] = useState<Record<number, Rating>>({});

  // Performance review
  const [weakAreas, setWeakAreas] = useState<Set<Metric>>(new Set());
  const [strongAreas, setStrongAreas] = useState<Set<Metric>>(new Set());
  const [emphasizeNext, setEmphasizeNext] = useState<Metric | null>(null);

  const submitMutation = useMutation({
    mutationFn: () => {
      // Get the Monday of the current calendar week
      const now = new Date();
      const day = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((day + 6) % 7));
      monday.setHours(0, 0, 0, 0);

      const review: Omit<WeeklyReview, "id"> = {
        programId: program.id,
        weekNumber,
        calendarWeekStart: monday.toISOString(),
        dayRatings,
        strongAreas: Array.from(strongAreas),
        weakAreas: Array.from(weakAreas),
        emphasizeNext,
        completedAt: new Date().toISOString(),
      };
      store.createWeeklyReview(review);
      return Promise.resolve();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["weeklyReviews"] });
      toast({ title: `Week ${weekNumber} review saved` });
      onClose();
    },
  });

  const toggleMetric = (
    metric: Metric,
    set: Set<Metric>,
    setter: (s: Set<Metric>) => void
  ) => {
    const next = new Set(set);
    if (next.has(metric)) next.delete(metric);
    else next.add(metric);
    setter(next);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-background rounded-t-3xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="micro-label">Weekly Review</p>
            <h2 className="text-base font-bold mt-0.5">Week {weekNumber} Wrap-Up</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Step 1: Rate each training day ── */}
        {step === "day-ratings" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              How did each training day feel this week?
            </p>
            <div className="space-y-3">
              {(program.dayLabels as string[]).map((label, idx) => (
                <div key={idx} className="rounded-xl bg-card p-3">
                  <p className="text-sm font-semibold mb-2">{label}</p>
                  <div className="flex gap-2 flex-wrap">
                    {RATINGS.map((r) => (
                      <RatingButton
                        key={r}
                        rating={r}
                        selected={dayRatings[idx] === r}
                        onSelect={() => setDayRatings({ ...dayRatings, [idx]: r })}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <Button
              className="w-full rounded-xl h-11"
              onClick={() => setStep("performance")}
              disabled={Object.keys(dayRatings).length < program.dayLabels.length}
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}

        {/* ── Step 2: Performance areas ── */}
        {step === "performance" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Reflect on your performance across all metrics.
            </p>

            <div className="space-y-3">
              <div className="rounded-xl bg-card p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Performed well on
                </p>
                <div className="flex gap-2 flex-wrap">
                  {METRICS.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => toggleMetric(key, strongAreas, setStrongAreas)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        strongAreas.has(key)
                          ? "bg-green-500/20 text-green-400 border-green-500/40"
                          : "bg-muted text-muted-foreground border-transparent hover:border-border"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl bg-card p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Performed poorly on
                </p>
                <div className="flex gap-2 flex-wrap">
                  {METRICS.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => toggleMetric(key, weakAreas, setWeakAreas)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        weakAreas.has(key)
                          ? "bg-red-500/20 text-red-400 border-red-500/40"
                          : "bg-muted text-muted-foreground border-transparent hover:border-border"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Button
              className="w-full rounded-xl h-11"
              onClick={() => setStep("emphasis")}
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}

        {/* ── Step 3: Emphasis for next week ── */}
        {step === "emphasis" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              What do you want to emphasize most in Week {weekNumber + 1}?
            </p>
            <div className="grid grid-cols-2 gap-2">
              {METRICS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setEmphasizeNext(key)}
                  className={`rounded-xl p-3 text-left border transition-all ${
                    emphasizeNext === key
                      ? "bg-primary/20 text-primary border-primary/40"
                      : "bg-card text-foreground border-transparent hover:border-border"
                  }`}
                >
                  <p className="text-sm font-semibold">{label}</p>
                </button>
              ))}
              <button
                onClick={() => setEmphasizeNext(null)}
                className={`rounded-xl p-3 text-left border transition-all col-span-2 ${
                  emphasizeNext === null
                    ? "bg-primary/20 text-primary border-primary/40"
                    : "bg-card text-muted-foreground border-transparent hover:border-border"
                }`}
              >
                <p className="text-sm font-semibold">No specific emphasis</p>
              </button>
            </div>

            <Button
              className="w-full rounded-xl h-11"
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
            >
              <CalendarCheck className="w-4 h-4 mr-2" />
              Save Review & Start Week {weekNumber + 1}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
