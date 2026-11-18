import React from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const ACTION_ICONS = {
  move: "swap-horizontal-outline",
  contacted: "checkmark-circle-outline",
  birthday: "gift-outline",
} as const;

export function ContactCardActionIcon({ action, size, color }: {
  action: keyof typeof ACTION_ICONS; size: number; color: string;
}) {
  return <Ionicons name={ACTION_ICONS[action]} size={size} color={color} />;
}

export function ContactWarningGlyph({ color, size = 11 }: { color: string; size?: number }) {
  return <Text style={{ color, fontSize: size, lineHeight: size + 2, fontFamily: "Nunito_800ExtraBold" }}>!</Text>;
}

export function ContactUrgencyDot({ color }: { color: string }) {
  return <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />;
}
