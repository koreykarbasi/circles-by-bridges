import React, { useRef } from "react";
import { View, Text, StyleSheet, Pressable, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Avatar } from "./Avatar";
import Colors from "@/constants/colors";
import { formatLastContacted, getContactUrgency } from "@/lib/helpers";
import { CIRCLE_CONFIG } from "@/lib/types";
import type { Contact } from "@/lib/types";
import * as Haptics from "expo-haptics";

interface ContactCardProps {
  contact: Contact;
  onPress: () => void;
  onMarkContacted?: () => void;
  onPlanHangout?: () => void;
  showCircleLabel?: boolean;
  onLongPress?: () => void;
  /** Override: mark this contact as having an incomplete profile (shows the yellow enrichment dot) */
  isProfileIncomplete?: boolean;
}

function isMissingBirthday(contact: Contact): boolean {
  return (contact.circleLevel === 1 || contact.circleLevel === 2) && !contact.birthday;
}

function isMissingEnrichment(contact: Contact): boolean {
  return (contact.interests ?? []).length === 0;
}

export function ContactCard({ contact, onPress, onMarkContacted, onPlanHangout, showCircleLabel, onLongPress, isProfileIncomplete }: ContactCardProps) {
  const urgency = getContactUrgency(contact.circleLevel as 1 | 2 | 3, contact.lastContacted ?? undefined);
  const circleColor = CIRCLE_CONFIG[contact.circleLevel as 1 | 2 | 3]?.color ?? Colors.primary;
  const flashAnim = useRef(new Animated.Value(0)).current;

  const incomplete = isMissingBirthday(contact);
  const badgeColor = contact.circleLevel === 1 ? Colors.danger : Colors.warning;

  // Show yellow dot when enrichment is missing: use external override if provided, otherwise compute locally
  const enrichmentMissing = !incomplete && (isProfileIncomplete !== undefined ? isProfileIncomplete : isMissingEnrichment(contact));

  const handleMarkContacted = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
    onMarkContacted?.();
  };

  const flashOpacity = flashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.6],
  });

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={250}
      style={({ pressed }) => [
        styles.container,
        incomplete && { borderColor: badgeColor + "55", borderWidth: 1.5 },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.avatarWrapper}>
        <Avatar name={contact.name} color={contact.avatarColor} size={48} photoUri={contact.photoUri} />
        <Animated.View style={[styles.avatarFlash, { opacity: flashOpacity }]} />
        {incomplete && (
          <View style={[styles.incompleteBadge, { backgroundColor: badgeColor }]}>
            <Text style={styles.incompleteBadgeText}>!</Text>
          </View>
        )}
        {enrichmentMissing && (
          <View style={[styles.incompleteBadge, styles.enrichmentBadge]}>
            <Text style={styles.enrichmentBadgeText}>!</Text>
          </View>
        )}
      </View>
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {contact.name}
          </Text>
          {showCircleLabel && (
            <View style={[styles.circleBadge, { backgroundColor: circleColor + "20" }]}>
              <Text style={[styles.circleBadgeText, { color: circleColor }]}>
                {contact.circleLevel === 1 ? "Core" : contact.circleLevel === 2 ? "Close" : "Acq."}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.metaRow}>
          <View
            style={[
              styles.urgencyDot,
              {
                backgroundColor:
                  urgency === "overdue"
                    ? Colors.danger
                    : urgency === "soon"
                      ? Colors.warning
                      : Colors.success,
              },
            ]}
          />
          <Text style={styles.lastContacted}>
            {contact.lastContactedLabel ?? formatLastContacted(contact.lastContacted ?? undefined)}
          </Text>
          {contact.interests.length > 0 && (
            <Text style={styles.interests} numberOfLines={1}>
              {contact.interests.slice(0, 2).join(", ")}
            </Text>
          )}
        </View>
        {incomplete && (
          <Text style={[styles.incompleteHint, { color: badgeColor }]}>
            Add birthday to unlock reminders
          </Text>
        )}
        {enrichmentMissing && (
          <Text style={[styles.incompleteHint, { color: Colors.yellow }]}>
            Add labels for curated suggestions
          </Text>
        )}
      </View>
      {!incomplete && (
        <View style={styles.actions}>
          {onPlanHangout && (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onPlanHangout();
              }}
              hitSlop={8}
              style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.5 }]}
            >
              <Ionicons name="calendar-outline" size={22} color={Colors.primary} />
            </Pressable>
          )}
          {onMarkContacted && (
            <Pressable
              onPress={handleMarkContacted}
              hitSlop={8}
              style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.5 }]}
            >
              <Ionicons name="checkmark-circle-outline" size={26} color={Colors.primaryLight} />
            </Pressable>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  avatarWrapper: {
    position: "relative",
    width: 48,
    height: 48,
  },
  avatarFlash: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.success,
  },
  info: {
    flex: 1,
    marginLeft: 12,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  name: {
    fontSize: 16,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.text,
    flexShrink: 1,
  },
  circleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  circleBadgeText: {
    fontSize: 11,
    fontFamily: "Nunito_600SemiBold",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 6,
  },
  urgencyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  lastContacted: {
    fontSize: 13,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
  },
  interests: {
    fontSize: 12,
    fontFamily: "Nunito_400Regular",
    color: Colors.textTertiary,
    marginLeft: 4,
    flexShrink: 1,
  },
  incompleteBadge: {
    position: "absolute",
    top: -3,
    right: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: Colors.background,
  },
  incompleteBadgeText: {
    fontSize: 11,
    fontFamily: "Nunito_800ExtraBold",
    color: "#fff",
    lineHeight: 13,
  },
  enrichmentBadge: {
    backgroundColor: Colors.yellow + "30",
    borderColor: "transparent",
  },
  enrichmentBadgeText: {
    fontSize: 11,
    fontFamily: "Nunito_800ExtraBold",
    color: Colors.yellow,
    lineHeight: 13,
  },
  incompleteHint: {
    fontSize: 11,
    fontFamily: "Nunito_600SemiBold",
    marginTop: 3,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: 4,
  },
  actionButton: {
    padding: 4,
  },
});
