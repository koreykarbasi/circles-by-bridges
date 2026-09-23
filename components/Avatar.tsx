import React, { useState, useMemo } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { getInitials } from "@/lib/helpers";
import { useTheme } from "@/lib/theme-context";
import type { ThemeColors } from "@/constants/colors";

interface AvatarProps {
  name: string;
  color: string;
  size?: number;
  photoUri?: string | null;
}

export function Avatar({ name, color, size = 44, photoUri }: AvatarProps) {
  const { colors: Colors, mode } = useTheme();
  const styles = useMemo(() => createStyles(Colors), [Colors]);
  const [imgError, setImgError] = useState(false);
  const fontSize = size * 0.38;

  React.useEffect(() => {
    setImgError(false);
  }, [photoUri]);

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
             color: mode === "dark" ? color : Colors.text,
          },
        ]}
      >
        {getInitials(name)}
      </Text>
    </View>
  );
}

const createStyles = (_Colors: ThemeColors) => StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontFamily: "Nunito_700Bold",
    letterSpacing: 0.5,
  },
});
