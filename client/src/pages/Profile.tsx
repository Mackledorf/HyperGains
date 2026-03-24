import { useState, useMemo, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ChevronRight, Dumbbell, Zap, Scale, Check, Pencil, Ruler } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import AppShell from "@/components/AppShell";
import SwipeableRow from "@/components/SwipeableRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import * as store from "@/lib/storage";
import { queryClient } from "@/lib/queryClient";
import type { UserProfile, Program, WeightEntry } from "@shared/schema";

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

// NOTE: Activity Level data — will be moved to the Food page where it is used to
// calculate TDEE / daily calorie targets. Kept here until that migration is complete.
const ACTIVITY_LEVELS = [
  { key: "sedentary",   label: "Sedentary",        desc: "Desk job, no exercise" },
  { key: "light",      label: "Lightly Active",    desc: "1–3 days/wk" },
  { key: "moderate",   label: "Moderately Active", desc: "3–5 days/wk" },
  { key: "active",     label: "Active",            desc: "6–7 days/wk" },
  { key: "very_active",label: "Very Active",       desc: "Twice daily / physical job" },
] as const;

const WEIGHT_GOAL_OPTIONS = [
  { key: "maintain", label: "Stay where I'm at" },
  { key: "lose",     label: "Lose weight" },
  { key: "gain",     label: "Gain weight" },
] as const;

const RATE_OPTIONS_LOSE = [-0.25, -0.5, -1];
const RATE_OPTIONS_GAIN = [0.25, 0.5, 1];

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
  const { data: weightHistory = [] } = useQuery<WeightEntry[]>({
    queryKey: ["weightHistory"],
    queryFn: () => store.getWeightHistory(),
  });

  // Form state
  const [gender, setGender] = useState<UserProfile["gender"]>(
    existingProfile?.gender ?? "prefer_not_to_say"
  );
  const [unitSystem, setUnitSystem] = useState<"imperial" | "metric">(
    existingProfile?.unitSystem ?? "imperial"
  );
  const [goals, setGoals] = useState<string[]>(existingProfile?.goals ?? []);

  // New profile fields
  const [ageYears, setAgeYears] = useState(
    existingProfile?.ageYears ? String(existingProfile.ageYears) : ""
  );
  // NOTE: activityLevel — UI removed from this page; will be surfaced on the Food page
  // to calculate TDEE / calorie targets. State and save logic retained until migration.
  const [activityLevel, setActivityLevel] = useState<UserProfile["activityLevel"]>(
    existingProfile?.activityLevel ?? null
  );
  const [bodyWeightGoal, setBodyWeightGoal] = useState<UserProfile["bodyWeightGoal"]>(
    existingProfile?.bodyWeightGoal ?? null
  );
  const [weeklyRateLbs, setWeeklyRateLbs] = useState<number | null>(
    existingProfile?.weeklyRateLbs ?? null
  );

  // Controls whether personal info and goals are in editable mode.
  // Starts in edit mode if no profile has been saved yet (new user).
  const [isEditing, setIsEditing] = useState(!existingProfile);

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

  // Weight tracking state
  const [timeOfDay, setTimeOfDay] = useState<"AM" | "PM">("AM");
  const [fed, setFed] = useState(false);
  const [filterTimeOfDay, setFilterTimeOfDay] = useState<"AM" | "PM" | null>(null);
  const [filterFed, setFilterFed] = useState<boolean | null>(null);

  const filteredHistory = useMemo(() => {
    return weightHistory.filter((e) => {
      if (filterTimeOfDay !== null && e.timeOfDay !== filterTimeOfDay) return false;
      if (filterFed !== null && e.fed !== filterFed) return false;
      return true;
    });
  }, [weightHistory, filterTimeOfDay, filterFed]);

  const chartData = useMemo(() => {
    return [...filteredHistory].reverse().slice(-30).map((e) => ({
      date: new Date(e.recordedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      weight: e.weightKg,
    }));
  }, [filteredHistory]);

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

      store.saveProfile({
        gender,
        heightCm,
        weightKg: store.getProfile()?.weightKg ?? null,
        unitSystem,
        goals,
        ageYears: parseInt(ageYears) || null,
        activityLevel,
        bodyWeightGoal,
        weeklyRateLbs: bodyWeightGoal === "maintain" ? null : weeklyRateLbs,
      });
      return Promise.resolve();
    },
    onSuccess: () => {
      toast({ title: "Profile saved" });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      setIsEditing(false);
    },
  });

  const toggleGoal = (key: string) => {
    setGoals((prev) =>
      prev.includes(key) ? prev.filter((g) => g !== key) : [...prev, key]
    );
  };

  const saveWeightMutation = useMutation({
    mutationFn: () => {
      const val = parseFloat(weightDisplay);
      if (isNaN(val) || val <= 0) return Promise.resolve();
      const weightKg = unitSystem === "imperial" ? lbsToKg(val) : val;
      store.addWeightEntry(weightKg, timeOfDay, fed);
      const current = store.getProfile();
      if (current) store.saveProfile({ ...current, weightKg });
      return Promise.resolve();
    },
    onSuccess: () => {
      toast({ title: "Weight logged" });
      setWeightDisplay("");
      queryClient.invalidateQueries({ queryKey: ["weightHistory"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  return (
    <AppShell>
      <div className="space-y-5 pb-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">{userName}</h1>
            <p className="micro-label mt-0.5">Personal details &amp; goals</p>
          </div>
          <button
            onClick={() => setIsEditing((v) => !v)}
            className="p-2 rounded-xl border border-border text-muted-foreground hover:text-foreground transition-colors"
            aria-label={isEditing ? "Finish editing" : "Edit profile"}
          >
            <Pencil className="w-4 h-4" />
          </button>
        </div>

        {/* ── Section A: Personal Info ── */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Personal Info
          </h2>

          {isEditing ? (
            <div className="rounded-2xl bg-card p-4 space-y-4">
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
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">yrs</span>
                </div>
              </div>

              {/* NOTE: Activity Level selector removed from Personal Info UI.
                  It will be added to the Food page to support TDEE / calorie-target
                  calculations. The ACTIVITY_LEVELS constant, activityLevel state, and
                  its save logic remain in this file until that migration is complete. */}
            </div>
          ) : (
            <div className="rounded-2xl bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Units</span>
                <span className="text-sm font-medium capitalize">{unitSystem}</span>
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
                    ? (heightFt ? `${heightFt}′ ${heightIn || 0}″` : "—")
                    : (heightCmDisplay ? `${heightCmDisplay} cm` : "—")}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Age</span>
                <span className="text-sm font-medium">
                  {ageYears ? `${ageYears} yrs` : "—"}
                </span>
              </div>
            </div>
          )}
        </section>

        {/* ── Weight Tracking ── */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Weight
          </h2>
          <div className="rounded-2xl bg-card p-4 space-y-4">
            {/* Log form */}
            <div className="space-y-3">
              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <Scale className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={weightDisplay}
                    onChange={(e) => setWeightDisplay(e.target.value)}
                    placeholder={unitSystem === "imperial" ? "185" : "84"}
                    className="rounded-xl bg-background border-border h-10 text-sm pl-9 pr-12"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {unitSystem === "imperial" ? "lbs" : "kg"}
                  </span>
                </div>
                <Button
                  size="sm"
                  className="rounded-xl h-10 px-4 text-xs shrink-0"
                  onClick={() => saveWeightMutation.mutate()}
                  disabled={saveWeightMutation.isPending || !weightDisplay}
                >
                  Log
                </Button>
              </div>
              {/* AM/PM + Fasted/Fed toggles */}
              <div className="flex gap-2">
                <div className="flex-1 flex rounded-xl overflow-hidden border border-border text-xs font-semibold">
                  {(["AM", "PM"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTimeOfDay(t)}
                      className={`flex-1 py-2 transition-colors ${
                        timeOfDay === t
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="flex-1 flex rounded-xl overflow-hidden border border-border text-xs font-semibold">
                  {([false, true] as const).map((v) => (
                    <button
                      key={String(v)}
                      onClick={() => setFed(v)}
                      className={`flex-1 py-2 transition-colors ${
                        fed === v
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {v ? "Fed" : "Fasted"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Chart + filters (only when there are multiple entries) */}
            {weightHistory.length > 1 && (
              <>
                <div className="flex gap-2">
                  <div className="flex-1 flex rounded-xl overflow-hidden border border-border text-xs font-semibold">
                    {([null, "AM", "PM"] as const).map((v) => (
                      <button
                        key={v ?? "all"}
                        onClick={() => setFilterTimeOfDay(v)}
                        className={`flex-1 py-1.5 transition-colors ${
                          filterTimeOfDay === v
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {v ?? "All"}
                      </button>
                    ))}
                  </div>
                  <div className="flex-1 flex rounded-xl overflow-hidden border border-border text-xs font-semibold">
                    {([null, false, true] as const).map((v) => (
                      <button
                        key={v === null ? "all" : String(v)}
                        onClick={() => setFilterFed(v)}
                        className={`flex-1 py-1.5 transition-colors ${
                          filterFed === v
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {v === null ? "All" : v ? "Fed" : "Fasted"}
                      </button>
                    ))}
                  </div>
                </div>
                {filteredHistory.length > 1 ? (
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        domain={["auto", "auto"]}
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v: number) =>
                          unitSystem === "imperial" ? `${kgToLbs(v)}` : `${v}`
                        }
                      />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 11,
                        }}
                        formatter={(v: number) => [
                          `${unitSystem === "imperial" ? kgToLbs(v) : v} ${unitSystem === "imperial" ? "lbs" : "kg"}`,
                          "Weight",
                        ]}
                      />
                      <Line
                        type="monotone"
                        dataKey="weight"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ r: 3, strokeWidth: 0, fill: "hsl(var(--primary))" }}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No data for selected filters
                  </p>
                )}
              </>
            )}

            {/* History list */}
            {filteredHistory.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  History
                </p>
                <div className="max-h-48 overflow-y-auto">
                  {filteredHistory.slice(0, 20).map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between py-2 border-b border-border/30 last:border-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {new Date(entry.recordedAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                        {entry.timeOfDay && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {entry.timeOfDay}
                          </span>
                        )}
                        {entry.fed !== undefined && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {entry.fed ? "Fed" : "Fasted"}
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-semibold tabular-nums">
                        {unitSystem === "imperial"
                          ? `${kgToLbs(entry.weightKg)} lbs`
                          : `${entry.weightKg} kg`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {weightHistory.length === 0 && (
              <p className="text-xs text-muted-foreground">No weight entries yet.</p>
            )}
          </div>
        </section>

        {/* ── Section B: Goals ── */}
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

        {/* ── Weight Direction & Rate ── */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Weight Goal
          </h2>
          {isEditing ? (
            <div className="rounded-2xl bg-card p-4 space-y-4">
              <div className="flex flex-col gap-2">
                {WEIGHT_GOAL_OPTIONS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setBodyWeightGoal(key);
                      if (key === "maintain") setWeeklyRateLbs(null);
                      else if (!weeklyRateLbs) setWeeklyRateLbs(key === "lose" ? -0.5 : 0.5);
                    }}
                    className={`flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all text-left ${
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

              {bodyWeightGoal && bodyWeightGoal !== "maintain" && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Rate (lbs/week)
                  </span>
                  <div className="flex gap-2 flex-wrap">
                    {(bodyWeightGoal === "lose" ? RATE_OPTIONS_LOSE : RATE_OPTIONS_GAIN).map((rate) => (
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
            </div>
          ) : (
            <div className="rounded-2xl bg-card p-4">
              {bodyWeightGoal ? (
                <div className="space-y-1">
                  <span className="text-sm font-semibold">
                    {WEIGHT_GOAL_OPTIONS.find((o) => o.key === bodyWeightGoal)?.label}
                  </span>
                  {weeklyRateLbs !== null && bodyWeightGoal !== "maintain" && (
                    <p className="text-xs text-muted-foreground">
                      {weeklyRateLbs > 0 ? `+${weeklyRateLbs}` : weeklyRateLbs} lb/wk
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No weight goal set.</p>
              )}
            </div>
          )}
        </section>

        {/* Save button — only shown while in edit mode */}
        {isEditing && (
          <Button
            className="w-full"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "Saving…" : "Save Profile"}
          </Button>
        )}

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
