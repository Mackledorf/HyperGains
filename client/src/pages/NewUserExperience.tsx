/**
 * NewUserExperience — shown once after account creation.
 * 4 animated steps:
 *   1. Name (vestaboard flip animation)
 *   2. About you (sex · age · height · weight · units)
 *   3. Goals (weight direction · fitness goals · rate)
 *   4. Calorie & macro targets (TDEE-based suggestions)
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, Check } from "lucide-react";
import * as store from "@/lib/storage";
import type { UserProfile } from "@shared/schema";
import MacroBar from "@/components/MacroBar";

// ─────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────

const FUNNY_NAMES = [
  "Lord Penguin",
  "The Architect",
  "Big Dave",
  "Sir Liftsalot",
  "CrunchMaster",
  "Karen",
  "John",
  "The Shadow",
  "CaptainCalves",
  "Mike",
  "El Bicep",
  "Swole Patrol",
  "GainzGuru",
  "Thunderquads",
  "Flex Luthor",
  "Brochacho",
  "The Grinder",
  "CoachPotato",
  "IronMike",
  "Dave",
];

const GENDERS = [
  { key: "male", label: "Male" },
  { key: "female", label: "Female" },
  { key: "other", label: "Other" },
  { key: "prefer_not_to_say", label: "Prefer not to say" },
] as const;

const ACTIVITY_LEVELS = [
  { key: "sedentary",  label: "Sedentary",        desc: "Desk job, no exercise",       multiplier: 1.2 },
  { key: "light",     label: "Lightly Active",    desc: "1–3 days/wk",                multiplier: 1.375 },
  { key: "moderate",  label: "Moderately Active", desc: "3–5 days/wk",                multiplier: 1.55 },
  { key: "active",    label: "Active",            desc: "6–7 days/wk",                multiplier: 1.725 },
  { key: "very_active", label: "Very Active",     desc: "Twice daily / physical job",  multiplier: 1.9 },
] as const;

const WEIGHT_GOAL_OPTIONS = [
  { key: "gain",     label: "Gain weight" },
  { key: "lose",     label: "Lose weight" },
  { key: "maintain", label: "Stay where I'm at" },
] as const;

const RATE_OPTIONS_LOSE = [-0.25, -0.5, -1];
const RATE_OPTIONS_GAIN = [0.25, 0.5, 1];

// ─────────────────────────────────────────────────
// TDEE helpers
// ─────────────────────────────────────────────────

function computeTDEE(
  gender: UserProfile["gender"],
  weightKg: number,
  heightCm: number,
  ageYears: number,
  activityMultiplier: number
): number {
  let bmr: number;
  if (gender === "male") {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * ageYears + 5;
  } else if (gender === "female") {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * ageYears - 161;
  } else {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * ageYears - 78;
  }
  return Math.round(bmr * activityMultiplier);
}

function rateToDailyKcal(rateLbs: number): number {
  // 1 lb body fat ≈ 3500 kcal; rateLbs can be negative (lose)
  return Math.round((rateLbs * 3500) / 7);
}

function lbsToKg(lbs: number) { return Math.round((lbs / 2.2046) * 10) / 10; }
function ftInToCm(ft: number, inches: number) {
  return Math.round((ft * 12 + inches) * 2.54 * 10) / 10;
}

// ─────────────────────────────────────────────────
// Vestaboard flip animation component
// ─────────────────────────────────────────────────

/** A single character cell that flips through characters before settling. */
function FlipCell({ targetChar, delay }: { targetChar: string; delay: number }) {
  const [displayChar, setDisplayChar] = useState(" ");
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz";
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let elapsed = 0;
    const TOTAL = 600; // ms per cell
    const TICK = 40;

    const t = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        elapsed += TICK;
        if (elapsed >= TOTAL) {
          setDisplayChar(targetChar);
          if (intervalRef.current) clearInterval(intervalRef.current);
        } else {
          setDisplayChar(chars[Math.floor(Math.random() * chars.length)]);
        }
      }, TICK);
    }, delay);

    return () => {
      clearTimeout(t);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetChar, delay]);

  return (
    <span
      className="inline-flex items-center justify-center w-7 h-9 bg-zinc-900 border border-zinc-700 rounded-sm text-sm font-mono font-bold text-amber-400 select-none"
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      {displayChar}
    </span>
  );
}

/** Full flip-board showing a name, cycling through CYCLES random names before landing. */
const CYCLES = 3;
function VestaBoard({ onDone }: { onDone: (name: string) => void }) {
  const finalName = useRef(
    FUNNY_NAMES[Math.floor(Math.random() * FUNNY_NAMES.length)]
  );
  const [displayName, setDisplayName] = useState(
    FUNNY_NAMES[Math.floor(Math.random() * FUNNY_NAMES.length)]
  );
  const cycleRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runCycle = useCallback(() => {
    if (cycleRef.current >= CYCLES) {
      setDisplayName(finalName.current);
      // Small delay after landing so user can read it
      timerRef.current = setTimeout(() => onDone(finalName.current), 900);
      return;
    }
    cycleRef.current++;
    const next =
      cycleRef.current === CYCLES
        ? finalName.current
        : FUNNY_NAMES[Math.floor(Math.random() * FUNNY_NAMES.length)];
    setDisplayName(next);
    // Each cycle takes ~700ms per char + a short pause
    const duration = Math.max(next.length, 4) * 90 + 400;
    timerRef.current = setTimeout(runCycle, duration);
  }, [onDone]);

  useEffect(() => {
    timerRef.current = setTimeout(runCycle, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-wrap gap-1 items-center justify-start my-4">
      {displayName.split("").map((ch, i) => (
        <FlipCell key={`${i}-${displayName}`} targetChar={ch} delay={i * 35} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────
// Shared UI helpers
// ─────────────────────────────────────────────────

function PillButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition-all active:scale-95 ${
        selected
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {selected && <Check className="w-3 h-3 shrink-0" />}
      {children}
    </button>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-xl overflow-hidden border border-border text-xs font-semibold">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 py-2.5 transition-colors ${
            value === opt.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────
// Step 1 — Name
// ─────────────────────────────────────────────────

function Step1Name({
  onNext,
  userId,
}: {
  onNext: (name: string) => void;
  userId: string;
}) {
  const [name, setName] = useState("");
  const [animDone, setAnimDone] = useState(false);

  const handleAnimDone = (landedName: string) => {
    setAnimDone(true);
    // Pre-fill the input with the funny name if user hasn't typed anything
    setName((prev) => (prev.trim() === "" ? landedName : prev));
  };

  const handleNext = () => {
    const finalName = name.trim() || "Hero";
    store.setUserName(userId, finalName);
    onNext(finalName);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">What should we call you?</h1>
        <p className="text-sm text-muted-foreground mt-1">
          A nickname is totally fine.{" "}
          <span className="text-muted-foreground/70">
            This name is just for you — it isn't shared or used anywhere else.
          </span>
        </p>
      </div>

      <VestaBoard onDone={handleAnimDone} />

      {animDone && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name or nickname"
            className="h-12 rounded-xl bg-card border-0 text-base"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleNext()}
          />
          <Button
            onClick={handleNext}
            className="w-full h-12 rounded-xl text-sm font-bold"
            disabled={!name.trim()}
          >
            Continue
          </Button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────
// Step 2 — About You
// ─────────────────────────────────────────────────

type Step2Data = {
  gender: UserProfile["gender"];
  ageYears: string;
  unitSystem: "imperial" | "metric";
  heightFt: string;
  heightIn: string;
  heightCm: string;
  weightDisplay: string;
};

function Step2About({
  initial,
  onNext,
  onBack,
}: {
  initial: Step2Data;
  onNext: (data: Step2Data) => void;
  onBack: () => void;
}) {
  const [gender, setGender] = useState<UserProfile["gender"]>(initial.gender);
  const [ageYears, setAgeYears] = useState(initial.ageYears);
  const [unitSystem, setUnitSystem] = useState<"imperial" | "metric">(initial.unitSystem);
  const [heightFt, setHeightFt] = useState(initial.heightFt);
  const [heightIn, setHeightIn] = useState(initial.heightIn);
  const [heightCm, setHeightCm] = useState(initial.heightCm);
  const [weightDisplay, setWeightDisplay] = useState(initial.weightDisplay);

  const handleNext = () => {
    onNext({ gender, ageYears, unitSystem, heightFt, heightIn, heightCm, weightDisplay });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tell me a little about yourself</h1>
        <p className="text-sm text-muted-foreground mt-1">I am…</p>
      </div>

      {/* Sex */}
      <div className="space-y-2">
        <span className="text-sm font-semibold text-foreground">Sex</span>
        <div className="flex flex-wrap gap-2">
          {GENDERS.map(({ key, label }) => (
            <PillButton
              key={key}
              selected={gender === key}
              onClick={() => setGender(key)}
            >
              {label}
            </PillButton>
          ))}
        </div>
      </div>

      {/* Age */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground" htmlFor="nux-age">
          Age
        </label>
        <div className="relative w-36">
          <Input
            id="nux-age"
            type="number"
            inputMode="numeric"
            value={ageYears}
            onChange={(e) => setAgeYears(e.target.value)}
            placeholder="25"
            className="rounded-xl bg-card border-0 h-11 text-sm pr-10"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">yrs</span>
        </div>
      </div>

      {/* Height */}
      <div className="space-y-2">
        <span className="text-sm font-semibold text-foreground">Height</span>
        {unitSystem === "imperial" ? (
          <div className="flex gap-2">
            <div className="relative w-24">
              <Input
                type="number"
                inputMode="numeric"
                value={heightFt}
                onChange={(e) => setHeightFt(e.target.value)}
                placeholder="5"
                className="rounded-xl bg-card border-0 h-11 text-sm pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">ft</span>
            </div>
            <div className="relative w-24">
              <Input
                type="number"
                inputMode="numeric"
                value={heightIn}
                onChange={(e) => setHeightIn(e.target.value)}
                placeholder="10"
                className="rounded-xl bg-card border-0 h-11 text-sm pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">in</span>
            </div>
          </div>
        ) : (
          <div className="relative w-36">
            <Input
              type="number"
              inputMode="decimal"
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              placeholder="178"
              className="rounded-xl bg-card border-0 h-11 text-sm pr-10"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">cm</span>
          </div>
        )}
      </div>

      {/* Weight */}
      <div className="space-y-2">
        <span className="text-sm font-semibold text-foreground">Weight</span>
        <div className="relative w-36">
          <Input
            type="number"
            inputMode="decimal"
            value={weightDisplay}
            onChange={(e) => setWeightDisplay(e.target.value)}
            placeholder={unitSystem === "imperial" ? "175" : "79"}
            className="rounded-xl bg-card border-0 h-11 text-sm pr-12"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {unitSystem === "imperial" ? "lbs" : "kg"}
          </span>
        </div>
      </div>

      {/* Units — compact square toggle */}
      <div className="space-y-1.5">
        <span className="text-xs text-muted-foreground">Units</span>
        <div className="flex gap-2">
          {(["imperial", "metric"] as const).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setUnitSystem(u)}
              className={`px-4 py-2.5 rounded-xl text-xs font-semibold border transition-colors ${
                unitSystem === u
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {u === "imperial" ? "Imperial" : "Metric"}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button variant="ghost" size="icon" className="rounded-xl h-12 w-12 shrink-0" onClick={onBack}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <Button className="flex-1 h-12 rounded-xl text-sm font-bold" onClick={handleNext}>
          Continue
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────
// Step 3 — Goals
// ─────────────────────────────────────────────────

type Step3Data = {
  bodyWeightGoal: "gain" | "lose" | "maintain";
  weeklyRateLbs: number | null;
  activityLevel: typeof ACTIVITY_LEVELS[number]["key"];
};

function Step3Goals({
  initial,
  onNext,
  onBack,
}: {
  initial: Step3Data;
  onNext: (data: Step3Data) => void;
  onBack: () => void;
}) {
  const [bodyWeightGoal, setBodyWeightGoal] = useState<"gain" | "lose" | "maintain">(
    initial.bodyWeightGoal
  );
  const [weeklyRateLbs, setWeeklyRateLbs] = useState<number | null>(initial.weeklyRateLbs);
  const [activityLevel, setActivityLevel] = useState<typeof ACTIVITY_LEVELS[number]["key"]>(
    initial.activityLevel
  );

  const rateOptions =
    bodyWeightGoal === "lose" ? RATE_OPTIONS_LOSE : RATE_OPTIONS_GAIN;

  // When weight goal changes, reset rate if it doesn't make sense anymore
  const handleWeightGoalChange = (goal: "gain" | "lose" | "maintain") => {
    setBodyWeightGoal(goal);
    if (goal === "maintain") {
      setWeeklyRateLbs(null);
    } else {
      // Reset to a reasonable default for the new direction
      setWeeklyRateLbs(goal === "lose" ? -0.5 : 0.5);
    }
  };

  const handleNext = () => {
    onNext({ bodyWeightGoal, weeklyRateLbs, activityLevel });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">I want to…</h1>
      </div>

      {/* Weight direction (single select) */}
      <div className="space-y-2">
        <span className="text-sm font-semibold text-foreground">Weight goal</span>
        <div className="flex flex-col gap-2">
          {WEIGHT_GOAL_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => handleWeightGoalChange(key)}
              className={`flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold border transition-all text-left ${
                bodyWeightGoal === key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              {bodyWeightGoal === key && <Check className="w-4 h-4 shrink-0" />}
            </button>
          ))}
        </div>
      </div>

      {/* Rate question — only shown when gain or lose */}
      {bodyWeightGoal !== "maintain" && (
        <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
          <span className="text-sm font-semibold text-foreground">
            How fast?{" "}
            <span className="text-muted-foreground/60 font-normal">lbs per week</span>
          </span>
          <div className="flex gap-2 flex-wrap">
            {rateOptions.map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => setWeeklyRateLbs(rate)}
                className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
                  weeklyRateLbs === rate
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {rate > 0 ? `+${rate}` : rate} lb/wk
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Activity level */}
      <div className="space-y-2">
        <span className="text-sm font-semibold text-foreground">Activity level</span>
        <div className="flex flex-col gap-1.5">
          {ACTIVITY_LEVELS.map(({ key, label, desc }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActivityLevel(key)}
              className={`flex items-center justify-between px-4 py-2.5 rounded-xl text-sm border transition-all text-left ${
                activityLevel === key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <div>
                <span className="font-semibold">{label}</span>
                <span className={`text-xs ms-2 ${activityLevel === key ? "text-primary/70" : "text-muted-foreground/60"}`}>
                  {desc}
                </span>
              </div>
              {activityLevel === key && <Check className="w-4 h-4 shrink-0" />}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button variant="ghost" size="icon" className="rounded-xl h-12 w-12 shrink-0" onClick={onBack}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <Button
          className="flex-1 h-12 rounded-xl text-sm font-bold"
          onClick={handleNext}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────
// Step 4 — Calorie & Macro Goals
// ─────────────────────────────────────────────────

type CalorieMode = "surplus" | "maintenance" | "deficit";

function Step4Macros({
  step2,
  step3,
  onFinish,
  onBack,
  userId,
}: {
  step2: Step2Data;
  step3: Step3Data;
  onFinish: () => void;
  onBack: () => void;
  userId: string;
}) {
  // Determine initial mode from weight goal
  const initialMode: CalorieMode =
    step3.bodyWeightGoal === "gain"
      ? "surplus"
      : step3.bodyWeightGoal === "lose"
      ? "deficit"
      : "maintenance";

  const [mode, setMode] = useState<CalorieMode>(initialMode);
  const [proteinRatio, setProteinRatio] = useState<"1g" | "0.8g">("1g");

  const activityMultiplier = ACTIVITY_LEVELS.find((a) => a.key === step3.activityLevel)!.multiplier;

  const age = parseInt(step2.ageYears) || null;

  // Compute base TDEE
  const baseTDEE = (() => {
    if (!weightKg || !heightCm || !age) return 2000; // fallback
    return computeTDEE(step2.gender, weightKg, heightCm, age, activityMultiplier);
  })();

  // Apply mode offset
  const rateKcal = (() => {
    if (mode === "maintenance") return 0;
    const absRate = Math.abs(step3.weeklyRateLbs ?? 0.5);
    const kcal = rateToDailyKcal(absRate);
    return mode === "surplus" ? kcal : -kcal;
  })();

  const suggestedCalories = baseTDEE + rateKcal;

  // Protein target
  const proteinBase = weightLbs
    ? Math.round(weightLbs * (proteinRatio === "1g" ? 1 : 0.8))
    : 150;
  const proteinKcal = proteinBase * 4;

  // Fat — ~25% of calories
  const fatG = Math.round((suggestedCalories * 0.25) / 9);
  const fatKcal = fatG * 9;

  // Carbs — remainder
  const carbsKcal = Math.max(0, suggestedCalories - proteinKcal - fatKcal);
  const carbsG = Math.round(carbsKcal / 4);

  const handleFinish = () => {
    const profile = store.getProfile();
    // Resolve height/weight into metric for storage
    const storeWeightKg = weightKg;
    const storeHeightCm = heightCm;
    const storeAgeYears = age;

    store.saveProfile({
      gender: step2.gender,
      heightCm: storeHeightCm,
      weightKg: storeWeightKg,
      unitSystem: step2.unitSystem,
      goals: [],
      ageYears: storeAgeYears,
      activityLevel: step3.activityLevel as UserProfile["activityLevel"],
      bodyWeightGoal: step3.bodyWeightGoal,
      weeklyRateLbs: step3.weeklyRateLbs,
      id: profile?.id,
      createdAt: profile?.createdAt,
    });

    store.saveNutritionGoals({
      calorieTarget: suggestedCalories,
      proteinTargetG: proteinBase,
      carbsTargetG: carbsG,
      fatTargetG: fatG,
      waterTargetOz: 64,
    });

    store.setNuxComplete(userId);
    onFinish();
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nutritional goals</h1>
      </div>

      <SegmentedControl
        options={[
          { label: "Deficit", value: "deficit" },
          { label: "Maintenance", value: "maintenance" },
          { label: "Surplus", value: "surplus" },
        ]}
        value={mode}
        onChange={setMode}
      />

      {/* Calorie target (Food.tsx style display) */}
      <div className="rounded-2xl bg-card p-4 space-y-5">
        <div className="flex flex-col items-center text-center pb-2">
          <p className="text-5xl font-bold tabular-nums leading-none tracking-tighter">{suggestedCalories}</p>
          <p className="text-xs text-muted-foreground mt-2 uppercase tracking-widest font-semibold text-primary/80">kcal / day</p>
        </div>

        {/* Protein ratio toggle */}
        <div className="flex items-center justify-between border-t border-border/50 pt-4">
          <span className="text-xs font-semibold">Protein target</span>
          <div className="flex rounded-lg overflow-hidden border border-border text-xs font-semibold">
            {(["1g", "0.8g"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setProteinRatio(r)}
                className={`px-3 py-1.5 transition-colors ${
                  proteinRatio === r
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {r}/lb
              </button>
            ))}
          </div>
        </div>

        {/* Macro rows */}
        <div className="space-y-4 pt-2">
          <MacroBar label="Carbs"   consumed={0} target={carbsG}   color="#eab308" />
          <MacroBar label="Protein" consumed={0} target={proteinBase} color="#f97316" />
          <MacroBar label="Fat"     consumed={0} target={fatG}     color="#3b82f6" />
        </div>

        {!weightLbs && (
          <p className="text-xs text-muted-foreground/70 text-center pt-2">
            Add your weight for a personalised protein suggestion.
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button variant="ghost" size="icon" className="rounded-xl h-12 w-12 shrink-0" onClick={onBack}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <Button className="flex-1 h-12 rounded-xl text-sm font-bold" onClick={handleFinish}>
          Let's Go
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────
// Progress dots
// ─────────────────────────────────────────────────

function ProgressDots({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex gap-1.5 items-center">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i < step ? "w-5 h-1.5 bg-primary" : i === step ? "w-5 h-1.5 bg-primary" : "w-1.5 h-1.5 bg-muted"
          }`}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────
// Root component
// ─────────────────────────────────────────────────

const EMPTY_STEP2: Step2Data = {
  gender: "prefer_not_to_say",
  ageYears: "",
  unitSystem: "imperial",
  heightFt: "",
  heightIn: "",
  heightCm: "",
  weightDisplay: "",
};

const EMPTY_STEP3: Step3Data = {
  bodyWeightGoal: "maintain",
  weeklyRateLbs: null,
  activityLevel: "moderate",
};

export default function NewUserExperience({
  userId,
  onNuxComplete,
}: {
  userId: string;
  onNuxComplete?: () => void;
}) {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(0);
  const [step2Data, setStep2Data] = useState<Step2Data>(EMPTY_STEP2);
  const [step3Data, setStep3Data] = useState<Step3Data>(EMPTY_STEP3);

  const handleFinish = () => {
    if (onNuxComplete) {
      onNuxComplete();
    } else {
      navigate("/");
    }
  };

  return (
    <div className="min-h-screen bg-background px-6 py-8 flex flex-col">
      <div className="w-full max-w-sm mx-auto flex flex-col flex-1">
        {/* Progress + step indicator */}
        <div className="flex items-center justify-between mb-8">
          <ProgressDots step={step} total={4} />
          <span className="text-xs text-muted-foreground">
            {step + 1} / 4
          </span>
        </div>

        {/* Step content */}
        <div className="flex-1">
          {step === 0 && (
            <Step1Name
              userId={userId}
              onNext={() => setStep(1)}
            />
          )}
          {step === 1 && (
            <Step2About
              initial={step2Data}
              onNext={(data) => { setStep2Data(data); setStep(2); }}
              onBack={() => setStep(0)}
            />
          )}
          {step === 2 && (
            <Step3Goals
              initial={step3Data}
              onNext={(data) => { setStep3Data(data); setStep(3); }}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <Step4Macros
              step2={step2Data}
              step3={step3Data}
              onFinish={handleFinish}
              onBack={() => setStep(2)}
              userId={userId}
            />
          )}
        </div>
      </div>
    </div>
  );
}
