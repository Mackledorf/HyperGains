import { useState } from "react";
import { useLocation } from "wouter";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import * as store from "@/lib/storage";
import { ChevronLeft, Dumbbell } from "lucide-react";

function defaultWorkoutName(): string {
  return `Workout – ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export default function QuickWorkoutSetup() {
  const [, navigate] = useLocation();
  const [name, setName] = useState(defaultWorkoutName);

  function handleStart() {
    const workoutName = name.trim() || defaultWorkoutName();
    const session = store.createWorkoutSession({
      programId: null,
      isAdHoc: true,
      dayLabel: workoutName,
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
            onClick={() => navigate("/workouts")}
            className="w-8 h-8 rounded-xl flex items-center justify-center bg-card transition-colors active:bg-muted"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h1 className="text-lg font-bold">New Workout</h1>
        </div>

        {/* Icon */}
        <div className="flex justify-center py-4">
          <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center">
            <Dumbbell className="w-10 h-10 text-primary" />
          </div>
        </div>

        {/* Name input */}
        <div className="space-y-2">
          <Label htmlFor="workout-name">Workout Name</Label>
          <Input
            id="workout-name"
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
          Start Workout
        </Button>
      </div>
    </AppShell>
  );
}
