import { useState } from "react";
import { Link } from "wouter";
import { Dumbbell, Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as store from "@/lib/storage";
import * as gist from "@/lib/gist";
import { hashPassword } from "@/lib/auth";

export default function Login({
  onAuthenticated,
}: {
  onAuthenticated: (userId: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setSubmitting(true);
    setError("");

    const userId = await hashPassword(password);

    try {
      const exists = await gist.userExists(userId);
      if (!exists) {
        setError("No account found for that password. Create one first.");
        setSubmitting(false);
        return;
      }
      const payload = await gist.getUserData(userId);
      if (payload) {
        store.setActiveUser(userId);
        store.importAll(payload);
      }
    } catch {
      // Network unavailable — fall back to local data
      store.setActiveUser(userId);
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
          <h1
            className="text-xl font-bold tracking-tight text-foreground"
            data-testid="text-login-title"
          >
            HyperGains
          </h1>
          <p className="text-xs text-muted-foreground text-center">
            Enter your password to continue
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
              placeholder="Password"
              className="pl-10 rounded-xl bg-card border-0 h-12 text-sm"
              autoFocus
              data-testid="input-password"
            />
          </div>

          {error && (
            <p
              className="text-xs text-destructive text-center font-medium"
              data-testid="text-login-error"
            >
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={!password.trim() || submitting}
            className="w-full rounded-xl h-12 text-sm font-bold"
            data-testid="button-login"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Logging in...
              </span>
            ) : (
              "Log In"
            )}
          </Button>
        </form>

        <Link href="/create-user" className="block">
          <Button
            type="button"
            variant="outline"
            className="w-full rounded-xl h-12 text-sm font-semibold"
          >
            Create a new account
          </Button>
        </Link>
      </div>
    </div>
  );
}
