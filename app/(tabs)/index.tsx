import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Platform, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useContacts } from "@/lib/contacts-context";
import { CirclesVisualization } from "@/components/CirclesVisualization";
import { ChecklistItem } from "@/components/ChecklistItem";
import { EmptyState } from "@/components/EmptyState";
import { formatBirthdayCountdown, formatLastContacted, getDaysSince } from "@/lib/helpers";
import { CIRCLE_CONFIG } from "@/lib/types";
import { router } from "expo-router";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { contacts, getOverdueContacts, getUpcomingBirthdays, markContacted, isLoading } = useContacts();
  const [refreshing, setRefreshing] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const overdue = getOverdueContacts().filter((c) => !dismissed.has("overdue-" + c.id));
  const birthdays = getUpcomingBirthdays().filter((c) => !dismissed.has("bday-" + c.id));

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setDismissed(new Set());
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  const totalChecklist = overdue.length + birthdays.length;
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16 + webTopInset, paddingBottom: 100 + (Platform.OS === "web" ? 34 : 0) },
      ]}
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.greeting}>Your Bridges</Text>
        <Text style={styles.subtitle}>
          {contacts.length === 0
            ? "Start by adding people to your circles"
            : `${contacts.length} ${contacts.length === 1 ? "person" : "people"} in your circles`}
        </Text>
      </View>

      <CirclesVisualization contacts={contacts} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Social Health</Text>
          {totalChecklist > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{totalChecklist}</Text>
            </View>
          )}
        </View>

        {totalChecklist === 0 && contacts.length === 0 && (
          <EmptyState
            icon="people-outline"
            title="No check-ins yet"
            subtitle="Add people to your circles to start getting reminders"
            actionLabel="Add someone"
            onAction={() => router.push("/(tabs)/circles")}
          />
        )}

        {totalChecklist === 0 && contacts.length > 0 && (
          <View style={styles.allGoodContainer}>
            <Text style={styles.allGoodText}>You're all caught up! Great job staying connected.</Text>
          </View>
        )}

        {birthdays.map((contact) => (
          <ChecklistItem
            key={"bday-" + contact.id}
            icon="gift-outline"
            iconColor={Colors.accent}
            title={`${contact.name}'s birthday`}
            subtitle={formatBirthdayCountdown(contact.birthday)}
            onComplete={() => setDismissed((prev) => new Set(prev).add("bday-" + contact.id))}
            onSnooze={() => setDismissed((prev) => new Set(prev).add("bday-" + contact.id))}
          />
        ))}

        {overdue.map((contact) => {
          const days = getDaysSince(contact.lastContacted);
          const circleLabel = CIRCLE_CONFIG[contact.circleLevel].label;
          return (
            <ChecklistItem
              key={"overdue-" + contact.id}
              icon="time-outline"
              iconColor={Colors.warning}
              title={`Reach out to ${contact.name}`}
              subtitle={
                days === null
                  ? `${circleLabel} - Never contacted`
                  : `${circleLabel} - Last: ${formatLastContacted(contact.lastContacted)}`
              }
              onComplete={() => {
                markContacted(contact.id);
                setDismissed((prev) => new Set(prev).add("overdue-" + contact.id));
              }}
              onSnooze={() => setDismissed((prev) => new Set(prev).add("overdue-" + contact.id))}
            />
          );
        })}
      </View>
    </ScrollView>
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
    marginBottom: 8,
  },
  greeting: {
    fontSize: 28,
    fontFamily: "Nunito_800ExtraBold",
    color: Colors.text,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    marginTop: 4,
  },
  section: {
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
  },
  badge: {
    backgroundColor: Colors.accent,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 12,
    fontFamily: "Nunito_700Bold",
    color: "#fff",
  },
  allGoodContainer: {
    backgroundColor: Colors.success + "12",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.success + "25",
  },
  allGoodText: {
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.success,
    textAlign: "center",
  },
});
