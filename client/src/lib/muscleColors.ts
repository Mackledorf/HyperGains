import type { CSSProperties } from "react";
import { getVolumeLandmarks } from "./volumeLandmarks";

export type VolumeZone = "none" | "warning" | "mv" | "mev" | "mav" | "overtraining";

export interface MuscleVolumeInfo {
  actualSets: number;
  zone: VolumeZone;
  color: string;
  zoneLabel: string;
}

// Colors per volume zone (highlighter palette):
//   none         → gray-500      (no volume)
//   warning      → rose-500      (undertraining <MV)
//   mv           → amber-400     (maintaining muscle)
//   mev          → lime-400      (growing)
//   mav          → sky-400       (emphasizing)
//   overtraining → red-500       (above MRV)
export const VOLUME_ZONE_COLORS: Record<VolumeZone, string> = {
  none: "#6b7280",          // gray-500
  warning: "#f43f5e",       // rose-500
  mv: "#fbbf24",            // amber-400
  mev: "#a3e635",           // lime-400
  mav: "#38bdf8",           // sky-400
  overtraining: "#ef4444",  // red-500
};

const ZONE_LABELS: Record<VolumeZone, string> = {
  none: "No Volume",
  warning: "Undertraining",
  mv: "Maintaining",
  mev: "Growing",
  mav: "Emphasizing",
  overtraining: "Overtraining",
};

/**
 * Raw hex fill colors per muscle for the visualizer's default mode (accumulate fatigue off).
 * Keyed by lowercase muscle name matching muscle map keys.
 * Hues match the MUSCLE_COLORS badges below.
 */
// Push muscles → red spectrum: shoulders (red) → chest (orange-red) → triceps (pink-red)
// Pull muscles → green spectrum: back (green) → biceps (green-teal) → abs (blue-teal)
// Legs         → blue/purple:   quads (bright blue) → hamstrings (dark blue-purple) → glutes (purple) → calves (pink)
export const MUSCLE_FILL_COLORS: Record<string, string> = {
  shoulders:  "#ff4f3a",  // red
  chest:      "#ff8130",  // orange-red
  triceps:    "#ff3a7f",  // pink-red
  back:       "#84d316",  // green
  biceps:     "#00d4aa",  // green-aqua teal
  abs:        "#44d5fa",  // blue-teal
  quads:      "#3B90FF",  // bright blue
  hamstrings: "#3366ff",  // dark blue-purple
  glutes:     "#783aff",  // purple
  calves:     "#e055ff",  // pink-purple
  traps:      "#ffb822",  // yellow (upper back)
  forearms:   "#ff9850",  // peach-orange
};

/**
 * Hex colors per muscle group — single source of truth for badges and visualizer fills.
 * Imported by CreateProgram, ProgramSettings, etc. Use getMuscleTagStyle() for badge styling.
 */
export const MUSCLE_COLORS: Record<string, string> = {
  Shoulders:  "#ff4f3a",  // red
  Chest:      "#ff8130",  // orange-red
  Triceps:    "#ff3a7f",  // pink-red
  Back:       "#84d316",  // green
  Biceps:     "#00d4aa",  // green-aqua teal
  Abs:        "#44d5fa",  // blue-teal
  Quads:      "#3B90FF",  // bright blue
  Hamstrings: "#3366ff",  // dark blue-purple
  Glutes:     "#783aff",  // purple
  Calves:     "#e055ff",  // pink-purple
  Traps:      "#ffb822",  // yellow (upper back)
  Forearms:   "#ff9850",  // peach-orange
};

/** Returns inline styles for a muscle group badge (background at 15% opacity + text color). */
export function getMuscleTagStyle(muscleGroup: string): CSSProperties {
  const hex = MUSCLE_COLORS[muscleGroup];
  if (!hex) return {};
  return { backgroundColor: hex + "26", color: hex };
}

export function getMuscleVolumeInfo(
  muscleGroup: string,
  actualSets: number
): MuscleVolumeInfo {
  const lm = getVolumeLandmarks(muscleGroup);

  let zone: VolumeZone;
  if (actualSets === 0) {
    zone = "none";
  } else if (actualSets < lm.mv) {
    zone = "warning"; // Undertrained
  } else if (actualSets <= lm.mv) {
    zone = "mv";
  } else if (actualSets <= lm.mev) {
    zone = "mev";
  } else if (actualSets <= lm.mavHigh) {
    zone = "mav";
  } else {
    zone = "overtraining";
  }

  return {
    actualSets,
    zone,
    color: VOLUME_ZONE_COLORS[zone],
    zoneLabel: ZONE_LABELS[zone],
  };
}
