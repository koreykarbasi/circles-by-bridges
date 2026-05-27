import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import * as Haptics from "expo-haptics";

interface ChecklistItemProps {
  icon: string;
  iconColor: string;
  iconLibrary?: "material";
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
  iconLibrary,
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
        {iconLibrary === "material" ? (
          <MaterialCommunityIcons name={icon as any} size={20} color={iconColor} />
        ) : (
          <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={20} color={iconColor} />
        )}
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
              hitSlop={4}
              style={({ pressed }) => [styles.yesBtn, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="checkmark" size={16} color={Colors.success} />
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onNo?.();
              }}
              hitSlop={4}
              style={({ pressed }) => [styles.noBtn, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="close" size={16} color={Colors.danger} />
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
                style={({ pressed }) => [styles.snoozeBtn, pressed && { opacity: 0.5 }]}
              >
                <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
              </Pressable>
            )}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onComplete();
              }}
              hitSlop={6}
              style={({ pressed }) => [styles.checkBtn, pressed && { opacity: 0.5 }]}
            >
              <Ionicons name="checkmark-circle" size={26} color={Colors.success} />
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
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  priorityBar: {
    position: "absolute",
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  content: {
    flex: 1,
    minWidth: 0,
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
    flexWrap: "wrap",
  },
  subtitle: {
    fontSize: 12,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
  },
  actionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  actionText: {
    fontSize: 10,
    fontFamily: "Nunito_400Regular",
    color: Colors.textTertiary,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
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
  snoozeBtn: {
    padding: 4,
  },
  checkBtn: {
    padding: 2,
  },
});
