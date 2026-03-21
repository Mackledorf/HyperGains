/**
 * Progressive overload algorithm — client-side.
 *
 * Core principles:
 * - Week-based RIR target ladder: W1-2→3, W3-4→2, W5-6→1, W7+→0
 * - Heavy compounds (chest/back/quads/hamstrings/glutes) train 1 RIR harder
 * - RIR is capped at 4 (stored as 4 = "4+ RIR" / junk volume)
 * - Each exercise has a difficulty tier with a fixed rep range:
 *     Hard  5–10   (target 8)  — barbell compounds
 *     Medium 8–15  (target 12) — DB/machine compounds
 *     Easy  12–20  (target 16) — isolations & accessories
 * - Priority order (highest wins):
 *     1. Above repRangeMax  → Epley recalibrate to repRangeMin, RIR = null (user fills)
 *     2. Below repRangeMin  → Epley recalibrate lighter to repRangeMin @ defaultRir
 *     3. Within range + rebound (prevRir < weekTarget) → weight up
 *     4. Within range + junk (prevRir ≥ 4) → Epley recalibrate to targetReps @ defaultRir
 *     5. Within range + productive (prevRir 0–3) → +1 rep
 * - Volume modulation layer adjusts set count suggestions based on
 *   weekly set totals vs. MEV/MRV landmarks (Dr. Mike Israetel)
 */
import type { OverloadSuggestion } from "@shared/schema";
import type { ExerciseDifficulty } from "./exerciseTiers";
import { getDifficultyForExercise, getRepRange } from "./exerciseTiers";
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
  muscleGroup: string,
  difficulty?: ExerciseDifficulty
): OverloadSuggestion[] {
  const weekTargetRir = getWeekTargetRir(weekNumber);
  const defaultRir = getMuscleGroupRir(weekTargetRir, muscleGroup);

  // Resolve tier — use passed difficulty or fall back to exercise name lookup
  const resolvedDifficulty: ExerciseDifficulty =
    difficulty ?? getDifficultyForExercise(previousLogs[0]?.exerciseName ?? "");
  const { min: repRangeMin, max: repRangeMax } = getRepRange(resolvedDifficulty);

  return previousLogs.map((log) => {
    let suggestedWeight = log.weight;
    let suggestedReps = log.reps;
    let suggestedRir: number | null = defaultRir;
    let reason = "";

    // Treat null RIR as 2 (reasonable working-weight assumption)
    const prevRir = log.rir ?? 2;

    // ── Priority 1: Above rep range max → recalibrate to bottom of range ──
    // Rep range exceeded: user is moving too light. Back-calculate weight
    // for repRangeMin reps. Leave RIR blank — user establishes new effort level.
    if (log.reps > repRangeMax) {
      const orm = estimateOneRepMax(log.weight, log.reps);
      suggestedWeight = weightForRepsAtRir(orm, repRangeMin, defaultRir);
      suggestedReps = repRangeMin;
      suggestedRir = null; // user fills RIR manually on the new weight
      reason = `Above range (${log.reps} > ${repRangeMax}) — recalibrated to ${suggestedWeight}lb × ${repRangeMin} reps`;

    // ── Priority 2: Below rep range min → recalibrate lighter ──
    // Weight is too heavy; user can't hit minimum reps. Epley down to repRangeMin.
    } else if (log.reps < repRangeMin) {
      const orm = estimateOneRepMax(log.weight, log.reps);
      suggestedWeight = weightForRepsAtRir(orm, repRangeMin, defaultRir);
      suggestedReps = repRangeMin;
      suggestedRir = defaultRir;
      reason = `Below range (${log.reps} < ${repRangeMin}) — lightened to ${suggestedWeight}lb × ${repRangeMin} reps @ ${defaultRir} RIR`;

    // ── Priority 3: Rebound — went harder than weekly target ──
    // Reward with a weight increase; pull reps back to compensate.
    } else if (prevRir < weekTargetRir) {
      const rirDiff = weekTargetRir - prevRir;
      suggestedWeight = roundUp2_5(log.weight * (1 + 0.025 * rirDiff));
      suggestedReps = Math.max(log.reps - rirDiff, repRangeMin);
      suggestedRir = weekTargetRir;
      reason = `Rebound: went to ${prevRir} RIR (target ${weekTargetRir}) — ↑ weight, ↓ reps`;

    // ── Priority 4: Junk volume (4+ RIR) — recalibrate to working weight ──
    // Weight is too light. Back-calculate to hit target reps at defaultRir.
    } else if (prevRir >= 4) {
      const orm = estimateOneRepMax(log.weight, log.reps);
      const recalibrated = weightForRepsAtRir(orm, targetReps, defaultRir);
      suggestedWeight = recalibrated;
      suggestedReps = targetReps;
      suggestedRir = defaultRir;
      reason = `Junk volume (${prevRir} RIR) — recalibrated to ~${recalibrated}lb × ${targetReps} reps @ ${defaultRir} RIR`;

    // ── Priority 5: Productive set (0–3 RIR, within range) → +1 rep ──
    // If already at repRangeMax, +1 rep would exceed the range — recalibrate
    // weight upward to repRangeMin instead (same logic as above-range).
    } else if (log.reps >= repRangeMax) {
      const orm = estimateOneRepMax(log.weight, log.reps);
      suggestedWeight = weightForRepsAtRir(orm, repRangeMin, defaultRir);
      suggestedReps = repRangeMin;
      suggestedRir = null;
      reason = `Hit rep ceiling (${log.reps}/${repRangeMax}) — ↑ weight to ${suggestedWeight}lb × ${repRangeMin} reps`;
    } else {
      suggestedWeight = log.weight;
      suggestedReps = log.reps + 1;
      suggestedRir = defaultRir;
      reason = `+1 rep (${log.reps} → ${suggestedReps}) — productive set at ${prevRir} RIR`;
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

