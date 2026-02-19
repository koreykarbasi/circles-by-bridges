import React, { useState, useRef, useCallback } from "react";
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeIn,
} from "react-native-reanimated";
import Colors from "@/constants/colors";
import { CIRCLE_CONFIG } from "@/lib/types";
import { ContactsImport, ImportedContact } from "@/components/ContactsImport";
import { useOnboarding } from "@/lib/onboarding-context";
import { useContacts } from "@/lib/contacts-context";
import { AVATAR_COLORS } from "@/lib/types";
import * as Haptics from "expo-haptics";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type OnboardingStep =
  | "welcome"
  | "circles"
  | "features"
  | "circle1"
  | "circle2"
  | "circle3"
  | "done";

const STEPS: OnboardingStep[] = [
  "welcome",
  "circles",
  "features",
  "circle1",
  "circle2",
  "circle3",
  "done",
];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { completeOnboarding } = useOnboarding();
  const { addContact } = useContacts();
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
      await addContact({
        name: contact.name,
        circleLevel: contact.circleLevel,
        interests: [],
        birthday: contact.birthday,
        phone: contact.phone,
        notes: undefined,
        lastContacted: undefined,
      });
    }

    await completeOnboarding();
  }, [circle1Contacts, circle2Contacts, circle3Contacts, addContact, completeOnboarding]);

  const currentStep = STEPS[currentIndex];
  const isImportStep = ["circle1", "circle2", "circle3"].includes(currentStep);
  const isSkippable = currentStep === "circle2" || currentStep === "circle3";

  const renderPage = useCallback(
    ({ item }: { item: OnboardingStep }) => {
      switch (item) {
        case "welcome":
          return <WelcomePage />;
        case "circles":
          return <CirclesPage />;
        case "features":
          return <FeaturesPage />;
        case "circle1":
          return (
            <CircleImportPage
              circleLevel={1}
              selectedContacts={circle1Contacts}
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
              onSelect={(c) => setCircle3Contacts((prev) => [...prev, c])}
              onDeselect={(name) =>
                setCircle3Contacts((prev) => prev.filter((c) => c.name !== name))
              }
            />
          );
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
    [circle1Contacts, circle2Contacts, circle3Contacts],
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
            <Text style={styles.primaryButtonText}>
              {isImportStep
                ? isSkippable
                  ? "Continue"
                  : "Next"
                : "Next"}
            </Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

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

function CircleImportPage({
  circleLevel,
  selectedContacts,
  onSelect,
  onDeselect,
}: {
  circleLevel: 1 | 2 | 3;
  selectedContacts: ImportedContact[];
  onSelect: (c: ImportedContact) => void;
  onDeselect: (name: string) => void;
}) {
  const cfg = CIRCLE_CONFIG[circleLevel];

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
                {selectedContacts.length}/{cfg.max}
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
            maxSelections={cfg.max}
          />
        </Animated.View>
      </ScrollView>
    </View>
  );
}

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
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  circleBadgeLabel: {
    fontSize: 14,
    fontFamily: "Nunito_700Bold",
  },
  circleBadgeCount: {
    fontSize: 12,
    fontFamily: "Nunito_600SemiBold",
  },
  importContainer: {
    marginTop: 16,
    flex: 1,
  },
  doneIllustration: {
    alignItems: "center",
    marginBottom: 24,
  },
  doneCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Colors.success + "18",
    borderWidth: 2,
    borderColor: Colors.success + "40",
    alignItems: "center",
    justifyContent: "center",
  },
  doneFeatures: {
    marginTop: 28,
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
