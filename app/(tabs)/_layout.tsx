import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs, usePathname } from "expo-router";
import { NativeTabs, Icon, Label } from "expo-router/unstable-native-tabs";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { AppState, Platform, StyleSheet, useColorScheme, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import React, { useMemo, useState, useEffect, useRef } from "react";
import Colors from "@/constants/colors";
import { useContacts } from "@/lib/contacts-context";
import { computeProfileCompletion } from "@/lib/profile-completion";
import { useQuery } from "@tanstack/react-query";
import type { HangoutPlan } from "@/lib/types";
import { getViewedTimestamps, hasUnreadVotes } from "@/lib/hangout-notifications";
import { useAuth } from "@/lib/auth-context";

function useHangoutUnreadCount(): number {
  const { user } = useAuth();
  const { data: hangouts } = useQuery<HangoutPlan[]>({
    queryKey: ["/api/hangouts"],
    refetchInterval: 60000,
  });
  const [viewedMap, setViewedMap] = useState<Record<string, string>>({});
  const pathname = usePathname();
  const refreshRef = useRef<() => void>(() => {});

  refreshRef.current = () => {
    if (!user?.id) return;
    getViewedTimestamps(user.id).then(setViewedMap);
  };

  // Refresh viewed timestamps whenever:
  // - user or hangouts data changes
  // - pathname changes (catches returning from hangout-detail modal)
  useEffect(() => {
    refreshRef.current();
  }, [user?.id, hangouts, pathname]);

  // Also refresh when app returns to foreground
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refreshRef.current();
      }
    });
    return () => sub.remove();
  }, []);

  return useMemo(() => {
    if (!hangouts) return 0;
    return hangouts.filter(
      (h) => h.status !== "finalized" && hasUnreadVotes(h, viewedMap[h.id])
    ).length;
  }, [hangouts, viewedMap]);
}

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "heart.circle", selected: "heart.circle.fill" }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="circles">
        <Icon sf={{ default: "circles.hexagongrid", selected: "circles.hexagongrid.fill" }} />
        <Label>Circles</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="suggestions">
        <Icon sf={{ default: "lightbulb", selected: "lightbulb.fill" }} />
        <Label>Suggestions</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="hangouts">
        <Icon sf={{ default: "calendar", selected: "calendar.badge.checkmark" }} />
        <Label>Hangouts</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout({ hangoutUnreadCount }: { hangoutUnreadCount: number }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isWeb = Platform.OS === "web";
  const isIOS = Platform.OS === "ios";
  const safeAreaInsets = useSafeAreaInsets();
  const { contacts } = useContacts();
  const profileCompletion = useMemo(() => computeProfileCompletion(contacts), [contacts]);
  const circlesBadge = profileCompletion.stage === 1 ? "" : undefined;
  const hangoutsBadge = hangoutUnreadCount > 0 ? hangoutUnreadCount : undefined;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.light.tabIconDefault,
        tabBarStyle: {
          position: "absolute" as const,
          backgroundColor: isIOS ? "transparent" : isDark ? "#000" : "#fff",
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: isDark ? "#333" : Colors.borderLight,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
          ...(!isWeb ? { paddingBottom: safeAreaInsets.bottom } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: isDark ? "#000" : "#fff" },
              ]}
            />
          ) : null,
        tabBarLabelStyle: {
          fontFamily: "Nunito_600SemiBold",
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "heart-circle" : "heart-circle-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="circles"
        options={{
          title: "Circles",
          tabBarBadge: circlesBadge,
          tabBarBadgeStyle: { backgroundColor: Colors.primary, fontSize: 10 },
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "people-circle" : "people-circle-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="suggestions"
        options={{
          title: "Suggestions",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "bulb" : "bulb-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="hangouts"
        options={{
          title: "Hangouts",
          tabBarBadge: hangoutsBadge,
          tabBarBadgeStyle: { backgroundColor: Colors.primary, fontSize: 10 },
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "calendar" : "calendar-outline"} size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  const { contacts } = useContacts();
  const profileCompletion = useMemo(() => computeProfileCompletion(contacts), [contacts]);
  const hangoutUnreadCount = useHangoutUnreadCount();

  // Use NativeTabs (liquid glass) only when:
  // - profile is complete (stage 2, no circles badge needed)
  // - no unread hangout votes (badge not supported in NativeTabs)
  if (isLiquidGlassAvailable() && profileCompletion.stage === 2 && hangoutUnreadCount === 0) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout hangoutUnreadCount={hangoutUnreadCount} />;
}
