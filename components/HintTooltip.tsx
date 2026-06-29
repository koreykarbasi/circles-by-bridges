import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Animated, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface HintTooltipProps {
  visible: boolean;
  text: string;
  onDismiss: () => void;
  /** Arrow points up (tooltip is below target) or down (tooltip is above target). Default none. */
  arrowSide?: "top" | "bottom" | "none";
  /** Position tooltip a fixed distance from top of screen. Overrides bottom-based positioning. */
  anchorTop?: number;
  /** Position tooltip a fixed distance from bottom of screen (without inset). */
  anchorBottom?: number;
  /** Legacy: extra bottom offset above tab bar. Used when anchorTop/anchorBottom are not set. Default 80. */
  bottomOffset?: number;
}

export function HintTooltip({
  visible,
  text,
  onDismiss,
  arrowSide = "none",
  anchorTop,
  anchorBottom,
  bottomOffset = 80,
}: HintTooltipProps) {
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(arrowSide === "top" ? -12 : 12)).current;

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(arrowSide === "top" ? -12 : 12);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 240, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, friction: 9, tension: 65, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.timing(fadeAnim, { toValue: 0, duration: 160, useNativeDriver: true }).start();
    }
  }, [visible, arrowSide]);

  if (!visible) return null;

  const webBottomExtra = Platform.OS === "web" ? 34 : 0;

  let positionStyle: object;
  if (anchorTop !== undefined) {
    positionStyle = { top: anchorTop };
  } else if (anchorBottom !== undefined) {
    positionStyle = { bottom: insets.bottom + anchorBottom + webBottomExtra };
  } else {
    positionStyle = { bottom: insets.bottom + bottomOffset + webBottomExtra };
  }

  return (
    <Animated.View
      style={[
        styles.wrapper,
        positionStyle,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      {arrowSide === "top" && (
        <View style={styles.arrowTopRow}>
          <View style={styles.arrowUp} />
        </View>
      )}

      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="bulb-outline" size={17} color={Colors.primary} />
        </View>
        <Text style={styles.text}>{text}</Text>
        <Pressable
          onPress={onDismiss}
          hitSlop={12}
          style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.5 }]}
        >
          <Ionicons name="close" size={16} color={Colors.textSecondary} />
        </Pressable>
      </View>

      {arrowSide === "bottom" && (
        <View style={styles.arrowBottomRow}>
          <View style={styles.arrowDown} />
        </View>
      )}
    </Animated.View>
  );
}

const CARD_BG = Colors.surfaceElevated;
const ARROW_SIZE = 10;

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 999,
  },
  arrowTopRow: {
    alignItems: "center",
    marginBottom: -1,
  },
  arrowBottomRow: {
    alignItems: "center",
    marginTop: -1,
  },
  arrowUp: {
    width: 0,
    height: 0,
    borderStyle: "solid",
    borderLeftWidth: ARROW_SIZE,
    borderRightWidth: ARROW_SIZE,
    borderBottomWidth: ARROW_SIZE,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: CARD_BG,
  },
  arrowDown: {
    width: 0,
    height: 0,
    borderStyle: "solid",
    borderLeftWidth: ARROW_SIZE,
    borderRightWidth: ARROW_SIZE,
    borderTopWidth: ARROW_SIZE,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: CARD_BG,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.primary + "35",
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 14,
    elevation: 10,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: Colors.primary + "18",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    flexShrink: 0,
  },
  text: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: Colors.text,
    fontFamily: "Nunito_400Regular",
  },
  closeBtn: {
    marginTop: 4,
    flexShrink: 0,
  },
});
