import React, { useCallback } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS } from "react-native-reanimated";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { CIRCLE_CONFIG } from "@/lib/types";
import * as Haptics from "expo-haptics";
import type { Reminder } from "@/lib/reminders";
import { QuickPickRow } from "./QuickPickRow";
import { router } from "expo-router";

interface ReminderItemProps {
  reminder: Reminder;
  onComplete: () => void;
  onQuickPick?: (date: Date, label: string) => void;
  onCalendarPress?: () => void;
}

const TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  "check-in-quickpick": "time-outline",
  "hangout-quickpick": "calendar-outline",
  "custom-reminder": "star-outline",
  "profile-completion-high": "person-circle-outline",
  "profile-completion-medium": "person-circle-outline",
  "profile-completion-low": "person-circle-outline",
};

function getPriorityColor(priority: number): string {
  if (priority >= 150) return Colors.danger;
  if (priority >= 100) return Colors.warning;
  return Colors.primaryLight;
}

function getProfileCompletionColor(type: string): string | null {
  if (type === "profile-completion-high") return Colors.danger;
  if (type === "profile-completion-medium") return Colors.warning;
  if (type === "profile-completion-low") return Colors.yellow;
  return null;
}

function getProfileCompletionRoute(type: string): { circle?: string; filter: string } {
  if (type === "profile-completion-high") return { circle: "1", filter: "missing-birthday-c1" };
  if (type === "profile-completion-medium") return { circle: "2", filter: "missing-birthday-c2" };
  return { filter: "yellow-dot" };
}

export function ReminderItem({ reminder, onComplete, onQuickPick, onCalendarPress }: ReminderItemProps) {
  const isProfileCompletion = reminder.type.startsWith("profile-completion");
  const circleColor = isProfileCompletion
    ? (getProfileCompletionColor(reminder.type) ?? Colors.primary)
    : (CIRCLE_CONFIG[reminder.circleLevel as 1 | 2 | 3]?.color ?? Colors.primary);
  const priorityColor = getProfileCompletionColor(reminder.type) ?? getPriorityColor(reminder.priority);
  const typeIcon = TYPE_ICONS[reminder.type] ?? "alert-circle-outline";
  const isBirthday = reminder.type === "birthday";
  const isQuickPick = (reminder.type === "check-in-quickpick" || reminder.type === "hangout-quickpick") && !!onQuickPick;
  const quickPickVariant: "checkin" | "hangout" = reminder.type === "hangout-quickpick" ? "hangout" : "checkin";
  const isPersistent = reminder.persistent === true;

  const opacity = useSharedValue(1);
  const height = useSharedValue<number | undefined>(undefined);
  const marginBottom = useSharedValue(8);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    height: height.value,
    marginBottom: marginBottom.value,
    overflow: "hidden" as const,
  }));

  const handleComplete = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    opacity.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) }, () => {
      height.value = withTiming(0, { duration: 200 });
      marginBottom.value = withTiming(0, { duration: 200 }, () => {
        runOnJS(onComplete)();
      });
    });
  }, [onComplete]);

  const handleQuickPick = useCallback((date: Date, label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const callback = () => {
      if (onQuickPick) onQuickPick(date, label);
      else onComplete();
    };
    opacity.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) }, () => {
      height.value = withTiming(0, { duration: 200 });
      marginBottom.value = withTiming(0, { duration: 200 }, () => {
        runOnJS(callback)();
      });
    });
  }, [onQuickPick, onComplete]);

  const handleProfileCompletionPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const params = getProfileCompletionRoute(reminder.type);
    router.push({ pathname: "/(tabs)/circles", params });
  }, [reminder.type]);

  const cardContent = (
    <View style={styles.row}>
      <View style={[styles.iconContainer, { backgroundColor: priorityColor + "18" }]}>
        {isBirthday ? (
          <MaterialCommunityIcons name="cake-variant-outline" size={18} color={priorityColor} />
        ) : (
          <Ionicons name={typeIcon} size={18} color={priorityColor} />
        )}
      </View>
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>{reminder.title}</Text>
        <View style={styles.metaRow}>
          <View style={[styles.circleDot, { backgroundColor: circleColor }]} />
          <Text style={styles.subtitle} numberOfLines={1}>{reminder.subtitle}</Text>
        </View>
      </View>
      {isProfileCompletion ? (
        <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} style={styles.chevron} />
      ) : !isPersistent ? (
        <View style={styles.actions}>
          <Pressable
            onPress={handleComplete}
            hitSlop={6}
            style={({ pressed }) => [styles.checkBtn, pressed && { opacity: 0.5 }]}
          >
            <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      {isProfileCompletion ? (
        <Pressable
          onPress={handleProfileCompletionPress}
          style={({ pressed }) => pressed && { opacity: 0.7 }}
        >
          {cardContent}
        </Pressable>
      ) : cardContent}
      {isQuickPick && (
        <QuickPickRow
          circleLevel={reminder.circleLevel as 1 | 2 | 3}
          variant={quickPickVariant}
          onSelect={handleQuickPick}
          onCalendarPress={quickPickVariant === "hangout" ? onCalendarPress : undefined}
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.text,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 3,
  },
  circleDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    flexShrink: 1,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
    gap: 2,
  },
  checkBtn: {
    padding: 4,
  },
  chevron: {
    marginLeft: 8,
  },
});
