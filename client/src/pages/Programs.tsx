import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import * as store from "@/lib/storage";
import { queryClient } from "@/lib/queryClient";
import AppShell from "@/components/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { PlusCircle, Dumbbell, ChevronRight, Zap } from "lucide-react";
import type { Program } from "@shared/schema";

export default function Programs() {
  const { toast } = useToast();
  const { data: programs = [], isLoading, isError } = useQuery<Program[]>({
    queryKey: ["programs", "all"],
    queryFn: () => store.getPrograms(),
  });

  const setActiveMutation = useMutation({
    mutationFn: (programId: string) => {
      store.setActiveProgram(programId);
      return Promise.resolve();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["programs"] });
      toast({ title: "Active program updated" });
    },
  });

  return (
    <AppShell>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-lg font-bold">Programs</h1>
            <p className="micro-label mt-0.5">
              {programs.length} program{programs.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Link href="/create">
            <Button size="sm" className="gap-1.5 h-8 text-xs">
              <PlusCircle className="w-3.5 h-3.5" />
              New
            </Button>
          </Link>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </div>
        ) : isError ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-sm font-semibold mb-1">Failed to load programs</p>
            <p className="text-xs">Please reload the page.</p>
          </div>
        ) : programs.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Dumbbell className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-semibold mb-1">No programs yet</p>
            <p className="text-xs">Create your first program to get started.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {programs.map((program) => (
              <div key={program.id} className="rounded-2xl bg-card overflow-hidden">
                <Link href={`/program/${program.id}`}>
                  <div className="p-4 flex items-center gap-3 hover-elevate transition-all active:scale-[0.99] cursor-pointer">
                    {/* Icon */}
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        program.isActive
                          ? "bg-primary/15"
                          : "bg-muted"
                      }`}
                    >
                      {program.isActive ? (
                        <Zap className="w-5 h-5 text-primary" />
                      ) : (
                        <Dumbbell className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-sm font-bold truncate">{program.name}</h3>
                        {program.isActive && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-0 flex-shrink-0"
                          >
                            Active
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{program.splitType}</p>
                      <p className="text-xs text-muted-foreground/70 mt-0.5">
                        {program.daysPerWeek} days/wk · {program.durationWeeks} weeks
                        {program.currentWeekNumber > 1 && ` · Week ${program.currentWeekNumber}`}
                      </p>
                    </div>

                    <ChevronRight className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />
                  </div>
                </Link>
                {!program.isActive && (
                  <div className="px-4 pb-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full rounded-xl h-8 text-xs"
                      onClick={() => setActiveMutation.mutate(program.id)}
                      disabled={setActiveMutation.isPending}
                    >
                      Set as Active
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
