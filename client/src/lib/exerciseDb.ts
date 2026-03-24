/**
 * Shared exercise database — muscle groups and their exercise lists.
 * Used by CreateProgram (program builder) and ActiveWorkout (ad-hoc "Add Exercise" sheet).
 * Extracted here to avoid circular imports between those two pages.
 */

export const MUSCLE_GROUPS = [
  "Chest", "Back", "Shoulders", "Biceps", "Triceps", "Quads",
  "Hamstrings", "Glutes", "Calves", "Abs", "Traps", "Forearms",
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const EXERCISE_DB: Record<string, string[]> = {
  Chest: [
    "Bench Press", "Incline Bench Press", "Decline Bench Press", "Close-Grip Bench Press",
    "DB Bench Press", "Incline DB Press", "Decline DB Press", "DB Fly", "Incline DB Fly",
    "Cable Fly", "Cable Chest Press", "Low-to-High Cable Fly", "High-to-Low Cable Fly",
    "Machine Chest Press", "Machine Incline Press", "Pec Deck", "Smith Machine Bench Press",
    "Dips", "Push-ups",
  ],
  Back: [
    "Barbell Row", "Pendlay Row", "Deadlift",
    "DB Row", "Chest-Supported DB Row", "DB Pullover",
    "Cable Row", "Straight Arm Pulldown", "Single Arm Cable Row", "Face Pull",
    "Lat Pulldown", "Close-Grip Lat Pulldown", "Machine Row", "Machine High Row",
    "Machine Low Row", "T-Bar Row",
    "Pull-ups", "Chin-ups",
  ],
  Shoulders: [
    "OHP", "Barbell Front Raise",
    "DB Shoulder Press", "DB Lateral Raise", "DB Front Raise", "DB Rear Delt Fly",
    "DB Arnold Press",
    "Cable Lateral Raise", "Cable Rear Delt Fly", "Cable Front Raise",
    "Cable Overhead Press", "Cable Upright Row",
    "Machine Shoulder Press", "Machine Lateral Raise", "Machine Reverse Fly",
    "Smith Machine OHP",
    "Upright Row", "Face Pull",
  ],
  Biceps: [
    "Barbell Curl", "EZ Bar Curl",
    "DB Curl", "Hammer Curl", "Incline DB Curl", "Concentration Curl",
    "DB Preacher Curl", "DB Spider Curl",
    "Cable Curl", "Cable Hammer Curl", "Single Arm Cable Curl",
    "Rope Cable Curl", "Straight Bar Cable Curl",
    "Machine Preacher Curl", "Machine Curl",
  ],
  Triceps: [
    "Rope Pushdown", "Straight Bar Pushdown", "V-Bar Pushdown",
    "Single Arm Cable Pushdown", "Rope Overhead Extension",
    "Bent Over Rope Extension",
    "Close-Grip Bench Press", "Skull Crushers", "EZ Bar Skull Crushers",
    "DB Overhead Extension", "DB Kickback", "DB Skull Crushers",
    "Machine Tricep Extension", "Machine Dip",
    "Dips", "Diamond Push-ups",
  ],
  Quads: [
    "Squat", "Front Squat",
    "DB Bulgarian Split Squat", "DB Lunges", "DB Goblet Squat", "DB Step-Up",
    "Leg Press", "Leg Extension", "Hack Squat", "Pendulum Squat",
    "Smith Machine Squat", "Sissy Squat Machine",
    "Bulgarian Split Squat", "Walking Lunges",
  ],
  Hamstrings: [
    "RDL", "Stiff-Leg Deadlift", "Good Morning",
    "DB RDL", "DB Stiff-Leg DL", "Single Leg DB RDL",
    "Cable Pull-Through",
    "Lying Leg Curl", "Seated Leg Curl", "Standing Leg Curl",
    "Machine RDL",
    "Nordic Curl", "Glute Ham Raise",
  ],
  Glutes: [
    "Hip Thrust", "Sumo Deadlift", "Barbell Glute Bridge",
    "DB Hip Thrust", "DB Step-Up", "DB Sumo Squat",
    "Cable Kickback", "Cable Pull-Through", "Cable Hip Abduction",
    "Machine Hip Thrust", "Machine Glute Kickback", "Machine Hip Abduction",
    "Smith Machine Hip Thrust",
    "Glute Bridge", "Frog Pump",
  ],
  Calves: [
    "Machine Calf Raise", "Seated Calf Raise", "Leg Press Calf Raise",
    "Smith Machine Calf Raise", "Machine Standing Calf Raise",
    "DB Calf Raise",
    "Standing Calf Raise", "Single Leg Calf Raise",
  ],
  Abs: [
    "Cable Crunch", "Cable Woodchop", "Cable Pallof Press",
    "Machine Ab Crunch",
    "Weighted Decline Sit-Up", "DB Side Bend",
    "Hanging Leg Raise", "Hanging Knee Raise", "Ab Wheel",
    "Plank", "Decline Sit-Up", "Bicycle Crunch", "Leg Raise",
  ],
  Traps: [
    "Barbell Shrugs",
    "DB Shrugs",
    "Cable Shrugs", "Face Pull",
    "Machine Shrugs", "Smith Machine Shrugs",
    "Farmer Walk", "Upright Row",
  ],
  Forearms: [
    "Barbell Wrist Curl", "Barbell Reverse Curl",
    "DB Wrist Curl", "DB Reverse Curl",
    "Cable Wrist Curl",
    "Farmer Walk", "Dead Hang", "Gripper",
  ],
};
