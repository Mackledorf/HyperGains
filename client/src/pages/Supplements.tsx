/**
 * Supplements page — placeholder.
 * Full supplement / vitamin / PED tracker coming in Phase 4.
 * See session plan for full data model and design documentation.
 */
import AppShell from "@/components/AppShell";
import { Pill } from "lucide-react";

export default function Supplements() {
  return (
    <AppShell>
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
          <Pill className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-lg font-bold mb-2">Supplement Tracker</h1>
        <p className="text-muted-foreground text-sm max-w-xs">
          Track daily vitamins, supplements, and injectable PEDs with site
          rotation logging. Coming soon.
        </p>
      </div>
    </AppShell>
  );
}
