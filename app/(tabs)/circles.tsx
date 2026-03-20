import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useContacts } from "@/lib/contacts-context";
import { ContactCard } from "@/components/ContactCard";
import { EmptyState } from "@/components/EmptyState";
import { CIRCLE_CONFIG } from "@/lib/types";
import type { Contact } from "@/lib/types";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { computeProfileCompletion } from "@/lib/profile-completion";

export default function CirclesScreen() {
  const insets = useSafeAreaInsets();
  const { contacts, getCircleContacts, markContacted, deleteContact } = useContacts();
  const [activeCircle, setActiveCircle] = useState<1 | 2 | 3>(1);

  const circleContacts = getCircleContacts(activeCircle);
  const config = CIRCLE_CONFIG[activeCircle];
  const profileCompletion = useMemo(() => computeProfileCompletion(contacts), [contacts]);
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16 + webTopInset, paddingBottom: 100 + (Platform.OS === "web" ? 34 : 0) },
        ]}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={styles.header}>
          <Text style={styles.title}>Circles</Text>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/hangouts");
              }}
              style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="calendar-outline" size={22} color={Colors.primaryLight} />
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.push({ pathname: "/add-contact", params: { circle: String(activeCircle) } });
              }}
              style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="add" size={24} color="#fff" />
            </Pressable>
          </View>
        </View>

        <View style={styles.tabs}>
          {([1, 2, 3] as const).map((level) => {
            const cfg = CIRCLE_CONFIG[level];
            const count = getCircleContacts(level).length;
            const isActive = activeCircle === level;
            return (
              <Pressable
                key={level}
                onPress={() => {
                  Haptics.selectionAsync();
                  setActiveCircle(level);
                }}
                style={[
                  styles.tab,
                  isActive && { backgroundColor: cfg.color + "18", borderColor: cfg.color + "40" },
                ]}
              >
                <View style={[styles.tabDot, { backgroundColor: cfg.color }]} />
                <Text
                  style={[
                    styles.tabLabel,
                    isActive && { color: cfg.color },
                  ]}
                  numberOfLines={1}
                >
                  {cfg.label}
                </Text>
                <Text style={[styles.tabCount, isActive && { color: cfg.color }]}>
                  {count}/{cfg.max}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.circleDescription}>{config.description}</Text>

        {profileCompletion.stage === 2 && (
          <View style={styles.encouragementCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.encouragementTitle}>Your circles are taking shape</Text>
              <Text style={styles.encouragementSub}>
                <Text style={{ fontFamily: "Nunito_700Bold" }}>Close friends</Text>
                {" — old roommates, college friends, former colleagues you'd grab coffee with.\n"}
                <Text style={{ fontFamily: "Nunito_700Bold" }}>Acquaintances</Text>
                {" — former coworkers, distant family, interesting people worth keeping in touch with."}
              </Text>
            </View>
          </View>
        )}

        {circleContacts.length === 0 ? (
          <EmptyState
            icon="person-add-outline"
            title={`No one in ${config.label}`}
            subtitle={`Add up to ${config.max} people to this circle`}
            actionLabel="Add someone"
            onAction={() => router.push({ pathname: "/add-contact", params: { circle: String(activeCircle) } })}
          />
        ) : (
          <>
            {circleContacts.map((contact) => (
              <View key={contact.id}>
                <ContactCard
                  contact={contact}
                  onPress={() =>
                    router.push({ pathname: "/edit-contact", params: { id: contact.id } })
                  }
                  onMarkContacted={() => markContacted(contact.id)}
                  onPlanHangout={() => {
                    markContacted(contact.id);
                    router.push({ pathname: "/create-hangout", params: { contactName: contact.name } });
                  }}
                />
                {activeCircle === 1 && !contact.birthday && (
                  <Pressable
                    onPress={() => router.push({ pathname: "/edit-contact", params: { id: contact.id, focusBirthday: "true" } })}
                    style={({ pressed }) => [styles.birthdayNudge, pressed && { opacity: 0.7 }]}
                  >
                    <Ionicons name="gift-outline" size={14} color={Colors.accent} />
                    <Text style={styles.birthdayNudgeText}>Add {contact.name.split(" ")[0]}'s birthday</Text>
                    <Ionicons name="chevron-forward" size={13} color={Colors.textTertiary} />
                  </Pressable>
                )}
              </View>
            ))}
            {circleContacts.length < config.max && (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push({ pathname: "/add-contact", params: { circle: String(activeCircle) } });
                }}
                style={({ pressed }) => [styles.addSomeoneButton, pressed && { opacity: 0.7 }]}
              >
                <View style={styles.addSomeoneIcon}>
                  <Ionicons name="add" size={18} color={Colors.primary} />
                </View>
                <Text style={styles.addSomeoneText}>Add someone to {config.label}</Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontFamily: "Nunito_800ExtraBold",
    color: Colors.text,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary + "18",
    borderWidth: 1,
    borderColor: Colors.primary + "30",
    alignItems: "center",
    justifyContent: "center",
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  tabs: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: 4,
  },
  tabDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tabLabel: {
    fontSize: 12,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
    textAlign: "center",
  },
  tabCount: {
    fontSize: 11,
    fontFamily: "Nunito_700Bold",
    color: Colors.textTertiary,
  },
  circleDescription: {
    fontSize: 13,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    marginBottom: 16,
    textAlign: "center",
  },
  addSomeoneButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.primary + "30",
    borderStyle: "dashed",
    backgroundColor: Colors.primary + "08",
    marginTop: 8,
  },
  addSomeoneIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  addSomeoneText: {
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.primary,
  },
  encouragementCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.success + "30",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    marginTop: 4,
  },
  encouragementTitle: {
    fontSize: 14,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
    marginBottom: 3,
  },
  encouragementSub: {
    fontSize: 13,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  birthdayNudge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: Colors.accent + "12",
    borderRadius: 8,
    marginTop: -4,
    marginBottom: 8,
    marginHorizontal: 2,
  },
  birthdayNudgeText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.accent,
  },
});
