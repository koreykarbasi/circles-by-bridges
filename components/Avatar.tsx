import React, { useState } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { getInitials } from "@/lib/helpers";

interface AvatarProps {
  name: string;
  color: string;
  size?: number;
  photoUri?: string | null;
}

export function Avatar({ name, color, size = 44, photoUri }: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const fontSize = size * 0.38;

  if (photoUri && !imgError) {
    return (
      <Image
        source={{ uri: photoUri }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
        }}
        onError={() => setImgError(true)}
      />
    );
  }

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
