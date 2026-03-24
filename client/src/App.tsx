import { useState, useEffect } from "react";
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
import NewUserExperience from "@/pages/NewUserExperience";
import Dashboard from "@/pages/Dashboard";
import Workouts from "@/pages/Workouts";
import Food from "@/pages/Food";
import Supplements from "@/pages/Supplements";
import CreateProgram from "@/pages/CreateProgram";
import ActiveWorkout from "@/pages/ActiveWorkout";
import History from "@/pages/History";
import Programs from "@/pages/Programs";
import ProgramDetail from "@/pages/ProgramDetail";
import ProgramSettings from "@/pages/ProgramSettings";
import Profile from "@/pages/Profile";
import * as store from "@/lib/storage";
import { HG_EVENTS, SESSION_KEY } from "@/lib/storage";
import * as gist from "@/lib/gist";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/workouts" component={Workouts} />
      <Route path="/food" component={Food} />
      <Route path="/supplements" component={Supplements} />
      <Route path="/programs" component={Programs} />
      <Route path="/create" component={CreateProgram} />
      <Route path="/program/:id/settings" component={ProgramSettings} />
      <Route path="/program/:id" component={ProgramDetail} />
      <Route path="/workout/:sessionId" component={ActiveWorkout} />
      <Route path="/history" component={History} />
      <Route path="/profile" component={Profile} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [activeUserId, setActiveUserId] = useState<string | null>(() => {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (!stored) return null;
    // Validate stored ID still corresponds to a real user
    const valid = store.getUserById(stored);
    if (valid) {
      store.setActiveUser(stored);
      return stored;
    }
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  });

  // Track NUX completion as separate state so completing the form triggers a re-render
  const [nuxDone, setNuxDone] = useState<boolean>(() =>
    !!activeUserId && store.isNuxComplete(activeUserId)
  );

  // Re-check NUX status whenever the active user changes (login/logout/switch)
  useEffect(() => {
    setNuxDone(!!activeUserId && store.isNuxComplete(activeUserId));
  }, [activeUserId]);

  const handleAuthenticated = (userId: string) => {
    store.setActiveUser(userId);
    sessionStorage.setItem(SESSION_KEY, userId);
    setActiveUserId(userId);
  };

  // Logout handler — fired by AppShell's logout button via custom event
  useEffect(() => {
    const onLogout = () => {
      store.setActiveUser("");
      sessionStorage.removeItem(SESSION_KEY);
      setActiveUserId(null);
    };
    window.addEventListener(HG_EVENTS.LOGOUT, onLogout);
    return () => window.removeEventListener(HG_EVENTS.LOGOUT, onLogout);
  }, []);

  // Push to gist whenever data changes (debounced) and on page unload.
  // Also pull fresh gist data when the tab regains visibility (cross-device sync).
  useEffect(() => {
    if (!activeUserId) return;

    const onDataChanged = () => {
      gist.scheduleSync(store.exportAll());
    };
    const onBeforeUnload = () => {
      void gist.flushSync(store.exportAll());
    };
    const onVisibilityChange = async () => {
      if (document.visibilityState === "visible") {
        try {
          const payload = await gist.getUserData(activeUserId);
          if (payload) {
            store.importAll(payload);
            // Re-evaluate NUX in case it was completed on another device
            setNuxDone(store.isNuxComplete(activeUserId));
          }
        } catch {
          // offline — silently ignore
        }
      }
    };

    window.addEventListener(HG_EVENTS.DATA_CHANGED, onDataChanged);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener(HG_EVENTS.DATA_CHANGED, onDataChanged);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [activeUserId]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          {activeUserId ? (
            nuxDone ? (
              <Router hook={useHashLocation}>
                <AppRouter />
              </Router>
            ) : (
              <NewUserExperience
                userId={activeUserId}
                onNuxComplete={() => {
                  setNuxDone(true);
                  // Flush immediately so other devices get the flag without waiting for debounce
                  void gist.flushSync(store.exportAll());
                }}
              />
            )
          ) : (
            <Router hook={useHashLocation}>
              <Switch>
                <Route path="/create-user">
                  <CreateUser onAuthenticated={handleAuthenticated} />
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
