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
    const hasJointFlag = !!checkIn.jointFlags[s.exerciseId];
    if (!globalNegative && !hasJointFlag) return s;

    let reps = s.suggestedReps;
    let rir = s.suggestedRir;
    const reasonParts: string[] = [s.reason];

    // ── Global negative feedback → +1 rep (fatigue is a global reductive force) ──
    if (globalNegative) {
      reps = Math.min(reps + 1, repRangeMax);
      reasonParts.push(`🔻 Recovery feedback → +1 rep, RIR ${NEGATIVE_RIR_OVERRIDE}`);
    }

    // ── Determine final RIR: joint pain overrides fatigue (more conservative) ──
    if (hasJointFlag) {
      rir = JOINT_PAIN_RIR;
      reasonParts.push(`⚠️ Joint flag → RIR ${JOINT_PAIN_RIR}`);
    } else if (globalNegative) {
      rir = NEGATIVE_RIR_OVERRIDE;
    }

    return {
      ...s,
      suggestedReps: reps,
      suggestedRir: rir,
      reason: reasonParts.join(" | "),
      feedbackModified: true,
    };
  });
}
