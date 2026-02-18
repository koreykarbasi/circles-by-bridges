import React, { useState, useMemo, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useContacts } from "@/lib/contacts-context";
import { SuggestionCard } from "@/components/SuggestionCard";
import { EmptyState } from "@/components/EmptyState";
import { CIRCLE_CONFIG } from "@/lib/types";
import { getRandomPrompt } from "@/lib/prompts";
import { getDaysSince } from "@/lib/helpers";
import type { Contact } from "@/lib/types";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";

interface GeneratedSuggestion {
  contact: Contact;
  prompt: string;
  type: "call" | "text" | "hangout";
}

export default function SuggestionsScreen() {
  const insets = useSafeAreaInsets();
  const { contacts, markContacted } = useContacts();
  const [filterCircle, setFilterCircle] = useState<1 | 2 | 3 | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

  const suggestions = useMemo(() => {
    const filtered = filterCircle
      ? contacts.filter((c) => c.circleLevel === filterCircle)
      : contacts;

    const sorted = [...filtered].sort((a, b) => {
      const daysA = getDaysSince(a.lastContacted) ?? 999;
      const daysB = getDaysSince(b.lastContacted) ?? 999;
      return daysB - daysA;
    });

    const top = sorted.slice(0, 8);

    return top
      .filter((c) => !completedIds.has(c.id))
      .map((contact): GeneratedSuggestion => {
        const types: ("call" | "text" | "hangout")[] = ["call", "text", "hangout"];
        const type = types[Math.floor(Math.random() * types.length)];
        return {
          contact,
          prompt: getRandomPrompt(contact.name, contact.circleLevel, contact.interests),
          type,
        };
      });
  }, [contacts, filterCircle, refreshKey, completedIds]);

  const handleRefreshSingle = useCallback((contactId: string) => {
    setRefreshKey((k) => k + 1);
  }, []);

  const handleDone = useCallback(
    (contactId: string) => {
      markContacted(contactId);
      setCompletedIds((prev) => new Set(prev).add(contactId));
    },
    [markContacted],
  );

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
    >
      <Text style={styles.title}>Suggestions</Text>
      <Text style={styles.subtitle}>People who'd love to hear from you</Text>

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
              }}
              style={[
                styles.filterChip,
                isActive && { backgroundColor: cfg.color + "15", borderColor: cfg.color + "40" },
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
          subtitle="You've completed all suggestions. Pull to refresh for new ones."
        />
      ) : (
        suggestions.map((s) => (
          <SuggestionCard
            key={s.contact.id + "-" + refreshKey}
            contactName={s.contact.name}
            avatarColor={s.contact.avatarColor}
            prompt={s.prompt}
            type={s.type}
            circleLevel={s.contact.circleLevel}
            onDone={() => handleDone(s.contact.id)}
            onRefresh={() => handleRefreshSingle(s.contact.id)}
          />
        ))
      )}

      {suggestions.length > 0 && (
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setRefreshKey((k) => k + 1);
          }}
          style={({ pressed }) => [styles.refreshAll, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="refresh" size={18} color={Colors.primary} />
          <Text style={styles.refreshAllText}>New suggestions</Text>
        </Pressable>
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
  title: {
    fontSize: 28,
    fontFamily: "Nunito_800ExtraBold",
    color: Colors.text,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    marginTop: 4,
    marginBottom: 16,
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
    borderColor: Colors.borderLight,
    gap: 6,
  },
  filterChipActive: {
    backgroundColor: Colors.primary + "15",
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
    color: Colors.primary,
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
    color: Colors.primary,
  },
});
