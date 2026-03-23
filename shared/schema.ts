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
  // If true: training week doesn't auto-advance — user advances it manually (or on Monday)
  isDecentralized?: boolean;
  // ISO date string tracking when the current training week started
  weekStartedAt?: string;
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

// Post-session check-in — global session feedback + per-exercise joint flags
export type PostSessionCheckIn = {
  id: string;
  sessionId: string;
  programId: string;
  sessionDifficulty: "too-easy" | "just-right" | "too-hard";
  motivation: "poor" | "okay" | "good" | "great";
  fatigue: "poor" | "okay" | "good" | "great";
  // exerciseId → true if user flagged joint/pain on that exercise
  jointFlags: Record<string, boolean>;
  loggedAt: string;
};

// ── User Profile & History ────────────────────────

// User profile — personal details, stored metric internally, displayed per unitSystem
export type UserProfile = {
  id: string;
  userId: string;
  gender: "male" | "female" | "other" | "prefer_not_to_say";
  /** Height always stored in cm regardless of unitSystem */
  heightCm: number | null;
  /** Weight always stored in kg regardless of unitSystem */
  weightKg: number | null;
  unitSystem: "imperial" | "metric";
  /** Predefined goal keys, e.g. ["build_muscle", "lose_fat"] */
  goals: string[];
  /** Age in years — used for TDEE calculation */
  ageYears: number | null;
  /** Activity multiplier tier for TDEE */
  activityLevel: "sedentary" | "light" | "moderate" | "active" | "very_active" | null;
  /** Overall body-weight direction goal */
  bodyWeightGoal: "gain" | "lose" | "maintain" | null;
  /** Target lbs gained / lost per week (positive = gain, negative = lose) */
  weeklyRateLbs: number | null;
  createdAt: string;
  updatedAt: string;
};

// Timestamped weight snapshot — appended whenever weight changes
export type WeightEntry = {
  id: string;
  userId: string;
  weightKg: number;
  timeOfDay?: "AM" | "PM";
  fed?: boolean;
  recordedAt: string;
};

// Timestamped goal snapshot — appended whenever goals change
export type GoalEntry = {
  id: string;
  userId: string;
  goals: string[];
  recordedAt: string;
};

// ── Food Tracker ────────────────────────────────────

// User's personal food library — foods they've searched/scanned/manually entered
export type CustomFood = {
  id: string;
  userId: string;
  name: string;
  brand?: string;
  barcode?: string;
  /** Canonical serving size in grams */
  servingSizeG: number;
  /** Human-readable serving label, e.g. "1 bar (50g)", "1 cup" */
  servingSizeLabel: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  source: "openfoodfacts" | "usda" | "custom";
  createdAt: string;
};

// Meal container — groups multiple FoodEntries under one card
export type Meal = {
  id: string;
  userId: string;
  /** "Meal 1", "Meal 2", or user-customized */
  name: string;
  /** Single timestamp for the meal; auto-captured, user-editable (ISO string) */
  loggedAt: string;
  /** YYYY-MM-DD for day bucketing (3AM daily reset) */
  date: string;
};

// A single food logged in the daily diary
export type FoodEntry = {
  id: string;
  userId: string;
  /** null = standalone food card; set = belongs to a Meal */
  mealId: string | null;
  /** Link to CustomFood in saved library */
  customFoodId?: string | null;
  name: string;
  brand?: string;
  /** Grams consumed — all macros are computed from this */
  servingG: number;
  /** Human-readable label, e.g. "1 bar (50g)" */
  servingSizeLabel: string;
  /** Computed: (servingG / 100) × caloriesPer100g */
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Auto-captured, user-editable ISO string */
  loggedAt: string;
  /** YYYY-MM-DD for day bucketing */
  date: string;
};

// Daily nutrition targets — user-set, TDEE estimate is offered as default
// Future: implement adaptive TDEE by tracking weight trend over 2-4 weeks and
// adjusting the estimate toward the calorie level where weight stays stable.
export type NutritionGoals = {
  id: string;
  userId: string;
  calorieTarget: number;
  proteinTargetG: number;
  carbsTargetG: number;
  fatTargetG: number;
  /** Base daily water goal in oz — scales dynamically with carb intake in UI */
  waterTargetOz: number;
  updatedAt: string;
};

// Water log entry
export type WaterEntry = {
  id: string;
  userId: string;
  amountOz: number;
  loggedAt: string;
  /** YYYY-MM-DD for day bucketing */
  date: string;
};

// ── Supplement Tracker (schema only — not yet built) ────────
// See /memories/session/plan.md for full design documentation.

// User's supplement / vitamin / PED regimen entry
export type Supplement = {
  id: string;
  userId: string;
  name: string;
  doseMg: number;
  /** Default number of pills/doses per day */
  defaultCount: number;
  frequency: "daily" | "weekly" | "biweekly" | "custom";
  category: "vitamin" | "supplement" | "ped";
  isInjectable: boolean;
  notes?: string;
  createdAt: string;
};

// Daily supplement check-off log
export type SupplementLog = {
  id: string;
  userId: string;
  supplementId: string;
  date: string;
  countTaken: number;
  skipped: boolean;
  loggedAt: string;
};

// Injection log entry (for injectable PEDs)
// Sites (IM): lower_quad_l/r, upper_quad_l/r, glute_l/r, deltoid_l/r
// Sites (SubQ): love_handle_l/r, abdomen_l/r, glute_subq_l/r
// Future: add injectable inventory tracking (vial volume, reorder alerts)
export type InjectionLog = {
  id: string;
  userId: string;
  supplementId: string;
  volumeMl: number;
  site: string;
  injectionType: "im" | "subq";
  date: string;
  notes?: string;
  loggedAt: string;
};

// ── Progressive Overload ─────────────────────────────────────

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
  // Set by applyFeedbackModifiers when a check-in adjustment was applied
  feedbackModified?: boolean;
};
