import { Link, useLocation } from "wouter";
import { Dumbbell, Home, PlusCircle, Clock } from "lucide-react";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/create", icon: PlusCircle, label: "New" },
    { href: "/history", icon: Clock, label: "History" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header — ultra minimal, no border */}
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
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-lg mx-auto w-full px-5 py-4 pb-20">
        {children}
      </main>

      {/* Bottom nav — floating pill style */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-lg mx-auto px-5 pb-3">
          <div className="flex items-center justify-around rounded-2xl bg-card/95 backdrop-blur-lg py-2 px-2">
            {navItems.map(item => {
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center gap-0.5 px-5 py-1.5 rounded-xl transition-all ${
                    isActive
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
