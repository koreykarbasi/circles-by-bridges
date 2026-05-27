import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Animated } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useContacts } from "@/lib/contacts-context";
import { SuggestionCard } from "@/components/SuggestionCard";
import { ReminderItem } from "@/components/ReminderItem";
import { EmptyState } from "@/components/EmptyState";
import { CIRCLE_CONFIG } from "@/lib/types";
import { getSmartPrompt, getNextPrompt, getActionType, resetSeenPrompts, loadSyncedPrompts } from "@/lib/prompts";
import { getDaysSince, getDaysUntilBirthday, formatLastContacted, formatBirthdayCountdown, getContactUrgency } from "@/lib/helpers";
import { generateReminders } from "@/lib/reminders";
import { getDaysSinceLastSuggestedSync, scoreSuggestion, isInCooldown } from "@/lib/suggestion-scheduler";
import { useDismissedSuggestions, dismissSuggestion, clearDismissedSuggestions, useSchedulerDates, markContactSuggested, getCachedPrompt, setCachedPrompt, clearPromptCache } from "@/lib/suggestions-store";
import type { Contact } from "@/lib/types";
import type { Reminder } from "@/lib/reminders";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";

interface GeneratedSuggestion {
  contact: Contact;
  prompt: string;
  type: "call" | "text" | "hangout";
  urgency: "overdue" | "soon" | "ok";
  birthdayLabel?: string;
  lastContactedLabel?: string;
}

function buildSuggestion(contact: Contact): GeneratedSuggestion {
  const urgency = getContactUrgency(contact.circleLevel as 1 | 2 | 3, contact.lastContacted ?? undefined);
  const bday = getDaysUntilBirthday(contact.birthday ?? undefined);
  const hasBirthdaySoon = bday !== null && bday <= 14;
  const birthdayLabel = formatBirthdayCountdown(contact.birthday ?? undefined);
  const lastContactedLabel = formatLastContacted(contact.lastContacted ?? undefined);

  const prompt = getSmartPrompt(
    contact.id,
    contact.name,
    contact.circleLevel as 1 | 2 | 3,
    contact.interests,
    { isOverdue: urgency === "overdue", hasBirthdaySoon, labels: contact.labels },
  );

  let type = getActionType(contact.circleLevel as 1 | 2 | 3, prompt);
  if (contact.circleLevel === 3 && type === "call") type = "text";

  return {
    contact,
    prompt,
    type,
    urgency,
    birthdayLabel: hasBirthdaySoon ? birthdayLabel : undefined,
    lastContactedLabel,
  };
}

function deriveHangoutTitle(contactName: string, prompt: string): string {
  const lower = prompt.toLowerCase();
  if (lower.includes("coffee")) return `Coffee with ${contactName}`;
  if (lower.includes("lunch")) return `Lunch with ${contactName}`;
  if (lower.includes("dinner")) return `Dinner with ${contactName}`;
  if (lower.includes("brunch")) return `Brunch with ${contactName}`;
  if (lower.includes("walk")) return `Walk with ${contactName}`;
  if (lower.includes("drink")) return `Drinks with ${contactName}`;
  if (lower.includes("movie")) return `Movie with ${contactName}`;
  if (lower.includes("hangout") || lower.includes("hang out")) return `Hang out with ${contactName}`;
  return `Hang out with ${contactName}`;
}


export default function SuggestionsScreen() {
  const insets = useSafeAreaInsets();
  const { contacts, markContacted, markHangout } = useContacts();
  const [filterCircle, setFilterCircle] = useState<1 | 2 | 3 | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [shuffleJitter, setShuffleJitter] = useState<Record<string, number>>({});
  const completedIds = useDismissedSuggestions();
  const lastSuggestedDates = useSchedulerDates();
  const [completedReminderIds, setCompletedReminderIds] = useState<Set<string>>(new Set());
  const [cardPrompts, setCardPrompts] = useState<Record<string, GeneratedSuggestion>>({});
  const [remindersCollapsed, setRemindersCollapsed] = useState(false);
  const visitCount = useRef(0);
  const [copiedToast, setCopiedToast] = useState(false);
  const copiedToastAnim = useRef(new Animated.Value(0)).current;
  const copiedToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadSyncedPrompts();
  }, []);

  useEffect(() => {
    visitCount.current += 1;
    if (visitCount.current > 1) {
      setRefreshKey((k) => k + 1);
    }
  }, []);

  const reminders = useMemo(() => {
    const allReminders = generateReminders(contacts);
    const filtered = filterCircle
      ? allReminders.filter((r) => r.circleLevel === filterCircle)
      : allReminders;
    return filtered.filter((r) => !completedReminderIds.has(r.id));
  }, [contacts, filterCircle, completedReminderIds]);

  const rankedContacts = useMemo(() => {
    const filtered = filterCircle
      ? contacts.filter((c) => c.circleLevel === filterCircle)
      : contacts;

    const inCooldown = (c: typeof contacts[0]) => {
      const daysSinceLastSug = getDaysSinceLastSuggestedSync(c.id, lastSuggestedDates);
      return isInCooldown(c.circleLevel as 1 | 2 | 3, daysSinceLastSug);
    };

    const eligible = filtered.filter((c) => !inCooldown(c));
    const cooledDown = filtered.filter((c) => inCooldown(c));
    const pool = eligible.length >= 1 ? eligible : [...eligible, ...cooledDown];

    return [...pool]
      .map((c) => {
        const daysSinceLastSug = getDaysSinceLastSuggestedSync(c.id, lastSuggestedDates);
        const daysSinceContact = getDaysSince(c.lastContacted ?? undefined);
        const daysUntilBday = getDaysUntilBirthday(c.birthday ?? undefined);
        return {
          contact: c,
          score: scoreSuggestion(
            c.circleLevel as 1 | 2 | 3,
            daysSinceLastSug,
            daysSinceContact,
            daysUntilBday,
          ) + (shuffleJitter[c.id] ?? 0),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((x) => x.contact);
  }, [contacts, filterCircle, lastSuggestedDates, shuffleJitter]);

  useEffect(() => {
    const next: Record<string, number> = {};
    for (const contact of rankedContacts) {
      if (!cardPrompts[contact.id]) {
        next[contact.id] = Math.random() * 0.01;
      }
    }
    if (Object.keys(next).length > 0) {
      setCardPrompts((prev) => {
        const updated = { ...prev };
        for (const contact of rankedContacts) {
          if (!updated[contact.id]) {
            const cachedPromptText = getCachedPrompt(contact.id);
            if (cachedPromptText) {
              const urgency = getContactUrgency(contact.circleLevel as 1 | 2 | 3, contact.lastContacted ?? undefined);
              const bday = getDaysUntilBirthday(contact.birthday ?? undefined);
              const hasBirthdaySoon = bday !== null && bday <= 14;
              let type = getActionType(contact.circleLevel as 1 | 2 | 3, cachedPromptText);
              if (contact.circleLevel === 3 && type === "call") type = "text";
              updated[contact.id] = {
                contact,
                prompt: cachedPromptText,
                type,
                urgency,
                birthdayLabel: hasBirthdaySoon ? formatBirthdayCountdown(contact.birthday ?? undefined) : undefined,
                lastContactedLabel: formatLastContacted(contact.lastContacted ?? undefined),
              };
            } else {
              const suggestion = buildSuggestion(contact);
              setCachedPrompt(contact.id, suggestion.prompt);
              updated[contact.id] = suggestion;
            }
          }
        }
        return updated;
      });
    }
  }, [rankedContacts, cardPrompts]);

  const suggestions = useMemo(() => {
    return rankedContacts
      .filter((contact) => !completedIds.has(contact.id))
      .map((contact) => cardPrompts[contact.id])
      .filter((s): s is GeneratedSuggestion => !!s);
  }, [rankedContacts, completedIds, cardPrompts]);

  const suggestionKeyRef = useRef<string>("");
  useEffect(() => {
    const shownIds = suggestions.map((s) => s.contact.id);
    const key = shownIds.join(",");
    if (key !== "" && key !== suggestionKeyRef.current) {
      suggestionKeyRef.current = key;
      shownIds.forEach((id) => markContactSuggested(id));
    }
  }, [suggestions]);

  const handleRefreshSingle = useCallback((contactId: string, currentPrompt: string) => {
    const contact = contacts.find((c) => c.id === contactId);
    if (!contact) return;

    const urgency = getContactUrgency(contact.circleLevel as 1 | 2 | 3, contact.lastContacted ?? undefined);
    const bday = getDaysUntilBirthday(contact.birthday ?? undefined);
    const hasBirthdaySoon = bday !== null && bday <= 14;

    const newPrompt = getNextPrompt(
      contactId,
      currentPrompt,
      contact.name,
      contact.circleLevel as 1 | 2 | 3,
      contact.interests,
      { isOverdue: urgency === "overdue", hasBirthdaySoon, labels: contact.labels },
    );

    let type = getActionType(contact.circleLevel as 1 | 2 | 3, newPrompt);
    if (contact.circleLevel === 3 && type === "call") type = "text";
    const birthdayLabel = formatBirthdayCountdown(contact.birthday ?? undefined);
    const lastContactedLabel = formatLastContacted(contact.lastContacted ?? undefined);

    setCachedPrompt(contactId, newPrompt);
    setCardPrompts((prev) => ({
      ...prev,
      [contactId]: {
        contact,
        prompt: newPrompt,
        type,
        urgency,
        birthdayLabel: hasBirthdaySoon ? birthdayLabel : undefined,
        lastContactedLabel,
      },
    }));
  }, [contacts]);

  const handlePlanHangout = useCallback(
    async (suggestion: GeneratedSuggestion) => {
      await markContacted(suggestion.contact.id);
      dismissSuggestion(suggestion.contact.id);
      router.push({
        pathname: "/create-hangout",
        params: {
          contactName: suggestion.contact.name,
          prefillTitle: deriveHangoutTitle(suggestion.contact.name, suggestion.prompt),
        },
      });
    },
    [markContacted],
  );

  const handleDone = useCallback(
    (contactId: string) => {
      markContacted(contactId);
      dismissSuggestion(contactId);
    },
    [markContacted],
  );

  useEffect(() => {
    return () => {
      if (copiedToastTimer.current) clearTimeout(copiedToastTimer.current);
    };
  }, []);

  const showCopiedToast = useCallback(() => {
    if (copiedToastTimer.current) clearTimeout(copiedToastTimer.current);
    setCopiedToast(true);
    Animated.timing(copiedToastAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    copiedToastTimer.current = setTimeout(() => {
      Animated.timing(copiedToastAnim, { toValue: 0, duration: 280, useNativeDriver: true }).start(() => {
        setCopiedToast(false);
      });
    }, 1800);
  }, [copiedToastAnim]);

  const handleCopyText = useCallback(
    (contactId: string) => {
      markContacted(contactId);
      dismissSuggestion(contactId);
    },
    [markContacted],
  );

  const handleReminderComplete = useCallback(
    async (reminder: Reminder) => {
      setCompletedReminderIds((prev) => new Set(prev).add(reminder.id));
      if (reminder.type === "birthday") return;
      if (reminder.type === "hangout-overdue") {
        await markHangout(reminder.contactId);
      }
      await markContacted(reminder.contactId);
    },
    [markContacted, markHangout],
  );

  const handleReminderQuickPick = useCallback(
    async (reminder: Reminder, date: Date) => {
      setCompletedReminderIds((prev) => new Set(prev).add(reminder.id));
      await markContacted(reminder.contactId, date);
    },
    [markContacted],
  );

  const handleReminderYes = useCallback(
    (reminder: Reminder) => {
      markHangout(reminder.contactId);
      setCompletedReminderIds((prev) => new Set(prev).add(reminder.id));
    },
    [markHangout],
  );

  const handleReminderNo = useCallback(
    (reminder: Reminder) => {
      setCompletedReminderIds((prev) => new Set(prev).add(reminder.id));
      router.push({
        pathname: "/create-hangout",
        params: { contactName: reminder.contactName },
      });
    },
    [],
  );

  const handlePlanHangoutReminder = useCallback(
    (reminder: Reminder) => {
      router.push({
        pathname: "/create-hangout",
        params: { contactName: reminder.contactName },
      });
    },
    [],
  );

  const handleRefreshAll = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    resetSeenPrompts();
    clearPromptCache();
    setCardPrompts({});
    setRefreshKey((k) => k + 1);
    setShuffleJitter(() => {
      const next: Record<string, number> = {};
      for (const contact of contacts) next[contact.id] = Math.random() * 0.01;
      return next;
    });
    clearDismissedSuggestions();
    setCompletedReminderIds(new Set());
  }, []);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  return (
    <View style={styles.screenWrapper}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16 + webTopInset, paddingBottom: 100 + (Platform.OS === "web" ? 34 : 0) },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Suggestions</Text>
          <Text style={styles.subtitle}>People who'd love to hear from you</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterContent}
      >
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            setFilterCircle(null);
            clearDismissedSuggestions();
            setCompletedReminderIds(new Set());
            setCardPrompts({});
          }}
          style={[
            styles.filterChip,
            filterCircle === null && styles.filterChipActive,
          ]}
        >
          <Text
            style={[
              styles.filterChipText,
              filterCircle === null && styles.filterChipTextActive,
            ]}
          >
            All
          </Text>
        </Pressable>
        {([1, 2, 3] as const).map((level) => {
          const cfg = CIRCLE_CONFIG[level];
          const isActive = filterCircle === level;
          return (
            <Pressable
              key={level}
              onPress={() => {
                Haptics.selectionAsync();
                setFilterCircle(level);
                clearDismissedSuggestions();
                setCompletedReminderIds(new Set());
                setCardPrompts({});
              }}
              style={[
                styles.filterChip,
                isActive && { backgroundColor: cfg.color + "18", borderColor: cfg.color + "40" },
              ]}
            >
              <View style={[styles.filterDot, { backgroundColor: cfg.color }]} />
              <Text
                style={[
                  styles.filterChipText,
                  isActive && { color: cfg.color },
                ]}
              >
                {cfg.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {reminders.length > 0 && (
        <View style={styles.remindersSection}>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              setRemindersCollapsed((prev) => !prev);
            }}
            style={styles.remindersSectionHeader}
          >
            <View style={styles.remindersTitleRow}>
              <Ionicons name="notifications-outline" size={18} color={Colors.warning} />
              <Text style={styles.remindersSectionTitle}>Reminders</Text>
              <View style={styles.remindersBadge}>
                <Text style={styles.remindersBadgeText}>{reminders.length}</Text>
              </View>
            </View>
            <Ionicons
              name={remindersCollapsed ? "chevron-forward" : "chevron-down"}
              size={18}
              color={Colors.textSecondary}
            />
          </Pressable>

          {!remindersCollapsed && (
            <View style={styles.remindersList}>
              {reminders.map((reminder) => (
                <ReminderItem
                  key={reminder.id}
                  reminder={reminder}
                  onComplete={() => handleReminderComplete(reminder)}
                  onYes={reminder.type === "hangout-6month" ? () => handleReminderYes(reminder) : undefined}
                  onNo={reminder.type === "hangout-6month" ? () => handleReminderNo(reminder) : undefined}
                  onPlanHangout={reminder.actionType === "hangout" ? () => handlePlanHangoutReminder(reminder) : undefined}
                  onQuickPick={reminder.type === "check-in-overdue" ? (date) => handleReminderQuickPick(reminder, date) : undefined}
                  contactLastContacted={contacts.find((c) => c.id === reminder.contactId)?.lastContacted}
                />
              ))}
            </View>
          )}
        </View>
      )}

      <View style={styles.suggestionsSectionHeader}>
        <Text style={styles.suggestionsSectionTitle}>Suggestions</Text>
        <Pressable
          onPress={handleRefreshAll}
          hitSlop={8}
          style={({ pressed }) => [styles.sectionShuffleBtn, pressed && { opacity: 0.5 }]}
        >
          <Ionicons name="shuffle-outline" size={18} color={Colors.textSecondary} />
        </Pressable>
      </View>

      {contacts.length === 0 ? (
        <EmptyState
          icon="bulb-outline"
          title="No suggestions yet"
          subtitle="Add people to your circles to get personalized prompts"
          actionLabel="Add someone"
          onAction={() => router.push("/(tabs)/circles")}
        />
      ) : suggestions.length === 0 ? (
        <EmptyState
          icon="checkmark-circle-outline"
          title="All caught up!"
          subtitle="You've completed all suggestions. Tap below for new ones."
        />
      ) : (
        suggestions.map((s) => {
          const daysSinceContact = getDaysSince(s.contact.lastContacted ?? undefined);
          const daysUntilBday = getDaysUntilBirthday(s.contact.birthday ?? undefined);
          const hasBirthdaySoon = daysUntilBday !== null && daysUntilBday <= 14;
          return (
            <SuggestionCard
              key={s.contact.id + "-" + refreshKey}
              contactName={s.contact.name}
              avatarColor={s.contact.avatarColor}
              photoUri={s.contact.photoUri}
              prompt={s.prompt}
              type={s.type}
              circleLevel={s.contact.circleLevel as 1 | 2 | 3}
              urgency={s.urgency}
              birthdayLabel={s.birthdayLabel}
              lastContactedLabel={s.lastContactedLabel}
              interests={s.contact.interests}
              labels={s.contact.labels}
              daysSinceContact={daysSinceContact}
              hasBirthdaySoon={hasBirthdaySoon}
              onDone={() => handleDone(s.contact.id)}
              onRefresh={() => handleRefreshSingle(s.contact.id, s.prompt)}
              onCopyText={s.type === "text" ? () => handleCopyText(s.contact.id) : undefined}
              onCopied={s.type === "text" ? showCopiedToast : undefined}
              onPlanHangout={s.type === "hangout" ? () => handlePlanHangout(s) : undefined}
            />
          );
        })
      )}

      <Pressable
        onPress={handleRefreshAll}
        style={({ pressed }) => [styles.refreshAll, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="refresh" size={18} color={Colors.primaryLight} />
        <Text style={styles.refreshAllText}>New suggestions</Text>
      </Pressable>
    </ScrollView>

    {copiedToast && (
      <Animated.View
        testID="copied-toast"
        style={[
          styles.copiedToast,
          {
            opacity: copiedToastAnim,
            bottom: insets.bottom + 90 + (Platform.OS === "web" ? 34 : 0),
            pointerEvents: "none",
          },
        ]}
      >
        <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
        <Text style={styles.copiedToastText}>Text copied</Text>
      </Animated.View>
    )}
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
  title: {
    fontSize: 28,
    fontFamily: "Nunito_800ExtraBold",
    color: Colors.text,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 0,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    marginTop: 4,
    marginBottom: 16,
  },
  hangoutButton: {
    padding: 8,
    marginTop: 4,
  },
  filterRow: {
    marginBottom: 16,
    flexGrow: 0,
  },
  filterContent: {
    gap: 8,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: 6,
  },
  filterChipActive: {
    backgroundColor: Colors.primary + "18",
    borderColor: Colors.primary + "40",
  },
  filterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  filterChipText: {
    fontSize: 13,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: Colors.primaryLight,
  },
  remindersSection: {
    marginBottom: 20,
  },
  remindersSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  remindersTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  remindersSectionTitle: {
    fontSize: 17,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
  },
  remindersBadge: {
    backgroundColor: Colors.warning,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  remindersBadgeText: {
    fontSize: 12,
    fontFamily: "Nunito_700Bold",
    color: "#fff",
  },
  remindersList: {
    gap: 0,
  },
  suggestionsSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionShuffleBtn: {
    padding: 4,
  },
  suggestionsSectionTitle: {
    fontSize: 17,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
  },
  refreshAll: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    marginTop: 8,
  },
  refreshAllText: {
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.primaryLight,
  },
  screenWrapper: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  copiedToast: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.success + "40",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  copiedToastText: {
    fontSize: 13,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.success,
  },
});
