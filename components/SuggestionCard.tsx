import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Avatar } from "./Avatar";
import Colors from "@/constants/colors";
import * as Haptics from "expo-haptics";

interface SuggestionCardProps {
  contactName: string;
  avatarColor: string;
  prompt: string;
  type: "call" | "text" | "hangout";
  circleLevel: 1 | 2 | 3;
  onDone: () => void;
  onRefresh: () => void;
}

export function SuggestionCard({ contactName, avatarColor, prompt, type, circleLevel, onDone, onRefresh }: SuggestionCardProps) {
  const typeIcon: keyof typeof Ionicons.glyphMap =
    type === "call" ? "call-outline" : type === "text" ? "chatbubble-outline" : "people-outline";
  const typeLabel = type === "call" ? "Call" : type === "text" ? "Text" : "Hang out";
  const circleColor = circleLevel === 1 ? Colors.circle1 : circleLevel === 2 ? Colors.circle2 : Colors.circle3;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Avatar name={contactName} color={avatarColor} size={40} />
        <View style={styles.headerInfo}>
          <Text style={styles.name}>{contactName}</Text>
          <View style={styles.typeBadge}>
            <Ionicons name={typeIcon} size={12} color={circleColor} />
            <Text style={[styles.typeText, { color: circleColor }]}>{typeLabel}</Text>
          </View>
        </View>
      </View>
      <Text style={styles.prompt}>{prompt}</Text>
      <View style={styles.actions}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onRefresh();
          }}
          style={({ pressed }) => [styles.secondaryButton, pressed && { opacity: 0.5 }]}
        >
          <Ionicons name="refresh-outline" size={18} color={Colors.textSecondary} />
          <Text style={styles.secondaryButtonText}>New prompt</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onDone();
          }}
          style={({ pressed }) => [styles.primaryButton, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="checkmark" size={18} color="#fff" />
          <Text style={styles.primaryButtonText}>Done</Text>
        </Pressable>
      </View>
    </View>
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
  },
  name: {
    fontSize: 16,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  typeText: {
    fontSize: 12,
    fontFamily: "Nunito_600SemiBold",
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
    gap: 10,
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: Colors.surfaceElevated,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
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
