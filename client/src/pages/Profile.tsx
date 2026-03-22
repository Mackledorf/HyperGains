import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ChevronRight, Dumbbell, Zap, Scale, Ruler, Check } from "lucide-react";
import AppShell from "@/components/AppShell";
import SwipeableRow from "@/components/SwipeableRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import * as store from "@/lib/storage";
import { queryClient } from "@/lib/queryClient";
import type { UserProfile, Program } from "@shared/schema";

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

function kgToLbs(kg: number) { return Math.round(kg * 2.2046 * 10) / 10; }
function lbsToKg(lbs: number) { return Math.round(lbs / 2.2046 * 10) / 10; }
function cmToFtIn(cm: number): { ft: number; inches: number } {
  const totalIn = cm / 2.54;
  return { ft: Math.floor(totalIn / 12), inches: Math.round(totalIn % 12) };
}
function ftInToCm(ft: number, inches: number) { return Math.round((ft * 12 + inches) * 2.54 * 10) / 10; }

// ── Main component ─────────────────────────────────────────

export default function Profile() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // Load existing profile
  const existingProfile = store.getProfile();
  const userName = store.getUserName(store.getActiveUserId());
  const weightHistory = store.getWeightHistory();

  // Form state
  const [gender, setGender] = useState<UserProfile["gender"]>(
    existingProfile?.gender ?? "prefer_not_to_say"
  );
  const [unitSystem, setUnitSystem] = useState<"imperial" | "metric">(
    existingProfile?.unitSystem ?? "imperial"
  );
  const [goals, setGoals] = useState<string[]>(existingProfile?.goals ?? []);

  // Height display state
  const [heightFt, setHeightFt] = useState(() => {
    if (!existingProfile?.heightCm) return "";
    return String(cmToFtIn(existingProfile.heightCm).ft);
  });
  const [heightIn, setHeightIn] = useState(() => {
    if (!existingProfile?.heightCm) return "";
    return String(cmToFtIn(existingProfile.heightCm).inches);
  });
  const [heightCmDisplay, setHeightCmDisplay] = useState(() => {
    return existingProfile?.heightCm ? String(existingProfile.heightCm) : "";
  });

  // Weight display state
  const [weightDisplay, setWeightDisplay] = useState(() => {
    if (!existingProfile?.weightKg) return "";
    return unitSystem === "imperial"
      ? String(kgToLbs(existingProfile.weightKg))
      : String(existingProfile.weightKg);
  });

  // Keep weight display in sync when unit system toggles
  useEffect(() => {
    if (!weightDisplay) return;
    const parsed = parseFloat(weightDisplay);
    if (isNaN(parsed)) return;
    // Recalculate from the stored kg value if available
    if (existingProfile?.weightKg) {
      setWeightDisplay(
        unitSystem === "imperial"
          ? String(kgToLbs(existingProfile.weightKg))
          : String(existingProfile.weightKg)
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitSystem]);

  // Programs query
  const { data: programs = [], isLoading: programsLoading } = useQuery<Program[]>({
    queryKey: ["programs", "all"],
    queryFn: () => store.getPrograms(),
  });

  const deleteProgramMutation = useMutation({
    mutationFn: (id: string) => {
      store.deleteProgram(id);
      return Promise.resolve();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["programs"] });
      toast({ title: "Program deleted" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      // Compute stored-metric values
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
      return Promise.resolve();
    },
    onSuccess: () => {
      toast({ title: "Profile saved" });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  const toggleGoal = (key: string) => {
    setGoals((prev) =>
      prev.includes(key) ? prev.filter((g) => g !== key) : [...prev, key]
    );
  };

  const lastWeight = weightHistory[0];

  return (
    <AppShell>
      <div className="space-y-5 pb-4">
        {/* Header */}
        <div>
          <h1 className="text-lg font-bold">{userName}</h1>
          <p className="micro-label mt-0.5">Personal details &amp; goals</p>
        </div>

        {/* ── Section A: Personal Info ── */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Personal Info
          </h2>

          {/* Unit system toggle */}
          <div className="rounded-2xl bg-card p-4 space-y-4">
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

            {/* Gender */}
            <div className="space-y-2">
              <span className="text-sm font-medium">Gender</span>
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
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">ft</span>
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
                    className="rounded-xl bg-background border-border h-10 text-sm pr-10"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">cm</span>
                </div>
              )}
            </div>

            {/* Weight */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">Weight</span>
              </div>
              <div className="relative">
                <Input
                  type="number"
                  inputMode="decimal"
                  value={weightDisplay}
                  onChange={(e) => setWeightDisplay(e.target.value)}
                  placeholder={unitSystem === "imperial" ? "185" : "84"}
                  className="rounded-xl bg-background border-border h-10 text-sm pr-12"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  {unitSystem === "imperial" ? "lbs" : "kg"}
                </span>
              </div>
              {lastWeight && (
                <p className="text-xs text-muted-foreground">
                  Last recorded:{" "}
                  <span className="text-foreground font-medium">
                    {unitSystem === "imperial"
                      ? `${kgToLbs(lastWeight.weightKg)} lbs`
                      : `${lastWeight.weightKg} kg`}
                  </span>{" "}
                  on{" "}
                  {new Date(lastWeight.recordedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ── Section B: Goals ── */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            My Goals
          </h2>
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
        </section>

        {/* Save button */}
        <Button
          className="w-full"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? "Saving…" : "Save Profile"}
        </Button>

        {/* ── Section C: My Programs ── */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            My Programs
          </h2>

          {programsLoading ? (
            <div className="space-y-px rounded-2xl overflow-hidden">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : programs.length === 0 ? (
            <div className="rounded-2xl bg-card p-6 text-center text-muted-foreground">
              <Dumbbell className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p className="text-xs">No programs yet.</p>
            </div>
          ) : (
            <div className="rounded-2xl bg-card overflow-hidden">
              {programs.map((program, idx) => (
                <SwipeableRow
                  key={program.id}
                  onDelete={() => deleteProgramMutation.mutate(program.id)}
                  confirmTitle={`Delete "${program.name}"?`}
                  confirmDescription="All sessions and set logs for this program will also be deleted. This cannot be undone."
                >
                  <Link href={`/program/${program.id}`}>
                    <div
                      className={`flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/40 active:bg-muted/60 transition-colors cursor-pointer ${
                        idx < programs.length - 1 ? "border-b border-border/50" : ""
                      }`}
                    >
                      {/* Icon */}
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          program.isActive ? "bg-primary/15" : "bg-muted"
                        }`}
                      >
                        {program.isActive ? (
                          <Zap className="w-4 h-4 text-primary" />
                        ) : (
                          <Dumbbell className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold truncate">{program.name}</span>
                          {program.isActive && (
                            <Badge variant="secondary" className="text-[10px] py-0 px-1.5 shrink-0">
                              Active
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {program.splitType} · {program.daysPerWeek}d/wk · {program.durationWeeks}wk
                        </p>
                      </div>

                      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    </div>
                  </Link>
                </SwipeableRow>
              ))}
            </div>
          )}

          <Link href="/create">
            <Button variant="outline" size="sm" className="w-full text-xs">
              + New Program
            </Button>
          </Link>
        </section>
      </div>
    </AppShell>
  );
}
