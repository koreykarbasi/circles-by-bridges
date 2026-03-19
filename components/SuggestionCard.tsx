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
  onDone: () => void;
  onRefresh: () => void;
  onCopyText?: () => void;
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

const TEXT_COPY_TEMPLATES = [
  "Hey {name}, I was just thinking about you — it's been a while! How have you been?",
  "Hey {name}, randomly thought of you today. Hope everything's going well on your end!",
  "Hey {name}, you crossed my mind — wanted to reach out. How's life treating you?",
  "Hey {name}, it's been too long! I'd love to catch up sometime. What's new with you?",
  "Hey {name}, just thinking about you and wanted to say hi. How are things?",
  "Hey {name}, hope you're doing well! Was reminiscing the other day and thought of you.",
  "Hey {name}, you've been on my mind lately. Hope everything's going your way!",
  "Hey {name}, just wanted to reach out and check in. How has everything been?",
  "Hey {name}, thinking of you today. Let's catch up soon!",
  "Hey {name}, hope life's been treating you well. Would love to hear what's new with you.",
  "Hey {name}, wanted to let you know I was thinking about you. How's everything going?",
  "Hey {name}, it's been a minute! What's been keeping you busy lately?",
  "Hey {name}, hope you're having a great week. Just wanted to say hi!",
  "Hey {name}, feel like we haven't talked in forever. Hope you're doing amazing!",
  "Hey {name}, just thought of you and had to say hello. How are you doing these days?",
];

export function getTextCopyMessage(contactName: string): string {
  const template = TEXT_COPY_TEMPLATES[Math.floor(Math.random() * TEXT_COPY_TEMPLATES.length)];
  return template.replace("{name}", contactName);
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
  onDone,
  onRefresh,
  onCopyText,
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
    const message = getTextCopyMessage(contactName);
    if (Platform.OS === "web") {
      try {
        await navigator.clipboard.writeText(message);
      } catch {}
    } else {
      await Clipboard.setStringAsync(message);
    }
    onCopyText?.();
  }, [contactName, onCopyText]);

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
    justifyContent: "flex-end",
    gap: 8,
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
