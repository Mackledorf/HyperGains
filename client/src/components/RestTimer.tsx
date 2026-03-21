import { useState, useEffect } from "react";

interface Props {
  seconds: number;
  onDone: () => void;
}

export default function RestTimer({ seconds, onDone }: Props) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) {
      onDone();
      return;
    }
    const timer = setTimeout(() => setRemaining(r => r - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining, onDone]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  return (
    <div className="rounded-2xl bg-card p-5 text-center">
      <p className="micro-label mb-2">Rest Timer</p>
      <p className="text-5xl font-bold tabular-nums tracking-tight text-foreground font-mono">
        {mins}:{secs.toString().padStart(2, "0")}
      </p>
      <button
        onClick={onDone}
        className="mt-3 px-5 py-1.5 rounded-lg bg-destructive/10 text-destructive text-sm font-semibold transition-colors hover:bg-destructive/20"
      >
        Skip
      </button>
    </div>
  );
}
