import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { VOLUME_ZONE_COLORS } from "@/lib/muscleColors";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_HEADERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/**
 * Volume-landmark-based training status for a single training day.
 *
 * The classification maps weekly accumulated sets (for the dominant muscle group
 * trained that day) against Dr. Mike Israetel's volume landmarks:
 *
 *   undertrained  → below MV   (not enough stimulus to maintain)
 *   maintaining   → at MV      (maintenance volume zone)
 *   growing       → MEV → MAV  (minimum effective through start of MAV)
 *   emphasizing   → within MAV (max-adaptive range, optimal hypertrophy)
 *   overreaching  → above MRV  (volume exceeds recovery capacity)
 *
 * TODO: Populate this map once per-day / per-week historical volume
 *       aggregation is implemented (see storage.getActualWeeklySetsPerMuscle).
 */
export type VolumeStatus =
  | "undertrained"
  | "maintaining"
  | "growing"
  | "emphasizing"
  | "overreaching";

export interface VolumeDayInfo {
  status: VolumeStatus;
  /** Primary muscle group that drives this day's classification */
  primaryMuscle?: string;
  /** Human-readable workout label (e.g. "Push Day") */
  dayLabel: string;
}

export const VOLUME_STATUS_COLORS: Record<VolumeStatus, string> = {
  undertrained: VOLUME_ZONE_COLORS.warning, // slate  — below MV
  maintaining:  VOLUME_ZONE_COLORS.mv,      // amber  — at MV
  growing:      VOLUME_ZONE_COLORS.mev,     // green  — MEV → start of MAV
  emphasizing:  VOLUME_ZONE_COLORS.mav,     // blue   — within MAV (optimal)
  overreaching: VOLUME_ZONE_COLORS.warning, // red    — above MRV
};

export const VOLUME_STATUS_LABELS: Record<VolumeStatus, string> = {
  undertrained: "Under MV",
  maintaining:  "Maintaining",
  growing:      "Growing",
  emphasizing:  "Emphasizing",
  overreaching: "Overreaching",
};

interface Props {
  year: number;
  month: number; // 0-indexed
  days: Map<string, VolumeDayInfo>; // "YYYY-MM-DD" → info
  onMonthChange: (year: number, month: number) => void;
}

export default function VolumeCalendarView({ year, month, days, onMonthChange }: Props) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const handlePrev = () => {
    const d = new Date(year, month - 1, 1);
    onMonthChange(d.getFullYear(), d.getMonth());
    setSelectedDate(null);
  };

  const handleNext = () => {
    const d = new Date(year, month + 1, 1);
    onMonthChange(d.getFullYear(), d.getMonth());
    setSelectedDate(null);
  };

  const workoutCount = days.size;
  const selectedInfo = selectedDate ? days.get(selectedDate) : null;
  const isEmpty = workoutCount === 0;

  return (
    <div className="space-y-3">
      {/* Month navigation header */}
      <div className="flex items-center justify-between">
        <button
          onClick={handlePrev}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-center">
          <p className="text-sm font-bold">
            {MONTHS[month]} {year}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {workoutCount} workout{workoutCount !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={handleNext}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1">
        {DAY_HEADERS.map((d) => (
          <div
            key={d}
            className="text-center text-[9px] font-semibold text-muted-foreground py-0.5"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const info = days.get(dateStr);
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          const color = info ? VOLUME_STATUS_COLORS[info.status] : undefined;

          return (
            <button
              key={day}
              onClick={() => info && setSelectedDate(isSelected ? null : dateStr)}
              className={[
                "aspect-square flex flex-col items-center justify-center rounded-lg relative",
                "text-[11px] font-medium transition-all",
                info ? "cursor-pointer active:scale-90" : "cursor-default",
                isSelected ? "ring-2 ring-primary/60" : "",
                isToday && !isSelected ? "ring-1 ring-muted-foreground/30" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={info ? { backgroundColor: color + "28" } : {}}
              aria-label={info ? `${dateStr}: ${info.dayLabel}` : undefined}
            >
              {info && (
                <div
                  className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
              )}
              <span
                className={
                  info
                    ? "text-foreground font-semibold"
                    : isToday
                    ? "text-foreground/70"
                    : "text-muted-foreground/40"
                }
              >
                {day}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected day detail */}
      {selectedInfo && selectedDate && (
        <div
          className="rounded-xl px-4 py-3 flex items-center justify-between"
          style={{ backgroundColor: VOLUME_STATUS_COLORS[selectedInfo.status] + "18" }}
        >
          <div>
            <p className="text-sm font-bold">{selectedInfo.dayLabel}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(`${selectedDate}T12:00:00`).toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </p>
          </div>
          <div className="text-right">
            <p
              className="text-sm font-bold"
              style={{ color: VOLUME_STATUS_COLORS[selectedInfo.status] }}
            >
              {VOLUME_STATUS_LABELS[selectedInfo.status]}
            </p>
            {selectedInfo.primaryMuscle && (
              <p className="text-xs text-muted-foreground capitalize">
                {selectedInfo.primaryMuscle}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <p className="text-center text-[11px] text-muted-foreground/60 px-2">
          Per-week volume analysis coming soon.
        </p>
      )}

      {/* Volume zone legend */}
      <div className="flex items-center justify-center gap-3 flex-wrap">
        {(Object.keys(VOLUME_STATUS_LABELS) as VolumeStatus[]).map((status) => (
          <div key={status} className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: VOLUME_STATUS_COLORS[status] }}
            />
            <span className="text-[10px] text-muted-foreground">
              {VOLUME_STATUS_LABELS[status]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
