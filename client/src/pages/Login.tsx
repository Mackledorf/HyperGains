import { useState } from "react";
import { Link } from "wouter";
import { Dumbbell, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as store from "@/lib/storage";

async function hashPassword(pw: string): Promise<string> {
  const data = new TextEncoder().encode(pw);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function Login({
  onAuthenticated,
}: {
  onAuthenticated: (userId: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);
  const hasUsers = store.getUsers().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setChecking(true);
    setError(false);

    const hash = await hashPassword(password);
    const user = store.getUserByPasswordHash(hash);
    if (user) {
      onAuthenticated(user.id);
    } else {
      setError(true);
      setChecking(false);
    }
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
            {hasUsers
              ? "Enter your password to continue"
              : "No accounts yet — create one to get started"}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(false);
              }}
              placeholder="Password"
              className="pl-10 rounded-xl bg-card border-0 h-12 text-sm"
              autoFocus
              disabled={!hasUsers}
              data-testid="input-password"
            />
          </div>

          {error && (
            <p
              className="text-xs text-destructive text-center font-medium"
              data-testid="text-login-error"
            >
              Incorrect password
            </p>
          )}

          <Button
            type="submit"
            disabled={!hasUsers || !password.trim() || checking}
            className="w-full rounded-xl h-12 text-sm font-bold"
            data-testid="button-login"
          >
            {checking ? "Checking..." : "Log In"}
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
