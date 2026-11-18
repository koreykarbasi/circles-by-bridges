import React from "react";
import { Text } from "react-native";

/** Shared by the real snooze controls and the Circles symbol legend. */
export function SnoozeGlyph({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <Text accessible={false} style={{ color, fontSize: size, lineHeight: size + 3, fontFamily: "Nunito_800ExtraBold" }}>
      Z<Text style={{ fontSize: size * 0.8 }}>z</Text><Text style={{ fontSize: size * 0.65 }}>z</Text>
    </Text>
  );
}

export const SNOOZE_ACTIVE_COLOR = "#FFBE85";
