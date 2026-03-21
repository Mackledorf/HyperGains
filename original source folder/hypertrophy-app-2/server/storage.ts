import {
  type Program, type InsertProgram,
  type ProgramExercise, type InsertProgramExercise,
  type WorkoutSession, type InsertWorkoutSession,
  type SetLog, type InsertSetLog,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Programs
  getPrograms(): Promise<Program[]>;
  getProgram(id: string): Promise<Program | undefined>;
  getActiveProgram(): Promise<Program | undefined>;
  createProgram(program: InsertProgram): Promise<Program>;
  updateProgram(id: string, updates: Partial<Program>): Promise<Program | undefined>;
  deleteProgram(id: string): Promise<void>;

  // Program Exercises
  getProgramExercises(programId: string): Promise<ProgramExercise[]>;
  getProgramExercisesByDay(programId: string, dayIndex: number): Promise<ProgramExercise[]>;
  createProgramExercise(exercise: InsertProgramExercise): Promise<ProgramExercise>;
  updateProgramExercise(id: string, updates: Partial<ProgramExercise>): Promise<ProgramExercise | undefined>;
  deleteProgramExercise(id: string): Promise<void>;

  // Workout Sessions
  getWorkoutSessions(programId: string): Promise<WorkoutSession[]>;
  getWorkoutSession(id: string): Promise<WorkoutSession | undefined>;
  getInProgressSession(): Promise<WorkoutSession | undefined>;
  createWorkoutSession(session: InsertWorkoutSession): Promise<WorkoutSession>;
  updateWorkoutSession(id: string, updates: Partial<WorkoutSession>): Promise<WorkoutSession | undefined>;

  // Set Logs
  getSetLogs(sessionId: string): Promise<SetLog[]>;
  getSetLogsByExercise(exerciseId: string): Promise<SetLog[]>;
  getLastSetLogsForExercise(exerciseId: string, programId: string): Promise<SetLog[]>;
  createSetLog(log: InsertSetLog): Promise<SetLog>;
  updateSetLog(id: string, updates: Partial<SetLog>): Promise<SetLog | undefined>;
  deleteSetLog(id: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private programs: Map<string, Program> = new Map();
  private programExercises: Map<string, ProgramExercise> = new Map();
  private workoutSessions: Map<string, WorkoutSession> = new Map();
  private setLogs: Map<string, SetLog> = new Map();

  // Programs
  async getPrograms(): Promise<Program[]> {
    return Array.from(this.programs.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getProgram(id: string): Promise<Program | undefined> {
    return this.programs.get(id);
  }

  async getActiveProgram(): Promise<Program | undefined> {
    return Array.from(this.programs.values()).find(p => p.isActive);
  }

  async createProgram(insert: InsertProgram): Promise<Program> {
    const id = randomUUID();
    // Deactivate other programs
    for (const [, p] of this.programs) {
      if (p.isActive) p.isActive = false;
    }
    const program: Program = { ...insert, id, isActive: true };
    this.programs.set(id, program);
    return program;
  }

  async updateProgram(id: string, updates: Partial<Program>): Promise<Program | undefined> {
    const program = this.programs.get(id);
    if (!program) return undefined;
    const updated = { ...program, ...updates };
    this.programs.set(id, updated);
    return updated;
  }

  async deleteProgram(id: string): Promise<void> {
    this.programs.delete(id);
    // Cascade delete exercises, sessions, and set logs
    for (const [eid, ex] of this.programExercises) {
      if (ex.programId === id) this.programExercises.delete(eid);
    }
    for (const [sid, sess] of this.workoutSessions) {
      if (sess.programId === id) {
        for (const [lid, log] of this.setLogs) {
          if (log.sessionId === sid) this.setLogs.delete(lid);
        }
        this.workoutSessions.delete(sid);
      }
    }
  }

  // Program Exercises
  async getProgramExercises(programId: string): Promise<ProgramExercise[]> {
    return Array.from(this.programExercises.values())
      .filter(e => e.programId === programId)
      .sort((a, b) => a.dayIndex - b.dayIndex || a.sortOrder - b.sortOrder);
  }

  async getProgramExercisesByDay(programId: string, dayIndex: number): Promise<ProgramExercise[]> {
    return Array.from(this.programExercises.values())
      .filter(e => e.programId === programId && e.dayIndex === dayIndex)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async createProgramExercise(insert: InsertProgramExercise): Promise<ProgramExercise> {
    const id = randomUUID();
    const exercise: ProgramExercise = { ...insert, id };
    this.programExercises.set(id, exercise);
    return exercise;
  }

  async updateProgramExercise(id: string, updates: Partial<ProgramExercise>): Promise<ProgramExercise | undefined> {
    const ex = this.programExercises.get(id);
    if (!ex) return undefined;
    const updated = { ...ex, ...updates };
    this.programExercises.set(id, updated);
    return updated;
  }

  async deleteProgramExercise(id: string): Promise<void> {
    this.programExercises.delete(id);
  }

  // Workout Sessions
  async getWorkoutSessions(programId: string): Promise<WorkoutSession[]> {
    return Array.from(this.workoutSessions.values())
      .filter(s => s.programId === programId)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  async getWorkoutSession(id: string): Promise<WorkoutSession | undefined> {
    return this.workoutSessions.get(id);
  }

  async getInProgressSession(): Promise<WorkoutSession | undefined> {
    return Array.from(this.workoutSessions.values()).find(s => s.status === "in_progress");
  }

  async createWorkoutSession(insert: InsertWorkoutSession): Promise<WorkoutSession> {
    const id = randomUUID();
    const session: WorkoutSession = { ...insert, id, completedAt: insert.completedAt ?? null };
    this.workoutSessions.set(id, session);
    return session;
  }

  async updateWorkoutSession(id: string, updates: Partial<WorkoutSession>): Promise<WorkoutSession | undefined> {
    const session = this.workoutSessions.get(id);
    if (!session) return undefined;
    const updated = { ...session, ...updates };
    this.workoutSessions.set(id, updated);
    return updated;
  }

  // Set Logs
  async getSetLogs(sessionId: string): Promise<SetLog[]> {
    return Array.from(this.setLogs.values())
      .filter(l => l.sessionId === sessionId)
      .sort((a, b) => a.setNumber - b.setNumber);
  }

  async getSetLogsByExercise(exerciseId: string): Promise<SetLog[]> {
    return Array.from(this.setLogs.values())
      .filter(l => l.exerciseId === exerciseId)
      .sort((a, b) => a.setNumber - b.setNumber);
  }

  async getLastSetLogsForExercise(exerciseId: string, programId: string): Promise<SetLog[]> {
    // Find the most recent completed session for this program
    const sessions = Array.from(this.workoutSessions.values())
      .filter(s => s.programId === programId && s.status === "completed")
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    for (const session of sessions) {
      const logs = Array.from(this.setLogs.values())
        .filter(l => l.sessionId === session.id && l.exerciseId === exerciseId)
        .sort((a, b) => a.setNumber - b.setNumber);
      if (logs.length > 0) return logs;
    }
    return [];
  }

  async createSetLog(insert: InsertSetLog): Promise<SetLog> {
    const id = randomUUID();
    const log: SetLog = { ...insert, id, rir: insert.rir ?? null, isProgressed: insert.isProgressed ?? false };
    this.setLogs.set(id, log);
    return log;
  }

  async updateSetLog(id: string, updates: Partial<SetLog>): Promise<SetLog | undefined> {
    const log = this.setLogs.get(id);
    if (!log) return undefined;
    const updated = { ...log, ...updates };
    this.setLogs.set(id, updated);
    return updated;
  }

  async deleteSetLog(id: string): Promise<void> {
    this.setLogs.delete(id);
  }
}

export const storage = new MemStorage();
