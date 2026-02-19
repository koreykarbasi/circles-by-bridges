import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useContacts } from "@/lib/contacts-context";
import { SuggestionCard } from "@/components/SuggestionCard";
import { EmptyState } from "@/components/EmptyState";
import { CIRCLE_CONFIG } from "@/lib/types";
import { getSmartPrompt, getNextPrompt, getActionType, resetSeenPrompts } from "@/lib/prompts";
import { getDaysSince, getDaysUntilBirthday, formatLastContacted, formatBirthdayCountdown, getContactUrgency } from "@/lib/helpers";
import type { Contact } from "@/lib/types";
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

function scoreContact(contact: Contact): number {
  let score = 0;
  const urgency = getContactUrgency(contact.circleLevel as 1 | 2 | 3, contact.lastContacted ?? undefined);
  if (urgency === "overdue") score += 100;
  else if (urgency === "soon") score += 50;

  const bday = getDaysUntilBirthday(contact.birthday ?? undefined);
  if (bday !== null && bday <= 7) score += 80;
  else if (bday !== null && bday <= 14) score += 40;
  else if (bday !== null && bday <= 30) score += 20;

  if (contact.circleLevel === 1) score += 15;
  else if (contact.circleLevel === 2) score += 8;

  const daysSince = getDaysSince(contact.lastContacted ?? undefined);
  if (daysSince === null) score += 30;
  else score += Math.min(daysSince, 60);

  return score;
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
    { isOverdue: urgency === "overdue", hasBirthdaySoon },
  );

  const type = getActionType(contact.circleLevel as 1 | 2 | 3, prompt);

  return {
    contact,
    prompt,
    type,
    urgency,
    birthdayLabel: hasBirthdaySoon ? birthdayLabel : undefined,
    lastContactedLabel,
  };
}

export default function SuggestionsScreen() {
  const insets = useSafeAreaInsets();
  const { contacts, markContacted } = useContacts();
  const [filterCircle, setFilterCircle] = useState<1 | 2 | 3 | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [cardPrompts, setCardPrompts] = useState<Record<string, GeneratedSuggestion>>({});
  const visitCount = useRef(0);

  useEffect(() => {
    visitCount.current += 1;
    if (visitCount.current > 1) {
      setRefreshKey((k) => k + 1);
    }
  }, []);

  const rankedContacts = useMemo(() => {
    const filtered = filterCircle
      ? contacts.filter((c) => c.circleLevel === filterCircle)
      : contacts;

    return [...filtered]
      .map((c) => ({ contact: c, score: scoreContact(c) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.contact);
  }, [contacts, filterCircle]);

  const suggestions = useMemo(() => {
    const result: GeneratedSuggestion[] = [];
    for (const contact of rankedContacts) {
      if (completedIds.has(contact.id)) continue;
      const existing = cardPrompts[contact.id];
      if (existing && existing.contact.id === contact.id) {
        result.push(existing);
      } else {
        result.push(buildSuggestion(contact));
      }
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rankedContacts, completedIds, refreshKey, cardPrompts]);

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
      { isOverdue: urgency === "overdue", hasBirthdaySoon },
    );

    const type = getActionType(contact.circleLevel as 1 | 2 | 3, newPrompt);
    const birthdayLabel = formatBirthdayCountdown(contact.birthday ?? undefined);
    const lastContactedLabel = formatLastContacted(contact.lastContacted ?? undefined);

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

  const handleDone = useCallback(
    (contactId: string) => {
      markContacted(contactId);
      setCompletedIds((prev) => new Set(prev).add(contactId));
    },
    [markContacted],
  );

  const handleRefreshAll = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    resetSeenPrompts();
    setCardPrompts({});
    setRefreshKey((k) => k + 1);
    setCompletedIds(new Set());
  }, []);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  return (
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
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/hangouts");
          }}
          style={({ pressed }) => [styles.hangoutButton, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="calendar-outline" size={18} color={Colors.primaryLight} />
        </Pressable>
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
            setCompletedIds(new Set());
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
                setCompletedIds(new Set());
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
        suggestions.map((s) => (
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
            onDone={() => handleDone(s.contact.id)}
            onRefresh={() => handleRefreshSingle(s.contact.id, s.prompt)}
          />
        ))
      )}

      <Pressable
        onPress={handleRefreshAll}
        style={({ pressed }) => [styles.refreshAll, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="refresh" size={18} color={Colors.primaryLight} />
        <Text style={styles.refreshAllText}>New suggestions</Text>
      </Pressable>
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
  refreshAll: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    marginTop: 4,
  },
  refreshAllText: {
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.primaryLight,
  },
});
