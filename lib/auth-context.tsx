import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import type { AuthUser } from "./types";
import { Platform } from "react-native";
import { apiRequest, getApiUrl } from "./query-client";
import { fetch as expoFetch } from "expo/fetch";
import AsyncStorage from "@react-native-async-storage/async-storage";

const fetchFn = Platform.OS === "web" ? globalThis.fetch : expoFetch;
const AUTH_CACHE_KEY = "bridges_auth_cache_v1";

async function readAuthCache(): Promise<AuthUser | null> {
  try {
    let raw: string | null = null;
    if (Platform.OS === "web") {
      raw = localStorage.getItem(AUTH_CACHE_KEY);
    } else {
      raw = await AsyncStorage.getItem(AUTH_CACHE_KEY);
    }
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

async function writeAuthCache(user: AuthUser | null): Promise<void> {
  try {
    if (Platform.OS === "web") {
      if (user) {
        localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(AUTH_CACHE_KEY);
      }
    } else {
      if (user) {
        await AsyncStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(user));
      } else {
        await AsyncStorage.removeItem(AUTH_CACHE_KEY);
      }
    }
  } catch {}
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isCacheHydrated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  loginWithApple: (identityToken: string, fullName?: { givenName?: string | null; familyName?: string | null }) => Promise<void>;
  loginWithGoogle: (accessToken: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfilePhoto: (uri: string) => Promise<void>;
  updateName: (name: string) => Promise<void>;
  updateNotificationPreferences: (frequency: string, time: string | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCacheHydrated, setIsCacheHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const cached = await readAuthCache();
      if (cancelled) return;

      if (cached) {
        setUser(cached);
      }
      setIsCacheHydrated(true);

      try {
        const baseUrl = getApiUrl();
        const url = new URL("/api/auth/me", baseUrl);
        const res = await fetchFn(url.toString(), { credentials: "include" });
        if (cancelled) return;

        if (res.ok) {
          const data = await res.json();
          setUser(data);
          writeAuthCache(data);
        } else {
          if (cached) {
            setUser(null);
            writeAuthCache(null);
          }
        }
      } catch {
        // Network error — keep cached user if present
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiRequest("POST", "/api/auth/login", { email, password });
    const data = await res.json();
    setUser(data);
    writeAuthCache(data);
  }, []);

  const register = useCallback(async (email: string, password: string, name?: string) => {
    await apiRequest("POST", "/api/auth/register", { email, password, name });
  }, []);

  const loginWithApple = useCallback(async (
    identityToken: string,
    fullName?: { givenName?: string | null; familyName?: string | null }
  ) => {
    const res = await apiRequest("POST", "/api/auth/apple", { identityToken, fullName });
    const data = await res.json();
    setUser(data);
    writeAuthCache(data);
  }, []);

  const loginWithGoogle = useCallback(async (accessToken: string) => {
    const res = await apiRequest("POST", "/api/auth/google", { accessToken });
    const data = await res.json();
    setUser(data);
    writeAuthCache(data);
  }, []);

  const logout = useCallback(async () => {
    await apiRequest("POST", "/api/auth/logout");
    setUser(null);
    writeAuthCache(null);
  }, []);

  const updateProfilePhoto = useCallback(async (uri: string) => {
    const res = await apiRequest("PUT", "/api/auth/profile", { profilePhotoUri: uri });
    const data = await res.json();
    setUser(data);
    writeAuthCache(data);
  }, []);

  const updateName = useCallback(async (name: string) => {
    const res = await apiRequest("PUT", "/api/auth/profile", { name });
    const data = await res.json();
    setUser(data);
    writeAuthCache(data);
  }, []);

  const updateNotificationPreferences = useCallback(async (frequency: string, time: string | null) => {
    const res = await apiRequest("PUT", "/api/notifications/preferences", { frequency, time });
    const data = await res.json();
    setUser(data);
    writeAuthCache(data);
  }, []);

  const value = useMemo(
    () => ({
      user, isLoading, isCacheHydrated,
      login, register,
      loginWithApple, loginWithGoogle,
      logout, updateProfilePhoto, updateName, updateNotificationPreferences,
    }),
    [user, isLoading, isCacheHydrated, login, register, loginWithApple, loginWithGoogle, logout, updateProfilePhoto, updateName, updateNotificationPreferences],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
