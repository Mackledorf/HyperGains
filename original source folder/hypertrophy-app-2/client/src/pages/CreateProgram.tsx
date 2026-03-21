import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import * as store from "@/lib/storage";
import { useLocation } from "wouter";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, Plus, X, Dumbbell, Search, Pencil } from "lucide-react";
import type { Program } from "@shared/schema";

const SPLIT_PRESETS: Record<string, { days: string[]; daysPerWeek: number }> = {
  PPL: { days: ["Push", "Pull", "Legs", "Push", "Pull", "Legs"], daysPerWeek: 6 },
  "Upper/Lower": { days: ["Upper", "Lower", "Upper", "Lower"], daysPerWeek: 4 },
  "Bro Split": { days: ["Chest", "Back", "Shoulders", "Arms", "Legs"], daysPerWeek: 5 },
  "Full Body": { days: ["Full Body A", "Full Body B", "Full Body C"], daysPerWeek: 3 },
  Custom: { days: [], daysPerWeek: 0 },
};

const MUSCLE_GROUPS = [
  "Chest", "Back", "Shoulders", "Biceps", "Triceps", "Quads",
  "Hamstrings", "Glutes", "Calves", "Abs", "Traps", "Forearms",
];

const MUSCLE_COLORS: Record<string, string> = {
  Chest: "bg-red-500/15 text-red-400",
  Back: "bg-blue-500/15 text-blue-400",
  Shoulders: "bg-orange-500/15 text-orange-400",
  Biceps: "bg-purple-500/15 text-purple-400",
  Triceps: "bg-pink-500/15 text-pink-400",
  Quads: "bg-emerald-500/15 text-emerald-400",
  Hamstrings: "bg-teal-500/15 text-teal-400",
  Glutes: "bg-amber-500/15 text-amber-400",
  Calves: "bg-lime-500/15 text-lime-400",
  Abs: "bg-cyan-500/15 text-cyan-400",
  Traps: "bg-indigo-500/15 text-indigo-400",
  Forearms: "bg-violet-500/15 text-violet-400",
};

const EXERCISE_DB: Record<string, string[]> = {
  Chest: [
    "Bench Press", "Incline Bench Press", "Decline Bench Press", "Close-Grip Bench Press",
    "DB Bench Press", "Incline DB Press", "Decline DB Press", "DB Fly", "Incline DB Fly",
    "Cable Fly", "Cable Chest Press", "Low-to-High Cable Fly", "High-to-Low Cable Fly",
    "Machine Chest Press", "Machine Incline Press", "Pec Deck", "Smith Machine Bench Press",
    "Dips", "Push-ups",
  ],
  Back: [
    "Barbell Row", "Pendlay Row", "Deadlift",
    "DB Row", "Chest-Supported DB Row", "DB Pullover",
    "Cable Row", "Straight Arm Pulldown", "Single Arm Cable Row", "Face Pull",
    "Lat Pulldown", "Close-Grip Lat Pulldown", "Machine Row", "Machine High Row",
    "Machine Low Row", "T-Bar Row",
    "Pull-ups", "Chin-ups",
  ],
  Shoulders: [
    "OHP", "Barbell Front Raise",
    "DB Shoulder Press", "DB Lateral Raise", "DB Front Raise", "DB Rear Delt Fly",
    "DB Arnold Press",
    "Cable Lateral Raise", "Cable Rear Delt Fly", "Cable Front Raise",
    "Cable Overhead Press", "Cable Upright Row",
    "Machine Shoulder Press", "Machine Lateral Raise", "Machine Reverse Fly",
    "Smith Machine OHP",
    "Upright Row", "Face Pull",
  ],
  Biceps: [
    "Barbell Curl", "EZ Bar Curl",
    "DB Curl", "Hammer Curl", "Incline DB Curl", "Concentration Curl",
    "DB Preacher Curl", "DB Spider Curl",
    "Cable Curl", "Cable Hammer Curl", "Single Arm Cable Curl",
    "Rope Cable Curl", "Straight Bar Cable Curl",
    "Machine Preacher Curl", "Machine Curl",
  ],
  Triceps: [
    "Rope Pushdown", "Straight Bar Pushdown", "V-Bar Pushdown",
    "Single Arm Cable Pushdown", "Rope Overhead Extension",
    "Bent Over Rope Extension",
    "Close-Grip Bench Press", "Skull Crushers", "EZ Bar Skull Crushers",
    "DB Overhead Extension", "DB Kickback", "DB Skull Crushers",
    "Machine Tricep Extension", "Machine Dip",
    "Dips", "Diamond Push-ups",
  ],
  Quads: [
    "Squat", "Front Squat",
    "DB Bulgarian Split Squat", "DB Lunges", "DB Goblet Squat", "DB Step-Up",
    "Leg Press", "Leg Extension", "Hack Squat", "Pendulum Squat",
    "Smith Machine Squat", "Sissy Squat Machine",
    "Bulgarian Split Squat", "Walking Lunges",
  ],
  Hamstrings: [
    "RDL", "Stiff-Leg Deadlift", "Good Morning",
    "DB RDL", "DB Stiff-Leg DL", "Single Leg DB RDL",
    "Cable Pull-Through",
    "Lying Leg Curl", "Seated Leg Curl", "Standing Leg Curl",
    "Machine RDL",
    "Nordic Curl", "Glute Ham Raise",
  ],
  Glutes: [
    "Hip Thrust", "Sumo Deadlift", "Barbell Glute Bridge",
    "DB Hip Thrust", "DB Step-Up", "DB Sumo Squat",
    "Cable Kickback", "Cable Pull-Through", "Cable Hip Abduction",
    "Machine Hip Thrust", "Machine Glute Kickback", "Machine Hip Abduction",
    "Smith Machine Hip Thrust",
    "Glute Bridge", "Frog Pump",
  ],
  Calves: [
    "Machine Calf Raise", "Seated Calf Raise", "Leg Press Calf Raise",
    "Smith Machine Calf Raise", "Machine Standing Calf Raise",
    "DB Calf Raise",
    "Standing Calf Raise", "Single Leg Calf Raise",
  ],
  Abs: [
    "Cable Crunch", "Cable Woodchop", "Cable Pallof Press",
    "Machine Ab Crunch",
    "Weighted Decline Sit-Up", "DB Side Bend",
    "Hanging Leg Raise", "Hanging Knee Raise", "Ab Wheel",
    "Plank", "Decline Sit-Up", "Bicycle Crunch", "Leg Raise",
  ],
  Traps: [
    "Barbell Shrugs",
    "DB Shrugs",
    "Cable Shrugs", "Face Pull",
    "Machine Shrugs", "Smith Machine Shrugs",
    "Farmer Walk", "Upright Row",
  ],
  Forearms: [
    "Barbell Wrist Curl", "Barbell Reverse Curl",
    "DB Wrist Curl", "DB Reverse Curl",
    "Cable Wrist Curl",
    "Farmer Walk", "Dead Hang", "Gripper",
  ],
};

type ExerciseEntry = {
  name: string;
  muscleGroup: string;
};

export default function CreateProgram() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(0);

  const [name, setName] = useState("");
  const [splitType, setSplitType] = useState("");
  const [durationWeeks, setDurationWeeks] = useState(0);
  const [dayLabels, setDayLabels] = useState<string[]>([]);
  const [customDayInput, setCustomDayInput] = useState("");

  const [currentDayIndex, setCurrentDayIndex] = useState(0);
  const [exercisesByDay, setExercisesByDay] = useState<Record<number, ExerciseEntry[]>>({});

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMuscle, setPickerMuscle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [customMode, setCustomMode] = useState(false);
  const [customExName, setCustomExName] = useState("");
  const [customExMuscle, setCustomExMuscle] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pickerOpen && searchRef.current) {
      searchRef.current.focus();
    }
  }, [pickerOpen, pickerMuscle]);

  const handleSelectSplit = (split: string) => {
    setSplitType(split);
    if (split !== "Custom") {
      const preset = SPLIT_PRESETS[split];
      setDayLabels(preset.days);
    } else {
      setDayLabels([]);
    }
  };

  const addCustomDay = () => {
    if (customDayInput.trim()) {
      setDayLabels([...dayLabels, customDayInput.trim()]);
      setCustomDayInput("");
    }
  };

  const removeDay = (idx: number) => {
    setDayLabels(dayLabels.filter((_, i) => i !== idx));
  };

  const addExercise = (exerciseName: string, muscleGroup: string) => {
    const exercises = exercisesByDay[currentDayIndex] || [];
    setExercisesByDay({
      ...exercisesByDay,
      [currentDayIndex]: [
        ...exercises,
        { name: exerciseName, muscleGroup },
      ],
    });
    setPickerOpen(false);
    setPickerMuscle("");
    setSearchQuery("");
    setCustomMode(false);
    setCustomExName("");
    setCustomExMuscle("");
  };

  const removeExercise = (dayIdx: number, exIdx: number) => {
    setExercisesByDay({
      ...exercisesByDay,
      [dayIdx]: (exercisesByDay[dayIdx] || []).filter((_, i) => i !== exIdx),
    });
  };

  const createProgramMutation = useMutation({
    mutationFn: () => {
      const program = store.createProgram({
        name,
        splitType,
        durationWeeks,
        daysPerWeek: dayLabels.length,
        dayLabels,
        createdAt: new Date().toISOString(),
      });

      for (const [dayIdx, exercises] of Object.entries(exercisesByDay)) {
        for (let i = 0; i < exercises.length; i++) {
          const ex = exercises[i];
          store.createProgramExercise({
            programId: program.id,
            dayIndex: parseInt(dayIdx),
            exerciseName: ex.name,
            muscleGroup: ex.muscleGroup,
            sortOrder: i,
            targetSets: 3,
            targetRepsMin: 8,
            targetRepsMax: 12,
            restSeconds: 120,
          });
        }
      }

      return Promise.resolve(program);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["programs"] });
      toast({ title: "Program created" });
      navigate("/");
    },
    onError: () => {
      toast({ title: "Failed to create program", variant: "destructive" });
    },
  });

  const canProceedStep0 = name.trim() && splitType && dayLabels.length > 0 && durationWeeks > 0;
  const currentDayExercises = exercisesByDay[currentDayIndex] || [];

  const getFilteredExercises = () => {
    if (searchQuery.trim()) {
      const results: { name: string; muscleGroup: string }[] = [];
      const q = searchQuery.toLowerCase();
      for (const [muscle, exercises] of Object.entries(EXERCISE_DB)) {
        for (const ex of exercises) {
          if (ex.toLowerCase().includes(q)) {
            results.push({ name: ex, muscleGroup: muscle });
          }
        }
      }
      return results;
    }
    if (pickerMuscle) {
      return (EXERCISE_DB[pickerMuscle] || []).map(name => ({
        name,
        muscleGroup: pickerMuscle,
      }));
    }
    return [];
  };

  const filteredExercises = getFilteredExercises();

  return (
    <AppShell>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => (step === 0 ? navigate("/") : setStep(0))}
            className="w-8 h-8 rounded-xl flex items-center justify-center bg-card transition-colors active:bg-muted"
            data-testid="button-back"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-lg font-bold">Create Program</h1>
            <p className="micro-label">
              Step {step + 1} of 2 — {step === 0 ? "Setup" : "Exercises"}
            </p>
          </div>
        </div>

        {step === 0 && (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label className="micro-label">Program Name</Label>
              <Input
                placeholder="e.g. Summer Hypertrophy Block"
                value={name}
                onChange={e => setName(e.target.value)}
                className="rounded-xl bg-card border-0 h-11"
                data-testid="input-program-name"
              />
            </div>

            <div className="space-y-2">
              <Label className="micro-label">Mesocycle Duration (weeks)</Label>
              <Input
                type="number"
                min={1}
                max={52}
                value={durationWeeks || ""}
                onChange={e => setDurationWeeks(parseInt(e.target.value) || 0)}
                placeholder="e.g. 6"
                className="rounded-xl bg-card border-0 h-11"
                data-testid="input-duration-weeks"
              />
            </div>

            <div className="space-y-2">
              <Label className="micro-label">Split Type</Label>
              <div className="grid grid-cols-2 gap-2">
                {Object.keys(SPLIT_PRESETS).map(split => (
                  <button
                    key={split}
                    onClick={() => handleSelectSplit(split)}
                    className={`p-3 rounded-xl text-left transition-all ${
                      splitType === split
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-foreground active:bg-muted"
                    }`}
                    data-testid={`button-split-${split.toLowerCase().replace(/[/ ]/g, "-")}`}
                  >
                    <span className="text-sm font-semibold">{split}</span>
                    {split !== "Custom" && (
                      <p className={`text-xs mt-0.5 ${splitType === split ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                        {SPLIT_PRESETS[split].daysPerWeek} days/week
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {splitType === "Custom" && (
              <div className="space-y-2">
                <Label className="micro-label">Training Days</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Day name (e.g. Push)"
                    value={customDayInput}
                    onChange={e => setCustomDayInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addCustomDay()}
                    className="rounded-xl bg-card border-0 h-10"
                    data-testid="input-custom-day"
                  />
                  <Button onClick={addCustomDay} variant="secondary" className="rounded-xl px-4 h-10">
                    Add
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {dayLabels.map((label, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-medium">
                      {label}
                      <button onClick={() => removeDay(i)} className="hover:text-destructive">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {splitType && splitType !== "Custom" && dayLabels.length > 0 && (
              <div className="space-y-2">
                <Label className="micro-label">Training Days</Label>
                <div className="flex flex-wrap gap-1.5">
                  {dayLabels.map((label, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-lg bg-card text-xs font-medium text-foreground">
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <Button
              onClick={() => setStep(1)}
              disabled={!canProceedStep0}
              className="w-full rounded-xl h-11"
              data-testid="button-next-step"
            >
              Next: Add Exercises
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {dayLabels.map((label, idx) => {
                const count = (exercisesByDay[idx] || []).length;
                return (
                  <button
                    key={idx}
                    onClick={() => { setCurrentDayIndex(idx); setPickerOpen(false); }}
                    className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                      currentDayIndex === idx
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-muted-foreground"
                    }`}
                    data-testid={`tab-day-${idx}`}
                  >
                    {label}
                    {count > 0 && (
                      <span className="ml-1.5 text-xs opacity-70">({count})</span>
                    )}
                  </button>
                );
              })}
            </div>

            {currentDayExercises.length > 0 && (
              <div className="rounded-2xl bg-card overflow-hidden">
                {currentDayExercises.map((ex, idx) => (
                  <div
                    key={idx}
                    className={`px-3.5 py-3 flex items-center gap-2.5 ${
                      idx > 0 ? "border-t border-border/30" : ""
                    }`}
                    data-testid={`card-exercise-${idx}`}
                  >
                    <span className="text-xs text-muted-foreground font-mono w-5 text-center flex-shrink-0">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{ex.name}</p>
                    </div>
                    <span className={`flex-shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${
                      MUSCLE_COLORS[ex.muscleGroup] || "bg-muted text-muted-foreground"
                    }`}>
                      {ex.muscleGroup}
                    </span>
                    <button
                      onClick={() => removeExercise(currentDayIndex, idx)}
                      className="flex-shrink-0 p-1 rounded-lg text-muted-foreground hover:text-destructive transition-colors"
                      data-testid={`button-remove-exercise-${idx}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {currentDayExercises.length === 0 && !pickerOpen && (
              <div className="text-center py-6 text-muted-foreground">
                <Dumbbell className="w-7 h-7 mx-auto mb-2 opacity-20" />
                <p className="text-sm">No exercises yet for {dayLabels[currentDayIndex]}</p>
              </div>
            )}

            {pickerOpen ? (
              <div className="rounded-2xl bg-card overflow-hidden">
                <div className="p-3 border-b border-border/30">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      ref={searchRef}
                      placeholder="Search exercises..."
                      value={searchQuery}
                      onChange={e => { setSearchQuery(e.target.value); setPickerMuscle(""); }}
                      className="pl-9 rounded-xl bg-muted border-0 h-9 text-sm"
                      data-testid="input-search-exercise"
                    />
                  </div>
                </div>

                {!customMode && (
                  <>
                    {!searchQuery && (
                      <div className="p-3 border-b border-border/30">
                        <div className="flex flex-wrap gap-1.5">
                          {MUSCLE_GROUPS.map(mg => (
                            <button
                              key={mg}
                              onClick={() => { setPickerMuscle(mg); setSearchQuery(""); }}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                                pickerMuscle === mg
                                  ? MUSCLE_COLORS[mg] || "bg-primary/10 text-primary"
                                  : "bg-muted text-muted-foreground active:bg-muted/80"
                              }`}
                              data-testid={`chip-muscle-${mg.toLowerCase()}`}
                            >
                              {mg}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {(searchQuery || pickerMuscle) && (
                      <div className="max-h-60 overflow-y-auto">
                        {filteredExercises.length > 0 ? (
                          filteredExercises.map((ex, idx) => (
                            <button
                              key={`${ex.muscleGroup}-${ex.name}-${idx}`}
                              onClick={() => addExercise(ex.name, ex.muscleGroup)}
                              className="w-full px-4 py-2.5 text-left flex items-center justify-between hover:bg-white/[0.03] active:bg-white/[0.06] transition-colors border-t border-border/20 first:border-0"
                              data-testid={`option-exercise-${idx}`}
                            >
                              <span className="text-sm font-medium">{ex.name}</span>
                              {searchQuery && (
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${
                                  MUSCLE_COLORS[ex.muscleGroup] || "bg-muted text-muted-foreground"
                                }`}>
                                  {ex.muscleGroup}
                                </span>
                              )}
                            </button>
                          ))
                        ) : (
                          <div className="p-4 text-center text-sm text-muted-foreground">
                            No exercises found
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {customMode && (
                  <div className="p-3 space-y-3">
                    <div className="space-y-1.5">
                      <Label className="micro-label">Exercise Name</Label>
                      <Input
                        placeholder="e.g. Reverse Pec Deck"
                        value={customExName}
                        onChange={e => setCustomExName(e.target.value)}
                        className="rounded-xl bg-muted border-0 h-9 text-sm"
                        autoFocus
                        data-testid="input-custom-exercise-name"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="micro-label">Muscle Group</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {MUSCLE_GROUPS.map(mg => (
                          <button
                            key={mg}
                            onClick={() => setCustomExMuscle(mg)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                              customExMuscle === mg
                                ? MUSCLE_COLORS[mg] || "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground"
                            }`}
                            data-testid={`chip-custom-muscle-${mg.toLowerCase()}`}
                          >
                            {mg}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Button
                      onClick={() => {
                        if (customExName.trim() && customExMuscle) {
                          addExercise(customExName.trim(), customExMuscle);
                        }
                      }}
                      disabled={!customExName.trim() || !customExMuscle}
                      className="w-full rounded-xl h-9 text-sm"
                      data-testid="button-add-custom-exercise"
                    >
                      Add Custom Exercise
                    </Button>
                  </div>
                )}

                <div className="p-3 border-t border-border/30 flex items-center justify-between">
                  <button
                    onClick={() => setCustomMode(!customMode)}
                    className="flex items-center gap-1.5 text-xs font-medium text-primary"
                    data-testid="button-toggle-custom"
                  >
                    <Pencil className="w-3 h-3" />
                    {customMode ? "Browse Exercises" : "Custom Exercise"}
                  </button>
                  <button
                    onClick={() => { setPickerOpen(false); setCustomMode(false); setSearchQuery(""); setPickerMuscle(""); }}
                    className="text-xs font-medium text-muted-foreground"
                    data-testid="button-close-picker"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <Button
                variant="ghost"
                onClick={() => setPickerOpen(true)}
                className="w-full rounded-xl h-10 text-muted-foreground border border-dashed border-border"
                data-testid="button-add-exercise"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Exercise
              </Button>
            )}

            <Button
              onClick={() => createProgramMutation.mutate()}
              disabled={createProgramMutation.isPending || Object.values(exercisesByDay).every(arr => arr.length === 0)}
              className="w-full rounded-xl h-11"
              data-testid="button-create-program-final"
            >
              {createProgramMutation.isPending ? "Creating..." : "Create Program"}
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
