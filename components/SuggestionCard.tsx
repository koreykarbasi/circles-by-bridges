import React, { useCallback, useState, useMemo, useRef, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Platform, Linking, PanResponder } from "react-native";
import { router } from "expo-router";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSequence, runOnJS, Easing } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { Avatar } from "./Avatar";
import Colors from "@/constants/colors";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { NoPhoneSheet, type ExtraContactData } from "./NoPhoneSheet";
import { getTextCopyMessage } from "@/lib/sms-templates";
export { getTextCopyMessage } from "@/lib/sms-templates";

interface SuggestionCardProps {
  contactId: string;
  contactName: string;
  avatarColor: string;
  photoUri?: string | null;
  phone?: string | null;
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
  onSaveContactData?: (data: { phone: string; birthday?: string; photoUri?: string }) => Promise<void> | void;
  onSwipeDismiss?: () => void;
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

function buildSmsUrl(phone: string, message: string): string {
  if (Platform.OS === "ios") {
    return `sms:${phone}&body=${message}`;
  }
  return `sms:${phone}?body=${encodeURIComponent(message)}`;
}

export function SuggestionCard({
  contactId,
  contactName,
  avatarColor,
  photoUri,
  phone,
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
  onSaveContactData,
  onSwipeDismiss,
}: SuggestionCardProps) {
  const circleColor = circleLevel === 1 ? Colors.circle1 : circleLevel === 2 ? Colors.circle2 : Colors.circle3;
  const typeConfig = TYPE_CONFIG[type];
  const urgencyConfig = URGENCY_CONFIG[urgency];

  const generatedTextMessage = useMemo(
    () => getTextCopyMessage(contactName, { prompt, interests, labels, daysSinceContact, hasBirthdaySoon, circleLevel }),
    [contactName, prompt, interests, labels, daysSinceContact, hasBirthdaySoon, circleLevel],
  );

  const [phoneSheetVisible, setPhoneSheetVisible] = useState(false);
  const [phoneSheetMode, setPhoneSheetMode] = useState<"sms" | "call">("sms");

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

  const onSwipeDismissRef = useRef<(() => void) | undefined>(onSwipeDismiss);
  useEffect(() => { onSwipeDismissRef.current = onSwipeDismiss; }, [onSwipeDismiss]);
  const swipeAnimating = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        !swipeAnimating.current &&
        Math.abs(gs.dx) > 8 &&
        Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
      onPanResponderMove: (_, gs) => {
        translateX.value = gs.dx;
        opacity.value = Math.max(0.3, 1 - Math.abs(gs.dx) / 250);
      },
      onPanResponderRelease: (_, gs) => {
        const dismissFn = onSwipeDismissRef.current;
        if (Math.abs(gs.dx) > 80 || Math.abs(gs.vx) > 0.5) {
          swipeAnimating.current = true;
          const dir = gs.dx > 0 ? 1 : -1;
          opacity.value = withTiming(0, { duration: 200 });
          translateX.value = withTiming(dir * 500, { duration: 250 }, () => {
            height.value = withTiming(0, { duration: 180 });
            marginBottom.value = withTiming(0, { duration: 180 }, () => {
              if (dismissFn) runOnJS(dismissFn)();
            });
          });
        } else {
          translateX.value = withTiming(0, { duration: 250 });
          opacity.value = withTiming(1, { duration: 250 });
        }
      },
      onPanResponderTerminate: () => {
        translateX.value = withTiming(0, { duration: 250 });
        opacity.value = withTiming(1, { duration: 250 });
      },
    })
  ).current;

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
    if (Platform.OS === "web") {
      try { await navigator.clipboard.writeText(generatedTextMessage); } catch {}
    } else {
      try { await Clipboard.setStringAsync(generatedTextMessage); } catch {}
    }
    onCopyText?.();
    onCopied?.();
  }, [generatedTextMessage, onCopyText, onCopied]);

  const handlePlanHangout = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPlanHangout?.();
  }, [onPlanHangout]);

  const openSms = useCallback(async (phoneNumber: string) => {
    if (Platform.OS === "web") {
      try { await navigator.clipboard.writeText(generatedTextMessage); } catch {}
      onCopyText?.();
      onCopied?.();
      return;
    }
    const url = buildSmsUrl(phoneNumber, generatedTextMessage);
    try {
      await Linking.openURL(url);
    } catch {}
    onCopyText?.();
    onCopied?.();
  }, [generatedTextMessage, onCopyText, onCopied]);

  const openDialer = useCallback(async (phoneNumber: string) => {
    try {
      await Linking.openURL(`tel:${phoneNumber}`);
    } catch {}
    handleDone();
  }, [handleDone]);

  const handleMessagePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === "web") {
      openSms("");
    } else if (phone) {
      openSms(phone);
    } else {
      setPhoneSheetMode("sms");
      setPhoneSheetVisible(true);
    }
  }, [phone, openSms]);

  const handleCallPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (phone) {
      openDialer(phone);
    } else {
      setPhoneSheetMode("call");
      setPhoneSheetVisible(true);
    }
  }, [phone, openDialer]);

  const handlePhoneSheetConfirm = useCallback(async (resolvedPhone: string, shouldSave: boolean, extra?: ExtraContactData) => {
    setPhoneSheetVisible(false);
    if (shouldSave && onSaveContactData) {
      try {
        await onSaveContactData({ phone: resolvedPhone, birthday: extra?.birthday, photoUri: extra?.photoUri });
      } catch {}
    }
    if (phoneSheetMode === "sms") {
      await openSms(resolvedPhone);
    } else {
      await openDialer(resolvedPhone);
    }
  }, [phoneSheetMode, openSms, openDialer, onSaveContactData]);

  return (
    <>
      <Animated.View style={[styles.container, animatedStyle]} {...panResponder.panHandlers}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.push({ pathname: "/edit-contact", params: { id: contactId } })}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
            hitSlop={4}
          >
            <Avatar name={contactName} color={avatarColor} size={42} photoUri={photoUri} />
          </Pressable>
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

          {type === "text" && (
            <>
              <Pressable
                testID="suggestion-sms-btn"
                onPress={handleMessagePress}
                style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.5 }]}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={20} color={Colors.primaryLight} />
              </Pressable>
              {onCopyText && (
                <Pressable
                  testID="suggestion-copy-btn"
                  onPress={handleCopyText}
                  style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.5 }]}
                >
                  <Ionicons name="copy-outline" size={20} color={Colors.primaryLight} />
                </Pressable>
              )}
            </>
          )}

          {type === "call" && (
            <Pressable
              testID="suggestion-call-btn"
              onPress={handleCallPress}
              style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.5 }]}
            >
              <Ionicons name="call-outline" size={20} color={Colors.primaryLight} />
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

      <NoPhoneSheet
        visible={phoneSheetVisible}
        contactName={contactName}
        mode={phoneSheetMode}
        onConfirm={handlePhoneSheetConfirm}
        onDismiss={() => setPhoneSheetVisible(false)}
      />
    </>
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
