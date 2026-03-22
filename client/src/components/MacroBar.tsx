export default function MacroBar({
  label, consumed, target, color,
}: { label: string; consumed: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min(100, (consumed / target) * 100) : 0;
  const remaining = Math.max(0, target - consumed);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground font-medium tabular-nums">{Math.round(remaining)}g left</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}
