import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Dimensions,
  ScrollView,
  Platform,
  Image,
  KeyboardAvoidingView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn } from "react-native-reanimated";
import Colors from "@/constants/colors";
import { CIRCLE_CONFIG } from "@/lib/types";
import { ContactsImport, ImportedContact } from "@/components/ContactsImport";
import { useOnboarding } from "@/lib/onboarding-context";
import { useContacts } from "@/lib/contacts-context";
import { useAuth } from "@/lib/auth-context";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Google from "expo-auth-session/providers/google";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type OnboardingStep =
  | "welcome"
  | "circles"
  | "features"
  | "auth"
  | "circle1"
  | "circle2"
  | "circle3"
  | "notifications"
  | "done";

const STEPS: OnboardingStep[] = [
  "welcome",
  "circles",
  "features",
  "auth",
  "circle1",
  "circle2",
  "circle3",
  "notifications",
  "done",
];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { completeOnboarding } = useOnboarding();
  const { addContact, getCircleContacts } = useContacts();
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [circle1Contacts, setCircle1Contacts] = useState<ImportedContact[]>([]);
  const [circle2Contacts, setCircle2Contacts] = useState<ImportedContact[]>([]);
  const [circle3Contacts, setCircle3Contacts] = useState<ImportedContact[]>([]);
  const [saving, setSaving] = useState(false);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const goNext = useCallback(() => {
    if (currentIndex < STEPS.length - 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const next = currentIndex + 1;
      flatListRef.current?.scrollToIndex({ index: next, animated: true });
      setCurrentIndex(next);
    }
  }, [currentIndex]);

  const goBack = useCallback(() => {
    if (currentIndex > 0) {
      const prev = currentIndex - 1;
      flatListRef.current?.scrollToIndex({ index: prev, animated: true });
      setCurrentIndex(prev);
    }
  }, [currentIndex]);

  const handleFinish = useCallback(async () => {
    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const allContacts = [
      ...circle1Contacts.map((c) => ({ ...c, circleLevel: 1 as const })),
      ...circle2Contacts.map((c) => ({ ...c, circleLevel: 2 as const })),
      ...circle3Contacts.map((c) => ({ ...c, circleLevel: 3 as const })),
    ];

    for (const contact of allContacts) {
      try {
        await addContact({
          name: contact.name,
          circleLevel: contact.circleLevel,
          interests: [],
          labels: [],
          birthday: contact.birthday,
          phone: contact.phone,
          notes: undefined,
          lastContacted: undefined,
        });
      } catch {
        // Continue saving remaining contacts even if one fails
      }
    }

    await completeOnboarding();
  }, [circle1Contacts, circle2Contacts, circle3Contacts, addContact, completeOnboarding]);

  const currentStep = STEPS[currentIndex];
  const isAuthStep = currentStep === "auth";
  const isNotifStep = currentStep === "notifications";
  const isImportStep = ["circle1", "circle2", "circle3"].includes(currentStep);
  const isSkippable = currentStep === "circle2" || currentStep === "circle3" || currentStep === "notifications";

  const renderPage = useCallback(
    ({ item }: { item: OnboardingStep }) => {
      switch (item) {
        case "welcome":
          return <WelcomePage />;
        case "circles":
          return <CirclesPage />;
        case "features":
          return <FeaturesPage />;
        case "auth":
          return <AuthPage onSuccess={goNext} isActive={currentIndex === 3} />;
        case "circle1":
          return (
            <CircleImportPage
              circleLevel={1}
              selectedContacts={circle1Contacts}
              existingCount={getCircleContacts(1).length}
              onSelect={(c) => setCircle1Contacts((prev) => [...prev, c])}
              onDeselect={(name) =>
                setCircle1Contacts((prev) => prev.filter((c) => c.name !== name))
              }
            />
          );
        case "circle2":
          return (
            <CircleImportPage
              circleLevel={2}
              selectedContacts={circle2Contacts}
              existingCount={getCircleContacts(2).length}
              onSelect={(c) => setCircle2Contacts((prev) => [...prev, c])}
              onDeselect={(name) =>
                setCircle2Contacts((prev) => prev.filter((c) => c.name !== name))
              }
            />
          );
        case "circle3":
          return (
            <CircleImportPage
              circleLevel={3}
              selectedContacts={circle3Contacts}
              existingCount={getCircleContacts(3).length}
              onSelect={(c) => setCircle3Contacts((prev) => [...prev, c])}
              onDeselect={(name) =>
                setCircle3Contacts((prev) => prev.filter((c) => c.name !== name))
              }
            />
          );
        case "notifications":
          return <NotificationsPage onNext={goNext} />;
        case "done":
          return (
            <DonePage
              total={circle1Contacts.length + circle2Contacts.length + circle3Contacts.length}
            />
          );
        default:
          return null;
      }
    },
    [circle1Contacts, circle2Contacts, circle3Contacts, goNext],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.topBar}>
        {currentIndex > 0 ? (
          <Pressable onPress={goBack} hitSlop={12} style={({ pressed }) => [pressed && { opacity: 0.5 }]}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </Pressable>
        ) : (
          <View style={{ width: 24 }} />
        )}
        <View style={styles.dotsContainer}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === currentIndex && styles.dotActive]}
            />
          ))}
        </View>
        {isSkippable ? (
          <Pressable onPress={goNext} hitSlop={12} style={({ pressed }) => [pressed && { opacity: 0.5 }]}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <FlatList
        ref={flatListRef}
        data={STEPS}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        renderItem={renderPage}
        keyExtractor={(item) => item}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
      />

      {!isAuthStep && !isNotifStep && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 + webBottomInset }]}>
          {currentStep === "done" ? (
            <Pressable
              onPress={handleFinish}
              disabled={saving}
              style={({ pressed }) => [styles.primaryButton, pressed && { opacity: 0.8 }]}
            >
              <Text style={styles.primaryButtonText}>
                {saving ? "Setting up..." : "Let's Go!"}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={goNext}
              style={({ pressed }) => [styles.primaryButton, pressed && { opacity: 0.8 }]}
            >
              <Text style={styles.primaryButtonText}>Next</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Auth Page ────────────────────────────────────────────────────────────────

function AuthPage({ onSuccess, isActive }: { onSuccess: () => void; isActive: boolean }) {
  const { user, login, register, loginWithApple, loginWithGoogle } = useAuth();
  const insets = useSafeAreaInsets();
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const showGoogleButton = !!(
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
  );

  // Auto-advance when this step becomes visible and a session already exists
  // (returning user with a cached session). The isActive guard ensures we only
  // fire when the auth slide is actually the current page — not while it is
  // mounted off-screen behind the welcome/circles/features slides.
  useEffect(() => {
    if (isActive && user) {
      onSuccess();
    }
  // Only re-check when the step becomes active; user identity changing mid-step
  // is handled by the direct onSuccess() calls in the form handlers below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  const handleEmailAuth = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim();

    if (!trimmedEmail) {
      setError("Please enter your email.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      if (mode === "signup") {
        await register(trimmedEmail, password, trimmedName || undefined);
        await login(trimmedEmail, password);
      } else {
        await login(trimmedEmail, password);
      }
      onSuccess();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setError(extractMessage(msg));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAppleSignIn = async () => {
    setError("");
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        setError("Apple sign in failed. Please try again.");
        return;
      }
      setIsSubmitting(true);
      await loginWithApple(credential.identityToken, {
        givenName: credential.fullName?.givenName,
        familyName: credential.fullName?.familyName,
      });
      onSuccess();
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if (code !== "ERR_REQUEST_CANCELED") {
        const msg = e instanceof Error ? e.message : "Apple sign in failed.";
        setError(extractMessage(msg));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleMode = () => {
    setMode((m) => (m === "signup" ? "signin" : "signup"));
    setError("");
    setPassword("");
    setConfirmPassword("");
  };

  return (
    <View style={pageStyles.page}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={[
            authStyles.scrollContent,
            { paddingBottom: insets.bottom + 24 + webBottomInset },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeIn.duration(400)}>
            <Text style={pageStyles.title}>
              {mode === "signup" ? "Create your account" : "Welcome back"}
            </Text>
            <Text style={pageStyles.subtitle}>
              {mode === "signup"
                ? "Set up your account to start building stronger friendships."
                : "Sign in to continue to your circles."}
            </Text>
          </Animated.View>

          {/* Sign in with Apple — iOS only */}
          {Platform.OS === "ios" && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={14}
              style={authStyles.appleButton}
              onPress={handleAppleSignIn}
            />
          )}

          {/* Sign in with Google — rendered as a separate component so the hook
              only runs when real credentials are configured */}
          {showGoogleButton && (
            <GoogleAuthButton
              onToken={(token) => {
                setIsSubmitting(true);
                setError("");
                loginWithGoogle(token)
                  .catch((e: unknown) => {
                    const msg = e instanceof Error ? e.message : "Google sign in failed";
                    setError(extractMessage(msg));
                  })
                  .finally(() => setIsSubmitting(false));
              }}
              onError={(msg) => setError(msg)}
              disabled={isSubmitting}
            />
          )}

          {(Platform.OS === "ios" || showGoogleButton) && (
            <View style={authStyles.divider}>
              <View style={authStyles.dividerLine} />
              <Text style={authStyles.dividerText}>or</Text>
              <View style={authStyles.dividerLine} />
            </View>
          )}

          {/* Mode tabs */}
          <View style={authStyles.modeTabs}>
            <Pressable
              style={[authStyles.modeTab, mode === "signup" && authStyles.modeTabActive]}
              onPress={() => mode !== "signup" && handleToggleMode()}
            >
              <Text style={[authStyles.modeTabText, mode === "signup" && authStyles.modeTabTextActive]}>
                Sign up
              </Text>
            </Pressable>
            <Pressable
              style={[authStyles.modeTab, mode === "signin" && authStyles.modeTabActive]}
              onPress={() => mode !== "signin" && handleToggleMode()}
            >
              <Text style={[authStyles.modeTabText, mode === "signin" && authStyles.modeTabTextActive]}>
                Sign in
              </Text>
            </Pressable>
          </View>

          {/* Name field (signup only) */}
          {mode === "signup" && (
            <View style={authStyles.inputGroup}>
              <Text style={authStyles.inputLabel}>Name (optional)</Text>
              <TextInput
                style={authStyles.input}
                placeholder="Your name"
                placeholderTextColor={Colors.textTertiary}
                value={name}
                onChangeText={(t) => { setName(t); setError(""); }}
                autoComplete="name"
                textContentType="name"
                returnKeyType="next"
              />
            </View>
          )}

          {/* Email */}
          <View style={authStyles.inputGroup}>
            <Text style={authStyles.inputLabel}>Email</Text>
            <TextInput
              style={authStyles.input}
              placeholder="you@example.com"
              placeholderTextColor={Colors.textTertiary}
              value={email}
              onChangeText={(t) => { setEmail(t); setError(""); }}
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              keyboardType="email-address"
              returnKeyType="next"
            />
          </View>

          {/* Password */}
          <View style={authStyles.inputGroup}>
            <Text style={authStyles.inputLabel}>Password</Text>
            <View style={authStyles.passwordRow}>
              <TextInput
                style={[authStyles.input, { flex: 1 }]}
                placeholder="At least 6 characters"
                placeholderTextColor={Colors.textTertiary}
                value={password}
                onChangeText={(t) => { setPassword(t); setError(""); }}
                secureTextEntry={!showPassword}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                textContentType={mode === "signup" ? "newPassword" : "password"}
                returnKeyType={mode === "signup" ? "next" : "done"}
                onSubmitEditing={mode === "signin" ? handleEmailAuth : undefined}
              />
              <TouchableOpacity
                style={authStyles.eyeButton}
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={8}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={Colors.textSecondary}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Confirm password (signup only) */}
          {mode === "signup" && (
            <View style={authStyles.inputGroup}>
              <Text style={authStyles.inputLabel}>Confirm password</Text>
              <TextInput
                style={authStyles.input}
                placeholder="Re-enter your password"
                placeholderTextColor={Colors.textTertiary}
                value={confirmPassword}
                onChangeText={(t) => { setConfirmPassword(t); setError(""); }}
                secureTextEntry={!showPassword}
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="done"
                onSubmitEditing={handleEmailAuth}
              />
            </View>
          )}

          {/* Error */}
          {!!error && (
            <View style={authStyles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color={Colors.danger} />
              <Text style={authStyles.errorText}>{error}</Text>
            </View>
          )}

          {/* Submit */}
          <Pressable
            style={({ pressed }) => [
              authStyles.submitButton,
              (pressed || isSubmitting) && { opacity: 0.75 },
            ]}
            onPress={handleEmailAuth}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={authStyles.submitButtonText}>
                {mode === "signup" ? "Create account" : "Sign in"}
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function extractMessage(raw: string): string {
  const jsonStart = raw.indexOf("{");
  if (jsonStart > -1) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart)) as { message?: string };
      if (parsed.message) return parsed.message;
    } catch {}
  }
  // Strip leading HTTP status code like "400: ..."
  const colonIdx = raw.indexOf(": ");
  if (colonIdx > -1 && colonIdx < 5) {
    return raw.slice(colonIdx + 2);
  }
  return raw;
}

// ─── Google Auth Button ───────────────────────────────────────────────────────
// Separate component so Google.useAuthRequest is only called when
// real credentials are configured (avoids crash when env vars are unset).

function GoogleAuthButton({
  onToken,
  onError,
  disabled,
}: {
  onToken: (accessToken: string) => void;
  onError: (message: string) => void;
  disabled: boolean;
}) {
  const [, response, promptAsync] = Google.useAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  });

  useEffect(() => {
    if (response?.type === "success") {
      const token = response.authentication?.accessToken;
      if (token) onToken(token);
    } else if (response?.type === "error") {
      onError("Google sign in was cancelled or failed.");
    }
  }, [response]);

  return (
    <TouchableOpacity
      style={authStyles.socialButton}
      onPress={() => promptAsync()}
      disabled={disabled}
      activeOpacity={0.75}
    >
      <Ionicons name="logo-google" size={20} color={Colors.text} />
      <Text style={authStyles.socialButtonText}>Continue with Google</Text>
    </TouchableOpacity>
  );
}

// ─── Welcome Page ─────────────────────────────────────────────────────────────

function WelcomePage() {
  return (
    <View style={pageStyles.page}>
      <ScrollView
        contentContainerStyle={pageStyles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(600)} style={pageStyles.illustration}>
          <View style={pageStyles.welcomeCircles}>
            <View style={[pageStyles.welcomeRing, pageStyles.ring3]} />
            <View style={[pageStyles.welcomeRing, pageStyles.ring2]} />
            <View style={[pageStyles.welcomeRing, pageStyles.ring1]} />
            <View style={pageStyles.ringCenter}>
              <Image
                source={require("@/assets/images/bridge-logo.png")}
                style={{ width: 42, height: 26 }}
                tintColor={Colors.primary}
                resizeMode="contain"
              />
            </View>
          </View>
        </Animated.View>
        <Animated.View entering={FadeIn.delay(200).duration(600)}>
          <Text style={pageStyles.title}>Welcome to Bridges</Text>
          <Text style={pageStyles.subtitle}>
            Helping you stay close to the people who matter most in your life.
          </Text>
          <Text style={pageStyles.body}>
            Great friendships don't just happen - they're nurtured. Bridges gives you the tools to keep every important relationship thriving.
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ─── Circles Page ─────────────────────────────────────────────────────────────

function CirclesPage() {
  return (
    <View style={pageStyles.page}>
      <ScrollView
        contentContainerStyle={pageStyles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(600)} style={pageStyles.illustration}>
          <View style={pageStyles.circlesDemo}>
            {([3, 2, 1] as const).map((level) => {
              const cfg = CIRCLE_CONFIG[level];
              const sizes = { 3: 160, 2: 110, 1: 60 };
              return (
                <View
                  key={level}
                  style={[
                    pageStyles.circleRing,
                    {
                      width: sizes[level],
                      height: sizes[level],
                      borderRadius: sizes[level] / 2,
                      borderColor: cfg.color + "60",
                      backgroundColor: cfg.color + "12",
                    },
                  ]}
                />
              );
            })}
          </View>
        </Animated.View>

        <Animated.View entering={FadeIn.delay(200).duration(600)}>
          <Text style={pageStyles.title}>Your 3 Circles</Text>
          <Text style={pageStyles.subtitle}>
            Based on Dunbar's research, we organize your relationships into three levels of closeness.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeIn.delay(400).duration(600)} style={pageStyles.circlesList}>
          {([1, 2, 3] as const).map((level) => {
            const cfg = CIRCLE_CONFIG[level];
            return (
              <View key={level} style={pageStyles.circleItem}>
                <View style={[pageStyles.circleDot, { backgroundColor: cfg.color }]} />
                <View style={pageStyles.circleItemContent}>
                  <Text style={pageStyles.circleLabel}>
                    {cfg.label}{" "}
                    <Text style={pageStyles.circleMax}>(up to {cfg.max})</Text>
                  </Text>
                  <Text style={pageStyles.circleDesc}>{cfg.description}</Text>
                </View>
              </View>
            );
          })}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ─── Features Page ────────────────────────────────────────────────────────────

function FeaturesPage() {
  const features = [
    {
      icon: "chatbubble-ellipses-outline" as const,
      title: "Conversation Starters",
      desc: "Get personalized suggestions for what to text or talk about with each person.",
      color: Colors.primary,
    },
    {
      icon: "calendar-outline" as const,
      title: "Hangout Planning",
      desc: "Plan hangouts and send surveys so friends can vote on dates and activities.",
      color: Colors.accent,
    },
    {
      icon: "gift-outline" as const,
      title: "Birthday Reminders",
      desc: "Never miss an important birthday. Get timely reminders for everyone in your circles.",
      color: Colors.warning,
    },
    {
      icon: "notifications-outline" as const,
      title: "Check-in Nudges",
      desc: "Gentle reminders when you haven't reached out to someone in a while.",
      color: Colors.circle3,
    },
  ];

  return (
    <View style={pageStyles.page}>
      <ScrollView
        contentContainerStyle={pageStyles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(600)}>
          <Text style={pageStyles.title}>What Bridges Does For You</Text>
          <Text style={pageStyles.subtitle}>
            Everything you need to keep your friendships strong and thriving.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeIn.delay(200).duration(600)} style={pageStyles.featuresList}>
          {features.map((f, i) => (
            <Animated.View
              key={i}
              entering={FadeIn.delay(300 + i * 100).duration(500)}
              style={pageStyles.featureItem}
            >
              <View style={[pageStyles.featureIcon, { backgroundColor: f.color + "18" }]}>
                <Ionicons name={f.icon} size={22} color={f.color} />
              </View>
              <View style={pageStyles.featureContent}>
                <Text style={pageStyles.featureTitle}>{f.title}</Text>
                <Text style={pageStyles.featureDesc}>{f.desc}</Text>
              </View>
            </Animated.View>
          ))}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ─── Circle Import Page ───────────────────────────────────────────────────────

function CircleImportPage({
  circleLevel,
  selectedContacts,
  existingCount,
  onSelect,
  onDeselect,
}: {
  circleLevel: 1 | 2 | 3;
  selectedContacts: ImportedContact[];
  existingCount: number;
  onSelect: (c: ImportedContact) => void;
  onDeselect: (name: string) => void;
}) {
  const cfg = CIRCLE_CONFIG[circleLevel];
  const remainingSlots = Math.max(0, cfg.max - existingCount);

  const prompts: Record<number, string> = {
    1: "These are the people you talk to almost every day. Your ride-or-die crew.",
    2: "People you trust and enjoy spending time with. You reach out regularly.",
    3: "People you like and want to stay connected with, but see less often.",
  };

  return (
    <View style={pageStyles.page}>
      <ScrollView
        contentContainerStyle={pageStyles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View entering={FadeIn.duration(400)}>
          <View style={pageStyles.circleHeader}>
            <View style={[pageStyles.circleBadge, { backgroundColor: cfg.color + "20" }]}>
              <View style={[pageStyles.circleBadgeDot, { backgroundColor: cfg.color }]} />
              <Text style={[pageStyles.circleBadgeLabel, { color: cfg.color }]}>
                {cfg.label}
              </Text>
              <Text style={[pageStyles.circleBadgeCount, { color: cfg.color }]}>
                {existingCount + selectedContacts.length}/{cfg.max}
              </Text>
            </View>
          </View>
          <Text style={pageStyles.title}>Add Your {cfg.label}</Text>
          <Text style={pageStyles.subtitle}>{prompts[circleLevel]}</Text>
        </Animated.View>

        <Animated.View entering={FadeIn.delay(200).duration(400)} style={pageStyles.importContainer}>
          <ContactsImport
            selectedContacts={selectedContacts}
            onSelect={onSelect}
            onDeselect={onDeselect}
            maxSelections={remainingSlots}
          />
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ─── Notifications Page ───────────────────────────────────────────────────────

function NotificationsPage({ onNext }: { onNext: () => void }) {
  const { updateNotificationPreferences } = useAuth();
  const [frequency, setFrequency] = useState<string>("daily");
  const [time, setTime] = useState<string>("morning");
  const [saving, setSaving] = useState(false);
  const [permDenied, setPermDenied] = useState(false);
  const insets = useSafeAreaInsets();
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  // Request notification permission as soon as the screen is shown
  useEffect(() => {
    if (Platform.OS === "web") return;
    (async () => {
      try {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== "granted") {
          setPermDenied(true);
        }
      } catch {
        // Non-fatal
      }
    })();
  }, []);

  const FREQ_OPTIONS = [
    { value: "daily", label: "Once a day" },
    { value: "3x_week", label: "Three times a week" },
    { value: "weekly", label: "Once a week" },
    { value: "off", label: "Not right now" },
  ];

  const TIME_OPTIONS = [
    { value: "morning", label: "Morning", sub: "Around 9am" },
    { value: "afternoon", label: "Afternoon", sub: "Around 5pm" },
  ];

  const handleContinue = async () => {
    setSaving(true);
    try {
      await updateNotificationPreferences(frequency, frequency !== "off" ? time : null);
    } catch {
      // Non-fatal — continue to next step regardless
    } finally {
      setSaving(false);
      onNext();
    }
  };

  return (
    <View style={pageStyles.page}>
      <ScrollView
        contentContainerStyle={pageStyles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(600)}>
          <Text style={pageStyles.title}>Stay connected without thinking about it</Text>
          <Text style={pageStyles.subtitle}>
            Birthday and check-in reminders are always on. Choose how often you want proactive nudges suggesting who to reach out to next.
          </Text>
        </Animated.View>

        {permDenied && (
          <Animated.View entering={FadeIn.duration(400)} style={notifStyles.deniedBanner}>
            <Text style={notifStyles.deniedText}>
              Notifications are currently disabled. To receive nudges, enable them in your device Settings.
            </Text>
          </Animated.View>
        )}

        <Animated.View entering={FadeIn.delay(200).duration(600)} style={notifStyles.group}>
          <Text style={notifStyles.groupLabel}>How often should we nudge you?</Text>
          <View style={notifStyles.tilesGrid}>
            {FREQ_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                style={[notifStyles.tile, frequency === opt.value && notifStyles.tileActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setFrequency(opt.value);
                }}
              >
                <Text style={[notifStyles.tileLabel, frequency === opt.value && notifStyles.tileLabelActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>

        {frequency !== "off" && (
          <Animated.View entering={FadeIn.duration(400)} style={notifStyles.group}>
            <Text style={notifStyles.groupLabel}>Best time to receive them?</Text>
            <View style={notifStyles.timeRow}>
              {TIME_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={[notifStyles.timeTile, time === opt.value && notifStyles.timeTileActive]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setTime(opt.value);
                  }}
                >
                  <Text style={[notifStyles.timeTileLabel, time === opt.value && notifStyles.timeTileLabelActive]}>
                    {opt.label}
                  </Text>
                  <Text style={[notifStyles.timeTileSub, time === opt.value && notifStyles.timeTileSubActive]}>
                    {opt.sub}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        )}
      </ScrollView>

      <View style={[notifStyles.bottomBar, { paddingBottom: insets.bottom + 16 + webBottomInset }]}>
        <Pressable
          onPress={handleContinue}
          disabled={saving}
          style={({ pressed }) => [styles.primaryButton, (pressed || saving) && { opacity: 0.8 }]}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Text style={styles.primaryButtonText}>Continue</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

// ─── Done Page ────────────────────────────────────────────────────────────────

function DonePage({ total }: { total: number }) {
  return (
    <View style={pageStyles.page}>
      <ScrollView
        contentContainerStyle={[pageStyles.scrollContent, { justifyContent: "center", flex: 1 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(600)} style={pageStyles.doneIllustration}>
          <View style={pageStyles.doneCircle}>
            <Ionicons name="checkmark" size={48} color={Colors.success} />
          </View>
        </Animated.View>

        <Animated.View entering={FadeIn.delay(300).duration(600)}>
          <Text style={pageStyles.title}>You're All Set!</Text>
          <Text style={pageStyles.subtitle}>
            {total > 0
              ? `You've added ${total} ${total === 1 ? "person" : "people"} to your circles. You can always add more later.`
              : "You can start adding people to your circles anytime from the Circles tab."}
          </Text>
        </Animated.View>

        <Animated.View entering={FadeIn.delay(500).duration(600)} style={pageStyles.doneFeatures}>
          <View style={pageStyles.doneItem}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
            <Text style={pageStyles.doneItemText}>Personalized suggestions ready</Text>
          </View>
          <View style={pageStyles.doneItem}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
            <Text style={pageStyles.doneItemText}>Check-in reminders active</Text>
          </View>
          <View style={pageStyles.doneItem}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
            <Text style={pageStyles.doneItemText}>Birthday tracking enabled</Text>
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  dotsContainer: {
    flexDirection: "row",
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.border,
  },
  dotActive: {
    backgroundColor: Colors.primary,
    width: 20,
    borderRadius: 4,
  },
  skipText: {
    fontSize: 15,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 16,
  },
  primaryButtonText: {
    fontSize: 17,
    fontFamily: "Nunito_700Bold",
    color: "#fff",
  },
});

const pageStyles = StyleSheet.create({
  page: {
    width: SCREEN_WIDTH,
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 28,
    paddingTop: 16,
    paddingBottom: 20,
  },
  illustration: {
    alignItems: "center",
    marginBottom: 28,
  },
  welcomeCircles: {
    width: 180,
    height: 180,
    alignItems: "center",
    justifyContent: "center",
  },
  welcomeRing: {
    position: "absolute",
    borderWidth: 2,
    borderStyle: "dashed",
  },
  ring1: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderColor: Colors.circle1 + "70",
    backgroundColor: Colors.circle1 + "10",
  },
  ring2: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderColor: Colors.circle2 + "50",
    backgroundColor: Colors.circle2 + "08",
  },
  ring3: {
    width: 170,
    height: 170,
    borderRadius: 85,
    borderColor: Colors.circle3 + "40",
    backgroundColor: Colors.circle3 + "06",
  },
  ringCenter: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.circle1 + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 26,
    fontFamily: "Nunito_800ExtraBold",
    color: Colors.text,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    fontFamily: "Nunito_400Regular",
    color: Colors.textTertiary,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 8,
  },
  circlesDemo: {
    width: 180,
    height: 180,
    alignItems: "center",
    justifyContent: "center",
  },
  circleRing: {
    position: "absolute",
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  circlesList: {
    marginTop: 20,
    gap: 14,
  },
  circleItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  circleDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 3,
  },
  circleItemContent: {
    flex: 1,
  },
  circleLabel: {
    fontSize: 15,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
  },
  circleMax: {
    fontFamily: "Nunito_400Regular",
    color: Colors.textTertiary,
    fontSize: 13,
  },
  circleDesc: {
    fontSize: 13,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    marginTop: 2,
  },
  featuresList: {
    marginTop: 20,
    gap: 14,
  },
  featureItem: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  featureIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
  },
  featureDesc: {
    fontSize: 13,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    lineHeight: 18,
    marginTop: 2,
  },
  circleHeader: {
    alignItems: "center",
    marginBottom: 16,
  },
  circleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  circleBadgeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  circleBadgeLabel: {
    fontSize: 14,
    fontFamily: "Nunito_700Bold",
  },
  circleBadgeCount: {
    fontSize: 13,
    fontFamily: "Nunito_600SemiBold",
    opacity: 0.8,
  },
  importContainer: {
    marginTop: 8,
  },
  doneIllustration: {
    alignItems: "center",
    marginBottom: 28,
  },
  doneCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.success + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  doneFeatures: {
    marginTop: 24,
    gap: 12,
  },
  doneItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  doneItemText: {
    fontSize: 15,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.text,
  },
});

const notifStyles = StyleSheet.create({
  group: {
    marginTop: 28,
  },
  groupLabel: {
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  tilesGrid: {
    flexDirection: "row",
    flexWrap: "wrap" as const,
    gap: 10,
  },
  tile: {
    minWidth: "47%",
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.surface,
    alignItems: "center" as const,
  },
  tileActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + "18",
  },
  tileLabel: {
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
    textAlign: "center" as const,
  },
  tileLabelActive: {
    color: Colors.primary,
  },
  timeRow: {
    flexDirection: "row" as const,
    gap: 10,
  },
  timeTile: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.surface,
    alignItems: "center" as const,
    gap: 4,
  },
  timeTileActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + "18",
  },
  timeTileLabel: {
    fontSize: 15,
    fontFamily: "Nunito_700Bold",
    color: Colors.textSecondary,
  },
  timeTileLabelActive: {
    color: Colors.primary,
  },
  timeTileSub: {
    fontSize: 12,
    fontFamily: "Nunito_400Regular",
    color: Colors.textTertiary,
  },
  timeTileSubActive: {
    color: Colors.primary + "cc",
  },
  deniedBanner: {
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  deniedText: {
    fontSize: 13,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    backgroundColor: Colors.background,
  },
});

const authStyles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 28,
    paddingTop: 16,
  },
  appleButton: {
    width: "100%",
    height: 52,
    marginTop: 20,
    marginBottom: 10,
  },
  socialButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    marginBottom: 10,
  },
  socialButtonText: {
    fontSize: 15,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.text,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 16,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    fontSize: 13,
    fontFamily: "Nunito_400Regular",
    color: Colors.textTertiary,
  },
  modeTabs: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 3,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
  },
  modeTabActive: {
    backgroundColor: Colors.primary,
  },
  modeTabText: {
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
  },
  modeTabTextActive: {
    color: "#fff",
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    height: 50,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    fontSize: 15,
    fontFamily: "Nunito_400Regular",
    color: Colors.text,
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
  },
  eyeButton: {
    position: "absolute",
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.danger + "15",
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Nunito_400Regular",
    color: Colors.danger,
  },
  submitButton: {
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    marginBottom: 20,
  },
  submitButtonText: {
    fontSize: 16,
    fontFamily: "Nunito_700Bold",
    color: "#fff",
  },
});
