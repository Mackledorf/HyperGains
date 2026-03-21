/**
 * Dr. Mike Israetel's Training Volume Landmarks for Muscle Growth.
 *
 * Values represent SETS PER WEEK per muscle group.
 *
 * MV  = Maintenance Volume   — minimum to maintain existing muscle
 * MEV = Minimum Effective Volume — minimum to stimulate growth
 * MAV = Maximum Adaptive Volume  — range where most growth occurs (MEV → MRV)
 * MRV = Maximum Recoverable Volume — ceiling before recovery is compromised
 *
 * Sources: RP Hypertrophy app, RP YouTube, Dr. Mike's written guides.
 * These are population averages for intermediate trainees; advanced lifters
 * may tolerate higher MRV. Beginners can grow near MV.
 */

export type VolumeLandmark = {
  mv: number;
  mev: number;
  mavLow: number;  // start of MAV (= MEV in most cases)
  mavHigh: number; // top of MAV (approaching MRV)
  mrv: number;
};

/** Normalized muscle group name → landmarks */
const LANDMARKS: Record<string, VolumeLandmark> = {
  chest: { mv: 6, mev: 8, mavLow: 8, mavHigh: 18, mrv: 22 },
  back: { mv: 8, mev: 10, mavLow: 10, mavHigh: 20, mrv: 25 },
  shoulders: { mv: 6, mev: 8, mavLow: 8, mavHigh: 16, mrv: 20 },
  biceps: { mv: 4, mev: 6, mavLow: 6, mavHigh: 14, mrv: 20 },
  triceps: { mv: 4, mev: 6, mavLow: 6, mavHigh: 14, mrv: 18 },
  quads: { mv: 6, mev: 8, mavLow: 8, mavHigh: 16, mrv: 20 },
  hamstrings: { mv: 4, mev: 6, mavLow: 6, mavHigh: 14, mrv: 18 },
  glutes: { mv: 0, mev: 4, mavLow: 4, mavHigh: 12, mrv: 16 },
  calves: { mv: 6, mev: 8, mavLow: 8, mavHigh: 14, mrv: 16 },
  abs: { mv: 0, mev: 4, mavLow: 4, mavHigh: 16, mrv: 20 },
  traps: { mv: 0, mev: 4, mavLow: 4, mavHigh: 12, mrv: 16 },
  forearms: { mv: 0, mev: 4, mavLow: 4, mavHigh: 10, mrv: 14 },
};

/**
 * Returns volume landmarks for a muscle group, or a conservative default
 * for any unrecognized group.
 */
export function getVolumeLandmarks(muscleGroup: string): VolumeLandmark {
  const key = muscleGroup.toLowerCase().trim();
  return (
    LANDMARKS[key] ?? { mv: 4, mev: 6, mavLow: 6, mavHigh: 12, mrv: 16 }
  );
}

/**
 * Returns the target weekly set range for a given emphasis level.
 *
 * maintain   → aim for MV (minimum to not regress)
 * grow       → aim between MEV and the start of MAV
 * emphasize  → aim within MAV (MEV → MRV)
 */
export function getTargetSetsForEmphasis(
  muscleGroup: string,
  emphasis: "maintain" | "grow" | "emphasize"
): { min: number; max: number } {
  const lm = getVolumeLandmarks(muscleGroup);
  switch (emphasis) {
    case "maintain":
      return { min: lm.mv, max: lm.mev };
    case "grow":
      return { min: lm.mev, max: lm.mavLow + Math.round((lm.mavHigh - lm.mavLow) / 2) };
    case "emphasize":
      return { min: lm.mavLow, max: lm.mavHigh };
  }
}
