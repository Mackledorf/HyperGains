// Pure TypeScript types — no Drizzle/pg dependencies
// All data is persisted in localStorage

export type User = {
  id: string;
  name: string;
  passwordHash: string;
};

export type Program = {
  id: string;
  name: string;
  splitType: string;
  durationWeeks: number;
  daysPerWeek: number;
  dayLabels: string[];
  isActive: boolean;
  createdAt: string;
  // Week number is manually advanced by the user via "End Week" button
  currentWeekNumber: number;
};

export type ProgramExercise = {
  id: string;
  programId: string;
  dayIndex: number;
  exerciseName: string;
  muscleGroup: string;
  sortOrder: number;
  targetSets: number;
  // Single target rep count — algorithm tracks and adjusts from here
  targetReps: number;
  restSeconds: number;
  // Exercise difficulty tier — drives rep range enforcement in overload algorithm
  difficulty?: "easy" | "medium" | "hard";
};

export type WorkoutSession = {
  id: string;
  programId: string;
  dayIndex: number;
  dayLabel: string;
  weekNumber: number;
  status: string;
  startedAt: string;
  completedAt: string | null;
};

export type SetLog = {
  id: string;
  sessionId: string;
  exerciseId: string;
  exerciseName: string;
  setNumber: number;
  weight: number;
  reps: number;
  // 0–3 = literal RIR; 4 = "4+ RIR" (junk volume threshold)
  rir: number | null;
  isProgressed: boolean;
};

// Muscle group emphasis — set at program creation, editable anytime
export type MuscleGroupEmphasis = {
  id: string;
  programId: string;
  muscleGroup: string;
  // maintain = MV target; grow = MEV→MAV; emphasize = MAV target
  emphasis: "maintain" | "grow" | "emphasize";
};

// Per-exercise feedback logged after the last set of each exercise
export type ExerciseFeedback = {
  id: string;
  sessionId: string;
  exerciseId: string;
  exerciseName: string;
  workload: "poor" | "okay" | "good" | "great";
  mmc: "poor" | "okay" | "good" | "great";
  pump: "poor" | "okay" | "good" | "great";
  stamina: "poor" | "okay" | "good" | "great";
  loggedAt: string;
};

// Weekly review — filled out when user presses "End Week"
export type WeeklyReview = {
  id: string;
  programId: string;
  weekNumber: number;
  calendarWeekStart: string; // ISO date of Monday that week started
  // dayIndex → rating
  dayRatings: Record<number, "poor" | "okay" | "good" | "great">;
  strongAreas: Array<"workload" | "mmc" | "pump" | "stamina">;
  weakAreas: Array<"workload" | "mmc" | "pump" | "stamina">;
  emphasizeNext: "workload" | "mmc" | "pump" | "stamina" | null;
  completedAt: string;
};

// Progressive overload suggestion type (computed, not stored)
export type OverloadSuggestion = {
  exerciseId: string;
  exerciseName: string;
  setNumber: number;
  suggestedWeight: number;
  suggestedReps: number;
  // null = above-range recalibration — user sets RIR manually
  suggestedRir: number | null;
  previousWeight: number;
  previousReps: number;
  previousRir: number | null;
  reason: string;
};
