import React, { useCallback } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSequence, runOnJS, Easing } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { Avatar } from "./Avatar";
import Colors from "@/constants/colors";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";

interface SuggestionCardProps {
  contactName: string;
  avatarColor: string;
  photoUri?: string | null;
  prompt: string;
  type: "call" | "text" | "hangout";
  circleLevel: 1 | 2 | 3;
  urgency?: "overdue" | "soon" | "ok";
  birthdayLabel?: string;
  lastContactedLabel?: string;
  interests?: string[];
  labels?: string[];
  daysSinceContact?: number | null;
  hasBirthdaySoon?: boolean;
  onDone: () => void;
  onRefresh: () => void;
  onCopyText?: () => void;
  onCopied?: () => void;
  onPlanHangout?: () => void;
}

const TYPE_CONFIG = {
  call: { icon: "call-outline" as const, label: "Call" },
  text: { icon: "chatbubble-outline" as const, label: "Text" },
  hangout: { icon: "people-outline" as const, label: "Hang out" },
};

const URGENCY_CONFIG = {
  overdue: { color: Colors.danger, label: "Overdue" },
  soon: { color: Colors.warning, label: "Due soon" },
  ok: { color: Colors.success, label: "On track" },
};

const OPENERS = [
  "Hey {name}, I was just thinking about you",
  "Hey {name}, you crossed my mind today",
  "Hey {name}, randomly thought of you",
  "Hey {name}, you've been on my mind",
];

const BIRTHDAY_REASONS = [
  "— your birthday is coming up and I didn't want to miss it. Hope you have an amazing day!",
  "— just wanted to wish you an early happy birthday! Hope it's a great one.",
  "— had to reach out before your birthday. Hope you have the best one!",
];

const OVERDUE_REASONS = [
  "— it's been a while and I've been meaning to reach out.",
  "— it's been too long. Would love to catch up soon.",
  "— feels like ages. How have you been?",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function reasonFromPrompt(prompt: string, interests: string[], labels: string[]): string {
  const lower = prompt.toLowerCase();

  // Interest match from prompt text
  for (const interest of interests) {
    if (lower.includes(interest.toLowerCase())) {
      return `— was curious how the ${interest.toLowerCase()} has been going.`;
    }
  }

  // Prompt-derived reasons — ordered from most specific to least
  if (lower.includes("memory") || lower.includes("remember") || lower.includes("reminiscing") || lower.includes("shared memory")) {
    return "— I was just reminiscing about one of our memories.";
  }
  if (lower.includes("appreciat") || lower.includes("admire") || lower.includes("grateful") || lower.includes("thankful")) {
    return "— I was thinking about how much I appreciate having you in my life.";
  }
  if (lower.includes("laugh") || lower.includes("funny") || lower.includes("joke")) {
    return "— something made me laugh and it reminded me of you.";
  }
  if (lower.includes("support") || lower.includes("there for") || lower.includes("helped you grow") || lower.includes("challenge")) {
    return "— thinking about how much you've supported me lately.";
  }
  if (lower.includes("vulnerable") || lower.includes("honest") || lower.includes("open up")) {
    return "— there's something I've been meaning to share with you.";
  }
  if (lower.includes("voice") || lower.includes("hear your voice") || lower.includes("voice note")) {
    return "— I just wanted to hear how things are going.";
  }
  if (lower.includes("plan") || lower.includes("hang") || lower.includes("get together") || lower.includes("spontaneous")) {
    return "— we should make time to get together soon.";
  }
  if (lower.includes("birthday")) {
    return "— your birthday is on my mind and I wanted to reach out.";
  }
  if (lower.includes("trip") || lower.includes("travel") || lower.includes("adventure")) {
    return "— been thinking about your travels lately.";
  }
  if (lower.includes("work") || lower.includes("career") || lower.includes("job")) {
    return "— I wanted to check in and see how work's been treating you.";
  }
  if (lower.includes("recipe") || lower.includes("cook") || lower.includes("food")) {
    return "— I tried a new recipe and thought of you.";
  }
  if (lower.includes("read") || lower.includes("book")) {
    return "— I read something recently that made me think of you.";
  }
  if (lower.includes("training") || lower.includes("workout") || lower.includes("hike") || lower.includes("run")) {
    return "— curious how your training has been going lately.";
  }

  // Label-based fallback
  if (labels.length > 0) {
    const label = labels[0].toLowerCase();
    if (label.includes("childhood") || label.includes("college")) {
      return "— I was just thinking about our history together.";
    }
    if (label.includes("work")) {
      return "— I wanted to check in and see how things are going at work.";
    }
    if (label.includes("travel")) {
      return "— been thinking about our last trip.";
    }
    if (label.includes("family")) {
      return "— wanted to check in and see how the family is doing.";
    }
  }

  // Interests fallback
  if (interests.length > 0) {
    return `— was curious how the ${interests[0].toLowerCase()} has been going.`;
  }

  // Last resort: always has a specific reason, never generic
  return "— I just wanted to reach out and check in with you.";
}

export function getTextCopyMessage(
  contactName: string,
  options?: {
    prompt?: string;
    interests?: string[];
    labels?: string[];
    daysSinceContact?: number | null;
    hasBirthdaySoon?: boolean;
    circleLevel?: 1 | 2 | 3;
  },
): string {
  const opener = pick(OPENERS).replace("{name}", contactName);
  const {
    prompt = "",
    interests = [],
    labels = [],
    daysSinceContact,
    hasBirthdaySoon,
  } = options ?? {};

  if (hasBirthdaySoon) {
    return `${opener} ${pick(BIRTHDAY_REASONS)}`;
  }

  if (daysSinceContact !== null && daysSinceContact !== undefined && daysSinceContact > 45) {
    return `${opener} ${pick(OVERDUE_REASONS)}`;
  }

  return `${opener} ${reasonFromPrompt(prompt, interests, labels)}`;
}

export function SuggestionCard({
  contactName,
  avatarColor,
  photoUri,
  prompt,
  type,
  circleLevel,
  urgency = "ok",
  birthdayLabel,
  lastContactedLabel,
  interests = [],
  labels = [],
  daysSinceContact,
  hasBirthdaySoon,
  onDone,
  onRefresh,
  onCopyText,
  onCopied,
  onPlanHangout,
}: SuggestionCardProps) {
  const circleColor = circleLevel === 1 ? Colors.circle1 : circleLevel === 2 ? Colors.circle2 : Colors.circle3;
  const typeConfig = TYPE_CONFIG[type];
  const urgencyConfig = URGENCY_CONFIG[urgency];

  const opacity = useSharedValue(1);
  const translateX = useSharedValue(0);
  const height = useSharedValue<number | undefined>(undefined);
  const marginBottom = useSharedValue(12);
  const refreshScale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
    height: height.value,
    marginBottom: marginBottom.value,
    overflow: "hidden" as const,
  }));

  const refreshStyle = useAnimatedStyle(() => ({
    transform: [{ scale: refreshScale.value }],
  }));


  const handleDone = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    translateX.value = withTiming(-400, { duration: 300, easing: Easing.out(Easing.cubic) });
    opacity.value = withTiming(0, { duration: 300 }, () => {
      height.value = withTiming(0, { duration: 200 });
      marginBottom.value = withTiming(0, { duration: 200 }, () => {
        runOnJS(onDone)();
      });
    });
  }, [onDone]);

  const handleRefresh = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    refreshScale.value = withSequence(
      withTiming(0.9, { duration: 100 }),
      withTiming(1.05, { duration: 150 }),
      withTiming(1, { duration: 100 }),
    );
    opacity.value = withSequence(
      withTiming(0.4, { duration: 120 }),
      withTiming(1, { duration: 200 }),
    );
    setTimeout(() => onRefresh(), 120);
  }, [onRefresh]);

  const handleCopyText = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const message = getTextCopyMessage(contactName, {
      prompt,
      interests,
      labels,
      daysSinceContact,
      hasBirthdaySoon,
      circleLevel,
    });
    if (Platform.OS === "web") {
      try {
        await navigator.clipboard.writeText(message);
      } catch {}
    } else {
      await Clipboard.setStringAsync(message);
    }
    onCopyText?.();
    onCopied?.();
  }, [contactName, prompt, interests, labels, daysSinceContact, hasBirthdaySoon, circleLevel, onCopyText, onCopied]);

  const handlePlanHangout = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPlanHangout?.();
  }, [onPlanHangout]);

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <View style={styles.header}>
        <Avatar name={contactName} color={avatarColor} size={42} photoUri={photoUri} />
        <View style={styles.headerInfo}>
          <Text style={styles.name} numberOfLines={1}>{contactName}</Text>
          <View style={styles.metaRow}>
            <View style={[styles.typeBadge, { backgroundColor: circleColor + "15" }]}>
              <Ionicons name={typeConfig.icon} size={11} color={circleColor} />
              <Text style={[styles.typeText, { color: circleColor }]}>{typeConfig.label}</Text>
            </View>
            {urgency !== "ok" && (
              <View style={[styles.urgencyDot, { backgroundColor: urgencyConfig.color }]} />
            )}
            {lastContactedLabel && (
              <Text style={styles.metaText} numberOfLines={1}>{lastContactedLabel}</Text>
            )}
          </View>
        </View>
      </View>

      {birthdayLabel ? (
        <View style={styles.birthdayBanner}>
          <Ionicons name="gift-outline" size={14} color={Colors.warning} />
          <Text style={styles.birthdayText}>Birthday {birthdayLabel}</Text>
        </View>
      ) : null}

      <Text style={styles.prompt}>{prompt}</Text>

      <View style={styles.actions}>
        <Animated.View style={refreshStyle}>
          <Pressable
            onPress={handleRefresh}
            style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.5 }]}
          >
            <Ionicons name="shuffle-outline" size={20} color={Colors.textSecondary} />
          </Pressable>
        </Animated.View>

        {type === "text" && onCopyText && (
          <Pressable
            onPress={handleCopyText}
            style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.5 }]}
          >
            <Ionicons name="copy-outline" size={20} color={Colors.primaryLight} />
          </Pressable>
        )}

        {type === "hangout" && onPlanHangout && (
          <Pressable
            onPress={handlePlanHangout}
            style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.5 }]}
          >
            <Ionicons name="calendar-outline" size={20} color={Colors.primaryLight} />
          </Pressable>
        )}

        <View style={{ flex: 1 }} />

        <Pressable
          onPress={handleDone}
          style={({ pressed }) => [styles.primaryButton, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="checkmark" size={18} color="#fff" />
          <Text style={styles.primaryButtonText}>Done</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  headerInfo: {
    marginLeft: 12,
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 3,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeText: {
    fontSize: 11,
    fontFamily: "Nunito_600SemiBold",
  },
  urgencyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  metaText: {
    fontSize: 11,
    fontFamily: "Nunito_400Regular",
    color: Colors.textTertiary,
    flexShrink: 1,
  },
  birthdayBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.warning + "12",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 10,
  },
  birthdayText: {
    fontSize: 12,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.warning,
  },
  prompt: {
    fontSize: 15,
    fontFamily: "Nunito_400Regular",
    color: Colors.text,
    lineHeight: 22,
    marginBottom: 14,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  iconButton: {
    padding: 8,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: Colors.primary,
  },
  primaryButtonText: {
    fontSize: 13,
    fontFamily: "Nunito_700Bold",
    color: "#fff",
  },
});
