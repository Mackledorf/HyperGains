import { getVolumeLandmarks } from "./volumeLandmarks";

export type VolumeZone = "none" | "mv" | "mev" | "mav" | "above-mav";

export interface MuscleVolumeInfo {
  actualSets: number;
  zone: VolumeZone;
  color: string;
  zoneLabel: string;
}

// Colors per volume zone (user-specified):
//   none      → gray       (untrained)
//   mv        → yellow     (at maintenance volume)
//   mev       → green      (MEV → start of MAV)
//   mav       → blue       (in the MAV sweet spot)
//   above-mav → red        (above MAV, approaching overtraining)
export const VOLUME_ZONE_COLORS: Record<VolumeZone, string> = {
  none: "#4b5563",          // gray-600
  mv: "#ca8a04",            // yellow-600
  mev: "#16a34a",           // green-600
  mav: "#2563eb",           // blue-600
  "above-mav": "#dc2626",   // red-600
};

const ZONE_LABELS: Record<VolumeZone, string> = {
  none: "Untrained",
  mv: "Maintenance",
  mev: "Building",
  mav: "Optimal (MAV)",
  "above-mav": "High Volume",
};

/**
 * Raw hex fill colors per muscle for the visualizer's default mode (accumulate fatigue off).
 * Keyed by lowercase muscle name matching muscle map keys.
 * Hues match the MUSCLE_COLORS badges below.
 */
export const MUSCLE_FILL_COLORS: Record<string, string> = {
  chest:      "#f87171",  // red-400
  back:       "#60a5fa",  // blue-400
  shoulders:  "#fb923c",  // orange-400
  biceps:     "#c084fc",  // purple-400
  triceps:    "#f472b6",  // pink-400
  quads:      "#34d399",  // emerald-400
  hamstrings: "#2dd4bf",  // teal-400
  glutes:     "#fbbf24",  // amber-400
  calves:     "#a3e635",  // lime-400
  abs:        "#22d3ee",  // cyan-400
  traps:      "#818cf8",  // indigo-400
  forearms:   "#a78bfa",  // violet-400
};

/**
 * Tailwind badge classes for each muscle group.
 * Single source of truth — imported by CreateProgram, ProgramSettings, etc.
 */
export const MUSCLE_COLORS: Record<string, string> = {
  Chest:      "bg-red-500/15 text-red-400",
  Back:       "bg-blue-500/15 text-blue-400",
  Shoulders:  "bg-orange-500/15 text-orange-400",
  Biceps:     "bg-purple-500/15 text-purple-400",
  Triceps:    "bg-pink-500/15 text-pink-400",
  Quads:      "bg-emerald-500/15 text-emerald-400",
  Hamstrings: "bg-teal-500/15 text-teal-400",
  Glutes:     "bg-amber-500/15 text-amber-400",
  Calves:     "bg-lime-500/15 text-lime-400",
  Abs:        "bg-cyan-500/15 text-cyan-400",
  Traps:      "bg-indigo-500/15 text-indigo-400",
  Forearms:   "bg-violet-500/15 text-violet-400",
};

export function getMuscleVolumeInfo(
  muscleGroup: string,
  actualSets: number
): MuscleVolumeInfo {
  const lm = getVolumeLandmarks(muscleGroup);

  let zone: VolumeZone;
  if (actualSets === 0) zone = "none";
  else if (actualSets <= lm.mv) zone = "mv";
  else if (actualSets <= lm.mev) zone = "mev";
  else if (actualSets <= lm.mavHigh) zone = "mav";
  else zone = "above-mav";

  return {
    actualSets,
    zone,
    color: VOLUME_ZONE_COLORS[zone],
    zoneLabel: ZONE_LABELS[zone],
  };
}
