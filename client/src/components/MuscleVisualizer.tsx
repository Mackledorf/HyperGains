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

  const fillForPath = (pathIndex: number, indexMap: Record<number, string>, useFatigue: boolean): string => {
    const muscle = indexMap[pathIndex];
    // Non-muscle body-detail paths always show the card background
    if (!muscle) return "hsl(var(--card))";
    // Fatigue mode: always show accumulated volume color
    if (useFatigue) return muscleData[muscle]?.color ?? VOLUME_ZONE_COLORS.none;
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
    const { y } = anchor;
    const col = selectedInfo.color;
    // TEXT_X must be right of the body outline's rightmost extent (~x=101).
    // The dot sits at x=103 as a visual anchor; text starts at x=106.
    const DOT_X = 103;
    const TEXT_X = 106;
    return (
      <g aria-hidden="true">
        {/* Marker dot — outside body right edge */}
        <circle cx={DOT_X} cy={y} r={1.5} fill={col} opacity={0.7} />
        {/* Sets count */}
        <text
          x={TEXT_X} y={y}
          fontFamily={MONO} fontSize={11} fontWeight="700"
          fill={col} dominantBaseline="middle" textAnchor="start"
        >
          {selectedInfo.actualSets}
        </text>
        {/* muscle name */}
        <text
          x={TEXT_X} y={y + 10}
          fontFamily={MONO} fontSize={4.5}
          fill="rgba(255,255,255,0.45)" dominantBaseline="middle" textAnchor="start"
        >
          {(MUSCLE_DISPLAY_NAMES[selected] ?? selected).toUpperCase()}
        </text>
        {/* zone label */}
        <text
          x={TEXT_X} y={y + 17}
          fontFamily={MONO} fontSize={4.5}
          fill="rgba(255,255,255,0.35)" dominantBaseline="middle" textAnchor="start"
        >
          {selectedInfo.zoneLabel.toUpperCase()}
        </text>
      </g>
    );
  };

  const renderFills = (fills: string[], indexMap: Record<number, string>, useFatigue: boolean) =>
    fills.map((d, i) => {
      const muscle = indexMap[i];
      const isSelected = selected === muscle;
      const isHovered = hoveredMuscle === muscle;
      return (
        <path
          key={i}
          d={d}
          style={{
            fill: fillForPath(i, indexMap, useFatigue),
            transition: useFatigue ? undefined : "fill 0.15s ease",
            opacity: muscle && !useFatigue && (isSelected || isHovered) ? 1 : 0.92,
          }}
          className={muscle && !useFatigue ? "cursor-pointer" : undefined}
          onClick={muscle && !useFatigue ? () => handleClick(muscle) : undefined}
          onMouseEnter={muscle && !useFatigue ? () => setHoveredMuscle(muscle) : undefined}
          onMouseLeave={muscle && !useFatigue ? () => setHoveredMuscle(null) : undefined}
        />
      );
    });

  // Renders a front+back SVG panel pair for either normal or fatigue display mode.
  // Two of these groups are stacked vertically inside the swipeable container:
  // the normal group slides out upward when fatigue is toggled on, and the fatigue
  // group slides in from below — giving the same swipe feel as the front/back switch.
  const renderBodyPanels = (useFatigue: boolean) => (
    <>
      {/* FRONT VIEW */}
      <div
        className="absolute inset-0 flex justify-center transition-transform duration-300 ease-in-out"
        style={{ transform: view === "front" ? "translateX(0)" : "translateX(-100%)" }}
      >
        <svg viewBox="0 0 144 150" className="w-full h-full" aria-label="Front muscle map">
          <defs>
            {/* clipRule="evenodd" mirrors the outline's fillRule so fills are clipped inside the body silhouette */}
            <clipPath id={useFatigue ? "front-body-clip-fatigue" : "front-body-clip"}>
              <path d={FRONT_OUTLINE} clipRule="evenodd" />
            </clipPath>
          </defs>
          {/* fillRule="evenodd" ensures compound-path interior subpaths act as holes (arm gaps, etc.) */}
          <path d={FRONT_OUTLINE} fillRule="evenodd" style={{ fill: "hsl(var(--foreground))" }} />
          <g clipPath={`url(#${useFatigue ? "front-body-clip-fatigue" : "front-body-clip"})`}>
            {renderFills(FRONT_FILLS, FRONT_INDEX_TO_MUSCLE, useFatigue)}
          </g>
          {/* Gap overlay: paints the arm-body gap shapes with card color to cover any fill bleed */}
          <path d={FRONT_GAPS} style={{ fill: "hsl(var(--card))", pointerEvents: "none" }} />
          {!useFatigue && renderMuscleAnnotation("front")}
        </svg>
      </div>

      {/* BACK VIEW */}
      <div
        className="absolute inset-0 flex justify-center transition-transform duration-300 ease-in-out"
        style={{ transform: view === "front" ? "translateX(100%)" : "translateX(0)" }}
      >
        <svg viewBox="0 0 144 150" className="w-full h-full" aria-label="Back muscle map">
          <defs>
            <clipPath id={useFatigue ? "back-body-clip-fatigue" : "back-body-clip"}>
              <path d={BACK_OUTLINE} clipRule="evenodd" />
            </clipPath>
          </defs>
          <path d={BACK_OUTLINE} fillRule="evenodd" style={{ fill: "hsl(var(--foreground))" }} />
          <g clipPath={`url(#${useFatigue ? "back-body-clip-fatigue" : "back-body-clip"})`}>
            {renderFills(BACK_FILLS, BACK_INDEX_TO_MUSCLE, useFatigue)}
          </g>
          {/* Gap overlay: paints the arm-body gap shapes with card color to cover any fill bleed */}
          <path d={REAR_GAPS} style={{ fill: "hsl(var(--card))", pointerEvents: "none" }} />
          {!useFatigue && renderMuscleAnnotation("back")}
        </svg>
      </div>
    </>
  );

  return (
    <div className="space-y-3">
      {/* Swipeable container — isolate creates a proper GPU compositing context so
          overflow-hidden strictly clips all animated child layers (fixes edge bleed). */}
      <div
        className="relative overflow-hidden isolate"
        style={{ height: 420 }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Accumulate Fatigue toggle — sits above both panel groups at all times */}
        <button
          onClick={() => setShowFatigue(!showFatigue)}
          className={`absolute top-0 left-0 z-20 w-12 h-12 flex items-center justify-center rounded-2xl border transition-all active:scale-90 ${
            showFatigue
              ? "bg-orange-500/20 border-orange-500/40 text-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.1)]"
              : "bg-background/60 backdrop-blur-sm border-border/40 text-muted-foreground hover:text-foreground"
          }`}
          aria-label="Toggle accumulated fatigue view"
        >
          <ChartNoAxesCombined className="w-6 h-6" />
        </button>

        {/* Volume landmark legend — vertical, left side, fatigue mode only */}
        {showFatigue && (
          <div className="absolute left-0 top-0 bottom-0 z-10 w-[38%] flex flex-col justify-center gap-3.5 pt-14 pb-4 pl-3">
            {[
              { color: VOLUME_ZONE_COLORS.overtraining, label: "Over-\ntraining" },
              { color: VOLUME_ZONE_COLORS.mav,          label: "Emphasizing" },
              { color: VOLUME_ZONE_COLORS.mev,          label: "Growing" },
              { color: VOLUME_ZONE_COLORS.mv,           label: "Maintaining" },
              { color: VOLUME_ZONE_COLORS.warning,      label: "Under-\ntraining" },
              { color: VOLUME_ZONE_COLORS.none,         label: "None" },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="text-[9px] sm:text-[12px] font-bold uppercase tracking-tight text-muted-foreground/80 whitespace-pre-line leading-tight">
                  {label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Normal panel group — hidden instantly when fatigue mode is active */}
        <div
          className="absolute inset-0"
          style={{ display: showFatigue ? "none" : "block" }}
        >
          {renderBodyPanels(false)}
        </div>

        {/* Fatigue panel group — shown instantly when fatigue mode is active */}
        <div
          className="absolute inset-0"
          style={{ display: showFatigue ? "block" : "none" }}
        >
          {renderBodyPanels(true)}
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

    </div>
  );
}
