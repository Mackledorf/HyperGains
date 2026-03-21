/**
 * Progressive overload algorithm — client-side.
 *
 * Core principles:
 * - Week-based RIR target ladder: W1-2→3, W3-4→2, W5-6→1, W7+→0
 * - Heavy compounds (chest/back/quads/hamstrings/glutes) train 1 RIR harder
 * - RIR is capped at 4 (stored as 4 = "4+ RIR" / junk volume)
 * - No fixed rep range — single targetReps, algorithm tracks actual reps
 * - Weight increases only happen via rebound or 4+ RIR recalibration;
 *   otherwise the user drives weight selection intuitively
 * - Volume modulation layer adjusts set count suggestions based on
 *   weekly set totals vs. MEV/MRV landmarks (Dr. Mike Israetel)
 */
import type { OverloadSuggestion } from "@shared/schema";
import { getVolumeLandmarks, getTargetSetsForEmphasis } from "./volumeLandmarks";

export const RIR_JUNK_THRESHOLD = 4; // 4+ = junk volume, recalibrate weight

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

/**
 * Epley 1RM estimate: weight × (1 + reps / 30)
 * Used to back-calculate a target weight for a new rep count.
 */
function estimateOneRepMax(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

/**
 * Given a 1RM estimate, return the load needed to perform targetReps
 * while leaving targetRir reps in reserve.
 *
 * Effective reps to failure = targetReps + targetRir
 * Load = 1RM / (1 + effectiveReps / 30)
 */
function weightForRepsAtRir(
  oneRepMax: number,
  targetReps: number,
  targetRir: number
): number {
  const effectiveReps = targetReps + targetRir;
  const raw = oneRepMax / (1 + effectiveReps / 30);
  // Round up to nearest 2.5 lb
  return Math.ceil(raw / 2.5) * 2.5;
}

/** Round weight up to nearest 2.5 lb increment. */
function roundUp2_5(weight: number): number {
  return Math.ceil((weight + Number.EPSILON) / 2.5) * 2.5;
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
  targetReps: number,
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

    // Treat null RIR as 2 (reasonable working-weight assumption)
    const prevRir = log.rir ?? 2;

    // ── Case 1: Rebound — user went harder than the weekly target ──
    // Reward with a weight increase; reduce reps to compensate
    const wentHarderThanTarget = prevRir < weekTargetRir;

    if (wentHarderThanTarget) {
      const rirDiff = weekTargetRir - prevRir;
      suggestedWeight = roundUp2_5(log.weight * (1 + 0.025 * rirDiff));
      suggestedReps = Math.max(targetReps - rirDiff, 1);
      suggestedRir = weekTargetRir;
      reason = `Rebound: went to ${prevRir} RIR last time (target ${weekTargetRir}) — ↑ weight, ↓ reps, ↑ RIR`;

    // ── Case 2 (removed): was "hit top of range → +2.5%" — replaced by user-driven weight selection ──

    // ── Case 3a: Within productive RIR range (0–3) — add one rep ──
    } else if (prevRir <= 3) {
      suggestedWeight = log.weight;
      suggestedReps = log.reps + 1;
      suggestedRir = defaultRir;
      reason = `+1 rep (${log.reps} → ${suggestedReps}) — productive set at ${prevRir} RIR`;

    // ── Case 3b: Junk volume (4+ RIR) — recalibrate weight to hit target RIR ──
    // User's weight is too light. Back-calculate from estimated 1RM.
    } else {
      const orm = estimateOneRepMax(log.weight, log.reps);
      const recalibratedWeight = weightForRepsAtRir(orm, targetReps, defaultRir);
      suggestedWeight = recalibratedWeight;
      suggestedReps = targetReps;
      suggestedRir = defaultRir;
      reason = `Weight too light (${prevRir} RIR) — recalibrated to ~${recalibratedWeight}lb for ${targetReps} reps @ ${defaultRir} RIR`;
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

/**
 * Volume modulation — determines whether to suggest adding or removing sets
 * based on the user's actual weekly set count vs. their MEV/MRV targets.
 *
 * Returns:
 *  +N → suggest adding N sets to the exercise this week
 *   0 → volume is on target
 *  -N → suggest removing N sets (overreaching / recovery risk)
 */
export function computeSetAdjustment(
  muscleGroup: string,
  actualWeeklySets: number,
  emphasis: "maintain" | "grow" | "emphasize"
): { delta: number; reason: string } {
  const target = getTargetSetsForEmphasis(muscleGroup, emphasis);
  const lm = getVolumeLandmarks(muscleGroup);

  if (actualWeeklySets < lm.mv) {
    // Below maintenance — drop weight, increase RIR, add sets
    const delta = target.min - actualWeeklySets;
    return {
      delta,
      reason: `Below maintenance volume (${actualWeeklySets} sets vs. MV ${lm.mv}) — add ${delta} sets`,
    };
  }

  if (actualWeeklySets < target.min) {
    const delta = target.min - actualWeeklySets;
    return {
      delta,
      reason: `Below ${emphasis} target (${actualWeeklySets} sets, aim ≥${target.min}) — add ${delta} sets`,
    };
  }

  if (actualWeeklySets > lm.mrv) {
    const delta = lm.mrv - actualWeeklySets; // negative
    return {
      delta,
      reason: `Exceeding MRV (${actualWeeklySets} sets vs. MRV ${lm.mrv}) — remove ${Math.abs(delta)} sets`,
    };
  }

  return { delta: 0, reason: "Volume on target" };
}

