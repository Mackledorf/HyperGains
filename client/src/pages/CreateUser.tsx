import { useState } from "react";
import { Link } from "wouter";
import { Dumbbell, Lock, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as store from "@/lib/storage";
import * as gist from "@/lib/gist";
import { hashPassword } from "@/lib/auth";

export default function CreateUser({
  onAuthenticated,
}: {
  onAuthenticated: (userId: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    if (password.length < 4) {
      setError("Password must be at least 4 characters");
      return;
    }

    setSubmitting(true);
    const userId = await hashPassword(password);

    try {
      const exists = await gist.userExists(userId);
      if (exists) {
        setError("An account with that password already exists. Log in instead.");
        setSubmitting(false);
        return;
      }
      store.setActiveUser(userId);
      await gist.setUserData(userId, store.exportAll());
    } catch (err) {
      setError(`Could not create account: ${(err as Error).message}`);
      setSubmitting(false);
      return;
    }

    onAuthenticated(userId);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-xs space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center">
            <Dumbbell className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Create Account
          </h1>
          <p className="text-xs text-muted-foreground text-center">
            Choose a password to get started.
          </p>
        </div>

        {/* Key info */}
        <div className="flex gap-3 rounded-xl bg-primary/10 border border-primary/20 p-3">
          <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-foreground/70 leading-relaxed">
            Your password <span className="font-semibold text-foreground/90">is your unique access key</span> to this account. There is no email or recovery option — if you lose your password, you lose access to your account.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              placeholder="Choose a password"
              className="pl-10 rounded-xl bg-card border-0 h-12 text-sm"
              autoFocus
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="password"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setError(""); }}
              placeholder="Confirm password"
              className="pl-10 rounded-xl bg-card border-0 h-12 text-sm"
            />
          </div>

          {error && (
            <p className="text-xs text-destructive text-center font-medium">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={!password || !confirm || submitting}
            className="w-full rounded-xl h-12 text-sm font-bold"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </span>
            ) : (
              "Create Account"
            )}
          </Button>
        </form>

        <div className="text-center">
          <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">
            ← Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
