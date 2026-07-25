import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Animated, Linking } from "react-native";
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
import { generateReminders, CHECKIN_THRESHOLDS, ELEVATION_PUSH_DELAY_HOURS, ELEVATION_CLEANUP_DAYS } from "@/lib/reminders";
import { setElevation, getElevations, getExpiredElevations, clearElevation, ELEVATION_SCORE_BONUS, invalidateElevationCache } from "@/lib/checkin-state";
import { snoozeContact, getSnoozedContacts, SNOOZE_DAYS } from "@/lib/reminder-snooze";
import { getDaysSinceLastSuggestedSync, scoreSuggestion, isInCooldown } from "@/lib/suggestion-scheduler";
import { useDismissedSuggestions, dismissSuggestion, clearDismissedSuggestions, useSchedulerDates, markContactSuggested, getCachedPrompt, setCachedPrompt, clearPromptCache } from "@/lib/suggestions-store";
import { useDismissedReminders, dismissReminder, clearDismissedReminders } from "@/lib/dismissed-reminders-store";
import type { Contact } from "@/lib/types";
import type { Reminder } from "@/lib/reminders";
import { router, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSequentialHints, HINT_TEXT } from "@/lib/hints-store";
import { HintTooltip } from "@/components/HintTooltip";
import { useAuth } from "@/lib/auth-context";
import { scheduleReminderNotifications } from "@/lib/reminder-notifications";
import { NoPhoneSheet } from "@/components/NoPhoneSheet";
import * as BirthdayText from "@/lib/birthday-text";

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
  // DISABLED: hangout tracking — lastHangout gate removed so hangout suggestions appear freely
  // if (type === "hangout") {
  //   const daysSinceHangout = getDaysSince(contact.lastHangout ?? undefined);
  //   const hangoutThreshold = HANGOUT_THRESHOLDS[contact.circleLevel as 1 | 2 | 3];
  //   if (daysSinceHangout !== null && daysSinceHangout < hangoutThreshold) {
  //     type = "text";
  //   }
  // }

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
  const { user } = useAuth();
  const { contacts, markContacted, savePhoneNumber } = useContacts();
  const [filterCircle, setFilterCircle] = useState<1 | 2 | 3 | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [shuffleJitter, setShuffleJitter] = useState<Record<string, number>>({});
  const completedIds = useDismissedSuggestions();
  const lastSuggestedDates = useSchedulerDates();
  const completedReminderIds = useDismissedReminders();
  const [cardPrompts, setCardPrompts] = useState<Record<string, GeneratedSuggestion>>({});
  const [remindersCollapsed, setRemindersCollapsed] = useState(false);
  const [elevationMap, setElevationMap] = useState<Record<string, number>>({});
  const [elevatedContactTypes, setElevatedContactTypes] = useState<Set<string>>(new Set());
  const [snoozedContacts, setSnoozedContacts] = useState<Set<string>>(new Set());
  const [sessionSkippedIds, setSessionSkippedIds] = useState<Set<string>>(new Set());
  const visitCount = useRef(0);
  const [copiedToast, setCopiedToast] = useState(false);
  const copiedToastAnim = useRef(new Animated.Value(0)).current;
  const copiedToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [errorToast, setErrorToast] = useState(false);
  const [errorToastMessage, setErrorToastMessage] = useState("");
  const errorToastAnim = useRef(new Animated.Value(0)).current;
  const errorToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [birthdaySheet, setBirthdaySheet] = useState<{ reminder: Reminder } | null>(null);

  useEffect(() => {
    loadSyncedPrompts();
    getSnoozedContacts().then(setSnoozedContacts);
    const now = Date.now();
    getElevations().then((elevations) => {
      const map: Record<string, number> = {};
      const suppressed = new Set<string>();
      for (const e of elevations) {
        suppressed.add(`${e.contactId}:${e.type}`);
        if (new Date(e.pushDue).getTime() <= now) {
          map[e.contactId] = ELEVATION_SCORE_BONUS[e.circleLevel];
        }
      }
      setElevationMap(map);
      setElevatedContactTypes(suppressed);
    });
  }, []);

  const contactsScheduleKey = contacts
    .map((c) => `${c.id}:${c.circleLevel}:${c.birthday ?? ""}:${c.lastContacted ?? ""}:${c.lastHangout ?? ""}:${(c.customReminders ?? []).length}`)
    .join("|");

  useEffect(() => {
    if (contacts.length === 0 || Platform.OS === "web") return;
    scheduleReminderNotifications(contacts).catch(() => {});
    // Suggestion nudge is intentionally scheduled only from index.tsx to avoid
    // duplicate notifications when both tabs mount at the same time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactsScheduleKey]);

  useFocusEffect(
    useCallback(() => {
      getSnoozedContacts().then(setSnoozedContacts);
      setSessionSkippedIds(new Set());
      const now = Date.now();
      getElevations().then((elevations) => {
        const map: Record<string, number> = {};
        const suppressed = new Set<string>();
        for (const e of elevations) {
          suppressed.add(`${e.contactId}:${e.type}`);
          if (new Date(e.pushDue).getTime() <= now) {
            map[e.contactId] = ELEVATION_SCORE_BONUS[e.circleLevel];
          }
        }
        setElevationMap(map);
        setElevatedContactTypes(suppressed);
      });
      getExpiredElevations().then(async (expired) => {
        for (const entry of expired) {
          await markContactSuggested(entry.contactId);
          await snoozeContact(entry.contactId, SNOOZE_DAYS[entry.circleLevel as 1 | 2 | 3]);
          await clearElevation(entry.contactId, entry.type);
        }
        if (expired.length > 0) {
          await invalidateElevationCache();
          const fresh = await getElevations();
          const freshNow = Date.now();
          const map: Record<string, number> = {};
          const suppressed = new Set<string>();
          for (const e of fresh) {
            suppressed.add(`${e.contactId}:${e.type}`);
            if (new Date(e.pushDue).getTime() <= freshNow) {
              map[e.contactId] = ELEVATION_SCORE_BONUS[e.circleLevel];
            }
          }
          setElevationMap(map);
          setElevatedContactTypes(suppressed);
          getSnoozedContacts().then(setSnoozedContacts);
        }
      });
    }, []),
  );

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
    return filtered.filter((r) => {
      if (completedReminderIds.has(r.id)) return false;
      if (r.type === "check-in-quickpick" && r.contactId && elevatedContactTypes.has(`${r.contactId}:checkin`)) return false;
      if (r.type === "hangout-quickpick" && r.contactId && elevatedContactTypes.has(`${r.contactId}:hangout`)) return false;
      if ((r.type === "check-in-quickpick" || r.type === "hangout-quickpick") && r.contactId && snoozedContacts.has(r.contactId)) return false;
      return true;
    });
  }, [contacts, filterCircle, completedReminderIds, elevatedContactTypes, snoozedContacts]);

  const rankedContacts = useMemo(() => {
    const filtered = filterCircle
      ? contacts.filter((c) => c.circleLevel === filterCircle)
      : contacts;

    const isElevated = (c: typeof contacts[0]) => !!elevationMap[c.id];
    const isSessionSkipped = (c: typeof contacts[0]) => sessionSkippedIds.has(c.id) && !isElevated(c);
    const inCooldown = (c: typeof contacts[0]) => {
      if (isElevated(c)) return false;
      const daysSinceLastSug = getDaysSinceLastSuggestedSync(c.id, lastSuggestedDates);
      return isInCooldown(c.circleLevel as 1 | 2 | 3, daysSinceLastSug);
    };

    const base = filtered.filter((c) => !isSessionSkipped(c) && !completedIds.has(c.id));
    const eligible = base.filter((c) => !inCooldown(c));

    const rankContact = (c: typeof contacts[0]) => {
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
          elevationMap[c.id],
        ),
      };
    };

    const SUGGESTION_MAX = 6;
    const rankedEligible = eligible.map(rankContact).sort((a, b) => b.score - a.score);
    const eligibleIds = new Set(eligible.map((c) => c.id));
    // Exclude contacts dismissed today from the fallback pool — they were just swiped away
    // and must not reappear within the same session or on restart.
    const cooldownPool = base.filter((c) => {
      if (eligibleIds.has(c.id)) return false;
      const daysSince = getDaysSinceLastSuggestedSync(c.id, lastSuggestedDates);
      return daysSince === null || daysSince >= 1;
    });
    const rankedCooldown = cooldownPool.map(rankContact).sort((a, b) => b.score - a.score);

    return [...rankedEligible, ...rankedCooldown]
      .slice(0, SUGGESTION_MAX)
      .map((x) => x.contact);
  }, [contacts, filterCircle, lastSuggestedDates, elevationMap, sessionSkippedIds, completedIds]);

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
      router.push({
        pathname: "/create-hangout",
        params: {
          contactName: suggestion.contact.name,
          prefillTitle: deriveHangoutTitle(suggestion.contact.name, suggestion.prompt),
        },
      });
    },
    [],
  );

  const handleDone = useCallback(
    (contactId: string) => {
      markContacted(contactId);
      // DISABLED: hangout tracking
      // if (cardPrompts[contactId]?.type === "hangout") {
      //   markHangout(contactId);
      // }
      dismissSuggestion(contactId);
      setSessionSkippedIds((prev) => new Set(prev).add(contactId));
      markContactSuggested(contactId).catch(() => {});
    },
    [markContacted, cardPrompts],
  );

  const handleSwipeDismiss = useCallback((contactId: string) => {
    dismissSuggestion(contactId);
    markContactSuggested(contactId).catch(() => {});
    // Tell the server so the push-notification picker respects the cooldown too
    fetch("/api/suggestions/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId }),
    }).catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      if (copiedToastTimer.current) clearTimeout(copiedToastTimer.current);
      if (errorToastTimer.current) clearTimeout(errorToastTimer.current);
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

  const showErrorToast = useCallback((message: string) => {
    if (errorToastTimer.current) clearTimeout(errorToastTimer.current);
    setErrorToastMessage(message);
    setErrorToast(true);
    Animated.timing(errorToastAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    errorToastTimer.current = setTimeout(() => {
      Animated.timing(errorToastAnim, { toValue: 0, duration: 280, useNativeDriver: true }).start(() => {
        setErrorToast(false);
      });
    }, 2500);
  }, [errorToastAnim]);

  const handleCopyText = useCallback(
    (_contactId: string) => {
      // copying alone does not mark as contacted — only explicit "done" does
    },
    [],
  );

  const handleReminderComplete = useCallback(
    async (reminder: Reminder) => {
      dismissReminder(reminder.id);
      if (
        reminder.type === "birthday" ||
        reminder.type === "custom-reminder" ||
        reminder.type.startsWith("profile-completion") ||
        !reminder.contactId
      ) return;
      // DISABLED: hangout tracking
      // if (reminder.type === "hangout-quickpick") {
      //   await markHangout(reminder.contactId);
      // } else {
        await markContacted(reminder.contactId);
      // }
    },
    [markContacted],
  );

  const handleReminderQuickPick = useCallback(
    async (reminder: Reminder, date: Date, label: string) => {
      dismissReminder(reminder.id);
      if (!reminder.contactId) return;
      const circleLevel = reminder.circleLevel as 1 | 2 | 3;

      if (reminder.type === "check-in-quickpick") {
        await markContacted(reminder.contactId, date, label);
        const daysSince = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSince > CHECKIN_THRESHOLDS[circleLevel]) {
          await setElevation({
            contactId: reminder.contactId,
            contactName: reminder.contactName,
            circleLevel,
            type: "checkin",
            elevatedAt: new Date().toISOString(),
            pushDue: new Date(Date.now() + ELEVATION_PUSH_DELAY_HOURS[circleLevel] * 3600 * 1000).toISOString(),
            cleanupDue: new Date(Date.now() + ELEVATION_CLEANUP_DAYS[circleLevel].checkin * 24 * 3600 * 1000).toISOString(),
          });
          await invalidateElevationCache();
          setElevatedContactTypes((prev) => new Set(prev).add(`${reminder.contactId}:checkin`));
        }
      // DISABLED: hangout tracking
      // } else if (reminder.type === "hangout-quickpick") {
      //   await markHangout(reminder.contactId, date, label);
      //   const daysSince = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
      //   if (daysSince > HANGOUT_THRESHOLDS[circleLevel]) {
      //     await setElevation({
      //       contactId: reminder.contactId,
      //       contactName: reminder.contactName,
      //       circleLevel,
      //       type: "hangout",
      //       elevatedAt: new Date().toISOString(),
      //       pushDue: new Date(Date.now() + ELEVATION_PUSH_DELAY_HOURS[circleLevel] * 3600 * 1000).toISOString(),
      //       cleanupDue: new Date(Date.now() + ELEVATION_CLEANUP_DAYS[circleLevel].hangout * 24 * 3600 * 1000).toISOString(),
      //     });
      //     await invalidateElevationCache();
      //     setElevatedContactTypes((prev) => new Set(prev).add(`${reminder.contactId}:hangout`));
      //   }
      }
    },
    [markContacted],
  );

  const handleHangoutCalendarPress = useCallback((reminder: Reminder) => {
    dismissReminder(reminder.id);
    router.push({
      pathname: "/create-hangout",
      params: { contactName: reminder.contactName },
    });
  }, []);

  const sendBirthdayText = useCallback(async (reminder: Reminder, phone: string) => {
    await BirthdayText.sendBirthdayText(reminder, phone, {
      platform: Platform,
      clipboard: { writeText: (t: string) => navigator.clipboard.writeText(t) },
      linking: Linking,
    });
  }, []);

  const handleBirthdayText = useCallback(async (reminder: Reminder) => {
    await BirthdayText.handleBirthdayText(reminder, contacts, {
      setBirthdaySheet,
      sendBirthdayText,
      showError: showErrorToast,
    });
  }, [contacts, sendBirthdayText, showErrorToast]);

  const handleBirthdaySheetConfirm = useCallback(
    async (phone: string, shouldSave: boolean, extra?: { birthday?: string; photoUri?: string }) => {
      await BirthdayText.handleBirthdaySheetConfirm(phone, shouldSave, extra, birthdaySheet, {
        setBirthdaySheet,
        savePhoneNumber,
        sendBirthdayText,
      });
    },
    [birthdaySheet, savePhoneNumber, sendBirthdayText],
  );

  const handleShuffle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const nonElevatedIds = suggestions
      .filter((s) => !elevationMap[s.contact.id])
      .map((s) => s.contact.id);
    if (nonElevatedIds.length === 0) return;
    setSessionSkippedIds((prev) => new Set([...prev, ...nonElevatedIds]));
    setCardPrompts((prev) => {
      const next = { ...prev };
      nonElevatedIds.forEach((id) => delete next[id]);
      return next;
    });
    resetSeenPrompts();
    setRefreshKey((k) => k + 1);
  }, [suggestions, elevationMap]);

  const handleRefreshAll = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    resetSeenPrompts();
    clearPromptCache();
    setCardPrompts({});
    setSessionSkippedIds(new Set());
    setShuffleJitter({});
    setRefreshKey((k) => k + 1);
    clearDismissedSuggestions();
    clearDismissedReminders();
  }, []);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const [activeHint, dismissHint] = useSequentialHints(["suggestions_filter", "suggestions_actions"]);

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
            clearDismissedReminders();
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
                clearDismissedReminders();
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
                  onQuickPick={
                    (reminder.type === "check-in-quickpick" || reminder.type === "hangout-quickpick")
                      ? (date, label) => handleReminderQuickPick(reminder, date, label)
                      : undefined
                  }
                  onCalendarPress={reminder.type === "hangout-quickpick" ? () => handleHangoutCalendarPress(reminder) : undefined}
                  onTextPress={reminder.type === "birthday" ? () => handleBirthdayText(reminder) : undefined}
                />
              ))}
            </View>
          )}
        </View>
      )}

      <View style={styles.suggestionsSectionHeader}>
        <Text style={styles.suggestionsSectionTitle}>Suggestions</Text>
        <Pressable
          onPress={handleShuffle}
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
              contactId={s.contact.id}
              contactName={s.contact.name}
              avatarColor={s.contact.avatarColor}
              photoUri={s.contact.photoUri}
              phone={s.contact.phone}
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
              onSwipeDismiss={() => handleSwipeDismiss(s.contact.id)}
              onRefresh={() => handleRefreshSingle(s.contact.id, s.prompt)}
              onCopyText={s.type === "text" ? () => handleCopyText(s.contact.id) : undefined}
              onCopied={s.type === "text" ? showCopiedToast : undefined}
              onPlanHangout={s.type === "hangout" ? () => handlePlanHangout(s) : undefined}
              onSaveContactData={(data) => savePhoneNumber(s.contact.id, data.phone, { birthday: data.birthday, photoUri: data.photoUri }).catch(() => {})}
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

    {errorToast && (
      <Animated.View
        testID="error-toast"
        style={[
          styles.copiedToast,
          {
            opacity: errorToastAnim,
            bottom: insets.bottom + 90 + (Platform.OS === "web" ? 34 : 0),
            pointerEvents: "none",
            backgroundColor: Colors.danger + "EE",
          },
        ]}
      >
        <Ionicons name="alert-circle" size={16} color="#fff" />
        <Text style={[styles.copiedToastText, { color: "#fff" }]}>{errorToastMessage}</Text>
      </Animated.View>
    )}

    <HintTooltip
      visible={!!activeHint}
      text={activeHint ? HINT_TEXT[activeHint] : ""}
      onDismiss={dismissHint}
      bottomOffset={80}
    />

    <NoPhoneSheet
      visible={!!birthdaySheet}
      contactName={birthdaySheet?.reminder.contactName ?? ""}
      mode="sms"
      onConfirm={handleBirthdaySheetConfirm}
      onDismiss={() => setBirthdaySheet(null)}
    />
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
