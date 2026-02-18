import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { getInitials } from "@/lib/helpers";

interface AvatarProps {
  name: string;
  color: string;
  size?: number;
}

export function Avatar({ name, color, size = 44 }: AvatarProps) {
  const fontSize = size * 0.38;
  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color + "25",
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            fontSize,
            color,
          },
        ]}
      >
        {getInitials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontFamily: "Nunito_700Bold",
    letterSpacing: 0.5,
  },
});
