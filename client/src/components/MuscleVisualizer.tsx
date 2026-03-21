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

const BODY_LEFT = "M 100,15 C 85,15 84,25 88,38 C 89,45 89,48 88,50 C 70,50 62,50 58,54 C 48,70 45,95 42,115 C 40,125 40,135 44,155 C 48,170 54,175 60,170 C 64,165 65,155 58,135 C 55,125 57,110 65,102 C 70,95 72,85 75,78 C 71,110 72,130 74,150 C 76,160 84,165 84,200 C 84,230 80,260 80,285 C 78,310 75,360 78,385 C 80,410 95,410 96,400 C 94,380 92,350 93,310 C 94,290 96,285 96,275 C 98,250 97,220 100,195";

const MUSCLES_FRONT: Record<string, string> = {
  chest: "M 100,60 C 85,60 78,63 74,68 C 73,75 73,82 76,88 C 85,95 95,92 100,88 Z",
  abs: "M 100,95 C 92,95 88,100 85,110 C 84,125 84,140 85,150 C 90,155 95,155 100,152 Z",
  shoulders: "M 74,52 C 60,52 54,60 52,70 C 50,80 50,90 55,100 C 65,95 72,85 75,78 C 76,70 76,60 74,52 Z",
  biceps: "M 55,100 C 56,110 56,115 58,122 C 65,115 68,105 65,100 C 62,97 58,97 55,100 Z",
  forearms: "M 56,128 C 50,140 46,150 48,160 C 52,165 58,155 60,145 C 62,135 60,130 56,128 Z",
  quads: "M 85,185 C 86,220 84,250 82,275 C 88,280 94,280 95,270 C 96,240 98,210 98,198 C 95,195 90,190 85,185 Z",
  calves: "M 80,300 C 78,330 78,360 80,380 C 85,380 90,380 92,360 C 93,330 92,300 90,290 C 85,295 82,300 80,300 Z",
};

const MUSCLES_BACK: Record<string, string> = {
  traps: "M 100,35 C 95,35 90,40 85,45 C 80,50 75,55 70,55 C 80,65 90,75 100,85 Z",
  back: "M 100,85 C 90,75 80,65 74,58 C 72,70 70,90 74,115 C 80,130 90,140 100,150 Z",
  shoulders: "M 74,52 C 60,52 54,60 52,70 C 50,80 50,90 55,100 C 65,95 72,85 75,78 C 76,70 76,60 74,52 Z",
  triceps: "M 55,100 C 56,110 57,125 59,130 C 62,125 66,115 65,105 C 62,95 58,95 55,100 Z",
  glutes: "M 100,150 C 90,150 84,160 84,180 C 84,195 90,205 100,205 Z",
  hamstrings: "M 100,205 C 90,205 84,215 82,270 C 88,275 94,275 95,265 C 96,240 98,220 100,215 Z",
  calves: "M 80,290 C 75,320 75,350 80,380 C 85,380 92,380 94,350 C 96,320 95,290 90,285 C 85,285 82,290 80,290 Z",
};

interface ViewPathProps extends React.SVGProps<SVGPathElement> {
  dLeft: string;
}

function MirroredPath({ dLeft, ...props }: ViewPathProps) {
  return (
    <g>
      <path d={dLeft} {...props} />
      <path d={dLeft} transform="translate(200, 0) scale(-1, 1)" {...props} />
    </g>
  );
}

function BodyBaseLayer() {
  return (
    <>
      <g className="text-muted-foreground opacity-10" fill="currentColor">
        <path d={`${BODY_LEFT} L 100,195 L 100,15 Z`} />
        <path d={`${BODY_LEFT} L 100,195 L 100,15 Z`} transform="translate(200, 0) scale(-1, 1)" />
      </g>
      <g className="text-foreground" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d={BODY_LEFT} />
        <path d={BODY_LEFT} transform="translate(200, 0) scale(-1, 1)" />
      </g>
    </>
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
        style={{ height: 320 }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* FRONT VIEW */}
        <div
          className="absolute inset-0 flex justify-center transition-transform duration-300 ease-in-out"
          style={{ transform: view === "front" ? "translateX(0)" : "translateX(-100%)" }}
        >
          <svg viewBox="0 0 200 420" className="w-full h-full" aria-label="Front muscle map">
            <BodyBaseLayer />
            
            {/* Front Muscles Fills */}
            {Object.entries(MUSCLES_FRONT).map(([muscle, dLeft]) => (
              <MirroredPath key={muscle} dLeft={dLeft} {...mp(muscle)} />
            ))}

            {/* Front Internal Strokes */}
            <g fill="none" stroke="currentColor" strokeWidth="1.5" className="text-foreground/50 opacity-40" strokeLinecap="round">
              <MirroredPath dLeft="M 76,88 C 85,95 95,92 100,88" />
              <MirroredPath dLeft="M 85,110 C 90,115 95,115 100,112" />
              <MirroredPath dLeft="M 84,130 C 90,135 95,135 100,132" />
              <MirroredPath dLeft="M 55,100 C 60,98 62,98 65,100" />
            </g>
          </svg>
        </div>

        {/* BACK VIEW */}
        <div
          className="absolute inset-0 flex justify-center transition-transform duration-300 ease-in-out"
          style={{ transform: view === "front" ? "translateX(100%)" : "translateX(0)" }}
        >
          <svg viewBox="0 0 200 420" className="w-full h-full" aria-label="Back muscle map">
            <BodyBaseLayer />
            
            {/* Back Muscle Fills */}
            {Object.entries(MUSCLES_BACK).map(([muscle, dLeft]) => (
              <MirroredPath key={muscle} dLeft={dLeft} {...mp(muscle)} />
            ))}

            {/* Back Internal Strokes */}
            <g fill="none" stroke="currentColor" strokeWidth="1.5" className="text-foreground/50 opacity-40" strokeLinecap="round">
              <MirroredPath dLeft="M 74,115 C 80,130 90,140 100,150" />
              <MirroredPath dLeft="M 84,180 C 84,195 90,205 100,205" />
              <MirroredPath dLeft="M 55,100 C 60,98 62,98 65,100" />
            </g>
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
