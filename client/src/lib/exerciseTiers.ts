/**
 * Exercise difficulty tiers — define rep ranges and map every exercise to a tier.
 *
 * Hard  (5–10 reps,  target 8):  barbell compounds, high-force multi-joint
 * Medium (8–15 reps, target 12): DB/machine compounds, cable compounds
 * Easy  (12–20 reps, target 16): isolation, cable accessories, small muscles
 */

export type ExerciseDifficulty = "easy" | "medium" | "hard";

export interface RepRange {
  min: number;
  max: number;
  target: number;
}

export const REP_RANGES: Record<ExerciseDifficulty, RepRange> = {
  easy:   { min: 12, max: 20, target: 16 },
  medium: { min: 8,  max: 15, target: 12 },
  hard:   { min: 5,  max: 10, target: 8  },
};

// Maps exercise name → tier. Frozen to prevent accidental mutation.
const EXERCISE_TIERS: Readonly<Record<string, ExerciseDifficulty>> = Object.freeze({
  // ── Chest ──────────────────────────────────────────────────────────────
  "Bench Press":                "hard",
  "Incline Bench Press":        "hard",
  "Decline Bench Press":        "hard",
  "Close-Grip Bench Press":     "hard",
  "Smith Machine Bench Press":  "hard",
  "Dips":                       "hard",
  "DB Bench Press":             "medium",
  "Incline DB Press":           "medium",
  "Decline DB Press":           "medium",
  "DB Fly":                     "medium",
  "Incline DB Fly":             "medium",
  "Machine Chest Press":        "medium",
  "Machine Incline Press":      "medium",
  "Cable Fly":                  "easy",
  "Cable Chest Press":          "easy",
  "Low-to-High Cable Fly":      "easy",
  "High-to-Low Cable Fly":      "easy",
  "Pec Deck":                   "easy",
  "Push-ups":                   "easy",

  // ── Back ───────────────────────────────────────────────────────────────
  "Barbell Row":                "hard",
  "Pendlay Row":                "hard",
  "Deadlift":                   "hard",
  "Pull-ups":                   "hard",
  "Chin-ups":                   "hard",
  "T-Bar Row":                  "hard",
  "DB Row":                     "medium",
  "Chest-Supported DB Row":     "medium",
  "Cable Row":                  "medium",
  "Lat Pulldown":               "medium",
  "Close-Grip Lat Pulldown":    "medium",
  "Machine Row":                "medium",
  "Machine High Row":           "medium",
  "Machine Low Row":            "medium",
  "Single Arm Cable Row":       "easy",
  "Straight Arm Pulldown":      "easy",
  "Face Pull":                  "easy",
  "DB Pullover":                "easy",

  // ── Shoulders ──────────────────────────────────────────────────────────
  "OHP":                        "hard",
  "Smith Machine OHP":          "hard",
  "DB Shoulder Press":          "medium",
  "DB Arnold Press":            "medium",
  "Cable Overhead Press":       "medium",
  "Machine Shoulder Press":     "medium",
  "Upright Row":                "medium",
  "Cable Upright Row":          "medium",
  "Barbell Front Raise":        "easy",
  "DB Lateral Raise":           "easy",
  "DB Front Raise":             "easy",
  "DB Rear Delt Fly":           "easy",
  "Cable Lateral Raise":        "easy",
  "Cable Rear Delt Fly":        "easy",
  "Cable Front Raise":          "easy",
  "Machine Lateral Raise":      "easy",
  "Machine Reverse Fly":        "easy",

  // ── Biceps ─────────────────────────────────────────────────────────────
  "Barbell Curl":               "medium",
  "EZ Bar Curl":                "medium",
  "DB Curl":                    "medium",
  "Hammer Curl":                "medium",
  "Incline DB Curl":            "easy",
  "Concentration Curl":         "easy",
  "DB Preacher Curl":           "easy",
  "DB Spider Curl":             "easy",
  "Cable Curl":                 "easy",
  "Cable Hammer Curl":          "easy",
  "Single Arm Cable Curl":      "easy",
  "Rope Cable Curl":            "easy",
  "Straight Bar Cable Curl":    "easy",
  "Machine Preacher Curl":      "easy",
  "Machine Curl":               "easy",

  // ── Triceps ────────────────────────────────────────────────────────────
  "Skull Crushers":             "hard",
  "EZ Bar Skull Crushers":      "hard",
  "DB Overhead Extension":      "medium",
  "DB Skull Crushers":          "medium",
  "Machine Tricep Extension":   "medium",
  "Machine Dip":                "medium",
  "Rope Pushdown":              "easy",
  "Straight Bar Pushdown":      "easy",
  "V-Bar Pushdown":             "easy",
  "Single Arm Cable Pushdown":  "easy",
  "Rope Overhead Extension":    "easy",
  "Bent Over Rope Extension":   "easy",
  "DB Kickback":                "easy",
  "Diamond Push-ups":           "easy",

  // ── Quads ───────────────────────────────────────────────────────────────
  "Squat":                      "hard",
  "Front Squat":                "hard",
  "Bulgarian Split Squat":      "hard",
  "Walking Lunges":             "hard",
  "Smith Machine Squat":        "hard",
  "Leg Press":                  "medium",
  "Hack Squat":                 "medium",
  "Pendulum Squat":             "medium",
  "DB Bulgarian Split Squat":   "medium",
  "DB Lunges":                  "medium",
  "DB Goblet Squat":            "medium",
  "DB Step-Up":                 "medium",
  "Sissy Squat Machine":        "medium",
  "Leg Extension":              "easy",

  // ── Hamstrings ─────────────────────────────────────────────────────────
  "RDL":                        "hard",
  "Stiff-Leg Deadlift":         "hard",
  "Good Morning":               "hard",
  "Nordic Curl":                "hard",
  "Glute Ham Raise":            "hard",
  "DB RDL":                     "medium",
  "DB Stiff-Leg DL":            "medium",
  "Single Leg DB RDL":          "medium",
  "Cable Pull-Through":         "medium",
  "Machine RDL":                "medium",
  "Lying Leg Curl":             "easy",
  "Seated Leg Curl":            "easy",
  "Standing Leg Curl":          "easy",

  // ── Glutes ─────────────────────────────────────────────────────────────
  "Hip Thrust":                 "hard",
  "Sumo Deadlift":              "hard",
  "Barbell Glute Bridge":       "hard",
  "Smith Machine Hip Thrust":   "hard",
  "DB Hip Thrust":              "medium",
  "DB Sumo Squat":              "medium",
  "Machine Hip Thrust":         "medium",
  "Glute Bridge":               "medium",
  "Cable Kickback":             "easy",
  "Cable Hip Abduction":        "easy",
  "Machine Glute Kickback":     "easy",
  "Machine Hip Abduction":      "easy",
  "Frog Pump":                  "easy",

  // ── Calves ─────────────────────────────────────────────────────────────
  "Machine Calf Raise":         "easy",
  "Seated Calf Raise":          "easy",
  "Leg Press Calf Raise":       "easy",
  "Smith Machine Calf Raise":   "easy",
  "Machine Standing Calf Raise":"easy",
  "DB Calf Raise":              "easy",
  "Standing Calf Raise":        "easy",
  "Single Leg Calf Raise":      "easy",

  // ── Abs ────────────────────────────────────────────────────────────────
  "Cable Crunch":               "easy",
  "Cable Woodchop":             "easy",
  "Cable Pallof Press":         "easy",
  "Machine Ab Crunch":          "easy",
  "Weighted Decline Sit-Up":    "easy",
  "DB Side Bend":               "easy",
  "Hanging Leg Raise":          "easy",
  "Hanging Knee Raise":         "easy",
  "Ab Wheel":                   "easy",
  "Plank":                      "easy",
  "Decline Sit-Up":             "easy",
  "Bicycle Crunch":             "easy",
  "Leg Raise":                  "easy",

  // ── Traps ──────────────────────────────────────────────────────────────
  "Barbell Shrugs":             "medium",
  "DB Shrugs":                  "easy",
  "Cable Shrugs":               "easy",
  "Machine Shrugs":             "easy",
  "Smith Machine Shrugs":       "easy",
  "Farmer Walk":                "easy",

  // ── Forearms ───────────────────────────────────────────────────────────
  "Barbell Wrist Curl":         "easy",
  "Barbell Reverse Curl":       "easy",
  "DB Wrist Curl":              "easy",
  "DB Reverse Curl":            "easy",
  "Cable Wrist Curl":           "easy",
  "Dead Hang":                  "easy",
  "Gripper":                    "easy",
});

// Case-insensitive lookup map — built once at module initialisation.
const EXERCISE_TIERS_CI: Map<string, ExerciseDifficulty> = new Map(
  Object.entries(EXERCISE_TIERS).map(([k, v]) => [k.toLowerCase().trim(), v])
);

/** Returns the difficulty tier for a known exercise, defaulting to "medium".
 *  Lookup is case-insensitive so user-typed exercise names always resolve correctly.
 */
export function getDifficultyForExercise(name: string): ExerciseDifficulty {
  return EXERCISE_TIERS_CI.get(name.toLowerCase().trim()) ?? "medium";
}

/** Returns the rep range for a given difficulty tier. */
export function getRepRange(difficulty: ExerciseDifficulty): RepRange {
  return REP_RANGES[difficulty];
}

/**
 * Returns the effective target reps for an exercise based on muscle emphasis.
 * maintain → lower end (min); grow → middle (target); emphasize → upper end (max).
 */
export function getEffectiveTargetReps(
  repRange: RepRange,
  emphasis: "maintain" | "grow" | "emphasize"
): number {
  switch (emphasis) {
    case "maintain":  return repRange.min;
    case "emphasize": return repRange.max;
    default:          return repRange.target;
  }
}

/** Maps difficulty → signal-bar level (1/2/3) for display. */
export function difficultyToLevel(difficulty: ExerciseDifficulty): 1 | 2 | 3 {
  return difficulty === "easy" ? 1 : difficulty === "medium" ? 2 : 3;
}

/** Maps signal-bar level → difficulty. */
export function levelToDifficulty(level: 1 | 2 | 3): ExerciseDifficulty {
  return level === 1 ? "easy" : level === 2 ? "medium" : "hard";
}
