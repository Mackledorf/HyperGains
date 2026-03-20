import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import type { OverloadSuggestion } from "@shared/schema";

// ─── Muscle-group awareness for RIR defaults ───
// Heavy compounds may not need 3 RIR from week 1 — they benefit from
// slightly lower starting RIR. Smaller/isolation muscles benefit from
// a more conservative start.
const HEAVY_COMPOUND_GROUPS = new Set([
  "chest", "back", "quads", "hamstrings", "glutes",
]);

/**
 * Get the default RIR target for a given week number.
 * W1-2 → 3 RIR, W3-4 → 2 RIR, W5-6 → 1 RIR, W7+ → 0 RIR
 */
function getWeekTargetRir(weekNumber: number): number {
  if (weekNumber <= 2) return 3;
  if (weekNumber <= 4) return 2;
  if (weekNumber <= 6) return 1;
  return 0;
}

/**
 * Adjust the default RIR based on muscle-group heuristics.
 * Heavy compounds can start 1 RIR lower than the default (but floor at 0).
 * This is just the autofill default — user always overrides.
 */
function getMuscleGroupRir(weekTargetRir: number, muscleGroup: string): number {
  const normalized = muscleGroup.toLowerCase();
  if (HEAVY_COMPOUND_GROUPS.has(normalized) && weekTargetRir > 0) {
    return weekTargetRir - 1;
  }
  return weekTargetRir;
}

function computeOverloadSuggestions(
  previousLogs: { exerciseId: string; exerciseName: string; setNumber: number; weight: number; reps: number; rir: number | null }[],
  targetRepsMin: number,
  targetRepsMax: number,
  weekNumber: number,
  muscleGroup: string
): OverloadSuggestion[] {
  const weekTargetRir = getWeekTargetRir(weekNumber);
  const defaultRir = getMuscleGroupRir(weekTargetRir, muscleGroup);

  return previousLogs.map(log => {
    let suggestedWeight = log.weight;
    let suggestedReps = log.reps;
    let suggestedRir = defaultRir;
    let reason = "";

    const prevRir = log.rir ?? 2;

    // ── Rebound logic ──
    // If the user went harder than the week target last session
    // (e.g. 0 RIR when target was 3), we "rebound" by suggesting
    // a higher weight, fewer reps, and a higher RIR to compensate.
    const wentHarderThanTarget = prevRir < weekTargetRir;

    if (wentHarderThanTarget) {
      // User pushed harder than intended — rebound:
      // Bump weight up, drop reps, and set RIR back to the week target
      // so they recover before pushing again.
      const rirDiff = weekTargetRir - prevRir; // how much harder they went
      suggestedWeight = Math.round((log.weight * (1 + 0.025 * rirDiff) + Number.EPSILON) * 100) / 100;
      suggestedWeight = Math.ceil(suggestedWeight / 2.5) * 2.5;
      suggestedReps = Math.max(targetRepsMin, log.reps - rirDiff);
      suggestedRir = weekTargetRir; // bring RIR back up
      reason = `Rebound: went to ${prevRir} RIR last time (target ${weekTargetRir}) — ↑ weight, ↓ reps, ↑ RIR`;
    } else if (log.reps >= targetRepsMax && prevRir <= 2) {
      // Hit top of rep range with low RIR — increase weight, reset reps
      suggestedWeight = Math.round((log.weight * 1.025 + Number.EPSILON) * 100) / 100;
      suggestedWeight = Math.ceil(suggestedWeight / 2.5) * 2.5;
      suggestedReps = targetRepsMin;
      suggestedRir = defaultRir;
      reason = `Hit ${log.reps} reps @ ${log.weight}lb with ${prevRir} RIR — ↑ weight`;
    } else if (log.reps >= targetRepsMin && log.reps < targetRepsMax) {
      // Within rep range — add a rep, keep weight
      suggestedWeight = log.weight;
      suggestedReps = log.reps + 1;
      suggestedRir = defaultRir;
      reason = `Within range — +1 rep (${log.reps} → ${suggestedReps})`;
    } else if (log.reps < targetRepsMin) {
      // Below rep range — keep weight, aim for minimum
      suggestedWeight = log.weight;
      suggestedReps = targetRepsMin;
      suggestedRir = defaultRir;
      reason = `Below rep range — aim for ${targetRepsMin} reps at same weight`;
    } else {
      // RIR > 2 at top of range — push harder before adding weight
      suggestedWeight = log.weight;
      suggestedReps = Math.min(log.reps + 1, targetRepsMax);
      suggestedRir = Math.max(defaultRir - 1, 0);
      reason = `RIR high (${prevRir}) at top of range — push harder before ↑ weight`;
    }

    return {
      exerciseId: log.exerciseId,
      exerciseName: log.exerciseName,
      setNumber: log.setNumber,
      suggestedWeight,
      suggestedReps,
      suggestedRir,
      previousWeight: log.weight,
      previousReps: log.reps,
      previousRir: log.rir,
      reason,
    };
  });
}

/**
 * When there are no previous logs (first session), we still want to
 * suggest an RIR target based on week + muscle group.
 */
function getDefaultRirForExercise(weekNumber: number, muscleGroup: string): number {
  return getMuscleGroupRir(getWeekTargetRir(weekNumber), muscleGroup);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // === Programs ===
  app.get("/api/programs", async (_req, res) => {
    const programs = await storage.getPrograms();
    res.json(programs);
  });

  app.get("/api/programs/active", async (_req, res) => {
    const program = await storage.getActiveProgram();
    res.json(program || null);
  });

  app.get("/api/programs/:id", async (req, res) => {
    const program = await storage.getProgram(req.params.id);
    if (!program) return res.status(404).json({ message: "Program not found" });
    res.json(program);
  });

  app.post("/api/programs", async (req, res) => {
    const program = await storage.createProgram(req.body);
    res.status(201).json(program);
  });

  app.patch("/api/programs/:id", async (req, res) => {
    const updated = await storage.updateProgram(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: "Program not found" });
    res.json(updated);
  });

  app.delete("/api/programs/:id", async (req, res) => {
    await storage.deleteProgram(req.params.id);
    res.status(204).end();
  });

  // === Program Exercises ===
  app.get("/api/programs/:programId/exercises", async (req, res) => {
    const exercises = await storage.getProgramExercises(req.params.programId);
    res.json(exercises);
  });

  app.get("/api/programs/:programId/exercises/day/:dayIndex", async (req, res) => {
    const exercises = await storage.getProgramExercisesByDay(
      req.params.programId,
      parseInt(req.params.dayIndex)
    );
    res.json(exercises);
  });

  app.post("/api/programs/:programId/exercises", async (req, res) => {
    const exercise = await storage.createProgramExercise({
      ...req.body,
      programId: req.params.programId,
    });
    res.status(201).json(exercise);
  });

  app.patch("/api/exercises/:id", async (req, res) => {
    const updated = await storage.updateProgramExercise(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: "Exercise not found" });
    res.json(updated);
  });

  app.delete("/api/exercises/:id", async (req, res) => {
    await storage.deleteProgramExercise(req.params.id);
    res.status(204).end();
  });

  // === Workout Sessions ===
  app.get("/api/sessions", async (req, res) => {
    const programId = req.query.programId as string;
    if (!programId) return res.status(400).json({ message: "programId required" });
    const sessions = await storage.getWorkoutSessions(programId);
    res.json(sessions);
  });

  app.get("/api/sessions/in-progress", async (_req, res) => {
    const session = await storage.getInProgressSession();
    res.json(session || null);
  });

  app.get("/api/sessions/:id", async (req, res) => {
    const session = await storage.getWorkoutSession(req.params.id);
    if (!session) return res.status(404).json({ message: "Session not found" });
    res.json(session);
  });

  app.post("/api/sessions", async (req, res) => {
    const session = await storage.createWorkoutSession(req.body);
    res.status(201).json(session);
  });

  app.patch("/api/sessions/:id", async (req, res) => {
    const updated = await storage.updateWorkoutSession(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: "Session not found" });
    res.json(updated);
  });

  // === Set Logs ===
  app.get("/api/sessions/:sessionId/logs", async (req, res) => {
    const logs = await storage.getSetLogs(req.params.sessionId);
    res.json(logs);
  });

  app.post("/api/sessions/:sessionId/logs", async (req, res) => {
    const log = await storage.createSetLog({
      ...req.body,
      sessionId: req.params.sessionId,
    });
    res.status(201).json(log);
  });

  app.patch("/api/logs/:id", async (req, res) => {
    const updated = await storage.updateSetLog(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: "Log not found" });
    res.json(updated);
  });

  app.delete("/api/logs/:id", async (req, res) => {
    await storage.deleteSetLog(req.params.id);
    res.status(204).end();
  });

  // === Progressive Overload Suggestions ===
  app.get("/api/overload/:programId/:exerciseId", async (req, res) => {
    const { programId, exerciseId } = req.params;
    const weekNumber = parseInt(req.query.week as string) || 1;

    // Get the exercise template for rep range + muscle group info
    const exercises = await storage.getProgramExercises(programId);
    const exerciseTemplate = exercises.find(e => e.id === exerciseId);
    if (!exerciseTemplate) {
      return res.json({ suggestions: [], defaultRir: getDefaultRirForExercise(weekNumber, "other") });
    }

    const muscleGroup = exerciseTemplate.muscleGroup;
    const defaultRir = getDefaultRirForExercise(weekNumber, muscleGroup);

    // Get previous logs for this exercise
    const previousLogs = await storage.getLastSetLogsForExercise(exerciseId, programId);
    if (previousLogs.length === 0) {
      // No previous data — return just the default RIR target
      return res.json({ suggestions: [], defaultRir });
    }

    const suggestions = computeOverloadSuggestions(
      previousLogs,
      exerciseTemplate.targetRepsMin,
      exerciseTemplate.targetRepsMax,
      weekNumber,
      muscleGroup
    );

    res.json({ suggestions, defaultRir });
  });

  // === History / Stats ===
  app.get("/api/history/:exerciseId", async (req, res) => {
    const logs = await storage.getSetLogsByExercise(req.params.exerciseId);
    res.json(logs);
  });

  return httpServer;
}
