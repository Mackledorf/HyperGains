import { useState } from "react";
import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";
import CreateUser from "@/pages/CreateUser";
import Dashboard from "@/pages/Dashboard";
import CreateProgram from "@/pages/CreateProgram";
import ActiveWorkout from "@/pages/ActiveWorkout";
import History from "@/pages/History";
import ProgramDetail from "@/pages/ProgramDetail";
import * as store from "@/lib/storage";

const AUTH_SESSION_KEY = "hg_session";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/create" component={CreateProgram} />
      <Route path="/program/:id" component={ProgramDetail} />
      <Route path="/workout/:sessionId" component={ActiveWorkout} />
      <Route path="/history" component={History} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [activeUserId, setActiveUserId] = useState<string | null>(() => {
    const stored = sessionStorage.getItem(AUTH_SESSION_KEY);
    if (!stored) return null;
    // Validate stored ID still corresponds to a real user
    const valid = store.getUserById(stored);
    if (valid) {
      store.setActiveUser(stored);
      return stored;
    }
    sessionStorage.removeItem(AUTH_SESSION_KEY);
    return null;
  });

  const handleAuthenticated = (userId: string) => {
    store.setActiveUser(userId);
    sessionStorage.setItem(AUTH_SESSION_KEY, userId);
    setActiveUserId(userId);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          {activeUserId ? (
            <Router hook={useHashLocation}>
              <AppRouter />
            </Router>
          ) : (
            <Router hook={useHashLocation}>
              <Switch>
                <Route path="/create-user">
                  <CreateUser />
                </Route>
                <Route>
                  <Login onAuthenticated={handleAuthenticated} />
                </Route>
              </Switch>
            </Router>
          )}
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
