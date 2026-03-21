import { useState, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { MuscleVolumeInfo } from "@/lib/muscleColors";
import { VOLUME_ZONE_COLORS, MUSCLE_FILL_COLORS } from "@/lib/muscleColors";
import {
  MUSCLE_DISPLAY_NAMES,
  FRONT_OUTLINE,
  FRONT_FILLS,
  BACK_OUTLINE,
  BACK_FILLS,
  FRONT_INDEX_TO_MUSCLE,
  BACK_INDEX_TO_MUSCLE,
  FRONT_GAPS,
  REAR_GAPS,
} from "@/lib/muscleMap";

interface Props {
  muscleData: Record<string, MuscleVolumeInfo>;
}

export default function MuscleVisualizer({ muscleData }: Props) {
  const [view, setView] = useState<"front" | "back">("front");
  const [selected, setSelected] = useState<string | null>(null);
  const [hoveredMuscle, setHoveredMuscle] = useState<string | null>(null);
  const [showFatigue, setShowFatigue] = useState(false);
  const touchStartX = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx > 40) setView("front");
    else if (dx < -40) setView("back");
  };

  const handleClick = (muscle: string) => {
    setSelected(selected === muscle ? null : muscle);
  };

  const fillForPath = (pathIndex: number): string => {
    const indexMap = view === "front" ? FRONT_INDEX_TO_MUSCLE : BACK_INDEX_TO_MUSCLE;
    const muscle = indexMap[pathIndex];
    // Non-muscle body-detail paths always show background
    if (!muscle) return "hsl(var(--background))";
    // Fatigue mode: always show accumulated volume color
    if (showFatigue) return muscleData[muscle]?.color ?? VOLUME_ZONE_COLORS.none;
    // Default mode: hover reveals zone color, otherwise show muscle's identity color
    if (hoveredMuscle === muscle) return muscleData[muscle]?.color ?? VOLUME_ZONE_COLORS.none;
    return MUSCLE_FILL_COLORS[muscle] ?? "hsl(var(--background))";
  };

  const selectedInfo = selected ? muscleData[selected] : null;

  const renderFills = (fills: string[], indexMap: Record<number, string>) =>
    fills.map((d, i) => {
      const muscle = indexMap[i];
      const isSelected = selected === muscle;
      const isHovered = hoveredMuscle === muscle;
      return (
        <path
          key={i}
          d={d}
          style={{
            fill: fillForPath(i),
            transition: "fill 0.15s ease",
            opacity: muscle && (isSelected || isHovered) ? 1 : 0.92,
          }}
          className={muscle ? "cursor-pointer" : undefined}
          onClick={muscle ? () => handleClick(muscle) : undefined}
          onMouseEnter={muscle ? () => setHoveredMuscle(muscle) : undefined}
          onMouseLeave={muscle ? () => setHoveredMuscle(null) : undefined}
        />
      );
    });

  return (
    <div className="space-y-3">
      {/* Swipeable container */}
      <div
        className="relative overflow-hidden"
        style={{ height: 320 }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* FRONT VIEW */}
        <div
          className="absolute inset-0 flex justify-center transition-transform duration-300 ease-in-out"
          style={{ transform: view === "front" ? "translateX(0)" : "translateX(-100%)" }}
        >
          <svg viewBox="0 0 144 144" className="w-full h-full" aria-label="Front muscle map">
            <defs>
              {/* clipRule="evenodd" mirrors the outline's fillRule so fills are clipped inside the body silhouette */}
              <clipPath id="front-body-clip">
                <path d={FRONT_OUTLINE} clipRule="evenodd" />
              </clipPath>
            </defs>
            {/* fillRule="evenodd" ensures compound-path interior subpaths act as holes (arm gaps, etc.) */}
            <path d={FRONT_OUTLINE} fillRule="evenodd" style={{ fill: "hsl(var(--foreground))" }} />
            <g clipPath="url(#front-body-clip)">
              {renderFills(FRONT_FILLS, FRONT_INDEX_TO_MUSCLE)}
            </g>
            {/* Gap overlay: paints the arm-body gap shapes with background to cover any fill bleed */}
            <path d={FRONT_GAPS} style={{ fill: "hsl(var(--background))", pointerEvents: "none" }} />
          </svg>
        </div>

        {/* BACK VIEW */}
        <div
          className="absolute inset-0 flex justify-center transition-transform duration-300 ease-in-out"
          style={{ transform: view === "front" ? "translateX(100%)" : "translateX(0)" }}
        >
          <svg viewBox="0 0 144 144" className="w-full h-full" aria-label="Back muscle map">
            <defs>
              <clipPath id="back-body-clip">
                <path d={BACK_OUTLINE} clipRule="evenodd" />
              </clipPath>
            </defs>
            <path d={BACK_OUTLINE} fillRule="evenodd" style={{ fill: "hsl(var(--foreground))" }} />
            <g clipPath="url(#back-body-clip)">
              {renderFills(BACK_FILLS, BACK_INDEX_TO_MUSCLE)}
            </g>
            {/* Gap overlay: paints the arm-body gap shapes with background to cover any fill bleed */}
            <path d={REAR_GAPS} style={{ fill: "hsl(var(--background))", pointerEvents: "none" }} />
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

      {/* Accumulate Fatigue toggle */}
      <button
        onClick={() => setShowFatigue(!showFatigue)}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-colors ${
          showFatigue
            ? "bg-orange-500/10 border-orange-500/30 text-orange-400"
            : "bg-muted/30 border-border/40 text-muted-foreground"
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div
            className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-colors ${
              showFatigue ? "border-orange-400 bg-orange-400" : "border-muted-foreground/50"
            }`}
          >
            {showFatigue && <div className="w-1.5 h-1.5 rounded-full bg-background" />}
          </div>
          <span className="text-xs font-semibold">Accumulate Fatigue</span>
        </div>
        <span className="text-[10px] uppercase tracking-wide opacity-70">
          {showFatigue ? "Volume colors shown" : "Hover to preview"}
        </span>
      </button>

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

      {/* Volume zone legend — only shown in fatigue mode */}
      {showFatigue && (
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
      )}
    </div>
  );
}
