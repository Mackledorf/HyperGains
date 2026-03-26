import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Check, Ruler, Pencil } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import * as store from "@/lib/storage";
import { queryClient } from "@/lib/queryClient";
import { HG_EVENTS } from "@/lib/storage";
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

function cmToFtIn(cm: number): { ft: number; inches: number } {
  const totalIn = cm / 2.54;
  return { ft: Math.floor(totalIn / 12), inches: Math.round(totalIn % 12) };
}
function ftInToCm(ft: number, inches: number) {
  return Math.round((ft * 12 + inches) * 2.54 * 10) / 10;
}

// ── Main component ─────────────────────────────────────────

export default function Settings() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const existingProfile = store.getProfile();

  // Form state
  const [gender, setGender] = useState<UserProfile["gender"]>(
    existingProfile?.gender ?? "prefer_not_to_say"
  );
  const [unitSystem, setUnitSystem] = useState<"imperial" | "metric">(
    existingProfile?.unitSystem ?? "imperial"
  );
  const [goals, setGoals] = useState<string[]>(existingProfile?.goals ?? []);
  const [ageYears, setAgeYears] = useState(
    existingProfile?.ageYears ? String(existingProfile.ageYears) : ""
  );
  const [isEditing, setIsEditing] = useState(!existingProfile);

  const [heightFt, setHeightFt] = useState(() => {
    if (!existingProfile?.heightCm) return "";
    return String(cmToFtIn(existingProfile.heightCm).ft);
  });
  const [heightIn, setHeightIn] = useState(() => {
    if (!existingProfile?.heightCm) return "";
    return String(cmToFtIn(existingProfile.heightCm).inches);
  });
  const [heightCmDisplay, setHeightCmDisplay] = useState(
    existingProfile?.heightCm ? String(existingProfile.heightCm) : ""
  );

  const toggleGoal = (key: string) => {
    setGoals((prev) =>
      prev.includes(key) ? prev.filter((g) => g !== key) : [...prev, key]
    );
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      let heightCm: number | null = null;
      if (unitSystem === "imperial") {
        const ft = parseInt(heightFt) || 0;
        const inches = parseInt(heightIn) || 0;
        if (ft > 0 || inches > 0) heightCm = ftInToCm(ft, inches);
      } else {
        const cm = parseFloat(heightCmDisplay);
        if (!isNaN(cm) && cm > 0) heightCm = cm;
      }
      const current = store.getProfile();
      store.saveProfile({
        gender,
        heightCm,
        weightKg: current?.weightKg ?? null,
        unitSystem,
        goals,
        ageYears: parseInt(ageYears) || null,
        activityLevel: current?.activityLevel ?? null,
        bodyWeightGoal: current?.bodyWeightGoal ?? null,
        weeklyRateLbs: current?.weeklyRateLbs ?? null,
      });
      return Promise.resolve();
    },
    onSuccess: () => {
      toast({ title: "Settings saved" });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      setIsEditing(false);
    },
  });

  const handleLogout = () => {
    window.dispatchEvent(new CustomEvent(HG_EVENTS.LOGOUT));
  };

  return (
    <AppShell>
      <div className="space-y-5 pb-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/stats")}
            className="p-2 rounded-xl border border-border text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Back to Stats"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Settings</h1>
            <p className="micro-label mt-0.5">Personal info &amp; goals</p>
          </div>
          <button
            onClick={() => setIsEditing((v) => !v)}
            className="p-2 rounded-xl border border-border text-muted-foreground hover:text-foreground transition-colors"
            aria-label={isEditing ? "Done editing" : "Edit settings"}
          >
            <Pencil className="w-4 h-4" />
          </button>
        </div>

        {/* ── Personal Info ── */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Personal Info
          </h2>
          {isEditing ? (
            <div className="rounded-2xl bg-card p-4 space-y-4">
              {/* Age */}
              <div className="space-y-2">
                <span className="text-sm font-medium">Age</span>
                <div className="relative w-32">
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={ageYears}
                    onChange={(e) => setAgeYears(e.target.value)}
                    placeholder="25"
                    className="rounded-xl bg-background border-border h-10 text-sm pr-10"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    yrs
                  </span>
                </div>
              </div>

              {/* Sex */}
              <div className="space-y-2">
                <span className="text-sm font-medium">Sex</span>
                <div className="flex flex-wrap gap-2 mt-1">
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
                <div className="flex items-center gap-1.5">
                  <Ruler className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium">Height</span>
                </div>
                {unitSystem === "imperial" ? (
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <Input
                        type="number"
                        inputMode="numeric"
                        value={heightFt}
                        onChange={(e) => setHeightFt(e.target.value)}
                        placeholder="5"
                        className="rounded-xl bg-background border-border h-10 text-sm pr-8"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        ft
                      </span>
                    </div>
                    <div className="flex-1 relative">
                      <Input
                        type="number"
                        inputMode="numeric"
                        value={heightIn}
                        onChange={(e) => setHeightIn(e.target.value)}
                        placeholder="10"
                        className="rounded-xl bg-background border-border h-10 text-sm pr-8"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        in
                      </span>
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
                      className="rounded-xl bg-background border-border h-10 text-sm pr-10"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      cm
                    </span>
                  </div>
                )}
              </div>

              {/* Unit system */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Units</span>
                <div className="flex rounded-xl overflow-hidden border border-border text-xs font-semibold">
                  {(["imperial", "metric"] as const).map((u) => (
                    <button
                      key={u}
                      onClick={() => setUnitSystem(u)}
                      className={`px-3 py-1.5 transition-colors ${
                        unitSystem === u
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {u === "imperial" ? "Imperial" : "Metric"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Age</span>
                <span className="text-sm font-medium">
                  {ageYears ? `${ageYears} yrs` : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Sex</span>
                <span className="text-sm font-medium">
                  {GENDERS.find((g) => g.key === gender)?.label ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Height</span>
                <span className="text-sm font-medium">
                  {unitSystem === "imperial"
                    ? heightFt
                      ? `${heightFt}′ ${heightIn || 0}″`
                      : "—"
                    : heightCmDisplay
                    ? `${heightCmDisplay} cm`
                    : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Units</span>
                <span className="text-sm font-medium capitalize">{unitSystem}</span>
              </div>
            </div>
          )}
        </section>

        {/* ── My Goals ── */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            My Goals
          </h2>
          {isEditing ? (
            <div className="rounded-2xl bg-card p-4">
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
              {goals.length === 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Select at least one goal.
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-2xl bg-card p-4">
              {goals.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {goals.map((key) => {
                    const goal = GOALS.find((g) => g.key === key);
                    return goal ? (
                      <span
                        key={key}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-primary bg-primary/10 text-primary"
                      >
                        <Check className="w-3 h-3" />
                        {goal.label}
                      </span>
                    ) : null;
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No goals set.</p>
              )}
            </div>
          )}
        </section>

        {/* Save button — only visible while editing */}
        {isEditing && (
          <Button
            className="w-full"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "Saving…" : "Save Settings"}
          </Button>
        )}

        {/* ── Account ── */}
        <section className="space-y-3 pt-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Account
          </h2>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="w-fit">
                Log Out
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Log out?</AlertDialogTitle>
                <AlertDialogDescription>
                  Your workout data is saved locally. You can log back in anytime
                  with your password.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleLogout}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Log Out
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>
      </div>
    </AppShell>
  );
}
