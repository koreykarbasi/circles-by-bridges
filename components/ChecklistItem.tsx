import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons, Feather } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import * as Haptics from "expo-haptics";

interface ChecklistItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  subtitle: string;
  onComplete: () => void;
  onSnooze?: () => void;
  priorityLevel?: "high" | "medium" | "low";
  actionType?: "call" | "text" | "hangout";
  showYesNo?: boolean;
  onYes?: () => void;
  onNo?: () => void;
}

const ACTION_ICONS: Record<string, { icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  call: { icon: "call-outline", label: "Call" },
  text: { icon: "chatbubble-outline", label: "Text" },
  hangout: { icon: "people-outline", label: "Hang out" },
};

const PRIORITY_COLORS: Record<string, string> = {
  high: Colors.danger,
  medium: Colors.warning,
  low: Colors.success,
};

export function ChecklistItem({
  icon,
  iconColor,
  title,
  subtitle,
  onComplete,
  onSnooze,
  priorityLevel,
  actionType,
  showYesNo,
  onYes,
  onNo,
}: ChecklistItemProps) {
  return (
    <View style={styles.container}>
      {priorityLevel && (
        <View style={[styles.priorityBar, { backgroundColor: PRIORITY_COLORS[priorityLevel] }]} />
      )}
      <View style={[styles.iconContainer, { backgroundColor: iconColor + "18" }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <View style={styles.subtitleRow}>
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
          {actionType && ACTION_ICONS[actionType] && (
            <View style={styles.actionBadge}>
              <Ionicons name={ACTION_ICONS[actionType].icon} size={10} color={Colors.textTertiary} />
              <Text style={styles.actionText}>{ACTION_ICONS[actionType].label}</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.actions}>
        {showYesNo ? (
          <>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onYes?.();
              }}
              hitSlop={6}
              style={({ pressed }) => [styles.yesNoButton, styles.yesButton, pressed && { opacity: 0.5 }]}
            >
              <Ionicons name="checkmark" size={16} color="#fff" />
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onNo?.();
              }}
              hitSlop={6}
              style={({ pressed }) => [styles.yesNoButton, styles.noButton, pressed && { opacity: 0.5 }]}
            >
              <Ionicons name="close" size={16} color="#fff" />
            </Pressable>
          </>
        ) : (
          <>
            {onSnooze && (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onSnooze();
                }}
                hitSlop={6}
                style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.5 }]}
              >
                <Feather name="clock" size={18} color={Colors.textTertiary} />
              </Pressable>
            )}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onComplete();
              }}
              hitSlop={6}
              style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.5 }]}
            >
              <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  priorityBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
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
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    flexShrink: 1,
  },
  actionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: Colors.surfaceElevated,
  },
  actionText: {
    fontSize: 9,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textTertiary,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: 8,
  },
  actionButton: {
    padding: 4,
  },
  yesNoButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  yesButton: {
    backgroundColor: Colors.success,
  },
  noButton: {
    backgroundColor: Colors.accent,
  },
});
