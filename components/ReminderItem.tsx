import React, { useCallback } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { CIRCLE_CONFIG } from "@/lib/types";
import * as Haptics from "expo-haptics";
import type { Reminder } from "@/lib/reminders";

interface ReminderItemProps {
  reminder: Reminder;
  onComplete: () => void;
  onYes?: () => void;
  onNo?: () => void;
  onPlanHangout?: () => void;
}

const TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  birthday: "gift-outline",
  "hangout-overdue": "calendar-outline",
  "check-in-overdue": "time-outline",
  "hangout-6month": "help-circle-outline",
};

const ACTION_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  call: "call-outline",
  text: "chatbubble-outline",
  hangout: "people-outline",
};

function getPriorityColor(priority: number): string {
  if (priority >= 150) return Colors.danger;
  if (priority >= 100) return Colors.warning;
  return Colors.primaryLight;
}

export function ReminderItem({ reminder, onComplete, onYes, onNo, onPlanHangout }: ReminderItemProps) {
  const circleColor = CIRCLE_CONFIG[reminder.circleLevel as 1 | 2 | 3]?.color ?? Colors.primary;
  const priorityColor = getPriorityColor(reminder.priority);
  const typeIcon = TYPE_ICONS[reminder.type] ?? "alert-circle-outline";
  const actionIcon = (reminder.actionType ? ACTION_ICONS[reminder.actionType] : undefined) ?? "chatbubble-outline";
  const isHangout6Month = reminder.type === "hangout-6month";

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

  const handleYes = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    opacity.value = withTiming(0, { duration: 250 }, () => {
      height.value = withTiming(0, { duration: 200 });
      marginBottom.value = withTiming(0, { duration: 200 }, () => {
        if (onYes) runOnJS(onYes)();
      });
    });
  }, [onYes]);

  const handleNo = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onNo) onNo();
  }, [onNo]);

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <View style={styles.row}>
        <View style={[styles.iconContainer, { backgroundColor: priorityColor + "18" }]}>
          <Ionicons name={typeIcon} size={18} color={priorityColor} />
        </View>
        <View style={styles.content}>
          <Text style={styles.title} numberOfLines={2}>{reminder.title}</Text>
          <View style={styles.metaRow}>
            <View style={[styles.circleDot, { backgroundColor: circleColor }]} />
            <Text style={styles.subtitle} numberOfLines={1}>{reminder.subtitle}</Text>
          </View>
        </View>
        {isHangout6Month ? (
          <View style={styles.yesNoActions}>
            <Pressable
              onPress={handleYes}
              hitSlop={4}
              style={({ pressed }) => [styles.yesBtn, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="checkmark" size={16} color={Colors.success} />
            </Pressable>
            <Pressable
              onPress={handleNo}
              hitSlop={4}
              style={({ pressed }) => [styles.noBtn, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="close" size={16} color={Colors.danger} />
            </Pressable>
          </View>
        ) : reminder.actionType === "hangout" && onPlanHangout ? (
          <View style={styles.actions}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onPlanHangout();
              }}
              hitSlop={4}
              style={({ pressed }) => [styles.hangoutBtn, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="calendar-outline" size={15} color={Colors.primaryLight} />
            </Pressable>
            <Pressable
              onPress={handleComplete}
              hitSlop={4}
              style={({ pressed }) => [styles.checkBtn, pressed && { opacity: 0.5 }]}
            >
              <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.actions}>
            {reminder.type !== "birthday" && reminder.actionType && (
              <Ionicons name={actionIcon} size={14} color={Colors.textTertiary} style={{ marginRight: 4 }} />
            )}
            <Pressable
              onPress={handleComplete}
              hitSlop={6}
              style={({ pressed }) => [styles.checkBtn, pressed && { opacity: 0.5 }]}
            >
              <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
            </Pressable>
          </View>
        )}
      </View>
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
  yesNoActions: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
    gap: 8,
  },
  checkBtn: {
    padding: 4,
  },
  yesBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.success + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  noBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.danger + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  hangoutBtn: {
    padding: 4,
    marginRight: 2,
  },
});
