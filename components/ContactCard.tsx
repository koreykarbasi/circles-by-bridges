import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
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
  showCircleLabel?: boolean;
}

export function ContactCard({ contact, onPress, onMarkContacted, showCircleLabel }: ContactCardProps) {
  const urgency = getContactUrgency(contact.circleLevel as 1 | 2 | 3, contact.lastContacted ?? undefined);
  const circleColor = CIRCLE_CONFIG[contact.circleLevel as 1 | 2 | 3]?.color ?? Colors.primary;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        pressed && styles.pressed,
      ]}
    >
      <Avatar name={contact.name} color={contact.avatarColor} size={48} photoUri={contact.photoUri} />
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
            {formatLastContacted(contact.lastContacted ?? undefined)}
          </Text>
          {contact.interests.length > 0 && (
            <Text style={styles.interests} numberOfLines={1}>
              {contact.interests.slice(0, 2).join(", ")}
            </Text>
          )}
        </View>
      </View>
      {onMarkContacted && (
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onMarkContacted();
          }}
          hitSlop={8}
          style={({ pressed }) => [
            styles.checkButton,
            pressed && { opacity: 0.5 },
          ]}
        >
          <Ionicons name="checkmark-circle-outline" size={26} color={Colors.primaryLight} />
        </Pressable>
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
  checkButton: {
    padding: 4,
    marginLeft: 8,
  },
});
