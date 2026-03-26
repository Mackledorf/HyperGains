import { useState, useRef } from "react";
import { ChevronLeft, ChevronRight, ChartNoAxesCombined } from "lucide-react";
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
  MUSCLE_LABEL_ANCHORS,
} from "@/lib/muscleMap";

const MONO = "ui-monospace, 'Cascadia Code', 'Courier New', monospace";

// Pre-computed sets of which muscles appear in each view
const FRONT_MUSCLE_SET = new Set(
  Object.values(FRONT_INDEX_TO_MUSCLE).filter(Boolean) as string[]
);
const BACK_MUSCLE_SET = new Set(
  Object.values(BACK_INDEX_TO_MUSCLE).filter(Boolean) as string[]
);

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
    // Non-muscle body-detail paths always show the card background
    if (!muscle) return "hsl(var(--card))";
    // Fatigue mode: always show accumulated volume color
    if (showFatigue) return muscleData[muscle]?.color ?? VOLUME_ZONE_COLORS.none;
    // Default mode: hover or selected reveals muscle's identity color, otherwise card background
    if (hoveredMuscle === muscle || selected === muscle) return MUSCLE_FILL_COLORS[muscle] ?? VOLUME_ZONE_COLORS.none;
    return "hsl(var(--card))";
  };

  const selectedInfo = selected ? muscleData[selected] : null;

  // Renders a floating monospaced annotation adjacent to the selected muscle
  // inside the SVG canvas — only when that muscle is visible in the current view.
  const renderMuscleAnnotation = (currentView: "front" | "back") => {
    if (!selected || !selectedInfo) return null;
    const inThisView = currentView === "front"
      ? FRONT_MUSCLE_SET.has(selected)
      : BACK_MUSCLE_SET.has(selected);
    if (!inThisView) return null;
    const anchor = MUSCLE_LABEL_ANCHORS[selected];
    if (!anchor) return null;
    const { x, y } = anchor;
    const col = selectedInfo.color;
    return (
      <g aria-hidden="true">
        {/* Tick line from body edge to text */}
        <line
          x1={86} y1={y} x2={x - 3} y2={y}
          stroke={col} strokeWidth={0.5} opacity={0.4}
        />
        {/* Anchor dot */}
        <circle cx={86} cy={y} r={1.2} fill={col} opacity={0.45} />
        {/* Sets count */}
        <text
          x={x} y={y}
          fontFamily={MONO} fontSize={11} fontWeight="700"
          fill={col} dominantBaseline="middle" textAnchor="start"
        >
          {selectedInfo.actualSets}
        </text>
        {/* muscle name */}
        <text
          x={x} y={y + 10}
          fontFamily={MONO} fontSize={4.5}
          fill="rgba(255,255,255,0.45)" dominantBaseline="middle" textAnchor="start"
        >
          {(MUSCLE_DISPLAY_NAMES[selected] ?? selected).toUpperCase()}
        </text>
        {/* zone label */}
        <text
          x={x} y={y + 17}
          fontFamily={MONO} fontSize={4.5}
          fill="rgba(255,255,255,0.35)" dominantBaseline="middle" textAnchor="start"
        >
          {selectedInfo.zoneLabel.toUpperCase()}
        </text>
      </g>
    );
  };

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
        style={{ height: 420 }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Accumulate Fatigue toggle — positioned closer to the edge */}
        <button
          onClick={() => setShowFatigue(!showFatigue)}
          className={`absolute top-0 left-0 z-10 w-12 h-12 flex items-center justify-center rounded-2xl border transition-all active:scale-90 ${
            showFatigue
              ? "bg-orange-500/20 border-orange-500/40 text-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.1)]"
              : "bg-background/60 backdrop-blur-sm border-border/40 text-muted-foreground hover:text-foreground"
          }`}
          aria-label="Toggle accumulated fatigue view"
        >
          <ChartNoAxesCombined className="w-6 h-6" />
        </button>
        {/* FRONT VIEW */}
        <div
          className="absolute inset-0 flex justify-center transition-transform duration-300 ease-in-out"
          style={{ transform: view === "front" ? "translateX(0)" : "translateX(-100%)" }}
        >
          <svg viewBox="0 0 144 150" className="w-full h-full" aria-label="Front muscle map">
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
            {/* Gap overlay: paints the arm-body gap shapes with card color to cover any fill bleed */}
            <path d={FRONT_GAPS} style={{ fill: "hsl(var(--card))", pointerEvents: "none" }} />
            {renderMuscleAnnotation("front")}
          </svg>
        </div>

        {/* BACK VIEW */}
        <div
          className="absolute inset-0 flex justify-center transition-transform duration-300 ease-in-out"
          style={{ transform: view === "front" ? "translateX(100%)" : "translateX(0)" }}
        >
          <svg viewBox="0 0 144 150" className="w-full h-full" aria-label="Back muscle map">
            <defs>
              <clipPath id="back-body-clip">
                <path d={BACK_OUTLINE} clipRule="evenodd" />
              </clipPath>
            </defs>
            <path d={BACK_OUTLINE} fillRule="evenodd" style={{ fill: "hsl(var(--foreground))" }} />
            <g clipPath="url(#back-body-clip)">
              {renderFills(BACK_FILLS, BACK_INDEX_TO_MUSCLE)}
            </g>
            {/* Gap overlay: paints the arm-body gap shapes with card color to cover any fill bleed */}
            <path d={REAR_GAPS} style={{ fill: "hsl(var(--card))", pointerEvents: "none" }} />
            {renderMuscleAnnotation("back")}
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

      {/* Volume zone legend */}
      <div className="rounded-2xl bg-card border border-border/50 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Volume Landmarks
            </p>
            <span className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest bg-muted/30 px-2 py-0.5 rounded-full">
              sets / week
            </span>
          </div>
          
          <div className="relative pt-1 pb-6 px-1.5">
            {/* The Track Line */}
            <div className="h-1 w-full rounded-full bg-muted/40 absolute top-2.5 left-0" />
            
            {/* Markers Container */}
            <div className="relative h-4 flex items-center">
              {[
                { id: "none", color: VOLUME_ZONE_COLORS.none, left: "0%", label: "None" },
                { id: "warning", color: VOLUME_ZONE_COLORS.warning, left: "25%", label: "Warning" },
                { id: "mv", color: VOLUME_ZONE_COLORS.mv, left: "50%", label: "Maintain" },
                { id: "mev", color: VOLUME_ZONE_COLORS.mev, left: "75%", label: "Growth" },
                { id: "mav", color: VOLUME_ZONE_COLORS.mav, left: "100%", label: "Focus" },
              ].map(({ id, color, left, label }) => (
                <div
                  key={id}
                  className="absolute flex flex-col items-center group"
                  style={{ left }}
                >
                  <div 
                    className="w-3 h-3 rounded-full border-[1.5px] border-card shadow-sm -translate-x-1/2" 
                    style={{ backgroundColor: color }}
                  />
                  <span 
                    className="mt-2.5 text-[9px] font-bold uppercase tracking-tight text-muted-foreground/70 whitespace-nowrap -translate-x-1/2"
                  >
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
      </div>
    </div>
  );
}
