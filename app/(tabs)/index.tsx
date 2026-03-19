import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { View, Text, StyleSheet, ScrollView, Platform, RefreshControl, Pressable, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useContacts } from "@/lib/contacts-context";
import { useAuth } from "@/lib/auth-context";
import { computeProfileCompletion, STAGE1_GOALS } from "@/lib/profile-completion";
import { CirclesVisualization } from "@/components/CirclesVisualization";
import { ChecklistItem } from "@/components/ChecklistItem";
import { EmptyState } from "@/components/EmptyState";
import { formatLastContacted, getDaysSince, getDaysUntilBirthday } from "@/lib/helpers";
import { CIRCLE_CONFIG } from "@/lib/types";
import { generateReminders, Reminder } from "@/lib/reminders";
import { getSmartPrompt, getActionType, getNextPrompt, loadSyncedPrompts } from "@/lib/prompts";
import { loadSchedulerData, markSuggested, getDaysSinceLastSuggestedSync, scoreSuggestion, isInCooldown } from "@/lib/suggestion-scheduler";
import { getTextCopyMessage } from "@/components/SuggestionCard";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";

const MAX_REMINDERS = 3;
const MAX_SUGGESTIONS = 2;

function getReminderIcon(reminder: Reminder): keyof typeof Ionicons.glyphMap {
  switch (reminder.type) {
    case "birthday":
      return "gift-outline";
    case "hangout-overdue":
      return "calendar-outline";
    case "hangout-6month":
      return "help-circle-outline";
    case "check-in-overdue":
      return "time-outline";
    default:
      return "notifications-outline";
  }
}

function getReminderIconColor(reminder: Reminder): string {
  switch (reminder.type) {
    case "birthday":
      return Colors.accent;
    case "hangout-overdue":
      return Colors.warning;
    case "hangout-6month":
      return Colors.circle3;
    case "check-in-overdue":
      return Colors.warning;
    default:
      return Colors.textSecondary;
  }
}

function getPriorityLevel(priority: number): "high" | "medium" | "low" {
  if (priority >= 150) return "high";
  if (priority >= 80) return "medium";
  return "low";
}

interface Suggestion {
  contactId: string;
  contactName: string;
  avatarColor: string;
  photoUri?: string | null;
  circleLevel: 1 | 2 | 3;
  prompt: string;
  actionType: "call" | "text" | "hangout";
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { contacts, markContacted, markHangout, isLoading, refreshContacts } = useContacts();
  const [refreshing, setRefreshing] = useState(false);
  const [dismissedReminders, setDismissedReminders] = useState<Set<string>>(new Set());
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());
  const [suggestionPrompts, setSuggestionPrompts] = useState<Map<string, string>>(new Map());
  const [lastSuggestedDates, setLastSuggestedDates] = useState<Record<string, string>>({});

  useEffect(() => {
    loadSyncedPrompts();
    loadSchedulerData().then(setLastSuggestedDates);
  }, []);

  const allReminders = useMemo(() => generateReminders(contacts), [contacts]);

  const visibleReminders = useMemo(
    () => allReminders.filter((r) => !dismissedReminders.has(r.id)).slice(0, MAX_REMINDERS),
    [allReminders, dismissedReminders],
  );

  const getSuggestionForContact = useCallback(
    (contact: typeof contacts[0]): Suggestion => {
      const existing = suggestionPrompts.get(contact.id);
      const circleLevel = contact.circleLevel as 1 | 2 | 3;
      const daysSinceContact = getDaysSince(contact.lastContacted ?? undefined);
      const daysUntilBday = getDaysUntilBirthday(contact.birthday ?? undefined);

      const prompt =
        existing ||
        getSmartPrompt(contact.id, contact.name, circleLevel, contact.interests, {
          isOverdue: daysSinceContact !== null && daysSinceContact > (circleLevel === 1 ? 7 : circleLevel === 2 ? 30 : 90),
          hasBirthdaySoon: daysUntilBday !== null && daysUntilBday <= 30,
          labels: contact.labels,
        });

      if (!existing) {
        setSuggestionPrompts((prev) => new Map(prev).set(contact.id, prompt));
      }

      return {
        contactId: contact.id,
        contactName: contact.name,
        avatarColor: contact.avatarColor,
        photoUri: contact.photoUri,
        circleLevel,
        prompt,
        actionType: getActionType(circleLevel, prompt),
      };
    },
    [suggestionPrompts],
  );

  const shownSuggestionIds = useRef<string[]>([]);
  const suggestionKeyRef = useRef<string>("");

  const suggestions = useMemo(() => {
    const reminderContactIds = new Set(visibleReminders.map((r) => r.contactId));

    const isEligibleForNewSlot = (c: typeof contacts[0]): boolean => {
      if (dismissedSuggestions.has(c.id)) return false;
      if (reminderContactIds.has(c.id)) return false;
      if (c.circleLevel === 3) return false;
      const daysSinceLastSug = getDaysSinceLastSuggestedSync(c.id, lastSuggestedDates);
      return !isInCooldown(c.circleLevel as 1 | 2 | 3, daysSinceLastSug);
    };

    const circle3NudgeContact = contacts.find((c) => {
      if (c.circleLevel !== 3) return false;
      if (dismissedSuggestions.has(c.id)) return false;
      if (reminderContactIds.has(c.id)) return false;
      const daysSince = getDaysSince(c.lastContacted ?? undefined);
      if (daysSince === null || daysSince < 90) return false;
      const daysSinceLastSug = getDaysSinceLastSuggestedSync(c.id, lastSuggestedDates);
      return daysSinceLastSug === null || daysSinceLastSug > 60;
    });

    const c1c2SlotCount = circle3NudgeContact
      ? MAX_SUGGESTIONS - 1
      : MAX_SUGGESTIONS;

    const currentStableIds = shownSuggestionIds.current.filter(
      (id) => !dismissedSuggestions.has(id) && !reminderContactIds.has(id),
    ).slice(0, c1c2SlotCount);
    const stableSet = new Set(currentStableIds);
    const slotsNeeded = c1c2SlotCount - currentStableIds.length;

    let newContacts: typeof contacts = [];
    if (slotsNeeded > 0) {
      newContacts = contacts
        .filter((c) => !stableSet.has(c.id) && isEligibleForNewSlot(c))
        .map((c) => {
          const daysSinceLastSug = getDaysSinceLastSuggestedSync(c.id, lastSuggestedDates);
          const daysSinceContact = getDaysSince(c.lastContacted ?? undefined);
          const daysUntilBday = getDaysUntilBirthday(c.birthday ?? undefined);
          return { contact: c, score: scoreSuggestion(c.circleLevel as 1 | 2 | 3, daysSinceLastSug, daysSinceContact, daysUntilBday) };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, slotsNeeded)
        .map((x) => x.contact);
    }

    const allC1C2Ids = [...currentStableIds, ...newContacts.map((c) => c.id)];
    shownSuggestionIds.current = allC1C2Ids;

    const result: Suggestion[] = allC1C2Ids
      .map((id) => contacts.find((c) => c.id === id))
      .filter((c): c is typeof contacts[0] => c !== undefined)
      .map((c) => getSuggestionForContact(c));

    if (circle3NudgeContact) {
      const daysSince = getDaysSince(circle3NudgeContact.lastContacted ?? undefined)!;
      const is6Month = daysSince >= 180;
      result.push({
        contactId: circle3NudgeContact.id,
        contactName: circle3NudgeContact.name,
        avatarColor: circle3NudgeContact.avatarColor,
        photoUri: circle3NudgeContact.photoUri,
        circleLevel: 3 as 1 | 2 | 3,
        prompt: is6Month
          ? `It's been 6 months since you last spoke to ${circle3NudgeContact.name} — it might be time to reconnect.`
          : `You haven't spoken to ${circle3NudgeContact.name} in 3 months — want to set up a hangout or give them a call?`,
        actionType: "hangout",
      });
    }

    return result;
  }, [contacts, dismissedSuggestions, visibleReminders, getSuggestionForContact, lastSuggestedDates]);

  useEffect(() => {
    const key = suggestions.map((s) => s.contactId).join(",");
    if (key !== "" && key !== suggestionKeyRef.current) {
      suggestionKeyRef.current = key;
      suggestions.forEach((s) => markSuggested(s.contactId));
      loadSchedulerData().then(setLastSuggestedDates);
    }
  }, [suggestions]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setDismissedReminders(new Set());
    setDismissedSuggestions(new Set());
    setSuggestionPrompts(new Map());
    await refreshContacts();
    setRefreshing(false);
  }, [refreshContacts]);

  const handleReminderComplete = useCallback(
    async (reminder: Reminder) => {
      setDismissedReminders((prev) => new Set(prev).add(reminder.id));
      if (reminder.type === "hangout-overdue" || reminder.type === "hangout-6month") {
        await markHangout(reminder.contactId);
      }
      await markContacted(reminder.contactId);
    },
    [markContacted, markHangout],
  );

  const handleReminderSnooze = useCallback((reminder: Reminder) => {
    setDismissedReminders((prev) => new Set(prev).add(reminder.id));
  }, []);

  const handleHangout6MonthYes = useCallback(
    async (reminder: Reminder) => {
      setDismissedReminders((prev) => new Set(prev).add(reminder.id));
      await markHangout(reminder.contactId);
    },
    [markHangout],
  );

  const handleHangout6MonthNo = useCallback(
    (reminder: Reminder) => {
      setDismissedReminders((prev) => new Set(prev).add(reminder.id));
      router.push({
        pathname: "/create-hangout",
        params: { contactName: reminder.contactName },
      });
    },
    [],
  );

  const handleSuggestionDone = useCallback(
    async (suggestion: Suggestion) => {
      setDismissedSuggestions((prev) => new Set(prev).add(suggestion.contactId));
      await markContacted(suggestion.contactId);
      if (suggestion.actionType === "hangout") {
        await markHangout(suggestion.contactId);
      }
    },
    [markContacted, markHangout],
  );

  const handleSuggestionRefresh = useCallback(
    (suggestion: Suggestion) => {
      const contact = contacts.find((c) => c.id === suggestion.contactId);
      if (!contact) return;
      const circleLevel = contact.circleLevel as 1 | 2 | 3;
      const daysSinceContact = getDaysSince(contact.lastContacted ?? undefined);
      const daysUntilBday = getDaysUntilBirthday(contact.birthday ?? undefined);
      const newPrompt = getNextPrompt(
        contact.id,
        suggestion.prompt,
        contact.name,
        circleLevel,
        contact.interests,
        {
          isOverdue: daysSinceContact !== null && daysSinceContact > (circleLevel === 1 ? 7 : circleLevel === 2 ? 30 : 90),
          hasBirthdaySoon: daysUntilBday !== null && daysUntilBday <= 30,
          labels: contact.labels,
        },
      );
      setSuggestionPrompts((prev) => new Map(prev).set(contact.id, newPrompt));
    },
    [contacts],
  );

  const handleSuggestionCopyText = useCallback(
    async (suggestion: Suggestion) => {
      const message = getTextCopyMessage(suggestion.contactName);
      if (Platform.OS === "web") {
        try { await navigator.clipboard.writeText(message); } catch {}
      } else {
        await Clipboard.setStringAsync(message);
      }
      setDismissedSuggestions((prev) => new Set(prev).add(suggestion.contactId));
      await markContacted(suggestion.contactId);
    },
    [markContacted],
  );

  const handleSuggestionHangout = useCallback(
    async (suggestion: Suggestion) => {
      await markContacted(suggestion.contactId);
      setDismissedSuggestions((prev) => new Set(prev).add(suggestion.contactId));
      router.push({
        pathname: "/create-hangout",
        params: { contactName: suggestion.contactName },
      });
    },
    [markContacted],
  );

  const totalItems = visibleReminders.length + suggestions.length;
  const profileCompletion = useMemo(() => computeProfileCompletion(contacts), [contacts]);
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
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primaryLight} />
      }
    >
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.push("/profile")}
            hitSlop={8}
            style={({ pressed }) => [styles.profileBtn, pressed && { opacity: 0.7 }]}
          >
            {user?.profilePhotoUri ? (
              <Image source={{ uri: user.profilePhotoUri }} style={styles.profileImg} />
            ) : (
              <Ionicons name="person" size={18} color={Colors.primaryLight} />
            )}
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.greeting}>Your Bridges</Text>
            <Text style={styles.subtitle}>
              {contacts.length === 0
                ? "Start by adding people to your circles"
                : `${contacts.length} ${contacts.length === 1 ? "person" : "people"} in your circles`}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push("/hangouts")}
            hitSlop={8}
            style={({ pressed }) => [styles.hangoutHeaderBtn, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="calendar-outline" size={20} color={Colors.primaryLight} />
          </Pressable>
        </View>
      </View>

      <CirclesVisualization contacts={contacts} user={user} />

      <Pressable
        onPress={() => router.push("/hangouts")}
        style={({ pressed }) => [styles.hangoutBanner, pressed && { opacity: 0.8 }]}
      >
        <View style={styles.hangoutBannerLeft}>
          <View style={styles.hangoutBannerIcon}>
            <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
          </View>
          <View>
            <Text style={styles.hangoutBannerTitle}>Plan a hangout</Text>
            <Text style={styles.hangoutBannerSub}>Create a survey and vote on times</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
      </Pressable>

      {profileCompletion.stage === 1 && (
        <Pressable
          onPress={() => router.push("/(tabs)/circles")}
          style={({ pressed }) => [styles.profileBanner, pressed && { opacity: 0.8 }]}
        >
          <View style={styles.profileBannerLeft}>
            <View style={styles.profileBannerIcon}>
              <Ionicons name="people-outline" size={18} color="#9B7DFF" />
            </View>
            <View style={styles.profileBannerText}>
              <Text style={styles.profileBannerTitle}>Complete your circles</Text>
              <Text style={styles.profileBannerSub}>
                {profileCompletion.circle1WithBirthday}/{STAGE1_GOALS.circle1WithBirthday} core friends with birthdays
                {profileCompletion.circle2Count < STAGE1_GOALS.circle2
                  ? `, ${profileCompletion.circle2Count}/${STAGE1_GOALS.circle2} close friends`
                  : ""}
                {profileCompletion.circle3Count < STAGE1_GOALS.circle3
                  ? `, ${profileCompletion.circle3Count}/${STAGE1_GOALS.circle3} acquaintance`
                  : ""}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
        </Pressable>
      )}

      {contacts.length === 0 && (
        <View style={styles.section}>
          <EmptyState
            icon="people-outline"
            title="No check-ins yet"
            subtitle="Add people to your circles to start getting reminders"
            actionLabel="Add someone"
            onAction={() => router.push("/(tabs)/circles")}
          />
        </View>
      )}

      {contacts.length > 0 && (
        <>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="notifications-outline" size={18} color={Colors.accent} />
              <Text style={styles.sectionTitle}>Reminders</Text>
              {visibleReminders.length > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{visibleReminders.length}</Text>
                </View>
              )}
            </View>

            {visibleReminders.length === 0 && (
              <View style={styles.allGoodContainer}>
                <Text style={styles.allGoodText}>No reminders right now. You're all caught up!</Text>
              </View>
            )}

            {visibleReminders.map((reminder) => (
              <ChecklistItem
                key={reminder.id}
                icon={getReminderIcon(reminder)}
                iconColor={getReminderIconColor(reminder)}
                title={reminder.title}
                subtitle={reminder.subtitle}
                priorityLevel={getPriorityLevel(reminder.priority)}
                actionType={reminder.actionType}
                showYesNo={reminder.type === "hangout-6month"}
                onYes={() => handleHangout6MonthYes(reminder)}
                onNo={() => handleHangout6MonthNo(reminder)}
                onComplete={() => handleReminderComplete(reminder)}
                onSnooze={reminder.type !== "hangout-6month" ? () => handleReminderSnooze(reminder) : undefined}
              />
            ))}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="bulb-outline" size={18} color={Colors.warning} />
              <Text style={styles.sectionTitle}>Suggestions</Text>
            </View>

            {suggestions.length === 0 && (
              <View style={styles.allGoodContainer}>
                <Text style={styles.allGoodText}>No suggestions right now. Check back later!</Text>
              </View>
            )}

            {suggestions.map((suggestion) => {
              const circleColor =
                suggestion.circleLevel === 1
                  ? Colors.circle1
                  : suggestion.circleLevel === 2
                    ? Colors.circle2
                    : Colors.circle3;
              const circleLabel = CIRCLE_CONFIG[suggestion.circleLevel]?.label ?? "Circle";

              return (
                <View key={suggestion.contactId} style={styles.suggestionCard}>
                  <View style={styles.suggestionHeader}>
                    <View style={[styles.suggestionDot, { backgroundColor: circleColor }]} />
                    <Text style={styles.suggestionName} numberOfLines={1}>{suggestion.contactName}</Text>
                    <View style={[styles.suggestionCircleBadge, { backgroundColor: circleColor + "15" }]}>
                      <Text style={[styles.suggestionCircleText, { color: circleColor }]}>{circleLabel}</Text>
                    </View>
                  </View>
                  <Text style={styles.suggestionPrompt} numberOfLines={2}>{suggestion.prompt}</Text>
                  <View style={styles.suggestionActions}>
                    {suggestion.actionType !== "hangout" && (
                      <Pressable
                        onPress={() => handleSuggestionRefresh(suggestion)}
                        hitSlop={8}
                        style={({ pressed }) => [styles.suggestionActionBtn, pressed && { opacity: 0.5 }]}
                      >
                        <Ionicons name="shuffle-outline" size={18} color={Colors.textSecondary} />
                      </Pressable>
                    )}
                    {suggestion.actionType === "text" && (
                      <Pressable
                        onPress={() => handleSuggestionCopyText(suggestion)}
                        hitSlop={8}
                        style={({ pressed }) => [styles.suggestionActionBtn, pressed && { opacity: 0.5 }]}
                      >
                        <Ionicons name="copy-outline" size={18} color={Colors.primaryLight} />
                      </Pressable>
                    )}
                    {suggestion.actionType === "hangout" && (
                      <Pressable
                        onPress={() => handleSuggestionHangout(suggestion)}
                        hitSlop={8}
                        style={({ pressed }) => [styles.suggestionActionBtn, pressed && { opacity: 0.5 }]}
                      >
                        <Ionicons name="calendar-outline" size={18} color={Colors.primaryLight} />
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() => handleSuggestionDone(suggestion)}
                      hitSlop={8}
                      style={({ pressed }) => [styles.suggestionDoneBtn, pressed && { opacity: 0.7 }]}
                    >
                      <Ionicons name="checkmark" size={16} color="#fff" />
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  profileBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primary + "20",
    borderWidth: 1.5,
    borderColor: Colors.primary + "40",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  profileImg: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  headerText: {
    flex: 1,
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
  hangoutHeaderBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primary + "18",
    borderWidth: 1,
    borderColor: Colors.primary + "30",
    alignItems: "center",
    justifyContent: "center",
  },
  hangoutBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.primary + "30",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  hangoutBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  hangoutBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  hangoutBannerTitle: {
    fontSize: 14,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
  },
  hangoutBannerSub: {
    fontSize: 12,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    marginTop: 1,
  },
  profileBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: "#9B7DFF30",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 10,
  },
  profileBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  profileBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#9B7DFF18",
    alignItems: "center",
    justifyContent: "center",
  },
  profileBannerText: {
    flex: 1,
  },
  profileBannerTitle: {
    fontSize: 14,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
  },
  profileBannerSub: {
    fontSize: 12,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    marginTop: 1,
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
    backgroundColor: Colors.success + "15",
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
  suggestionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  suggestionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  suggestionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  suggestionName: {
    fontSize: 15,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
    flex: 1,
  },
  suggestionCircleBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  suggestionCircleText: {
    fontSize: 10,
    fontFamily: "Nunito_600SemiBold",
  },
  suggestionPrompt: {
    fontSize: 14,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 10,
  },
  suggestionActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  suggestionActionBtn: {
    padding: 6,
  },
  suggestionDoneBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
