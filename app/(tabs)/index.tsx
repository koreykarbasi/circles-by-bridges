import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { View, Text, StyleSheet, ScrollView, Platform, RefreshControl, Pressable, Image, Animated, Linking, ActivityIndicator, PanResponder } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useContacts } from "@/lib/contacts-context";
import { useAuth } from "@/lib/auth-context";
import { computeProfileCompletion } from "@/lib/profile-completion";
import { BellSheet, computeBellDotColor } from "@/components/BellSheet";
import * as Haptics from "expo-haptics";
import { CirclesVisualization } from "@/components/CirclesVisualization";
import { ChecklistItem } from "@/components/ChecklistItem";
import { ReminderItem } from "@/components/ReminderItem";
import { EmptyState } from "@/components/EmptyState";
import { NoPhoneSheet } from "@/components/NoPhoneSheet";
import { formatLastContacted, getDaysSince, getDaysUntilBirthday } from "@/lib/helpers";
import { CIRCLE_CONFIG, HangoutPlan } from "@/lib/types";
import { generateReminders, Reminder, CHECKIN_THRESHOLDS, HANGOUT_THRESHOLDS, ELEVATION_PUSH_DELAY_HOURS, ELEVATION_CLEANUP_DAYS } from "@/lib/reminders";
import { setElevation, getElevations, getExpiredElevations, clearElevation, ELEVATION_SCORE_BONUS, invalidateElevationCache } from "@/lib/checkin-state";
import { snoozeContact, getSnoozedContacts, SNOOZE_DAYS } from "@/lib/reminder-snooze";
import { getSmartPrompt, getActionType, getNextPrompt, loadSyncedPrompts } from "@/lib/prompts";
import { getDaysSinceLastSuggestedSync, scoreSuggestion, isInCooldown } from "@/lib/suggestion-scheduler";
import { useDismissedSuggestions, dismissSuggestion, clearDismissedSuggestions, getCachedPrompt, setCachedPrompt, clearPromptCache, useSchedulerDates, markContactSuggested } from "@/lib/suggestions-store";
import { useDismissedReminders, dismissReminder, clearDismissedReminders } from "@/lib/dismissed-reminders-store";
import { getTextCopyMessage } from "@/components/SuggestionCard";
import * as Clipboard from "expo-clipboard";
import { router, useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { getViewedTimestamps, hasUnreadVotes } from "@/lib/hangout-notifications";
import { useSequentialHints, HINT_TEXT } from "@/lib/hints-store";
import { HintTooltip } from "@/components/HintTooltip";

const MAX_REMINDERS = 5;
const MAX_SUGGESTIONS = 3;

function getReminderIcon(reminder: Reminder): string {
  if (reminder.type === "custom-reminder") return "star-outline";
  return "cake-variant-outline";
}

function getReminderIconLibrary(reminder: Reminder): "material" | undefined {
  if (reminder.type === "custom-reminder") return undefined;
  return "material";
}

function getReminderIconColor(reminder: Reminder): string {
  if (reminder.type === "custom-reminder") return Colors.primary;
  return Colors.accent;
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
  phone?: string | null;
  circleLevel: 1 | 2 | 3;
  prompt: string;
  actionType: "call" | "text" | "hangout";
}

function SwipableSuggestionRow({ children, onSwipeDismiss }: { children: React.ReactNode; onSwipeDismiss?: () => void }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;
  const onDismissRef = useRef<(() => void) | undefined>(onSwipeDismiss);
  useEffect(() => { onDismissRef.current = onSwipeDismiss; }, [onSwipeDismiss]);
  const animating = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        !animating.current && Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
      onPanResponderMove: (_, gs) => {
        translateX.setValue(gs.dx);
        cardOpacity.setValue(Math.max(0.3, 1 - Math.abs(gs.dx) / 250));
      },
      onPanResponderRelease: (_, gs) => {
        const dismissFn = onDismissRef.current;
        if (Math.abs(gs.dx) > 80 || Math.abs(gs.vx) > 0.5) {
          animating.current = true;
          const dir = gs.dx > 0 ? 1 : -1;
          Animated.parallel([
            Animated.timing(translateX, { toValue: dir * 500, duration: 250, useNativeDriver: true }),
            Animated.timing(cardOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
          ]).start(() => { dismissFn?.(); });
        } else {
          Animated.parallel([
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
            Animated.timing(cardOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
          ]).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.parallel([
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
          Animated.timing(cardOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        ]).start();
      },
    })
  ).current;

  return (
    <Animated.View style={{ transform: [{ translateX }], opacity: cardOpacity }} {...panResponder.panHandlers}>
      {children}
    </Animated.View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { contacts, markContacted, markHangout, refreshContacts, savePhoneNumber, isLoading } = useContacts();
  const [refreshing, setRefreshing] = useState(false);
  const dismissedReminders = useDismissedReminders();
  const dismissedSuggestions = useDismissedSuggestions();
  const lastSuggestedDates = useSchedulerDates();
  const [suggestionPrompts, setSuggestionPrompts] = useState<Map<string, string>>(new Map());
  const [bellSheetOpen, setBellSheetOpen] = useState(false);
  const [elevationMap, setElevationMap] = useState<Record<string, number>>({});
  const [elevatedContactTypes, setElevatedContactTypes] = useState<Set<string>>(new Set());
  const [snoozedContacts, setSnoozedContacts] = useState<Set<string>>(new Set());
  const [copiedToast, setCopiedToast] = useState(false);
  const copiedToastAnim = useRef(new Animated.Value(0)).current;
  const copiedToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeHint, dismissHint] = useSequentialHints(["home_profile", "home_reminders", "home_suggestions"]);
  const [phoneSheet, setPhoneSheet] = useState<{ suggestion: Suggestion; mode: "sms" | "call" } | null>(null);

  const { data: hangouts } = useQuery<HangoutPlan[]>({
    queryKey: ["/api/hangouts"],
    refetchInterval: 60000,
  });
  const [hangoutViewedMap, setHangoutViewedMap] = useState<Record<string, string>>({});

  useEffect(() => {
    loadSyncedPrompts();
  }, []);

  useFocusEffect(
    useCallback(() => {
      getViewedTimestamps(user?.id ?? "").then(setHangoutViewedMap);
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
    }, [user?.id]),
  );

  const allReminders = useMemo(() => {
    const all = generateReminders(contacts);
    return all.filter((r) => {
      if ((r.type === "check-in-quickpick" || r.type === "hangout-quickpick") && r.contactId && snoozedContacts.has(r.contactId)) return false;
      return true;
    });
  }, [contacts, snoozedContacts]);

  const visibleReminders = useMemo(() => {
    const passesFilter = (r: Reminder) => {
      if (dismissedReminders.has(r.id)) return false;
      if (r.type === "check-in-quickpick" && r.contactId && elevatedContactTypes.has(`${r.contactId}:checkin`)) return false;
      if (r.type === "hangout-quickpick" && r.contactId && elevatedContactTypes.has(`${r.contactId}:hangout`)) return false;
      return true;
    };
    const actionable = allReminders
      .filter((r) => !r.type.startsWith("profile-completion"))
      .filter(passesFilter)
      .slice(0, MAX_REMINDERS);
    const profileCompletion = allReminders
      .filter((r) => r.type.startsWith("profile-completion"))
      .filter(passesFilter);
    return [...actionable, ...profileCompletion];
  }, [allReminders, dismissedReminders, elevatedContactTypes]);

  const getSuggestionForContact = useCallback(
    (contact: typeof contacts[0]): Suggestion => {
      const circleLevel = contact.circleLevel as 1 | 2 | 3;
      const daysSinceContact = getDaysSince(contact.lastContacted ?? undefined);
      const daysUntilBday = getDaysUntilBirthday(contact.birthday ?? undefined);

      const shared = getCachedPrompt(contact.id);
      const local = suggestionPrompts.get(contact.id);
      const existing = shared || local;

      const prompt =
        existing ||
        getSmartPrompt(contact.id, contact.name, circleLevel, contact.interests, {
          isOverdue: daysSinceContact !== null && daysSinceContact > (circleLevel === 1 ? 7 : circleLevel === 2 ? 30 : 90),
          hasBirthdaySoon: daysUntilBday !== null && daysUntilBday <= 30,
          labels: contact.labels,
        });

      if (!existing) {
        setSuggestionPrompts((prev) => new Map(prev).set(contact.id, prompt));
        setCachedPrompt(contact.id, prompt);
      }

      let actionType = getActionType(circleLevel, prompt);
      if (circleLevel === 3 && actionType === "call") actionType = "text";

      return {
        contactId: contact.id,
        contactName: contact.name,
        avatarColor: contact.avatarColor,
        photoUri: contact.photoUri,
        phone: contact.phone,
        circleLevel,
        prompt,
        actionType,
      };
    },
    [suggestionPrompts],
  );

  const suggestions = useMemo(() => {
    const reminderContactIds = new Set(visibleReminders.map((r) => r.contactId));

    const eligible = contacts.filter((c) => {
      if (reminderContactIds.has(c.id)) return false;
      if (elevationMap[c.id]) return true;
      if (dismissedSuggestions.has(c.id)) return false;
      const daysSinceLastSug = getDaysSinceLastSuggestedSync(c.id, lastSuggestedDates);
      if (isInCooldown(c.circleLevel as 1 | 2 | 3, daysSinceLastSug)) return false;
      return true;
    });

    const rankContact = (c: typeof contacts[0]) => {
      const daysSinceLastSug = getDaysSinceLastSuggestedSync(c.id, lastSuggestedDates);
      const daysSinceContact = getDaysSince(c.lastContacted ?? undefined);
      const daysUntilBday = getDaysUntilBirthday(c.birthday ?? undefined);
      return {
        contact: c,
        score: scoreSuggestion(c.circleLevel as 1 | 2 | 3, daysSinceLastSug, daysSinceContact, daysUntilBday, elevationMap[c.id]),
        elevated: !!elevationMap[c.id],
      };
    };

    const rankedEligible = eligible.map(rankContact).sort((a, b) => {
      if (a.elevated !== b.elevated) return a.elevated ? -1 : 1;
      return b.score - a.score;
    });

    const eligibleIds = new Set(eligible.map((c) => c.id));
    const cooldownPool = contacts.filter(
      (c) => !reminderContactIds.has(c.id) && !eligibleIds.has(c.id),
    );
    const rankedCooldown = cooldownPool.map(rankContact).sort((a, b) => {
      if (a.elevated !== b.elevated) return a.elevated ? -1 : 1;
      return b.score - a.score;
    });

    const ranked = [...rankedEligible, ...rankedCooldown]
      .slice(0, MAX_SUGGESTIONS)
      .map((x) => x.contact);

    return ranked.map((c) => getSuggestionForContact(c));
  }, [contacts, dismissedSuggestions, visibleReminders, getSuggestionForContact, lastSuggestedDates, elevationMap]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    clearDismissedReminders();
    clearDismissedSuggestions();
    clearPromptCache();
    setSuggestionPrompts(new Map());
    await refreshContacts();
    setRefreshing(false);
  }, [refreshContacts]);

  const handleReminderComplete = useCallback(
    async (reminder: Reminder) => {
      dismissReminder(reminder.id);
      if (
        reminder.type === "birthday" ||
        reminder.type === "custom-reminder" ||
        reminder.type.startsWith("profile-completion") ||
        !reminder.contactId
      ) return;
      if (reminder.type === "hangout-quickpick") {
        await markHangout(reminder.contactId);
      } else {
        await markContacted(reminder.contactId);
      }
    },
    [markContacted, markHangout],
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
      } else if (reminder.type === "hangout-quickpick") {
        await markHangout(reminder.contactId, date, label);
        const daysSince = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSince > HANGOUT_THRESHOLDS[circleLevel]) {
          await setElevation({
            contactId: reminder.contactId,
            contactName: reminder.contactName,
            circleLevel,
            type: "hangout",
            elevatedAt: new Date().toISOString(),
            pushDue: new Date(Date.now() + ELEVATION_PUSH_DELAY_HOURS[circleLevel] * 3600 * 1000).toISOString(),
            cleanupDue: new Date(Date.now() + ELEVATION_CLEANUP_DAYS[circleLevel].hangout * 24 * 3600 * 1000).toISOString(),
          });
          await invalidateElevationCache();
          setElevatedContactTypes((prev) => new Set(prev).add(`${reminder.contactId}:hangout`));
        }
      }
    },
    [markContacted, markHangout],
  );

  const handleReminderSnooze = useCallback((reminder: Reminder) => {
    dismissReminder(reminder.id);
  }, []);

  const handleHangoutCalendarPress = useCallback((reminder: Reminder) => {
    dismissReminder(reminder.id);
    router.push({
      pathname: "/create-hangout",
      params: { contactName: reminder.contactName },
    });
  }, []);

  const handleSuggestionDone = useCallback(
    async (suggestion: Suggestion) => {
      dismissSuggestion(suggestion.contactId);
      markContactSuggested(suggestion.contactId).catch(() => {});
      await markContacted(suggestion.contactId);
      if (suggestion.actionType === "hangout") {
        await markHangout(suggestion.contactId);
      }
    },
    [markContacted, markHangout],
  );

  const handleSuggestionSwipeDismiss = useCallback((suggestion: Suggestion) => {
    dismissSuggestion(suggestion.contactId);
    markContactSuggested(suggestion.contactId).catch(() => {});
  }, []);

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
      setCachedPrompt(contact.id, newPrompt);
    },
    [contacts],
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

  const handleSuggestionCopyText = useCallback(
    async (suggestion: Suggestion) => {
      const contact = contacts.find((c) => c.id === suggestion.contactId);
      const daysSinceContact = getDaysSince(contact?.lastContacted ?? undefined);
      const daysUntilBday = getDaysUntilBirthday(contact?.birthday ?? undefined);
      const hasBirthdaySoon = daysUntilBday !== null && daysUntilBday <= 30;

      const message = getTextCopyMessage(suggestion.contactName, {
        prompt: suggestion.prompt,
        interests: contact?.interests ?? [],
        labels: contact?.labels ?? [],
        daysSinceContact,
        hasBirthdaySoon,
        circleLevel: suggestion.circleLevel,
      });
      if (Platform.OS === "web") {
        try { await navigator.clipboard.writeText(message); } catch {}
      } else {
        try { await Clipboard.setStringAsync(message); } catch {}
      }
      showCopiedToast();
      markContactSuggested(suggestion.contactId).catch(() => {});
    },
    [contacts, showCopiedToast],
  );

  const handleSuggestionHangout = useCallback(
    async (suggestion: Suggestion) => {
      markContactSuggested(suggestion.contactId).catch(() => {});
      router.push({
        pathname: "/create-hangout",
        params: { contactName: suggestion.contactName },
      });
    },
    [],
  );

  const openSmsForSuggestion = useCallback(
    async (suggestion: Suggestion, phone: string) => {
      const contact = contacts.find((c) => c.id === suggestion.contactId);
      const daysSinceContact = getDaysSince(contact?.lastContacted ?? undefined);
      const daysUntilBday = getDaysUntilBirthday(contact?.birthday ?? undefined);
      const hasBirthdaySoon = daysUntilBday !== null && daysUntilBday <= 30;
      const message = getTextCopyMessage(suggestion.contactName, {
        prompt: suggestion.prompt,
        interests: contact?.interests ?? [],
        labels: contact?.labels ?? [],
        daysSinceContact,
        hasBirthdaySoon,
        circleLevel: suggestion.circleLevel,
      });
      if (Platform.OS === "web") {
        try { await navigator.clipboard.writeText(message); } catch {}
      } else {
        const url = Platform.OS === "ios" ? `sms:${phone}&body=${message}` : `sms:${phone}?body=${encodeURIComponent(message)}`;
        try { await Linking.openURL(url); } catch {}
      }
      showCopiedToast();
      markContactSuggested(suggestion.contactId).catch(() => {});
    },
    [contacts, showCopiedToast],
  );

  const handleSuggestionSms = useCallback(
    async (suggestion: Suggestion) => {
      if (Platform.OS === "web") {
        await openSmsForSuggestion(suggestion, "");
      } else if (suggestion.phone) {
        await openSmsForSuggestion(suggestion, suggestion.phone);
      } else {
        setPhoneSheet({ suggestion, mode: "sms" });
      }
    },
    [openSmsForSuggestion],
  );

  const handleSuggestionCall = useCallback(
    async (suggestion: Suggestion) => {
      if (suggestion.phone) {
        try { await Linking.openURL(`tel:${suggestion.phone}`); } catch {}
        markContactSuggested(suggestion.contactId).catch(() => {});
      } else {
        setPhoneSheet({ suggestion, mode: "call" });
      }
    },
    [],
  );

  const handlePhoneSheetConfirm = useCallback(
    async (phone: string, shouldSave: boolean, extra?: { birthday?: string; photoUri?: string }) => {
      if (!phoneSheet) return;
      const { suggestion, mode } = phoneSheet;
      setPhoneSheet(null);
      if (shouldSave) {
        savePhoneNumber(suggestion.contactId, phone, extra).catch(() => {});
      }
      if (mode === "sms") {
        await openSmsForSuggestion(suggestion, phone);
      } else {
        try { await Linking.openURL(`tel:${phone}`); } catch {}
        markContactSuggested(suggestion.contactId).catch(() => {});
      }
    },
    [phoneSheet, openSmsForSuggestion, savePhoneNumber],
  );

  const profileCompletion = useMemo(() => computeProfileCompletion(contacts), [contacts]);
  const bellDotColor = useMemo(
    () => computeBellDotColor(contacts, profileCompletion.isComplete),
    [contacts, profileCompletion.isComplete],
  );
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const hangoutWithNewVotes = useMemo(() => {
    if (!hangouts) return null;
    return hangouts.find(
      (h) => h.status !== "finalized" && hasUnreadVotes(h, hangoutViewedMap[h.id]),
    ) ?? null;
  }, [hangouts, hangoutViewedMap]);

  return (
    <View style={styles.screenWrapper}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16 + webTopInset, paddingBottom: 100 + (Platform.OS === "web" ? 34 : 0) },
      ]}
      showsVerticalScrollIndicator={false}
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
              {isLoading
                ? "Loading your circles..."
                : contacts.length === 0
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
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setBellSheetOpen(true);
            }}
            hitSlop={8}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
          >
            <View style={styles.bellBtn}>
              <Ionicons name="notifications-outline" size={20} color={Colors.primaryLight} />
              {bellDotColor && (
                <View style={[styles.bellDot, { backgroundColor: bellDotColor }]} />
              )}
            </View>
          </Pressable>
        </View>
      </View>

      {isLoading ? (
        <View style={{ height: 220, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <CirclesVisualization contacts={contacts} user={user} onCenterPress={() => router.push("/profile")} />
      )}

      <Pressable
        onPress={() => router.push("/create-hangout")}
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

      {!isLoading && contacts.length === 0 && (
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
          <Text style={styles.umbrellaLabel}>Social Health Checklist</Text>
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

            {visibleReminders.map((reminder) =>
              (reminder.type === "check-in-quickpick" || reminder.type === "hangout-quickpick") ? (
                <ReminderItem
                  key={reminder.id}
                  reminder={reminder}
                  onComplete={() => handleReminderComplete(reminder)}
                  onQuickPick={(date, label) => handleReminderQuickPick(reminder, date, label)}
                  onCalendarPress={reminder.type === "hangout-quickpick" ? () => handleHangoutCalendarPress(reminder) : undefined}
                />
              ) : (
                <ChecklistItem
                  key={reminder.id}
                  icon={getReminderIcon(reminder)}
                  iconLibrary={getReminderIconLibrary(reminder)}
                  iconColor={getReminderIconColor(reminder)}
                  title={reminder.title}
                  subtitle={reminder.subtitle}
                  priorityLevel={getPriorityLevel(reminder.priority)}
                  actionType={reminder.actionType}
                  onComplete={() => handleReminderComplete(reminder)}
                />
              )
            )}
          </View>

          {hangoutWithNewVotes && (
            <Pressable
              onPress={() => router.push({ pathname: "/hangout-detail", params: { id: hangoutWithNewVotes.id } })}
              style={({ pressed }) => [styles.newVotesBanner, pressed && { opacity: 0.8 }]}
            >
              <View style={styles.newVotesBannerLeft}>
                <View style={styles.newVotesDotLarge} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.newVotesBannerTitle} numberOfLines={1}>New votes on "{hangoutWithNewVotes.title}"</Text>
                  <Text style={styles.newVotesBannerSub}>Tap to see the latest results</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.primaryLight} />
            </Pressable>
          )}

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="bulb-outline" size={18} color={Colors.warning} />
              <Text style={styles.sectionTitle}>Suggestions</Text>
              <View style={{ flex: 1 }} />
            </View>

            {suggestions.map((suggestion) => {
              const circleColor =
                suggestion.circleLevel === 1
                  ? Colors.circle1
                  : suggestion.circleLevel === 2
                    ? Colors.circle2
                    : Colors.circle3;
              const circleLabel = CIRCLE_CONFIG[suggestion.circleLevel]?.label ?? "Circle";

              return (
                <SwipableSuggestionRow
                  key={suggestion.contactId}
                  onSwipeDismiss={() => handleSuggestionSwipeDismiss(suggestion)}
                >
                <View style={styles.suggestionCard}>
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
                        onPress={() => handleSuggestionSms(suggestion)}
                        hitSlop={8}
                        style={({ pressed }) => [styles.suggestionActionBtn, pressed && { opacity: 0.5 }]}
                      >
                        <Ionicons name="chatbubble-ellipses-outline" size={18} color={Colors.primaryLight} />
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
                    {suggestion.actionType === "call" && (
                      <Pressable
                        onPress={() => handleSuggestionCall(suggestion)}
                        hitSlop={8}
                        style={({ pressed }) => [styles.suggestionActionBtn, pressed && { opacity: 0.5 }]}
                      >
                        <Ionicons name="call-outline" size={18} color={Colors.primaryLight} />
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
                </SwipableSuggestionRow>
              );
            })}
          </View>
        </>
      )}

      <BellSheet
        visible={bellSheetOpen}
        onClose={() => setBellSheetOpen(false)}
        contacts={contacts}
        isComplete={profileCompletion.isComplete}
      />
    </ScrollView>

    <NoPhoneSheet
      visible={!!phoneSheet}
      contactName={phoneSheet?.suggestion.contactName ?? ""}
      mode={phoneSheet?.mode ?? "sms"}
      onConfirm={handlePhoneSheetConfirm}
      onDismiss={() => setPhoneSheet(null)}
    />

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

    <HintTooltip
      visible={!!activeHint}
      text={activeHint ? HINT_TEXT[activeHint] : ""}
      onDismiss={dismissHint}
      arrowSide={
        activeHint === "home_profile" ? "top"
        : activeHint === "home_reminders" ? "top"
        : "bottom"
      }
      anchorTop={
        activeHint === "home_profile" ? insets.top + 72
        : activeHint === "home_reminders" ? insets.top + 200
        : undefined
      }
      anchorBottom={
        activeHint === "home_suggestions" ? 95
        : undefined
      }
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
  bellBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primary + "18",
    borderWidth: 1,
    borderColor: Colors.primary + "30",
    alignItems: "center",
    justifyContent: "center",
  },
  bellDot: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Colors.background,
  },
  umbrellaLabel: {
    fontSize: 13,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textTertiary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 20,
    marginBottom: 4,
  },
  shuffleBtn: {
    padding: 4,
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
  newVotesBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.primary + "12",
    borderWidth: 1,
    borderColor: Colors.primary + "40",
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginTop: 8,
  },
  newVotesBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  newVotesDotLarge: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  newVotesBannerTitle: {
    fontSize: 13,
    fontFamily: "Nunito_700Bold",
    color: Colors.primaryLight,
    flexShrink: 1,
  },
  newVotesBannerSub: {
    fontSize: 11,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    marginTop: 1,
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
