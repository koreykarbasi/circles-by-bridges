import React, { useMemo, useRef, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SnoozeGlyph, SNOOZE_ACTIVE_COLOR } from "./SnoozeGlyph";
import * as Haptics from "expo-haptics";
import type { Contact } from "@/lib/types";
import { useContacts } from "@/lib/contacts-context";
import { useThemeColors } from "@/lib/theme-context";
import type { ThemeColors } from "@/constants/colors";
import { isContactOnCooldown } from "@shared/contact-cooldown";

interface ContactCooldownButtonProps {
  contact: Contact;
  compact?: boolean;
}

export function ContactCooldownButton({ contact, compact = false }: ContactCooldownButtonProps) {
  const Colors = useThemeColors();
  const styles = useMemo(() => createStyles(Colors), [Colors]);
  const { setContactCooldown } = useContacts();
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef(false);
  const active = isContactOnCooldown(contact);
  const until = contact.notificationsCooldownUntil
    ? new Date(contact.notificationsCooldownUntil)
    : null;

  const updateCooldown = async (enabled: boolean) => {
    pendingRef.current = true;
    setBusy(true);
    try {
      await setContactCooldown(contact.id, enabled);
    } catch {
      Alert.alert("Could not update cooldown", "Please check your connection and try again.");
    } finally {
      pendingRef.current = false;
      setBusy(false);
    }
  };

  const handlePress = (event: { stopPropagation?: () => void }) => {
    event.stopPropagation?.();
    if (busy || pendingRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (active) {
      void updateCooldown(false);
      return;
    }
    pendingRef.current = true;
    const message = "Pauses check-in nudges and suggestions for this contact for 30 days. Birthdays and your custom reminders still come through.";
    if (Platform.OS === "web") {
      if (window.confirm(message)) void updateCooldown(true);
      else pendingRef.current = false;
      return;
    }
    Alert.alert("Snooze contact?", message, [
      { text: "Cancel", style: "cancel", onPress: () => { pendingRef.current = false; } },
      { text: "Snooze", onPress: () => { void updateCooldown(true); } },
    ], { cancelable: true, onDismiss: () => { pendingRef.current = false; } });
  };

  if (compact) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={active ? "End notification cooldown" : "Pause notifications for 30 days"}
        accessibilityState={{ busy, disabled: busy, selected: active }}
        disabled={busy}
        onPress={handlePress}
        hitSlop={8}
        style={({ pressed }) => [styles.iconButton, active && styles.iconButtonActive, pressed && !busy && styles.pressed]}
      >
        <SnoozeGlyph color={active ? Colors.primaryDeep : Colors.primary} size={12.8} />
      </Pressable>
    );
  }

  return (
    <View style={styles.fullWrap}>
      {active && until && Number.isFinite(until.getTime()) && (
        <Text style={styles.untilText}>
          On cooldown until {until.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ busy, disabled: busy, selected: active }}
        disabled={busy}
        onPress={handlePress}
        style={({ pressed }) => [
          styles.fullButton,
          active && styles.fullButtonActive,
          busy && styles.disabled,
          pressed && !busy && styles.pressed,
        ]}
      >
        <SnoozeGlyph color={active ? Colors.primaryDeep : Colors.primary} />
        <Text style={[styles.fullButtonText, active && styles.fullButtonTextActive]}>
          {busy ? "Updating..." : active ? "End cooldown" : "Cooldown (30 days)"}
        </Text>
      </Pressable>
    </View>
  );
}

const createStyles = (Colors: ThemeColors) => StyleSheet.create({
  iconButton: {
    width: 27.2,
    height: 27.2,
    padding: 3.2,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonActive: {
    backgroundColor: SNOOZE_ACTIVE_COLOR,
    borderColor: SNOOZE_ACTIVE_COLOR,
  },
  fullWrap: {
    marginBottom: 22,
  },
  untilText: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  fullButton: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "transparent",
    borderColor: Colors.primary,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  fullButtonActive: {
    backgroundColor: SNOOZE_ACTIVE_COLOR,
    borderColor: SNOOZE_ACTIVE_COLOR,
  },
  fullButtonText: {
    fontSize: 14,
    fontFamily: "Nunito_700Bold",
    color: Colors.primary,
  },
  fullButtonTextActive: {
    color: Colors.primaryDeep,
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.65,
  },
});
