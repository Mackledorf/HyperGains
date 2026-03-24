import { useState } from "react";
import { useLocation } from "wouter";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import * as store from "@/lib/storage";
import { ChevronLeft, Dumbbell, Info } from "lucide-react";

function defaultLiftName(): string {
  return `Lift – ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export default function QuickLiftSetup() {
  const [, navigate] = useLocation();
  const [name, setName] = useState(defaultLiftName);

  function handleStart() {
    const liftName = name.trim() || defaultLiftName();
    const session = store.createWorkoutSession({
      programId: null,
      isAdHoc: true,
      dayLabel: liftName,
      dayIndex: 0,
      weekNumber: 1,
      status: "in_progress",
      startedAt: new Date().toISOString(),
      completedAt: null,
    });
    navigate(`/workout/${session.id}`);
  }

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/lifts")}
            className="w-8 h-8 rounded-xl flex items-center justify-center bg-card transition-colors active:bg-muted"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h1 className="text-lg font-bold">New Lift</h1>
        </div>

        {/* Icon */}
        <div className="flex justify-center py-4">
          <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center">
            <Dumbbell className="w-10 h-10 text-primary" />
          </div>
        </div>

        {/* Temporary lift notice */}
        <div className="flex items-start gap-3 rounded-xl bg-muted/60 px-4 py-3">
          <Info className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            This lift is <span className="font-semibold text-foreground">temporary</span> — your data will be recorded, but it will not count toward or affect your active program.
          </p>
        </div>

        {/* Name input */}
        <div className="space-y-2">
          <Label htmlFor="lift-name">Lift Name</Label>
          <Input
            id="lift-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleStart()}
            className="rounded-xl h-11"
            autoFocus
          />
        </div>

        {/* Start button */}
        <Button
          className="w-full rounded-xl h-12 text-sm font-bold"
          onClick={handleStart}
        >
          Start Lift
        </Button>
      </div>
    </AppShell>
  );
}
