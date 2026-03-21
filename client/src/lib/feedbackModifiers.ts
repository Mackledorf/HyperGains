/**
 * Feedback-driven overload modifiers.
 *
 * Sits between computeOverloadSuggestions() and the UI.  Reads the most
 * recent PostSessionCheckIn and adjusts suggestions when the user reported
 * negative feedback.
 *
 * Rules:
 *  - fatigue == "poor" OR motivation == "poor"  →
 *      Hard-override RIR to 2 (ignores weekTargetRir), +1 rep
 *  - Joint pain flag on a specific exercise     →
 *      Push that exercise's RIR to 3
 *  - The flag clears automatically when the user completes another session
 *    and submits a check-in that is no longer negative.
 */
import type {
  OverloadSuggestion,
  PostSessionCheckIn,
} from "@shared/schema";

const NEGATIVE_RIR_OVERRIDE = 2;
const JOINT_PAIN_RIR = 3;

/**
 * Determines whether the check-in triggers a negative feedback adjustment.
 */
export function isNegativeCheckIn(checkIn: PostSessionCheckIn): boolean {
  return checkIn.fatigue === "poor" || checkIn.motivation === "poor";
}

/**
 * Applies feedback modifiers to an array of overload suggestions.
 *
 * @param suggestions — output from computeOverloadSuggestions()
 * @param checkIn     — most recent PostSessionCheckIn (or undefined)
 * @param repRangeMax — upper rep-range bound for the exercise tier
 *                      (prevents +1 rep from exceeding the range)
 * @returns modified suggestions (original array is not mutated)
 */
export function applyFeedbackModifiers(
  suggestions: OverloadSuggestion[],
  checkIn: PostSessionCheckIn | undefined,
  repRangeMax: number
): OverloadSuggestion[] {
  if (!checkIn) return suggestions;

  const globalNegative = isNegativeCheckIn(checkIn);

  return suggestions.map((s) => {
    let modified = false;
    let weight = s.suggestedWeight;
    let reps = s.suggestedReps;
    let rir = s.suggestedRir;
    let reason = s.reason;

    // ── Joint pain flag on this exercise → RIR 3 ──
    if (checkIn.jointFlags[s.exerciseId]) {
      rir = Math.max(rir ?? 0, JOINT_PAIN_RIR);
      reason += ` | ⚠️ Joint flag → RIR ${JOINT_PAIN_RIR}`;
      modified = true;
    }

    // ── Global negative feedback → hard-override RIR to 2, +1 rep ──
    if (globalNegative) {
      // Hard override: always set to 2, even if week ladder is lower
      rir = NEGATIVE_RIR_OVERRIDE;
      // +1 rep capped at repRangeMax
      reps = Math.min(reps + 1, repRangeMax);
      reason += ` | 🔻 Recovery feedback → RIR ${NEGATIVE_RIR_OVERRIDE}, +1 rep`;
      modified = true;
    }

    // Joint pain takes precedence over global negative for RIR
    if (checkIn.jointFlags[s.exerciseId] && globalNegative) {
      rir = JOINT_PAIN_RIR;
    }

    if (!modified) return s;

    return {
      ...s,
      suggestedWeight: weight,
      suggestedReps: reps,
      suggestedRir: rir,
      reason,
      feedbackModified: true,
    };
  });
}
