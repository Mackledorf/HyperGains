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

export function getMuscleVolumeInfo(
  muscleGroup: string,
  actualSets: number
): MuscleVolumeInfo {
  const lm = getVolumeLandmarks(muscleGroup);

  let zone: VolumeZone;
  if (actualSets === 0) zone = "none";
  else if (actualSets <= lm.mv) zone = "mv";
  else if (actualSets <= lm.mavLow) zone = "mev";
  else if (actualSets <= lm.mavHigh) zone = "mav";
  else zone = "above-mav";

  return {
    actualSets,
    zone,
    color: VOLUME_ZONE_COLORS[zone],
    zoneLabel: ZONE_LABELS[zone],
  };
}
