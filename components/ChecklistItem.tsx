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
}

export function ChecklistItem({ icon, iconColor, title, subtitle, onComplete, onSnooze }: ChecklistItemProps) {
  return (
    <View style={styles.container}>
      <View style={[styles.iconContainer, { backgroundColor: iconColor + "18" }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
      <View style={styles.actions}>
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
  subtitle: {
    fontSize: 12,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    marginTop: 2,
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
});
