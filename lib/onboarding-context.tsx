import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const ONBOARDING_KEY = "bridges_onboarding_complete";

interface OnboardingContextValue {
  hasCompletedOnboarding: boolean | null;
  isReplayRequested: boolean;
  completeOnboarding: () => Promise<void>;
  resetOnboarding: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean | null>(null);
  const [isReplayRequested, setIsReplayRequested] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((val) => {
      setHasCompletedOnboarding(val === "true");
    });
  }, []);

  const completeOnboarding = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, "true");
    setHasCompletedOnboarding(true);
    setIsReplayRequested(false);
  }, []);

  const resetOnboarding = useCallback(async () => {
    await AsyncStorage.removeItem(ONBOARDING_KEY);
    setHasCompletedOnboarding(false);
    setIsReplayRequested(true);
  }, []);

  const value = useMemo(
    () => ({ hasCompletedOnboarding, isReplayRequested, completeOnboarding, resetOnboarding }),
    [hasCompletedOnboarding, isReplayRequested, completeOnboarding, resetOnboarding],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding must be used within OnboardingProvider");
  return ctx;
}
