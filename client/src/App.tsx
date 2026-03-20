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
import Dashboard from "@/pages/Dashboard";
import CreateProgram from "@/pages/CreateProgram";
import ActiveWorkout from "@/pages/ActiveWorkout";
import History from "@/pages/History";
import ProgramDetail from "@/pages/ProgramDetail";

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
  const [authenticated, setAuthenticated] = useState(
    () => sessionStorage.getItem(AUTH_SESSION_KEY) === "1"
  );

  const handleAuthenticated = () => {
    sessionStorage.setItem(AUTH_SESSION_KEY, "1");
    setAuthenticated(true);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          {authenticated ? (
            <Router hook={useHashLocation}>
              <AppRouter />
            </Router>
          ) : (
            <Login onAuthenticated={handleAuthenticated} />
          )}
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
