/**
 * Progressive overload algorithm — client-side.
 * Moved verbatim from server/routes.ts.
 *
 * Week-based default RIR: W1-2→3, W3-4→2, W5-6→1, W7+→0
 * Heavy compounds start 1 RIR lower.
 * Rebound logic when user goes harder than target.
 */
import type { OverloadSuggestion } from "@shared/schema";

const HEAVY_COMPOUND_GROUPS = new Set([
  "chest", "back", "quads", "hamstrings", "glutes",
]);

/** Week target RIR: W1-2→3, W3-4→2, W5-6→1, W7+→0 */
export function getWeekTargetRir(weekNumber: number): number {
  if (weekNumber <= 2) return 3;
  if (weekNumber <= 4) return 2;
  if (weekNumber <= 6) return 1;
  return 0;
}

/** Adjust default RIR for muscle-group heuristics. Heavy compounds = −1. */
export function getMuscleGroupRir(
  weekTargetRir: number,
  muscleGroup: string
): number {
  const normalized = muscleGroup.toLowerCase();
  if (HEAVY_COMPOUND_GROUPS.has(normalized) && weekTargetRir > 0) {
    return weekTargetRir - 1;
  }
  return weekTargetRir;
}

/** Default RIR for an exercise based on week + muscle group. */
export function getDefaultRirForExercise(
  weekNumber: number,
  muscleGroup: string
): number {
  return getMuscleGroupRir(getWeekTargetRir(weekNumber), muscleGroup);
}

export function computeOverloadSuggestions(
  previousLogs: {
    exerciseId: string;
    exerciseName: string;
    setNumber: number;
    weight: number;
    reps: number;
    rir: number | null;
  }[],
  targetRepsMin: number,
  targetRepsMax: number,
  weekNumber: number,
  muscleGroup: string
): OverloadSuggestion[] {
  const weekTargetRir = getWeekTargetRir(weekNumber);
  const defaultRir = getMuscleGroupRir(weekTargetRir, muscleGroup);

  return previousLogs.map((log) => {
    let suggestedWeight = log.weight;
    let suggestedReps = log.reps;
    let suggestedRir = defaultRir;
    let reason = "";

    const prevRir = log.rir ?? 2;

    // ── Rebound logic ──
    const wentHarderThanTarget = prevRir < weekTargetRir;

    if (wentHarderThanTarget) {
      const rirDiff = weekTargetRir - prevRir;
      suggestedWeight =
        Math.round((log.weight * (1 + 0.025 * rirDiff) + Number.EPSILON) * 100) / 100;
      suggestedWeight = Math.ceil(suggestedWeight / 2.5) * 2.5;
      suggestedReps = Math.max(targetRepsMin, log.reps - rirDiff);
      suggestedRir = weekTargetRir;
      reason = `Rebound: went to ${prevRir} RIR last time (target ${weekTargetRir}) — ↑ weight, ↓ reps, ↑ RIR`;
    } else if (log.reps >= targetRepsMax && prevRir <= 2) {
      suggestedWeight =
        Math.round((log.weight * 1.025 + Number.EPSILON) * 100) / 100;
      suggestedWeight = Math.ceil(suggestedWeight / 2.5) * 2.5;
      suggestedReps = targetRepsMin;
      suggestedRir = defaultRir;
      reason = `Hit ${log.reps} reps @ ${log.weight}lb with ${prevRir} RIR — ↑ weight`;
    } else if (log.reps >= targetRepsMin && log.reps < targetRepsMax) {
      suggestedWeight = log.weight;
      suggestedReps = log.reps + 1;
      suggestedRir = defaultRir;
      reason = `Within range — +1 rep (${log.reps} → ${suggestedReps})`;
    } else if (log.reps < targetRepsMin) {
      suggestedWeight = log.weight;
      suggestedReps = targetRepsMin;
      suggestedRir = defaultRir;
      reason = `Below rep range — aim for ${targetRepsMin} reps at same weight`;
    } else {
      suggestedWeight = log.weight;
      suggestedReps = Math.min(log.reps + 1, targetRepsMax);
      suggestedRir = Math.max(defaultRir - 1, 0);
      reason = `RIR high (${prevRir}) at top of range — push harder before ↑ weight`;
    }

    return {
      exerciseId: log.exerciseId,
      exerciseName: log.exerciseName,
      setNumber: log.setNumber,
      suggestedWeight,
      suggestedReps,
      suggestedRir,
      previousWeight: log.weight,
      previousReps: log.reps,
      previousRir: log.rir,
      reason,
    };
  });
}
