import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, router, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { ContactsProvider } from "@/lib/contacts-context";
import { OnboardingProvider, useOnboarding } from "@/lib/onboarding-context";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import {
  useFonts,
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from "@expo-google-fonts/nunito";
import { View, ActivityIndicator, Platform } from "react-native";
import Colors from "@/constants/colors";
import * as Notifications from "expo-notifications";
import { apiRequest } from "@/lib/query-client";

SplashScreen.preventAutoHideAsync();

// Show notifications in foreground as banners
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === "web") return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") return null;

  try {
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    return token;
  } catch {
    return null;
  }
}

async function savePushToken(token: string) {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    await apiRequest("PUT", "/api/notifications/token", { token, timezone });
  } catch {
    // Non-fatal — token registration is best-effort
  }
}

function RootLayoutNav() {
  const { user, isCacheHydrated } = useAuth();
  const { hasCompletedOnboarding, isReplayRequested } = useOnboarding();
  const segments = useSegments();
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const responseListener = useRef<{ remove(): void } | null>(null);

  // Auth is now embedded inside onboarding, so the only safe signal that onboarding
  // is fully done is the explicit AsyncStorage flag — not the presence of a user session.
  // Using user !== null as a shortcut would redirect authenticated users away from
  // onboarding before they finish adding their contacts.
  const onboardingDone = hasCompletedOnboarding === true && !isReplayRequested;

  // Push notifications gate: only register after both onboarding and auth are complete.
  useEffect(() => {
    if (!user || !onboardingDone) return;

    registerForPushNotifications().then((token) => {
      if (token) savePushToken(token);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, string> | undefined;
      if (data?.hangoutId) {
        router.push({ pathname: "/hangout-detail", params: { id: data.hangoutId } });
      } else if (data?.contactId) {
        router.push({ pathname: "/edit-contact", params: { id: data.contactId } });
      } else {
        router.push("/(tabs)");
      }
    });

    return () => {
      responseListener.current?.remove();
      responseListener.current = null;
    };
  }, [user?.id, onboardingDone]);

  useEffect(() => {
    if (hasCompletedOnboarding === null || !isCacheHydrated) return;

    if (!onboardingDone) {
      // Don't replace if already on onboarding — avoids resetting the pager mid-flow
      // (e.g., when user signs in on the embedded auth step).
      const alreadyOnOnboarding = segmentsRef.current[0] === "onboarding";
      if (!alreadyOnOnboarding) {
        router.replace("/onboarding");
      }
      return;
    }

    // Onboarding complete — route by auth state
    if (!user) {
      router.replace("/auth");
    } else {
      router.replace("/(tabs)");
    }
  }, [user, hasCompletedOnboarding, isReplayRequested, isCacheHydrated]);

  if (hasCompletedOnboarding === null || !isCacheHydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="auth" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="add-contact"
        options={{ headerShown: false, presentation: "modal" }}
      />
      <Stack.Screen
        name="edit-contact"
        options={{ headerShown: false, presentation: "modal" }}
      />
      <Stack.Screen
        name="profile"
        options={{ headerShown: false, presentation: "modal" }}
      />
      <Stack.Screen
        name="create-hangout"
        options={{ headerShown: false, presentation: "modal" }}
      />
      <Stack.Screen
        name="hangout-detail"
        options={{ headerShown: false, presentation: "modal" }}
      />
      <Stack.Screen
        name="import-contacts"
        options={{ headerShown: false, presentation: "modal" }}
      />
      <Stack.Screen
        name="complete-contacts"
        options={{ headerShown: false, presentation: "modal" }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <OnboardingProvider>
            <ContactsProvider>
              <GestureHandlerRootView>
                <KeyboardProvider>
                  <RootLayoutNav />
                </KeyboardProvider>
              </GestureHandlerRootView>
            </ContactsProvider>
          </OnboardingProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
