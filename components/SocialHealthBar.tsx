import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useContacts } from "@/lib/contacts-context";
import { useThemeColors } from "@/lib/theme-context";
import { CIRCLE_CONFIG } from "@/lib/types";
import { calculateSocialHealth, socialHealthBand } from "@shared/social-health";

/** Profile today; compact is available for a future placement, not mounted on Home. */
export function SocialHealthBar({ compact = false }: { compact?: boolean }) {
  const { contacts } = useContacts();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const health = calculateSocialHealth(contacts);
  const band = health ? socialHealthBand(health.score) : null;
  const color = band === "warning" ? colors.yellow : band ? colors[band] : colors.primary;
  const encouragement = band === "success" ? "Making time for your connections."
    : band === "warning" ? "Small catch-ups keep connections growing."
      : "A simple hello is a lovely place to start.";
  const close = () => setExpanded(false);
  const empty = "Add at least 3 Close Friends or Friends with a last-contacted date to see your social health. Snoozed contacts aren't scored.";
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={health ? `Social health, ${health.score} percent. View breakdown` : "Social health. View how it works"}
        onPress={() => setExpanded(true)}
        style={({ pressed }) => [styles.card, { padding: compact ? 14 : 18, backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
      >
        <View style={styles.row}>
          <Text style={[styles.title, { color: colors.text }]}>Social health</Text>
          <View style={styles.row}>
            {health && <Text style={[styles.percentage, { color }]}>{health.score}%</Text>}
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </View>
        </View>
        {health ? (
          <>
            <View
              accessibilityRole="progressbar"
              accessibilityLabel="Social health"
              accessibilityValue={{ min: 0, max: 100, now: health.score }}
              style={[styles.track, { backgroundColor: colors.border }]}
            >
              <View style={[styles.fill, { width: `${health.score}%`, backgroundColor: color }]} />
            </View>
            {!compact && <Text style={[styles.body, { color: colors.textSecondary }]}>{encouragement}</Text>}
          </>
        ) : <Text style={[styles.body, { color: colors.textSecondary, marginTop: 8 }]}>{empty}</Text>}
      </Pressable>
      <Modal visible={expanded} transparent animationType="slide" onRequestClose={close}>
        <View style={styles.overlay}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close social health breakdown" style={StyleSheet.absoluteFill} onPress={close} />
          <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 20), borderColor: colors.border }]}>
            <View style={styles.row}>
              <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Social health</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close breakdown" onPress={close} hitSlop={12}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView>
              {health ? (
                <>
                  <Text style={[styles.score, { color }]}>{health.score}%</Text>
                  <Text style={[styles.body, { color: colors.textSecondary, marginBottom: 20 }]}>{encouragement}</Text>
                  {([2, 3] as const).map(circle => (
                    <View key={circle} style={[styles.breakdownRow, { borderColor: colors.border }]}>
                      <View style={[styles.dot, { backgroundColor: colors[`circle${circle}`] }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.label, { color: colors[`circle${circle}`] }]}>{CIRCLE_CONFIG[circle].label}</Text>
                        <Text style={[styles.body, { color: colors.text }]}>{health.circles[circle].inRange} of {health.circles[circle].total} in touch</Text>
                      </View>
                    </View>
                  ))}
                </>
              ) : <Text style={[styles.body, { color: colors.textSecondary, marginVertical: 20 }]}>{empty}</Text>}
              <View style={[styles.breakdownRow, { borderColor: colors.border }]}>
                <View style={[styles.dot, { backgroundColor: colors.circle1 }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: colors.circle1 }]}>{CIRCLE_CONFIG[1].label}</Text>
                  <Text style={[styles.body, { color: colors.text }]}>You're always in touch</Text>
                  <Text style={[styles.body, { color: colors.textSecondary }]}>Not included in your score.</Text>
                </View>
              </View>
              <Text style={[styles.body, { color: colors.textSecondary, marginTop: 18 }]}>
                Starting dates for new contacts are estimates until you log a real catch-up.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, marginBottom: 24, gap: 4 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  title: { fontSize: 18, fontFamily: "Nunito_800ExtraBold" },
  label: { fontSize: 16, fontFamily: "Nunito_700Bold" },
  percentage: { fontSize: 22, fontFamily: "Nunito_800ExtraBold" },
  body: { fontSize: 14, lineHeight: 21, fontFamily: "Nunito_600SemiBold" },
  track: { height: 10, borderRadius: 5, overflow: "hidden", marginVertical: 10 },
  fill: { height: "100%", borderRadius: 5 },
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "#00000080" },
  sheet: { maxHeight: "85%", padding: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1 },
  score: { fontSize: 40, fontFamily: "Nunito_800ExtraBold", marginTop: 20 },
  breakdownRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
