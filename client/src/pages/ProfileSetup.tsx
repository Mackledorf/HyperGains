// ProfileSetup has been replaced by the NewUserExperience onboarding flow.
// Redirects to Stats page so any stale links still work.
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function ProfileSetup() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate("/stats"); }, [navigate]);
  return null;
}
