/**
 * localStorage-backed data layer for HyperGains.
 * Replaces the Express + in-memory server storage.
 * All data is persisted locally in the browser.
 */
import type {
  User,
  Program,
  ProgramExercise,
  WorkoutSession,
  SetLog,
  MuscleGroupEmphasis,
  ExerciseFeedback,
  PostSessionCheckIn,
  UserProfile,
  WeightEntry,
  GoalEntry,
  CustomFood,
  Meal,
  FoodEntry,
  NutritionGoals,
  WaterEntry,
} from "@shared/schema";

// ── Active user (set at login, scopes all data keys) ──

let _activeUserId = "";

export function setActiveUser(id: string): void {
  _activeUserId = id;
}

export function getActiveUserId(): string {
  return _activeUserId;
}

// ── Shared event names & session key ──

export const HG_EVENTS = {
  LOGOUT: "hg:logout",
  DATA_CHANGED: "hg:data-changed",
} as const;

export const SESSION_KEY = "hg_session";

// ── New User Experience flag (user-level, persists across sessions) ──

export function isNuxComplete(userId: string): boolean {
  return localStorage.getItem(`hg_nux_${userId}`) === "1";
}

export function setNuxComplete(userId: string): void {
  localStorage.setItem(`hg_nux_${userId}`, "1");
  notifyDataChanged();
}

export function getNuxSkippedAbout(userId: string): boolean {
  return localStorage.getItem(`hg_nux_skipped_about_${userId}`) === "1";
}
export function setNuxSkippedAbout(userId: string): void {
  localStorage.setItem(`hg_nux_skipped_about_${userId}`, "1");
}
export function clearNuxSkippedAbout(userId: string): void {
  localStorage.removeItem(`hg_nux_skipped_about_${userId}`);
}

export function getNuxSkippedGoals(userId: string): boolean {
  return localStorage.getItem(`hg_nux_skipped_goals_${userId}`) === "1";
}
export function setNuxSkippedGoals(userId: string): void {
  localStorage.setItem(`hg_nux_skipped_goals_${userId}`, "1");
}
export function clearNuxSkippedGoals(userId: string): void {
  localStorage.removeItem(`hg_nux_skipped_goals_${userId}`);
}

// ── Helpers ──

function uuid(): string {
  return crypto.randomUUID();
}

function getStore<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setStore<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

// User-scoped data keys — computed dynamically from the active user ID
const KEYS = {
  get programs()       { return `hg_programs_${_activeUserId}`; },
  get exercises()      { return `hg_exercises_${_activeUserId}`; },
  get sessions()       { return `hg_sessions_${_activeUserId}`; },
  get setLogs()        { return `hg_setlogs_${_activeUserId}`; },
  get emphasis()       { return `hg_emphasis_${_activeUserId}`; },
  get feedback()       { return `hg_feedback_${_activeUserId}`; },
  get checkIns()       { return `hg_checkins_${_activeUserId}`; },
  get profile()        { return `hg_profile_${_activeUserId}`; },
  get weightHistory()  { return `hg_weighthistory_${_activeUserId}`; },
  get goalHistory()    { return `hg_goalhistory_${_activeUserId}`; },
  // Food tracker
  get customFoods()    { return `hg_customfoods_${_activeUserId}`; },
  get meals()          { return `hg_meals_${_activeUserId}`; },
  get foodEntries()    { return `hg_foodentries_${_activeUserId}`; },
  get nutritionGoals()   { return `hg_nutrigoals_${_activeUserId}`; },
  get waterEntries()     { return `hg_water_${_activeUserId}`; },
  get globalFoods()      { return `hg_globalfoods`; },
  // Ad-hoc workout exercises (not tied to a program)
  get adHocExercises()   { return `hg_adhoc_exercises_${_activeUserId}`; },
};

// ══════════════════════════════════════════════════
// Users — userId = SHA-256(password), no device registry
// Each account is identified solely by its password hash.
// ══════════════════════════════════════════════════

export function getUserName(userId: string): string {
  return localStorage.getItem(`hg_name_${userId}`) ?? "User";
}

export function setUserName(userId: string, name: string): void {
  localStorage.setItem(`hg_name_${userId}`, name);
}

/** Returns a synthetic User — always succeeds, no registry needed. */
export function getUserById(id: string): User {
  return { id, name: getUserName(id), passwordHash: id };
}

function notifyDataChanged(): void {
  window.dispatchEvent(new CustomEvent(HG_EVENTS.DATA_CHANGED));
}

// ══════════════════════════════════════════════════
// Programs
// ══════════════════════════════════════════════════

export function getPrograms(): Program[] {
  return getStore<Program>(KEYS.programs).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getProgram(id: string): Program | undefined {
  return getStore<Program>(KEYS.programs).find((p) => p.id === id);
}

export function getActiveProgram(): Program | undefined {
  return getStore<Program>(KEYS.programs).find((p) => p.isActive);
}

export function setActiveProgram(programId: string): Program | undefined {
  const programs = getStore<Program>(KEYS.programs);
  const idx = programs.findIndex((p) => p.id === programId);
  if (idx === -1) return undefined;
  for (const p of programs) p.isActive = false;
  programs[idx].isActive = true;
  setStore(KEYS.programs, programs);
  notifyDataChanged();
  return programs[idx];
}

export function createProgram(
  data: Omit<Program, "id" | "isActive">
): Program {
  const programs = getStore<Program>(KEYS.programs);
  // Deactivate all existing
  for (const p of programs) p.isActive = false;
  const program: Program = { ...data, id: uuid(), isActive: true };
  programs.push(program);
  setStore(KEYS.programs, programs);
  notifyDataChanged();
  return program;
}

export function updateProgram(
  id: string,
  updates: Partial<Program>
): Program | undefined {
  const programs = getStore<Program>(KEYS.programs);
  const idx = programs.findIndex((p) => p.id === id);
  if (idx === -1) return undefined;
  programs[idx] = { ...programs[idx], ...updates };
  setStore(KEYS.programs, programs);
  notifyDataChanged();
  return programs[idx];
}

export function deleteProgram(id: string): void {
  let programs = getStore<Program>(KEYS.programs).filter((p) => p.id !== id);
  setStore(KEYS.programs, programs);
  // Cascade delete exercises
  setStore(
    KEYS.exercises,
    getStore<ProgramExercise>(KEYS.exercises).filter(
      (e) => e.programId !== id
    )
  );
  // Cascade delete sessions & logs
  const sessions = getStore<WorkoutSession>(KEYS.sessions);
  const sessionIds = new Set(
    sessions.filter((s) => s.programId === id).map((s) => s.id)
  );
  setStore(
    KEYS.sessions,
    sessions.filter((s) => s.programId !== id)
  );
  setStore(
    KEYS.setLogs,
    getStore<SetLog>(KEYS.setLogs).filter((l) => !sessionIds.has(l.sessionId))
  );
  // Cascade delete emphasis
  deleteMuscleGroupEmphasisForProgram(id);
  notifyDataChanged();
}

// ══════════════════════════════════════════════════
// Program Exercises
// ══════════════════════════════════════════════════

export function getProgramExercises(programId: string): ProgramExercise[] {
  return getStore<ProgramExercise>(KEYS.exercises)
    .filter((e) => e.programId === programId)
    .sort((a, b) => a.dayIndex - b.dayIndex || a.sortOrder - b.sortOrder);
}

export function getProgramExercisesByDay(
  programId: string,
  dayIndex: number
): ProgramExercise[] {
  return getStore<ProgramExercise>(KEYS.exercises)
    .filter((e) => e.programId === programId && e.dayIndex === dayIndex)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function createProgramExercise(
  data: Omit<ProgramExercise, "id">
): ProgramExercise {
  const exercises = getStore<ProgramExercise>(KEYS.exercises);
  const exercise: ProgramExercise = { ...data, id: uuid() };
  exercises.push(exercise);
  setStore(KEYS.exercises, exercises);
  notifyDataChanged();
  return exercise;
}

export function updateProgramExercise(
  id: string,
  updates: Partial<ProgramExercise>
): ProgramExercise | undefined {
  const exercises = getStore<ProgramExercise>(KEYS.exercises);
  const idx = exercises.findIndex((e) => e.id === id);
  if (idx === -1) return undefined;
  exercises[idx] = { ...exercises[idx], ...updates };
  setStore(KEYS.exercises, exercises);
  notifyDataChanged();
  return exercises[idx];
}

export function deleteProgramExercise(id: string): void {
  setStore(
    KEYS.exercises,
    getStore<ProgramExercise>(KEYS.exercises).filter((e) => e.id !== id)
  );
  notifyDataChanged();
}

// ══════════════════════════════════════════════════
// Workout Sessions
// ══════════════════════════════════════════════════

export function getWorkoutSessions(programId: string): WorkoutSession[] {
  return getStore<WorkoutSession>(KEYS.sessions)
    .filter((s) => s.programId === programId)
    .sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
}

export function getAllRecentSessions(limit: number = 5): WorkoutSession[] {
  return getStore<WorkoutSession>(KEYS.sessions)
    .filter((s) => s.status === "completed")
    .sort((a, b) => {
      const bTime = new Date(b.completedAt || b.startedAt).getTime();
      const aTime = new Date(a.completedAt || a.startedAt).getTime();
      return bTime - aTime;
    })
    .slice(0, limit);
}

// ══════════════════════════════════════════════════
// Ad-Hoc Exercises
// Exercises added on-the-fly during an unplanned (ad-hoc) workout session.
// Stored separately from ProgramExercises (no programId / dayIndex).
// ══════════════════════════════════════════════════

export function getAdHocExercisesForSession(sessionId: string): ProgramExercise[] {
  return getStore<ProgramExercise>(KEYS.adHocExercises)
    .filter((e) => e.programId === sessionId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function addAdHocExercise(
  sessionId: string,
  data: { exerciseName: string; muscleGroup: string; difficulty?: ProgramExercise["difficulty"] }
): ProgramExercise {
  const existing = getAdHocExercisesForSession(sessionId);
  const exercise: ProgramExercise = {
    id: uuid(),
    // Reuse programId field to scope exercise to the session
    programId: sessionId,
    dayIndex: 0,
    exerciseName: data.exerciseName,
    muscleGroup: data.muscleGroup,
    sortOrder: existing.length,
    targetSets: 3,
    targetReps: 10,
    restSeconds: 120,
    difficulty: data.difficulty,
  };
  const all = getStore<ProgramExercise>(KEYS.adHocExercises);
  all.push(exercise);
  setStore(KEYS.adHocExercises, all);
  notifyDataChanged();
  return exercise;
}

export function removeAdHocExercise(sessionId: string, exerciseId: string): void {
  setStore(
    KEYS.adHocExercises,
    getStore<ProgramExercise>(KEYS.adHocExercises).filter(
      (e) => !(e.programId === sessionId && e.id === exerciseId)
    )
  );
  notifyDataChanged();
}

export function getWorkoutSession(id: string): WorkoutSession | undefined {
  return getStore<WorkoutSession>(KEYS.sessions).find((s) => s.id === id);
}

export function getInProgressSession(): WorkoutSession | undefined {
  return getStore<WorkoutSession>(KEYS.sessions).find(
    (s) => s.status === "in_progress"
  );
}

export function createWorkoutSession(
  data: Omit<WorkoutSession, "id">
): WorkoutSession {
  const sessions = getStore<WorkoutSession>(KEYS.sessions);
  const session: WorkoutSession = {
    ...data,
    id: uuid(),
    completedAt: data.completedAt ?? null,
  };
  sessions.push(session);
  setStore(KEYS.sessions, sessions);
  notifyDataChanged();
  return session;
}

export function updateWorkoutSession(
  id: string,
  updates: Partial<WorkoutSession>
): WorkoutSession | undefined {
  const sessions = getStore<WorkoutSession>(KEYS.sessions);
  const idx = sessions.findIndex((s) => s.id === id);
  if (idx === -1) return undefined;
  sessions[idx] = { ...sessions[idx], ...updates };
  setStore(KEYS.sessions, sessions);
  notifyDataChanged();
  return sessions[idx];
}

// ══════════════════════════════════════════════════
// Set Logs
// ══════════════════════════════════════════════════

export function getSetLogs(sessionId: string): SetLog[] {
  return getStore<SetLog>(KEYS.setLogs)
    .filter((l) => l.sessionId === sessionId)
    .sort((a, b) => a.setNumber - b.setNumber);
}

// Used by the long-term calendar/block view to plot per-exercise volume
// and muscle emphasis over time. Returns every log ever recorded for this
// exercise across all sessions (not just the most recent one).
export function getSetLogsByExercise(exerciseId: string): SetLog[] {
  return getStore<SetLog>(KEYS.setLogs)
    .filter((l) => l.exerciseId === exerciseId)
    .sort((a, b) => a.setNumber - b.setNumber);
}

export function getLastSetLogsForExercise(
  exerciseId: string,
  programId: string
): SetLog[] {
  const sessions = getStore<WorkoutSession>(KEYS.sessions)
    .filter((s) => s.programId === programId && s.status === "completed")
    .sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );

  const allLogs = getStore<SetLog>(KEYS.setLogs);

  for (const session of sessions) {
    const logs = allLogs
      .filter(
        (l) => l.sessionId === session.id && l.exerciseId === exerciseId
      )
      .sort((a, b) => a.setNumber - b.setNumber);
    if (logs.length > 0) return logs;
  }
  return [];
}

export function createSetLog(data: Omit<SetLog, "id">): SetLog {
  const logs = getStore<SetLog>(KEYS.setLogs);
  const log: SetLog = {
    ...data,
    id: uuid(),
    rir: data.rir ?? null,
    isProgressed: data.isProgressed ?? false,
  };
  logs.push(log);
  setStore(KEYS.setLogs, logs);
  notifyDataChanged();
  return log;
}

// ══════════════════════════════════════════════════
// User Profile
// ══════════════════════════════════════════════════

export function getProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(KEYS.profile);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveProfile(data: Omit<UserProfile, "id" | "userId" | "createdAt" | "updatedAt"> & { id?: string; createdAt?: string }): UserProfile {
  const existing = getProfile();
  const now = new Date().toISOString();
  const profile: UserProfile = {
    id: existing?.id ?? crypto.randomUUID(),
    userId: _activeUserId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ...data,
  };
  localStorage.setItem(KEYS.profile, JSON.stringify(profile));

  // Append to goal history when goals change
  const goalsChanged =
    !existing ||
    JSON.stringify([...data.goals].sort()) !== JSON.stringify([...existing.goals].sort());
  if (goalsChanged && data.goals.length > 0) {
    addGoalEntry(data.goals);
  }

  notifyDataChanged();
  return profile;
}

// ══════════════════════════════════════════════════
// Weight History
// ══════════════════════════════════════════════════

export function getWeightHistory(): WeightEntry[] {
  return getStore<WeightEntry>(KEYS.weightHistory).sort(
    (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()
  );
}

export function addWeightEntry(weightKg: number, timeOfDay: "AM" | "PM" = "AM", fed: boolean = false): WeightEntry {
  const entries = getStore<WeightEntry>(KEYS.weightHistory);
  const entry: WeightEntry = {
    id: crypto.randomUUID(),
    userId: _activeUserId,
    weightKg,
    timeOfDay,
    fed,
    recordedAt: new Date().toISOString(),
  };
  entries.push(entry);
  setStore(KEYS.weightHistory, entries);
  return entry;
}

// ══════════════════════════════════════════════════
// Goal History
// ══════════════════════════════════════════════════

export function getGoalHistory(): GoalEntry[] {
  return getStore<GoalEntry>(KEYS.goalHistory).sort(
    (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()
  );
}

export function addGoalEntry(goals: string[]): GoalEntry {
  const entries = getStore<GoalEntry>(KEYS.goalHistory);
  const entry: GoalEntry = {
    id: crypto.randomUUID(),
    userId: _activeUserId,
    goals: [...goals],
    recordedAt: new Date().toISOString(),
  };
  entries.push(entry);
  setStore(KEYS.goalHistory, entries);
  return entry;
}

// ══════════════════════════════════════════════════
// Cross-device sync payload
// ══════════════════════════════════════════════════

export interface UserDataPayload {
  userId: string;
  name: string;
  nuxComplete?: boolean;
  programs: Program[];
  exercises: ProgramExercise[];
  sessions: WorkoutSession[];
  setLogs: SetLog[];
  emphasis?: MuscleGroupEmphasis[];
  feedback?: ExerciseFeedback[];
  checkIns?: PostSessionCheckIn[];
  profile?: UserProfile;
  weightHistory?: WeightEntry[];
  goalHistory?: GoalEntry[];
  // Food tracker
  customFoods?: CustomFood[];
  meals?: Meal[];
  foodEntries?: FoodEntry[];
  nutritionGoals?: NutritionGoals;
  waterEntries?: WaterEntry[];
}

/** Exports all data for the active user as a plain object (for gist sync). */
export function exportAll(): UserDataPayload {
  const rawProfile = localStorage.getItem(KEYS.profile);
  const rawNutritionGoals = localStorage.getItem(KEYS.nutritionGoals);
  return {
    userId: _activeUserId,
    name: getUserName(_activeUserId),
    nuxComplete: isNuxComplete(_activeUserId),
    programs: getStore<Program>(KEYS.programs),
    exercises: getStore<ProgramExercise>(KEYS.exercises),
    sessions: getStore<WorkoutSession>(KEYS.sessions),
    setLogs: getStore<SetLog>(KEYS.setLogs),
    emphasis: getStore<MuscleGroupEmphasis>(KEYS.emphasis),
    feedback: getStore<ExerciseFeedback>(KEYS.feedback),
    checkIns: getStore<PostSessionCheckIn>(KEYS.checkIns),
    profile: rawProfile ? JSON.parse(rawProfile) : undefined,
    weightHistory: getStore<WeightEntry>(KEYS.weightHistory),
    goalHistory: getStore<GoalEntry>(KEYS.goalHistory),
    customFoods: getStore<CustomFood>(KEYS.customFoods),
    meals: getStore<Meal>(KEYS.meals),
    foodEntries: getStore<FoodEntry>(KEYS.foodEntries),
    nutritionGoals: rawNutritionGoals ? JSON.parse(rawNutritionGoals) : undefined,
    waterEntries: getStore<WaterEntry>(KEYS.waterEntries),
  };
}

/** Imports all data from a gist payload into localStorage for the active user. */
export function importAll(payload: UserDataPayload): void {
  setStore(KEYS.programs, payload.programs);
  setStore(KEYS.exercises, payload.exercises);
  setStore(KEYS.sessions, payload.sessions);
  setStore(KEYS.setLogs, payload.setLogs);
  if (payload.emphasis) setStore(KEYS.emphasis, payload.emphasis);
  if (payload.feedback) setStore(KEYS.feedback, payload.feedback);
  if (payload.checkIns) setStore(KEYS.checkIns, payload.checkIns);
  if (payload.profile) localStorage.setItem(KEYS.profile, JSON.stringify(payload.profile));
  if (payload.weightHistory) setStore(KEYS.weightHistory, payload.weightHistory);
  if (payload.goalHistory) setStore(KEYS.goalHistory, payload.goalHistory);
  if (payload.customFoods) setStore(KEYS.customFoods, payload.customFoods);
  if (payload.meals) setStore(KEYS.meals, payload.meals);
  if (payload.foodEntries) setStore(KEYS.foodEntries, payload.foodEntries);
  if (payload.nutritionGoals) localStorage.setItem(KEYS.nutritionGoals, JSON.stringify(payload.nutritionGoals));
  if (payload.waterEntries) setStore(KEYS.waterEntries, payload.waterEntries);
  if (payload.name) setUserName(_activeUserId, payload.name);
  if (payload.nuxComplete) localStorage.setItem(`hg_nux_${_activeUserId}`, "1");
}

export function updateSetLog(
  id: string,
  updates: Partial<SetLog>
): SetLog | undefined {
  const logs = getStore<SetLog>(KEYS.setLogs);
  const idx = logs.findIndex((l) => l.id === id);
  if (idx === -1) return undefined;
  logs[idx] = { ...logs[idx], ...updates };
  setStore(KEYS.setLogs, logs);
  return logs[idx];
}

export function deleteSetLog(id: string): void {
  setStore(
    KEYS.setLogs,
    getStore<SetLog>(KEYS.setLogs).filter((l) => l.id !== id)
  );
}

// ══════════════════════════════════════════════════
// Week Management
// ══════════════════════════════════════════════════

/** Manually increments the week counter on a program. Called by "End Week" button. */
export function advanceWeek(programId: string): Program | undefined {
  const programs = getStore<Program>(KEYS.programs);
  const idx = programs.findIndex((p) => p.id === programId);
  if (idx === -1) return undefined;
  programs[idx] = {
    ...programs[idx],
    currentWeekNumber: (programs[idx].currentWeekNumber ?? 1) + 1,
    weekStartedAt: new Date().toISOString(),
  };
  setStore(KEYS.programs, programs);
  notifyDataChanged();
  return programs[idx];
}

/**
 * Returns the total number of completed sets for a given muscle group
 * within a specific calendar week (identified by the ISO date of Monday).
 */
export function getWeeklySetsForMuscleGroup(
  programId: string,
  muscleGroup: string,
  calendarWeekStart: string
): number {
  const weekStart = new Date(calendarWeekStart);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const exercises = getStore<ProgramExercise>(KEYS.exercises)
    .filter(
      (e) =>
        e.programId === programId &&
        e.muscleGroup.toLowerCase() === muscleGroup.toLowerCase()
    )
    .map((e) => e.id);

  const exerciseSet = new Set(exercises);

  const sessions = getStore<WorkoutSession>(KEYS.sessions).filter((s) => {
    if (s.programId !== programId || s.status !== "completed") return false;
    const t = new Date(s.startedAt).getTime();
    return t >= weekStart.getTime() && t < weekEnd.getTime();
  });

  const sessionIds = new Set(sessions.map((s) => s.id));

  return getStore<SetLog>(KEYS.setLogs).filter(
    (l) => sessionIds.has(l.sessionId) && exerciseSet.has(l.exerciseId)
  ).length;
}

// ══════════════════════════════════════════════════
// Muscle Group Emphasis
// ══════════════════════════════════════════════════

export function getMuscleGroupEmphases(programId: string): MuscleGroupEmphasis[] {
  return getStore<MuscleGroupEmphasis>(KEYS.emphasis).filter(
    (e) => e.programId === programId
  );
}

export function getMuscleGroupEmphasis(
  programId: string,
  muscleGroup: string
): MuscleGroupEmphasis | undefined {
  return getStore<MuscleGroupEmphasis>(KEYS.emphasis).find(
    (e) =>
      e.programId === programId &&
      e.muscleGroup.toLowerCase() === muscleGroup.toLowerCase()
  );
}

export function upsertMuscleGroupEmphasis(
  programId: string,
  muscleGroup: string,
  emphasis: MuscleGroupEmphasis["emphasis"]
): MuscleGroupEmphasis {
  const all = getStore<MuscleGroupEmphasis>(KEYS.emphasis);
  const idx = all.findIndex(
    (e) =>
      e.programId === programId &&
      e.muscleGroup.toLowerCase() === muscleGroup.toLowerCase()
  );
  if (idx !== -1) {
    all[idx] = { ...all[idx], emphasis };
    setStore(KEYS.emphasis, all);
    notifyDataChanged();
    return all[idx];
  }
  const entry: MuscleGroupEmphasis = {
    id: crypto.randomUUID(),
    programId,
    muscleGroup,
    emphasis,
  };
  all.push(entry);
  setStore(KEYS.emphasis, all);
  notifyDataChanged();
  return entry;
}

export function deleteMuscleGroupEmphasisForProgram(programId: string): void {
  setStore(
    KEYS.emphasis,
    getStore<MuscleGroupEmphasis>(KEYS.emphasis).filter(
      (e) => e.programId !== programId
    )
  );
}

// ══════════════════════════════════════════════════
// Exercise Feedback
// ══════════════════════════════════════════════════

export function getExerciseFeedbackForSession(sessionId: string): ExerciseFeedback[] {
  return getStore<ExerciseFeedback>(KEYS.feedback).filter(
    (f) => f.sessionId === sessionId
  );
}

export function createExerciseFeedback(
  data: Omit<ExerciseFeedback, "id">
): ExerciseFeedback {
  const all = getStore<ExerciseFeedback>(KEYS.feedback);
  // Replace if already exists for this session+exercise
  const existing = all.findIndex(
    (f) => f.sessionId === data.sessionId && f.exerciseId === data.exerciseId
  );
  const entry: ExerciseFeedback = { ...data, id: crypto.randomUUID() };
  if (existing !== -1) {
    all[existing] = entry;
  } else {
    all.push(entry);
  }
  setStore(KEYS.feedback, all);
  notifyDataChanged();
  return entry;
}

// ══════════════════════════════════════════════════
// Post-Session Check-Ins
// ══════════════════════════════════════════════════

export function getCheckInsForProgram(programId: string): PostSessionCheckIn[] {
  return getStore<PostSessionCheckIn>(KEYS.checkIns)
    .filter((c) => c.programId === programId)
    .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
}

/** Returns the most recent check-in for a program, or undefined. */
export function getLatestCheckIn(
  programId: string
): PostSessionCheckIn | undefined {
  return getCheckInsForProgram(programId)[0];
}

export function createCheckIn(
  data: Omit<PostSessionCheckIn, "id">
): PostSessionCheckIn {
  const all = getStore<PostSessionCheckIn>(KEYS.checkIns);
  // Replace if already exists for this session
  const existing = all.findIndex((c) => c.sessionId === data.sessionId);
  const entry: PostSessionCheckIn = { ...data, id: crypto.randomUUID() };
  if (existing !== -1) {
    all[existing] = entry;
  } else {
    all.push(entry);
  }
  setStore(KEYS.checkIns, all);
  notifyDataChanged();
  return entry;
}

// ══════════════════════════════════════════════════
// Analytics queries (completed sessions only)
// ══════════════════════════════════════════════════

/**
 * Returns actual completed sets per muscle group for a specific program week.
 * Only counts sets from completed sessions — in-progress sessions are excluded.
 */
export function getActualWeeklySetsPerMuscle(
  programId: string,
  weekNumber: number
): Record<string, number> {
  const sessions = getStore<WorkoutSession>(KEYS.sessions).filter(
    (s) =>
      s.programId === programId &&
      s.weekNumber === weekNumber &&
      s.status === "completed"
  );
  const sessionIds = new Set(sessions.map((s) => s.id));
  if (sessionIds.size === 0) return {};

  // Build exerciseId → normalizedMuscleGroup for this program
  const exerciseMuscle = new Map(
    getStore<ProgramExercise>(KEYS.exercises)
      .filter((e) => e.programId === programId)
      .map((e) => [e.id, e.muscleGroup.toLowerCase()])
  );

  const result: Record<string, number> = {};
  for (const log of getStore<SetLog>(KEYS.setLogs)) {
    if (!sessionIds.has(log.sessionId)) continue;
    const muscle = exerciseMuscle.get(log.exerciseId);
    if (muscle) {
      result[muscle] = (result[muscle] ?? 0) + 1;
    }
  }
  return result;
}

/**
 * Returns all completed sessions whose completedAt timestamp falls within
 * the given calendar month (year/month are the active user's sessions only).
 * month is 0-indexed (0 = January).
 */
export function getCompletedSessionsForMonth(
  year: number,
  month: number
): WorkoutSession[] {
  return getStore<WorkoutSession>(KEYS.sessions).filter((s) => {
    if (s.status !== "completed" || !s.completedAt) return false;
    const d = new Date(s.completedAt);
    return d.getFullYear() === year && d.getMonth() === month;
  });
}

/** Returns all PostSessionCheckIns for the active user, newest first. */
export function getAllCheckIns(): PostSessionCheckIn[] {
  return getStore<PostSessionCheckIn>(KEYS.checkIns).sort((a, b) =>
    b.loggedAt.localeCompare(a.loggedAt)
  );
}

/** Returns all ExerciseFeedbacks for the given set of session IDs. */
export function getExerciseFeedbackForSessions(
  sessionIds: string[]
): ExerciseFeedback[] {
  const idSet = new Set(sessionIds);
  return getStore<ExerciseFeedback>(KEYS.feedback).filter((f) =>
    idSet.has(f.sessionId)
  );
}

/** Returns all ExerciseFeedbacks for the active user. */
export function getAllExerciseFeedbacks(): ExerciseFeedback[] {
  return getStore<ExerciseFeedback>(KEYS.feedback);
}

// ══════════════════════════════════════════════════
// Food Tracker — Date Bucketing
// Daily boundary is 3AM (night-owl friendly reset).
// ══════════════════════════════════════════════════

/** Returns "YYYY-MM-DD" for the food-day that contains the given time.
 *  Hours 0:00–2:59 belong to the previous calendar day. */
export function getFoodDate(now: Date = new Date()): string {
  const adjusted = new Date(now);
  if (adjusted.getHours() < 3) {
    adjusted.setDate(adjusted.getDate() - 1);
  }
  return adjusted.toISOString().split("T")[0];
}

// ══════════════════════════════════════════════════
// Custom Food Library
// ══════════════════════════════════════════════════

export function getCustomFoods(): CustomFood[] {
  return getStore<CustomFood>(KEYS.customFoods).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getGlobalFoods(): CustomFood[] {
  return getStore<CustomFood>(KEYS.globalFoods);
}

export function saveGlobalFoods(foods: CustomFood[]): void {
  setStore(KEYS.globalFoods, foods);
}

export function saveCustomFood(
  data: Omit<CustomFood, "id" | "userId" | "createdAt">,
  share: boolean = false
): CustomFood {
  const foods = getStore<CustomFood>(KEYS.customFoods);
  // Avoid duplicates by barcode
  if (data.barcode) {
    const existing = foods.find((f) => f.barcode === data.barcode);
    if (existing) return existing;
  }
  const food: CustomFood = {
    ...data,
    id: uuid(),
    userId: _activeUserId,
    createdAt: new Date().toISOString(),
  };
  foods.push(food);
  setStore(KEYS.customFoods, foods);
  notifyDataChanged();

  if (share) {
    // Add to local global cache immediately
    const globalFoods = getGlobalFoods();
    globalFoods.push({ ...food, isGlobal: true, contributorId: _activeUserId });
    saveGlobalFoods(globalFoods);
    
    // Trigger async push to Gist (logic to be handled by caller or a new sync trigger)
    // For now, we'll assume the caller in the UI handles the gist.updateGlobalFoods call
    // or we can add a specific event if needed.
  }

  return food;
}

export function deleteCustomFood(id: string): void {
  setStore(
    KEYS.customFoods,
    getStore<CustomFood>(KEYS.customFoods).filter((f) => f.id !== id)
  );
  notifyDataChanged();
}

// ══════════════════════════════════════════════════
// Meals
// ══════════════════════════════════════════════════

export function getMealsForDate(date: string): Meal[] {
  return getStore<Meal>(KEYS.meals)
    .filter((m) => m.date === date)
    .sort(
      (a, b) =>
        new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime()
    );
}

export function createMeal(data: Omit<Meal, "id" | "userId">): Meal {
  const meals = getStore<Meal>(KEYS.meals);
  // Auto-number the meal based on how many meals exist today
  const todayMeals = meals.filter((m) => m.date === data.date);
  const name = data.name || `Meal ${todayMeals.length + 1}`;
  const meal: Meal = { ...data, name, id: uuid(), userId: _activeUserId };
  meals.push(meal);
  setStore(KEYS.meals, meals);
  notifyDataChanged();
  return meal;
}

export function updateMeal(
  id: string,
  updates: Partial<Meal>
): Meal | undefined {
  const meals = getStore<Meal>(KEYS.meals);
  const idx = meals.findIndex((m) => m.id === id);
  if (idx === -1) return undefined;
  meals[idx] = { ...meals[idx], ...updates };
  setStore(KEYS.meals, meals);
  notifyDataChanged();
  return meals[idx];
}

export function deleteMeal(id: string): void {
  setStore(
    KEYS.meals,
    getStore<Meal>(KEYS.meals).filter((m) => m.id !== id)
  );
  // Cascade: delete all food entries belonging to this meal
  setStore(
    KEYS.foodEntries,
    getStore<FoodEntry>(KEYS.foodEntries).filter((e) => e.mealId !== id)
  );
  notifyDataChanged();
}

// ══════════════════════════════════════════════════
// Food Entries
// ══════════════════════════════════════════════════

export function getFoodEntriesForDate(date: string): FoodEntry[] {
  return getStore<FoodEntry>(KEYS.foodEntries).filter((e) => e.date === date);
}

export function createFoodEntry(
  data: Omit<FoodEntry, "id" | "userId">
): FoodEntry {
  const entries = getStore<FoodEntry>(KEYS.foodEntries);
  const entry: FoodEntry = { ...data, id: uuid(), userId: _activeUserId };
  entries.push(entry);
  setStore(KEYS.foodEntries, entries);
  notifyDataChanged();
  return entry;
}

export function updateFoodEntry(
  id: string,
  updates: Partial<FoodEntry>
): FoodEntry | undefined {
  const entries = getStore<FoodEntry>(KEYS.foodEntries);
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return undefined;
  entries[idx] = { ...entries[idx], ...updates };
  setStore(KEYS.foodEntries, entries);
  notifyDataChanged();
  return entries[idx];
}

export function deleteFoodEntry(id: string): void {
  setStore(
    KEYS.foodEntries,
    getStore<FoodEntry>(KEYS.foodEntries).filter((e) => e.id !== id)
  );
  notifyDataChanged();
}

// ══════════════════════════════════════════════════
// Nutrition Goals
// ══════════════════════════════════════════════════

const DEFAULT_NUTRITION_GOALS: Omit<NutritionGoals, "id" | "userId" | "updatedAt"> = {
  calorieTarget: 2000,
  proteinTargetG: 150,
  carbsTargetG: 200,
  fatTargetG: 70,
  waterTargetOz: 64,
};

export function getNutritionGoals(): NutritionGoals {
  try {
    const raw = localStorage.getItem(KEYS.nutritionGoals);
    if (raw) return JSON.parse(raw);
  } catch {}
  // Return defaults (not yet persisted)
  return {
    ...DEFAULT_NUTRITION_GOALS,
    id: "",
    userId: _activeUserId,
    updatedAt: new Date().toISOString(),
  };
}

export function saveNutritionGoals(
  data: Omit<NutritionGoals, "id" | "userId" | "updatedAt"> & { id?: string }
): NutritionGoals {
  const existing = getNutritionGoals();
  const goals: NutritionGoals = {
    id: data.id ?? existing.id ?? uuid(),
    userId: _activeUserId,
    updatedAt: new Date().toISOString(),
    calorieTarget: data.calorieTarget,
    proteinTargetG: data.proteinTargetG,
    carbsTargetG: data.carbsTargetG,
    fatTargetG: data.fatTargetG,
    waterTargetOz: data.waterTargetOz,
  };
  localStorage.setItem(KEYS.nutritionGoals, JSON.stringify(goals));
  notifyDataChanged();
  return goals;
}

// ══════════════════════════════════════════════════
// Water Entries
// ══════════════════════════════════════════════════

export function getWaterEntriesForDate(date: string): WaterEntry[] {
  return getStore<WaterEntry>(KEYS.waterEntries).filter((e) => e.date === date);
}

export function addWaterEntry(amountOz: number): WaterEntry {
  const entries = getStore<WaterEntry>(KEYS.waterEntries);
  const now = new Date().toISOString();
  const entry: WaterEntry = {
    id: uuid(),
    userId: _activeUserId,
    amountOz,
    loggedAt: now,
    date: getFoodDate(),
  };
  entries.push(entry);
  setStore(KEYS.waterEntries, entries);
  notifyDataChanged();
  return entry;
}
