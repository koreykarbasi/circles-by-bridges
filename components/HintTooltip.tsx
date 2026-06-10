import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Animated, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface HintTooltipProps {
  visible: boolean;
  text: string;
  onDismiss: () => void;
  /** Extra bottom offset above tab bar. Default 80 for tab screens, 20 for modal screens. */
  bottomOffset?: number;
}

export function HintTooltip({ visible, text, onDismiss, bottomOffset = 80 }: HintTooltipProps) {
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 240, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, friction: 9, tension: 65, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.timing(fadeAnim, { toValue: 0, duration: 160, useNativeDriver: true }).start();
      slideAnim.setValue(14);
    }
  }, [visible]);

  if (!visible) return null;

  const webBottomExtra = Platform.OS === "web" ? 34 : 0;
  const bottom = insets.bottom + bottomOffset + webBottomExtra;

  return (
    <Animated.View
      style={[
        styles.wrapper,
        { bottom, opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="bulb-outline" size={16} color={Colors.primary} />
        </View>
        <Text style={styles.text}>{text}</Text>
        <Pressable
          onPress={onDismiss}
          hitSlop={12}
          style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.5 }]}
        >
          <Ionicons name="close" size={15} color={Colors.textSecondary} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 999,
  },
  card: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.primary + "35",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 8,
  },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: Colors.primary + "18",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    flexShrink: 0,
  },
  text: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: Colors.textSecondary,
    fontFamily: "Nunito_400Regular",
  },
  closeBtn: {
    marginTop: 3,
    flexShrink: 0,
  },
});
