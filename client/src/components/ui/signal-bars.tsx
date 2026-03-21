/**
 * Signal-bars widget — inspired by RP Strength's volume emphasis indicator.
 *
 * Three ascending bars (short → mid → tall) where lit bars indicate intensity:
 *   1 bar = Easy / Maintain
 *   2 bars = Medium / Grow
 *   3 bars = Hard / Emphasize
 *
 * Two flavors:
 *   <SignalBars>        — static display (non-interactive)
 *   <SignalBarsToggle>  — tappable; each bar sets the level directly
 */
import { cn } from "@/lib/utils";

export type SignalLevel = 1 | 2 | 3;

// px height for each bar position
const BAR_HEIGHTS: Record<1 | 2 | 3, number> = { 1: 6, 2: 10, 3: 14 };

interface SignalBarsProps {
  level: SignalLevel;
  /** Tailwind bg-* class for lit bars, e.g. "bg-emerald-400" */
  activeColor?: string;
  className?: string;
}

/** Static (non-interactive) signal-bars display. */
export function SignalBars({
  level,
  activeColor = "bg-foreground",
  className,
}: SignalBarsProps) {
  return (
    <div className={cn("flex items-end gap-[3px]", className)}>
      {([1, 2, 3] as const).map((bar) => (
        <div
          key={bar}
          style={{ height: `${BAR_HEIGHTS[bar]}px` }}
          className={cn(
            "w-[5px] rounded-sm",
            bar <= level ? activeColor : "bg-white/10"
          )}
        />
      ))}
    </div>
  );
}

interface SignalBarsToggleProps {
  level: SignalLevel;
  onChange: (level: SignalLevel) => void;
  /** Tailwind bg-* classes for each lit level — index 0=level1, 1=level2, 2=level3 */
  levelColors?: [string, string, string];
  className?: string;
}

/** Interactive toggle: tap any bar to set that level directly. */
export function SignalBarsToggle({
  level,
  onChange,
  levelColors = ["bg-muted-foreground", "bg-blue-400", "bg-primary"],
  className,
}: SignalBarsToggleProps) {
  const activeColor = levelColors[level - 1];
  return (
    <div className={cn("flex items-end", className)}>
      {([1, 2, 3] as const).map((bar) => (
        <button
          key={bar}
          type="button"
          onClick={() => onChange(bar)}
          className="px-[3px] py-1 -my-1 active:opacity-60"
        >
          <div
            style={{ height: `${BAR_HEIGHTS[bar]}px` }}
            className={cn(
              "w-[5px] rounded-sm transition-colors",
              bar <= level ? activeColor : "bg-white/10"
            )}
          />
        </button>
      ))}
    </div>
  );
}
