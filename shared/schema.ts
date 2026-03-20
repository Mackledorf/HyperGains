// Pure TypeScript types — no Drizzle/pg dependencies
// All data is persisted in localStorage

export type Program = {
  id: string;
  name: string;
  splitType: string;
  durationWeeks: number;
  daysPerWeek: number;
  dayLabels: string[];
  isActive: boolean;
  createdAt: string;
};

export type ProgramExercise = {
  id: string;
  programId: string;
  dayIndex: number;
  exerciseName: string;
  muscleGroup: string;
  sortOrder: number;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  restSeconds: number;
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
  rir: number | null;
  isProgressed: boolean;
};

// Progressive overload suggestion type (computed, not stored)
export type OverloadSuggestion = {
  exerciseId: string;
  exerciseName: string;
  setNumber: number;
  suggestedWeight: number;
  suggestedReps: number;
  suggestedRir: number;
  previousWeight: number;
  previousReps: number;
  previousRir: number | null;
  reason: string;
};
