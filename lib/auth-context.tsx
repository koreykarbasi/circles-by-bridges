import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import type { AuthUser } from "./types";
import { Platform } from "react-native";
import { apiRequest, getApiUrl } from "./query-client";
import { fetch as expoFetch } from "expo/fetch";

const fetchFn = Platform.OS === "web" ? globalThis.fetch : expoFetch;

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  loginAsGuest: (name: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfilePhoto: (uri: string) => Promise<void>;
  updateName: (name: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/auth/me", baseUrl);
      const res = await fetchFn(url.toString(), { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiRequest("POST", "/api/auth/login", { email, password });
    const data = await res.json();
    setUser(data);
  }, []);

  const register = useCallback(async (email: string, password: string, name?: string) => {
    const res = await apiRequest("POST", "/api/auth/register", { email, password, name });
    const data = await res.json();
    setUser(data);
  }, []);

  const loginAsGuest = useCallback(async (name: string) => {
    const res = await apiRequest("POST", "/api/auth/guest", { name });
    const data = await res.json();
    setUser(data);
  }, []);

  const logout = useCallback(async () => {
    await apiRequest("POST", "/api/auth/logout");
    setUser(null);
  }, []);

  const updateProfilePhoto = useCallback(async (uri: string) => {
    const res = await apiRequest("PUT", "/api/auth/profile", { profilePhotoUri: uri });
    const data = await res.json();
    setUser(data);
  }, []);

  const updateName = useCallback(async (name: string) => {
    const res = await apiRequest("PUT", "/api/auth/profile", { name });
    const data = await res.json();
    setUser(data);
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, login, register, loginAsGuest, logout, updateProfilePhoto, updateName }),
    [user, isLoading, login, register, loginAsGuest, logout, updateProfilePhoto, updateName],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
