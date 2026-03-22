import type { PostSessionCheckIn, ExerciseFeedback } from "@shared/schema";

const RATING_SCORE: Record<string, number> = {
  poor: 1,
  okay: 2,
  good: 3,
  great: 4,
};

// "just-right" is the ideal outcome; "too-hard" is worse than "too-easy"
const DIFFICULTY_SCORE: Record<string, number> = {
  "too-hard": 1.5,
  "too-easy": 2.5,
  "just-right": 4,
};

export type FeelingColor = "red" | "yellow" | "green" | "blue";

export interface SessionFeeling {
  score: number;
  color: FeelingColor;
  label: string;
}

function scoreFromCheckIn(checkIn: PostSessionCheckIn): number {
  const motivation = RATING_SCORE[checkIn.motivation] ?? 2.5;
  // High fatigue = bad; "great" fatigue means very tired → bad; "poor" fatigue means fresh → good
  // Actually in the app context, "great" motivation/fatigue means the user felt great.
  // So fatigue "great" = feeling great (well-recovered) → 4.
  const fatigue = RATING_SCORE[checkIn.fatigue] ?? 2.5;
  const difficulty = DIFFICULTY_SCORE[checkIn.sessionDifficulty] ?? 2.5;
  return (motivation + fatigue + difficulty) / 3;
}

function scoreFromFeedbacks(feedbacks: ExerciseFeedback[]): number {
  if (feedbacks.length === 0) return 2.5;
  const total = feedbacks.reduce((sum, f) => {
    const avg =
      ((RATING_SCORE[f.workload] ?? 2.5) +
        (RATING_SCORE[f.mmc] ?? 2.5) +
        (RATING_SCORE[f.pump] ?? 2.5) +
        (RATING_SCORE[f.stamina] ?? 2.5)) /
      4;
    return sum + avg;
  }, 0);
  return total / feedbacks.length;
}

function scoreToFeeling(score: number): SessionFeeling {
  if (score < 1.75) return { score, color: "red", label: "Poor" };
  if (score < 2.5) return { score, color: "yellow", label: "Okay" };
  if (score < 3.25) return { score, color: "green", label: "Good" };
  return { score, color: "blue", label: "Great" };
}

export function deriveSessionFeeling(
  checkIn: PostSessionCheckIn | undefined,
  feedbacks: ExerciseFeedback[]
): SessionFeeling {
  // No feedback at all — session completed but no data, show neutral green
  if (!checkIn && feedbacks.length === 0) {
    return { score: 2.75, color: "green", label: "Completed" };
  }

  let score: number;
  if (checkIn && feedbacks.length > 0) {
    score = (scoreFromCheckIn(checkIn) + scoreFromFeedbacks(feedbacks)) / 2;
  } else if (checkIn) {
    score = scoreFromCheckIn(checkIn);
  } else {
    score = scoreFromFeedbacks(feedbacks);
  }

  return scoreToFeeling(score);
}

export const FEELING_COLORS: Record<FeelingColor, string> = {
  red: "#ef4444",
  yellow: "#eab308",
  green: "#22c55e",
  blue: "#3b82f6",
};
