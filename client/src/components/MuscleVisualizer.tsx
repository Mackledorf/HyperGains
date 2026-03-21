import { useState, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { MuscleVolumeInfo } from "@/lib/muscleColors";
import { VOLUME_ZONE_COLORS } from "@/lib/muscleColors";

const MUSCLE_DISPLAY_NAMES: Record<string, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  abs: "Abs",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
  traps: "Traps",
};

interface Props {
  muscleData: Record<string, MuscleVolumeInfo>;
}

// Shared body silhouette background — used for both front and back views.
// All shapes use muted fill so the colored muscle overlays stand out.
function BodyBase() {
  return (
    <g fill="hsl(215 20% 22%)" opacity="0.9">
      {/* Head */}
      <circle cx="60" cy="18" r="14" />
      {/* Neck */}
      <rect x="52" y="31" width="16" height="12" rx="4" />
      {/* Torso — trapezoidal, wider at shoulders, slightly narrower at waist */}
      <path d="M 28,44 L 92,44 L 87,128 L 33,128 Z" />
      {/* Hips — slightly wider than waist */}
      <path d="M 31,126 L 89,126 L 92,152 L 28,152 Z" />
      {/* Left upper arm */}
      <rect x="10" y="46" width="18" height="56" rx="9" />
      {/* Right upper arm */}
      <rect x="92" y="46" width="18" height="56" rx="9" />
      {/* Left forearm */}
      <rect x="11" y="104" width="16" height="46" rx="8" />
      {/* Right forearm */}
      <rect x="93" y="104" width="16" height="46" rx="8" />
      {/* Left thigh */}
      <rect x="28" y="152" width="28" height="60" rx="14" />
      {/* Right thigh */}
      <rect x="64" y="152" width="28" height="60" rx="14" />
      {/* Left shin */}
      <rect x="30" y="214" width="24" height="56" rx="12" />
      {/* Right shin */}
      <rect x="66" y="214" width="24" height="56" rx="12" />
    </g>
  );
}

export default function MuscleVisualizer({ muscleData }: Props) {
  const [view, setView] = useState<"front" | "back">("front");
  const [selected, setSelected] = useState<string | null>(null);
  const touchStartX = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx > 40) setView("front");
    else if (dx < -40) setView("back");
  };

  const getColor = (muscle: string) =>
    muscleData[muscle]?.color ?? VOLUME_ZONE_COLORS.none;

  const handleClick = (muscle: string) => {
    setSelected(selected === muscle ? null : muscle);
  };

  // Returns SVG props for a clickable muscle region
  const mp = (muscle: string) => ({
    fill: getColor(muscle),
    opacity: selected === muscle ? 1 : 0.82,
    style: { cursor: "pointer" } as React.CSSProperties,
    onClick: () => handleClick(muscle),
  });

  const selectedInfo = selected ? muscleData[selected] : null;

  return (
    <div className="space-y-3">
      {/* Swipeable container */}
      <div
        className="relative overflow-hidden"
        style={{ height: 298 }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* FRONT VIEW */}
        <div
          className="absolute inset-0 flex justify-center transition-transform duration-300 ease-in-out"
          style={{ transform: view === "front" ? "translateX(0)" : "translateX(-100%)" }}
        >
          <svg viewBox="0 0 120 275" width="130" height="298" aria-label="Front muscle map">
            <BodyBase />
            {/* Chest — two pectorals */}
            <ellipse cx="38" cy="72" rx="16" ry="13" {...mp("chest")} />
            <ellipse cx="82" cy="72" rx="16" ry="13" {...mp("chest")} />
            {/* Front deltoids */}
            <ellipse cx="17" cy="54" rx="9" ry="9" {...mp("shoulders")} />
            <ellipse cx="103" cy="54" rx="9" ry="9" {...mp("shoulders")} />
            {/* Biceps */}
            <ellipse cx="17" cy="78" rx="7" ry="14" {...mp("biceps")} />
            <ellipse cx="103" cy="78" rx="7" ry="14" {...mp("biceps")} />
            {/* Forearms */}
            <ellipse cx="17" cy="120" rx="7" ry="15" {...mp("forearms")} />
            <ellipse cx="103" cy="120" rx="7" ry="15" {...mp("forearms")} />
            {/* Abs */}
            <ellipse cx="60" cy="100" rx="15" ry="22" {...mp("abs")} />
            {/* Quads */}
            <ellipse cx="41" cy="180" rx="13" ry="26" {...mp("quads")} />
            <ellipse cx="79" cy="180" rx="13" ry="26" {...mp("quads")} />
            {/* Front calves (tibialis) */}
            <ellipse cx="40" cy="238" rx="11" ry="22" {...mp("calves")} />
            <ellipse cx="80" cy="238" rx="11" ry="22" {...mp("calves")} />
          </svg>
        </div>

        {/* BACK VIEW */}
        <div
          className="absolute inset-0 flex justify-center transition-transform duration-300 ease-in-out"
          style={{ transform: view === "front" ? "translateX(100%)" : "translateX(0)" }}
        >
          <svg viewBox="0 0 120 275" width="130" height="298" aria-label="Back muscle map">
            <BodyBase />
            {/* Traps — diamond/pentagon at upper back */}
            <path d="M 36,46 L 84,46 L 78,65 L 60,72 L 42,65 Z" {...mp("traps")} />
            {/* Back / Lats */}
            <ellipse cx="37" cy="96" rx="14" ry="30" {...mp("back")} />
            <ellipse cx="83" cy="96" rx="14" ry="30" {...mp("back")} />
            {/* Rear deltoids */}
            <ellipse cx="17" cy="54" rx="9" ry="9" {...mp("shoulders")} />
            <ellipse cx="103" cy="54" rx="9" ry="9" {...mp("shoulders")} />
            {/* Triceps */}
            <ellipse cx="17" cy="78" rx="7" ry="14" {...mp("triceps")} />
            <ellipse cx="103" cy="78" rx="7" ry="14" {...mp("triceps")} />
            {/* Glutes */}
            <ellipse cx="41" cy="157" rx="16" ry="13" {...mp("glutes")} />
            <ellipse cx="79" cy="157" rx="16" ry="13" {...mp("glutes")} />
            {/* Hamstrings */}
            <ellipse cx="41" cy="186" rx="14" ry="28" {...mp("hamstrings")} />
            <ellipse cx="79" cy="186" rx="14" ry="28" {...mp("hamstrings")} />
            {/* Rear calves (gastrocnemius) */}
            <ellipse cx="40" cy="238" rx="11" ry="22" {...mp("calves")} />
            <ellipse cx="80" cy="238" rx="11" ry="22" {...mp("calves")} />
          </svg>
        </div>
      </div>

      {/* Navigation controls */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => setView("front")}
          className={`p-1 rounded-full transition-colors ${
            view === "front" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
          aria-label="Front view"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView("front")}
            className={`w-2 h-2 rounded-full transition-all ${
              view === "front" ? "bg-primary scale-125" : "bg-muted-foreground/40"
            }`}
            aria-label="Show front"
          />
          <button
            onClick={() => setView("back")}
            className={`w-2 h-2 rounded-full transition-all ${
              view === "back" ? "bg-primary scale-125" : "bg-muted-foreground/40"
            }`}
            aria-label="Show back"
          />
        </div>
        <button
          onClick={() => setView("back")}
          className={`p-1 rounded-full transition-colors ${
            view === "back" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
          aria-label="Back view"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Current view label */}
      <p className="text-center text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {view === "front" ? "Front" : "Back"} · tap a muscle for details
      </p>

      {/* Selected muscle info card */}
      {selected && selectedInfo && (
        <div className="rounded-xl bg-muted/40 px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold">{MUSCLE_DISPLAY_NAMES[selected] ?? selected}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{selectedInfo.zoneLabel}</p>
          </div>
          <div className="text-right">
            <p
              className="text-xl font-bold tabular-nums"
              style={{ color: selectedInfo.color }}
            >
              {selectedInfo.actualSets}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">sets / wk</p>
          </div>
        </div>
      )}

      {/* Volume zone legend */}
      <div className="rounded-xl bg-muted/30 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          Volume Legend
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {(
            [
              { color: VOLUME_ZONE_COLORS.none, label: "Untrained" },
              { color: VOLUME_ZONE_COLORS.mv, label: "Maintenance (MV)" },
              { color: VOLUME_ZONE_COLORS.mev, label: "Building (MEV)" },
              { color: VOLUME_ZONE_COLORS.mav, label: "Optimal (MAV)" },
              { color: VOLUME_ZONE_COLORS["above-mav"], label: "High Volume" },
            ] as const
          ).map(({ color, label }) => (
            <div key={label} className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-[11px] text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
