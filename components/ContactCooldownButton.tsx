import React, { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
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
  const active = isContactOnCooldown(contact);
  const until = contact.notificationsCooldownUntil
    ? new Date(contact.notificationsCooldownUntil)
    : null;

  const handlePress = async (event: { stopPropagation?: () => void }) => {
    event.stopPropagation?.();
    if (busy) return;
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await setContactCooldown(contact.id, !active);
    } catch {
      Alert.alert("Could not update cooldown", "Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (compact) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={active ? "End notification cooldown" : "Pause notifications for 30 days"}
        accessibilityState={{ busy, disabled: busy }}
        disabled={busy}
        onPress={handlePress}
        hitSlop={8}
        style={({ pressed }) => [styles.iconButton, active && styles.iconButtonActive, pressed && !busy && styles.pressed]}
      >
        <Ionicons name="time-outline" size={19} color={active ? Colors.primary : Colors.textSecondary} />
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
        accessibilityState={{ busy, disabled: busy }}
        disabled={busy}
        onPress={handlePress}
        style={({ pressed }) => [
          styles.fullButton,
          active && styles.fullButtonActive,
          busy && styles.disabled,
          pressed && !busy && styles.pressed,
        ]}
      >
        <Ionicons name="time-outline" size={18} color={active ? Colors.primary : Colors.textSecondary} />
        <Text style={[styles.fullButtonText, active && styles.fullButtonTextActive]}>
          {busy ? "Updating..." : active ? "End cooldown" : "Cooldown (30 days)"}
        </Text>
      </Pressable>
    </View>
  );
}

const createStyles = (Colors: ThemeColors) => StyleSheet.create({
  iconButton: {
    minWidth: 34,
    minHeight: 34,
    padding: 6,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonActive: {
    backgroundColor: Colors.primary + "12",
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
    backgroundColor: Colors.surface,
    borderColor: Colors.borderLight,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  fullButtonActive: {
    backgroundColor: Colors.primary + "0D",
    borderColor: Colors.primary + "35",
  },
  fullButtonText: {
    fontSize: 14,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
  },
  fullButtonTextActive: {
    color: Colors.primary,
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.65,
  },
});
