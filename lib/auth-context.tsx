import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import type { AuthUser } from "./types";
import { Platform } from "react-native";
import { apiRequest, getApiUrl } from "./query-client";
import { fetch as expoFetch } from "expo/fetch";
import AsyncStorage from "@react-native-async-storage/async-storage";

const fetchFn = Platform.OS === "web" ? globalThis.fetch : expoFetch;

// v2: slim cache — no photo blob. Photo lives in its own key.
const AUTH_SLIM_CACHE_KEY  = "bridges_auth_slim_v1";
const AUTH_PHOTO_CACHE_KEY = "bridges_auth_photo_v1";
const AUTH_LEGACY_CACHE_KEY = "bridges_auth_cache_v1"; // migration only

// ─── Storage helpers ──────────────────────────────────────────────────────────

async function storageRead(key: string): Promise<string | null> {
  try {
    return Platform.OS === "web"
      ? localStorage.getItem(key)
      : await AsyncStorage.getItem(key);
  } catch { return null; }
}

async function storageWrite(key: string, value: string | null): Promise<void> {
  try {
    if (Platform.OS === "web") {
      value !== null ? localStorage.setItem(key, value) : localStorage.removeItem(key);
    } else {
      value !== null
        ? await AsyncStorage.setItem(key, value)
        : await AsyncStorage.removeItem(key);
    }
  } catch {}
}

// Splits user into slim (tiny JSON) + photo (large string, separate key).
async function writeAuthCache(user: AuthUser | null): Promise<void> {
  if (!user) {
    await storageWrite(AUTH_SLIM_CACHE_KEY, null);
    await storageWrite(AUTH_PHOTO_CACHE_KEY, null);
    return;
  }
  const { profilePhotoUri, ...slim } = user;
  await storageWrite(AUTH_SLIM_CACHE_KEY, JSON.stringify(slim));
  // Photo write is large — fire-and-forget so callers aren't blocked
  if (profilePhotoUri !== undefined) {
    storageWrite(AUTH_PHOTO_CACHE_KEY, profilePhotoUri ?? null);
  }
}

// ─── Context types ────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isCacheHydrated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  loginWithApple: (identityToken: string, fullName?: { givenName?: string | null; familyName?: string | null }) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
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
      // ── Step 1: slim cache read — this is the ONLY thing that blocks isCacheHydrated.
      // It contains no photo blob so it parses in <1ms even on slow devices.
      const slimRaw = await storageRead(AUTH_SLIM_CACHE_KEY);
      if (cancelled) return;

      if (slimRaw) {
        try { setUser(JSON.parse(slimRaw) as AuthUser); } catch {}
        // Unblock the layout immediately — no need to wait for photo
        setIsCacheHydrated(true);

        // Non-blocking: merge photo from its own cache key
        storageRead(AUTH_PHOTO_CACHE_KEY).then(photo => {
          if (photo && !cancelled) {
            setUser(prev => prev ? { ...prev, profilePhotoUri: photo } : prev);
          }
        });
      } else {
        // No slim cache yet — kick off background migration from legacy key so the
        // NEXT launch is fast. Don't await it; let the network call handle auth state.
        storageRead(AUTH_LEGACY_CACHE_KEY).then(legacyRaw => {
          if (!legacyRaw || cancelled) return;
          try {
            const { profilePhotoUri, ...slim } = JSON.parse(legacyRaw) as AuthUser;
            storageWrite(AUTH_SLIM_CACHE_KEY, JSON.stringify(slim));
            if (profilePhotoUri) storageWrite(AUTH_PHOTO_CACHE_KEY, profilePhotoUri);
            storageWrite(AUTH_LEGACY_CACHE_KEY, null);
          } catch {}
        });
      }

      // ── Step 2: network session check — now fast (no photo in response)
      try {
        const baseUrl = getApiUrl();
        const url = new URL("/api/auth/me", baseUrl);
        const res = await fetchFn(url.toString(), { credentials: "include" });
        if (cancelled) return;

        if (res.ok) {
          const data = await res.json() as Omit<AuthUser, "profilePhotoUri">;
          // Preserve the cached photo — it hasn't changed unless user updated it
          const cachedPhoto = await storageRead(AUTH_PHOTO_CACHE_KEY);
          if (cancelled) return;
          const merged: AuthUser = { ...data, profilePhotoUri: cachedPhoto ?? undefined };
          setUser(merged);
          storageWrite(AUTH_SLIM_CACHE_KEY, JSON.stringify(data));
        } else {
          // Session expired
          if (slimRaw) {
            setUser(null);
            storageWrite(AUTH_SLIM_CACHE_KEY, null);
            storageWrite(AUTH_PHOTO_CACHE_KEY, null);
          }
        }
      } catch {
        // Network error — keep whatever is already shown from cache
      } finally {
        if (!cancelled) {
          // If there was no slim cache, we were waiting for network to know auth state
          if (!slimRaw) setIsCacheHydrated(true);
          setIsLoading(false);
        }
      }

      // ── Step 3: lazily refresh photo from server (entirely non-blocking)
      // Runs after isLoading = false so it never holds up the UI.
      if (cancelled) return;
      try {
        const photoUrl = new URL("/api/auth/photo", getApiUrl()).toString();
        const r = await fetchFn(photoUrl, { credentials: "include" });
        if (!cancelled && r.ok) {
          const { profilePhotoUri } = await r.json() as { profilePhotoUri?: string | null };
          setUser(prev => prev ? { ...prev, profilePhotoUri: profilePhotoUri ?? undefined } : prev);
          storageWrite(AUTH_PHOTO_CACHE_KEY, profilePhotoUri ?? null);
        }
      } catch {}
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
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { message?: string };
      throw new Error(body.message ?? "Apple sign in failed");
    }
    const data = await res.json();
    setUser(data);
    writeAuthCache(data);
  }, []);

  const loginWithGoogle = useCallback(async (idToken: string) => {
    const res = await apiRequest("POST", "/api/auth/google", { idToken });
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
