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
} from "@shared/schema";

// ── Active user (set at login, scopes all data keys) ──

let _activeUserId = "";

export function setActiveUser(id: string): void {
  _activeUserId = id;
}

export function getActiveUserId(): string {
  return _activeUserId;
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
  get programs() { return `hg_programs_${_activeUserId}`; },
  get exercises() { return `hg_exercises_${_activeUserId}`; },
  get sessions() { return `hg_sessions_${_activeUserId}`; },
  get setLogs() { return `hg_setlogs_${_activeUserId}`; },
  get emphasis() { return `hg_emphasis_${_activeUserId}`; },
  get feedback() { return `hg_feedback_${_activeUserId}`; },
  get checkIns() { return `hg_checkins_${_activeUserId}`; },
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
  window.dispatchEvent(new CustomEvent("hg:data-changed"));
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
// Cross-device sync payload
// ══════════════════════════════════════════════════

export interface UserDataPayload {
  userId: string;
  name: string;
  programs: Program[];
  exercises: ProgramExercise[];
  sessions: WorkoutSession[];
  setLogs: SetLog[];
  emphasis?: MuscleGroupEmphasis[];
  feedback?: ExerciseFeedback[];
  checkIns?: PostSessionCheckIn[];
}

/** Exports all data for the active user as a plain object (for gist sync). */
export function exportAll(): UserDataPayload {
  return {
    userId: _activeUserId,
    name: getUserName(_activeUserId),
    programs: getStore<Program>(KEYS.programs),
    exercises: getStore<ProgramExercise>(KEYS.exercises),
    sessions: getStore<WorkoutSession>(KEYS.sessions),
    setLogs: getStore<SetLog>(KEYS.setLogs),
    emphasis: getStore<MuscleGroupEmphasis>(KEYS.emphasis),
    feedback: getStore<ExerciseFeedback>(KEYS.feedback),
    checkIns: getStore<PostSessionCheckIn>(KEYS.checkIns),
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
  if (payload.name) setUserName(_activeUserId, payload.name);
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
