import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
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
  const { hasCompletedOnboarding } = useOnboarding();
  const responseListener = useRef<{ remove(): void } | null>(null);

  // Register for push notifications once onboarding is done and user is authenticated
  useEffect(() => {
    if (!user || !hasCompletedOnboarding) return;

    registerForPushNotifications().then((token) => {
      if (token) savePushToken(token);
    });

    // Handle notification taps — deep-link to the relevant contact's edit screen
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, string> | undefined;
      if (data?.contactId) {
        router.push({ pathname: "/edit-contact", params: { id: data.contactId } });
      } else {
        router.push("/(tabs)");
      }
    });

    return () => {
      responseListener.current?.remove();
      responseListener.current = null;
    };
  }, [user?.id, hasCompletedOnboarding]);

  useEffect(() => {
    if (hasCompletedOnboarding === null || !isCacheHydrated) return;

    if (!hasCompletedOnboarding) {
      router.replace("/onboarding");
    } else if (!user) {
      router.replace("/auth");
    } else {
      router.replace("/(tabs)");
    }
  }, [user, hasCompletedOnboarding, isCacheHydrated]);

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
