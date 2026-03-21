/**
 * localStorage-backed data layer for HyperGains.
 * Replaces the Express + in-memory server storage.
 * All data is persisted locally in the browser.
 */
import type {
  Program,
  ProgramExercise,
  WorkoutSession,
  SetLog,
} from "@shared/schema";

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

const KEYS = {
  programs: "hg_programs",
  exercises: "hg_exercises",
  sessions: "hg_sessions",
  setLogs: "hg_setlogs",
} as const;

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

export function createProgram(
  data: Omit<Program, "id" | "isActive">
): Program {
  const programs = getStore<Program>(KEYS.programs);
  // Deactivate all existing
  for (const p of programs) p.isActive = false;
  const program: Program = { ...data, id: uuid(), isActive: true };
  programs.push(program);
  setStore(KEYS.programs, programs);
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
  return exercises[idx];
}

export function deleteProgramExercise(id: string): void {
  setStore(
    KEYS.exercises,
    getStore<ProgramExercise>(KEYS.exercises).filter((e) => e.id !== id)
  );
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
  return log;
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
