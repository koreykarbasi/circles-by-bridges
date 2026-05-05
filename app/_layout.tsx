import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
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
import { router } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import Colors from "@/constants/colors";

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { user, isCacheHydrated } = useAuth();
  const { hasCompletedOnboarding } = useOnboarding();

  useEffect(() => {
    // Wait for onboarding flag AND auth cache to be read before navigating.
    // Both are fast AsyncStorage reads. The background network check updates
    // state afterward without causing flicker.
    if (hasCompletedOnboarding === null || !isCacheHydrated) return;

    if (!hasCompletedOnboarding) {
      router.replace("/onboarding");
    } else if (!user) {
      // No cached user → go to auth. If background check later validates a
      // session the user will be redirected to tabs when user state updates.
      router.replace("/auth");
    } else {
      router.replace("/(tabs)");
    }
  }, [user, hasCompletedOnboarding, isCacheHydrated]);

  // Spinner only while onboarding flag or auth cache is being read (milliseconds).
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
