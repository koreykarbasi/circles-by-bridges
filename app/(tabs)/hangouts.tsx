import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, Platform, ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { EmptyState } from "@/components/EmptyState";
import type { HangoutPlan } from "@/lib/types";
import { getViewedTimestamps, hasUnreadVotes, countNewVoters } from "@/lib/hangout-notifications";
import { useAuth } from "@/lib/auth-context";
import { useSequentialHints, HINT_TEXT } from "@/lib/hints-store";
import { HintTooltip } from "@/components/HintTooltip";

function HangoutCard({ plan, viewedAt }: { plan: HangoutPlan; viewedAt: string | undefined }) {
  const isFinalized = plan.status === "finalized";
  const totalVotes = (plan.options || []).reduce((sum, o) => sum + (o.voteCount || 0), 0);
  const unread = !isFinalized && hasUnreadVotes(plan, viewedAt);
  const newVoterCount = unread ? countNewVoters(plan, viewedAt) : 0;

  const finalizedOption = isFinalized && plan.finalizedOptionId
    ? (plan.options || []).find((o) => o.id === plan.finalizedOptionId)
    : null;

  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        router.push({ pathname: "/hangout-detail", params: { id: plan.id } });
      }}
      style={({ pressed }) => [styles.card, unread && styles.cardUnread, pressed && { opacity: 0.8 }]}
    >
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <Text style={styles.cardTitle} numberOfLines={1}>{plan.title}</Text>
            {unread && <View style={styles.unreadDot} />}
          </View>
          <View style={styles.cardMeta}>
            <Ionicons name="people-outline" size={13} color={Colors.textTertiary} />
            <Text style={styles.cardMetaText}>{plan.inviteeNames.length} invited</Text>
            <View style={styles.dot} />
            <Ionicons name="hand-left-outline" size={13} color={Colors.textTertiary} />
            <Text style={styles.cardMetaText}>{totalVotes} votes</Text>
          </View>
        </View>
        <View style={[styles.statusBadge, isFinalized ? styles.statusFinalized : styles.statusActive]}>
          <Text style={[styles.statusText, isFinalized ? styles.statusFinalizedText : styles.statusActiveText]}>
            {isFinalized ? "Done" : "Active"}
          </Text>
        </View>
      </View>

      {unread && newVoterCount > 0 && (
        <View style={styles.newVotesRow}>
          <View style={styles.newVotesDot} />
          <Text style={styles.newVotesText}>
            {newVoterCount === 1 ? "1 new vote" : `${newVoterCount} new votes`}
          </Text>
        </View>
      )}

      {finalizedOption && (
        <View style={styles.winnerRow}>
          <Ionicons name="trophy" size={14} color={Colors.warning} />
          <Text style={styles.winnerText} numberOfLines={1}>{finalizedOption.label}</Text>
        </View>
      )}

      {!isFinalized && (plan.options || []).length > 0 && (
        <View style={styles.optionPreview}>
          {(plan.options || []).slice(0, 3).map((opt) => (
            <View key={opt.id} style={styles.optionChip}>
              <Text style={styles.optionChipText} numberOfLines={1}>{opt.label}</Text>
              <Text style={styles.optionChipVotes}>{opt.voteCount || 0}</Text>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  );
}

export default function HangoutsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const [viewedMap, setViewedMap] = useState<Record<string, string>>({});

  const { data: hangouts, isLoading } = useQuery<HangoutPlan[]>({
    queryKey: ["/api/hangouts"],
  });

  useFocusEffect(
    useCallback(() => {
      getViewedTimestamps(user?.id ?? "").then(setViewedMap);
    }, [user?.id]),
  );

  const activeHangouts = (hangouts || []).filter((h) => h.status !== "finalized");
  const pastHangouts = (hangouts || []).filter((h) => h.status === "finalized");
  const [activeHint, dismissHint] = useSequentialHints(["hangouts_intro"]);

  return (
    <View style={styles.screen}>
      <View style={[styles.headerBar, { paddingTop: insets.top + 8 + webTopInset }]}>
        <Text style={styles.headerTitle}>Hangouts</Text>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/create-hangout");
          }}
        >
          <Ionicons name="add-circle-outline" size={26} color={Colors.primary} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + (Platform.OS === "web" ? 34 : 0) }]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : !hangouts || hangouts.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="No hangouts yet"
            subtitle="Create a hangout plan and invite your friends to vote on the best option."
            actionLabel="Plan a hangout"
            onAction={() => router.push("/create-hangout")}
          />
        ) : (
          <>
            {activeHangouts.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Active</Text>
                {activeHangouts.map((h) => (
                  <HangoutCard key={h.id} plan={h} viewedAt={viewedMap[h.id]} />
                ))}
              </>
            )}
            {pastHangouts.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, activeHangouts.length > 0 && { marginTop: 24 }]}>
                  Past
                </Text>
                {pastHangouts.map((h) => (
                  <HangoutCard key={h.id} plan={h} viewedAt={viewedMap[h.id]} />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>

      <HintTooltip
        visible={activeHint === "hangouts_intro"}
        text={HINT_TEXT.hangouts_intro}
        onDismiss={dismissHint}
        bottomOffset={80}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Nunito_700Bold",
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardUnread: {
    borderColor: Colors.primary + "50",
    backgroundColor: Colors.primary + "06",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
    flexShrink: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  cardMetaText: {
    fontSize: 12,
    fontFamily: "Nunito_400Regular",
    color: Colors.textTertiary,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.textTertiary,
    marginHorizontal: 4,
  },
  newVotesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    backgroundColor: Colors.primary + "12",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  newVotesDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primaryLight,
  },
  newVotesText: {
    fontSize: 12,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.primaryLight,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusActive: {
    backgroundColor: Colors.primary + "18",
  },
  statusFinalized: {
    backgroundColor: Colors.success + "18",
  },
  statusText: {
    fontSize: 11,
    fontFamily: "Nunito_700Bold",
  },
  statusActiveText: {
    color: Colors.primaryLight,
  },
  statusFinalizedText: {
    color: Colors.success,
  },
  winnerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    backgroundColor: Colors.warning + "10",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  winnerText: {
    fontSize: 13,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.warning,
    flex: 1,
  },
  optionPreview: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },
  optionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  optionChipText: {
    fontSize: 12,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.text,
    maxWidth: 120,
  },
  optionChipVotes: {
    fontSize: 11,
    fontFamily: "Nunito_700Bold",
    color: Colors.primary,
  },
});
