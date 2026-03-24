import { Link, useLocation } from "wouter";
import { Dumbbell, Home, UtensilsCrossed, Pill, LogOut, CircleUser } from "lucide-react";
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
import { HG_EVENTS } from "@/lib/storage";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/workouts", icon: Dumbbell, label: "Lifts" },
    { href: "/food", icon: UtensilsCrossed, label: "Food" },
    { href: "/supplements", icon: Pill, label: "Supps" },
  ];

  function isActive(href: string): boolean {
    if (href === "/") return location === "/";
    if (href === "/workouts")
      return (
        location === "/workouts" ||
        location.startsWith("/workout/") ||
        location.startsWith("/program/") ||
        location === "/programs" ||
        location === "/create"
      );
    return location === href || location.startsWith(href + "/");
  }

  const handleLogout = () => {
    window.dispatchEvent(new CustomEvent(HG_EVENTS.LOGOUT));
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background">
        <div className="max-w-lg mx-auto flex items-center justify-between px-5 h-12">
          <Link href="/" className="flex items-center gap-2 text-foreground">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <Dumbbell className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-bold tracking-tight" data-testid="app-title">
              HyperGains
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <Link href="/profile">
              <button
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Profile & Goals"
              >
                <CircleUser className="w-4 h-4" />
              </button>
            </Link>
            <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Sign out?</AlertDialogTitle>
                <AlertDialogDescription>
                  Your workout data is saved. You can log back in anytime with
                  your password.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleLogout}>Sign out</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-lg mx-auto w-full px-5 py-4 pb-20 no-scrollbar">
        {children}
      </main>

      {/* Bottom nav — floating pill style */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-lg mx-auto px-5 pb-3">
          <div className="flex items-center justify-around rounded-2xl bg-card/95 backdrop-blur-lg py-2 px-2">
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center gap-0.5 px-5 py-1.5 rounded-xl transition-all ${
                    active
                      ? "text-primary bg-primary/10"
                      : "text-muted-foreground"
                  }`}
                  data-testid={`nav-${item.label.toLowerCase().replace(" ", "-")}`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}
