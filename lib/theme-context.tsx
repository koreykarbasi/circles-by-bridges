import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Appearance, Platform } from "react-native";
import { darkColors, lightColors, type ThemeColors } from "@/constants/colors";

type AppearanceMode = "dark" | "light";
const STORAGE_KEY = "bridges:appearance";

type ThemeContextValue = {
  mode: AppearanceMode;
  colors: ThemeColors;
  ready: boolean;
  setMode: (mode: AppearanceMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<AppearanceMode>("dark");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === "light" || stored === "dark") setModeState(stored);
      })
      .catch((error) => console.warn("Could not load appearance preference:", error))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready && Platform.OS !== "web") Appearance.setColorScheme(mode);
  }, [mode, ready]);

  const setMode = useCallback((next: AppearanceMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next)
      .catch((error) => console.warn("Could not save appearance preference:", error));
  }, []);

  const value = useMemo(
    () => ({ mode, colors: mode === "dark" ? darkColors : lightColors, ready, setMode }),
    [mode, ready, setMode],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}

export function useThemeColors(): ThemeColors {
  return useTheme().colors;
}