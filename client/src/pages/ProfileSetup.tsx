import { useState } from "react";
import { useLocation } from "wouter";
import { Dumbbell, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as store from "@/lib/storage";
import type { UserProfile } from "@shared/schema";

// ── Constants ──────────────────────────────────────────────

const GOALS = [
  { key: "build_muscle", label: "Build Muscle" },
  { key: "lose_fat", label: "Lose Fat" },
  { key: "get_stronger", label: "Get Stronger" },
  { key: "improve_endurance", label: "Improve Endurance" },
  { key: "maintain", label: "Maintain" },
] as const;

const GENDERS = [
  { key: "male", label: "Male" },
  { key: "female", label: "Female" },
  { key: "other", label: "Other" },
  { key: "prefer_not_to_say", label: "Prefer not to say" },
] as const;

// ── Conversion helpers ─────────────────────────────────────

function lbsToKg(lbs: number) { return Math.round(lbs / 2.2046 * 10) / 10; }
function ftInToCm(ft: number, inches: number) { return Math.round((ft * 12 + inches) * 2.54 * 10) / 10; }

// ── Component ──────────────────────────────────────────────

export default function ProfileSetup() {
  const [, navigate] = useLocation();

  const [gender, setGender] = useState<UserProfile["gender"]>("prefer_not_to_say");
  const [unitSystem, setUnitSystem] = useState<"imperial" | "metric">("imperial");
  const [goals, setGoals] = useState<string[]>([]);

  const [heightFt, setHeightFt] = useState("");
  const [heightIn, setHeightIn] = useState("");
  const [heightCmDisplay, setHeightCmDisplay] = useState("");
  const [weightDisplay, setWeightDisplay] = useState("");

  const toggleGoal = (key: string) => {
    setGoals((prev) =>
      prev.includes(key) ? prev.filter((g) => g !== key) : [...prev, key]
    );
  };

  const handleContinue = () => {
    // Compute metric values for storage
    let heightCm: number | null = null;
    if (unitSystem === "imperial") {
      const ft = parseInt(heightFt) || 0;
      const inches = parseInt(heightIn) || 0;
      if (ft > 0 || inches > 0) heightCm = ftInToCm(ft, inches);
    } else {
      const cm = parseFloat(heightCmDisplay);
      if (!isNaN(cm) && cm > 0) heightCm = cm;
    }

    let weightKg: number | null = null;
    const weightVal = parseFloat(weightDisplay);
    if (!isNaN(weightVal) && weightVal > 0) {
      weightKg = unitSystem === "imperial" ? lbsToKg(weightVal) : weightVal;
    }

    store.saveProfile({ gender, heightCm, weightKg, unitSystem, goals });
    navigate("/");
  };

  const handleSkip = () => {
    navigate("/");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background px-6 py-8">
      <div className="w-full max-w-xs mx-auto space-y-8 flex-1">

        {/* Logo + intro */}
        <div className="flex flex-col items-center gap-3 pt-4">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center">
            <Dumbbell className="w-7 h-7 text-primary-foreground" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-tight">Let's set you up</h1>
            <p className="text-xs text-muted-foreground mt-1">
              This helps us tailor your experience. You can update this anytime.
            </p>
          </div>
        </div>

        <div className="space-y-5">

          {/* Unit system */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Units
            </label>
            <div className="flex rounded-xl overflow-hidden border border-border text-xs font-semibold">
              {(["imperial", "metric"] as const).map((u) => (
                <button
                  key={u}
                  onClick={() => setUnitSystem(u)}
                  className={`flex-1 py-2.5 transition-colors ${
                    unitSystem === u
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {u === "imperial" ? "Imperial (lbs, ft)" : "Metric (kg, cm)"}
                </button>
              ))}
            </div>
          </div>

          {/* Gender */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Gender
            </label>
            <div className="flex flex-wrap gap-2">
              {GENDERS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setGender(key as UserProfile["gender"])}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                    gender === key
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Height */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Height <span className="text-muted-foreground/50 font-normal normal-case">(optional)</span>
            </label>
            {unitSystem === "imperial" ? (
              <div className="flex gap-2">
                <div className="flex-1 relative">
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
                <div className="flex-1 relative">
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
              <div className="relative">
                <Input
                  type="number"
                  inputMode="decimal"
                  value={heightCmDisplay}
                  onChange={(e) => setHeightCmDisplay(e.target.value)}
                  placeholder="178"
                  className="rounded-xl bg-card border-0 h-11 text-sm pr-10"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">cm</span>
              </div>
            )}
          </div>

          {/* Weight */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Weight <span className="text-muted-foreground/50 font-normal normal-case">(optional)</span>
            </label>
            <div className="relative">
              <Input
                type="number"
                inputMode="decimal"
                value={weightDisplay}
                onChange={(e) => setWeightDisplay(e.target.value)}
                placeholder={unitSystem === "imperial" ? "185" : "84"}
                className="rounded-xl bg-card border-0 h-11 text-sm pr-12"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                {unitSystem === "imperial" ? "lbs" : "kg"}
              </span>
            </div>
          </div>

          {/* Goals */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              My Goals
            </label>
            <div className="flex flex-wrap gap-2">
              {GOALS.map(({ key, label }) => {
                const selected = goals.includes(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleGoal(key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                      selected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {selected && <Check className="w-3 h-3" />}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3 pt-2">
          <Button className="w-full h-12" onClick={handleContinue}>
            Let's Go
          </Button>
          <button
            onClick={handleSkip}
            className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
