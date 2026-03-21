import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_HEADERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export interface SessionDayInfo {
  color: string;       // hex color based on feeling score
  dayLabel: string;    // e.g. "Push Day"
  duration: number | null; // workout duration in minutes
  feelingLabel: string; // e.g. "Good", "Amazing"
}

interface Props {
  year: number;
  month: number; // 0-indexed
  sessions: Map<string, SessionDayInfo>; // "YYYY-MM-DD" → info
  onMonthChange: (year: number, month: number) => void;
}

export default function CalendarView({ year, month, sessions, onMonthChange }: Props) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Sunday

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

  const selectedInfo = selectedDate ? sessions.get(selectedDate) : null;

  const workoutCount = sessions.size;

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
        {/* Leading empty cells */}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}

        {/* Day cells */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const info = sessions.get(dateStr);
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;

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
              style={
                info
                  ? {
                      backgroundColor: info.color + "28",
                    }
                  : {}
              }
              aria-label={info ? `${dateStr}: ${info.dayLabel}` : undefined}
            >
              {/* Colored dot indicator for workout days */}
              {info && (
                <div
                  className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: info.color }}
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
          style={{ backgroundColor: selectedInfo.color + "18" }}
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
              style={{ color: selectedInfo.color }}
            >
              {selectedInfo.feelingLabel}
            </p>
            {selectedInfo.duration !== null && (
              <p className="text-xs text-muted-foreground">
                {selectedInfo.duration} min
              </p>
            )}
          </div>
        </div>
      )}

      {/* Feeling color legend */}
      <div className="flex items-center justify-center gap-4 flex-wrap">
        {[
          { color: "#ef4444", label: "Rough" },
          { color: "#eab308", label: "Okay" },
          { color: "#22c55e", label: "Good" },
          { color: "#3b82f6", label: "Amazing" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="text-[10px] text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
