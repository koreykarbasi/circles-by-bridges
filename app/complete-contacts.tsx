import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useContacts } from "@/lib/contacts-context";
import { Avatar } from "@/components/Avatar";
import { CIRCLE_CONFIG } from "@/lib/types";
import * as Haptics from "expo-haptics";
import { HINT_TEXT } from "@/lib/hints-store";

export default function CompleteContactsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ count?: string; importedIds?: string }>();
  const count = parseInt(params.count ?? "0", 10);
  const { contacts } = useContacts();
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const importedIdSet = useMemo<Set<string>>(() => {
    if (!params.importedIds) return new Set();
    try {
      const ids: string[] = JSON.parse(params.importedIds);
      return new Set(ids);
    } catch {
      return new Set();
    }
  }, [params.importedIds]);

  const incomplete = useMemo(
    () =>
      contacts.filter(
        (c) =>
          importedIdSet.size > 0
            ? importedIdSet.has(c.id) && (c.circleLevel === 1 || c.circleLevel === 2) && !c.birthday
            : (c.circleLevel === 1 || c.circleLevel === 2) && !c.birthday,
      ),
    [contacts, importedIdSet],
  );

  // Imported contacts missing both labels and interests — they'll show the yellow dot
  const enrichmentMissing = useMemo(
    () =>
      contacts.filter((c) => {
        const isImported = importedIdSet.size > 0 ? importedIdSet.has(c.id) : true;
        return (
          isImported &&
          (c.labels ?? []).length === 0 &&
          (c.interests ?? []).length === 0
        );
      }),
    [contacts, importedIdSet],
  );

  const firstEnrichmentContact = enrichmentMissing[0] ?? null;

  const handleDone = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace("/(tabs)");
  };

  return (
    <View style={styles.container}>
      <View style={[styles.headerBar, { paddingTop: insets.top + 8 + webTopInset }]}>
        <View style={{ width: 26 }} />
        <Text style={styles.headerTitle}>Contacts Added</Text>
        <Pressable
          onPress={handleDone}
          hitSlop={12}
          style={({ pressed }) => [pressed && { opacity: 0.5 }]}
        >
          <Text style={styles.doneLink}>Done</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 40 + (Platform.OS === "web" ? 34 : 0) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.successBanner}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={28} color={Colors.success} />
          </View>
          <Text style={styles.successTitle}>
            {count > 0 ? `${count} ${count === 1 ? "person" : "people"} added` : "Contacts imported"}
          </Text>
          <Text style={styles.successSub}>
            You can edit any contact from your Circles tab.
          </Text>
        </View>

        {incomplete.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Ionicons name="gift-outline" size={16} color={Colors.warning} />
              <Text style={styles.sectionTitle}>Missing birthdays</Text>
            </View>
            <Text style={styles.sectionSub}>
              Adding birthdays lets Bridges send you timely reminders so you never miss an important day.
            </Text>

            {incomplete.map((contact) => {
              const cfg = CIRCLE_CONFIG[contact.circleLevel as 1 | 2 | 3];
              const badgeColor = contact.circleLevel === 1 ? Colors.danger : Colors.warning;
              return (
                <Pressable
                  key={contact.id}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push({
                      pathname: "/edit-contact",
                      params: { id: contact.id, focusBirthday: "true" },
                    });
                  }}
                  style={({ pressed }) => [
                    styles.contactRow,
                    { borderColor: badgeColor + "50", borderWidth: 1.5 },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Avatar name={contact.name} color={contact.avatarColor} size={44} photoUri={contact.photoUri} />
                  <View style={styles.contactInfo}>
                    <Text style={styles.contactName}>{contact.name}</Text>
                    <Text style={[styles.contactCircle, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                  <View style={styles.addBirthdayBtn}>
                    <Ionicons name="gift-outline" size={14} color={badgeColor} />
                    <Text style={[styles.addBirthdayText, { color: badgeColor }]}>Add birthday</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
                </Pressable>
              );
            })}
          </>
        )}

        {enrichmentMissing.length > 0 && (
          <View style={styles.enrichmentBanner}>
            <View style={styles.enrichmentIconRow}>
              <View style={styles.enrichmentDot} />
              <Text style={styles.enrichmentTitle}>Add labels for better suggestions</Text>
            </View>
            <Text style={styles.enrichmentBody}>
              {HINT_TEXT.import_enrichment_dot}
            </Text>
            {firstEnrichmentContact && (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push({
                    pathname: "/edit-contact",
                    params: { id: firstEnrichmentContact.id },
                  });
                }}
                style={({ pressed }) => [
                  styles.enrichmentCta,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Avatar
                  name={firstEnrichmentContact.name}
                  color={firstEnrichmentContact.avatarColor}
                  size={32}
                  photoUri={firstEnrichmentContact.photoUri}
                />
                <Text style={styles.enrichmentCtaText} numberOfLines={1}>
                  Start with {firstEnrichmentContact.name}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.yellow} />
              </Pressable>
            )}
          </View>
        )}

        <Pressable
          onPress={handleDone}
          style={({ pressed }) => [styles.doneButton, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.doneButtonText}>Go to my circles</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    backgroundColor: Colors.background,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
  },
  doneLink: {
    fontSize: 16,
    fontFamily: "Nunito_700Bold",
    color: Colors.primary,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  successBanner: {
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: Colors.success + "30",
  },
  successIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.success + "18",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  successTitle: {
    fontSize: 20,
    fontFamily: "Nunito_800ExtraBold",
    color: Colors.text,
    marginBottom: 6,
  },
  successSub: {
    fontSize: 14,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
  },
  sectionSub: {
    fontSize: 13,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    marginBottom: 16,
    lineHeight: 18,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 15,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.text,
  },
  contactCircle: {
    fontSize: 12,
    fontFamily: "Nunito_600SemiBold",
    marginTop: 2,
  },
  addBirthdayBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  addBirthdayText: {
    fontSize: 12,
    fontFamily: "Nunito_600SemiBold",
  },
  doneButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 24,
  },
  doneButtonText: {
    fontSize: 16,
    fontFamily: "Nunito_700Bold",
    color: "#fff",
  },
  enrichmentBanner: {
    backgroundColor: Colors.yellow + "14",
    borderRadius: 14,
    padding: 16,
    marginTop: 24,
    borderWidth: 1.5,
    borderColor: Colors.yellow + "50",
  },
  enrichmentIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  enrichmentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.yellow,
  },
  enrichmentTitle: {
    fontSize: 15,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
  },
  enrichmentBody: {
    fontSize: 13,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: 12,
  },
  enrichmentCta: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.yellow + "40",
  },
  enrichmentCtaText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.yellow,
  },
});
