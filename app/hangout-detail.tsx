import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, Platform, Alert, Share,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { apiRequest, getApiUrl, queryClient } from "@/lib/query-client";
import type { HangoutPlan } from "@/lib/types";

export default function HangoutDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const { data: plan, isLoading } = useQuery<HangoutPlan>({
    queryKey: ["/api/hangouts", id],
    enabled: !!id,
  });

  const finalizeMutation = useMutation({
    mutationFn: async (optionId: string) => {
      await apiRequest("PUT", `/api/hangouts/${id}`, {
        status: "finalized",
        finalizedOptionId: optionId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hangouts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hangouts", id] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/hangouts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hangouts"] });
      router.back();
    },
  });

  const handleShare = useCallback(async () => {
    if (!plan) return;
    try {
      const baseUrl = getApiUrl();
      const voteUrl = `${baseUrl}vote/${plan.shareCode}`;
      await Share.share({
        message: `Vote on "${plan.title}" - ${voteUrl}`,
        url: voteUrl,
      });
    } catch (err) {
      // user cancelled
    }
  }, [plan]);

  const handleFinalize = useCallback((optionId: string, label: string) => {
    Alert.alert(
      "Finalize Plan",
      `Lock in "${label}" as the chosen option? This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Finalize", style: "default", onPress: () => finalizeMutation.mutate(optionId) },
      ],
    );
  }, [finalizeMutation]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      "Delete Hangout",
      "Are you sure you want to delete this hangout plan?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate() },
      ],
    );
  }, [deleteMutation]);

  if (isLoading || !plan) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + webTopInset }]}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  const isFinalized = plan.status === "finalized";
  const totalVoters = new Set(
    (plan.options || []).flatMap((o) => (o.votes || []).map((v) => v.voterName)),
  ).size;

  const sortedOptions = [...(plan.options || [])].sort(
    (a, b) => (b.voteCount || 0) - (a.voteCount || 0),
  );

  const maxVotes = sortedOptions.length > 0 ? (sortedOptions[0].voteCount || 0) : 0;

  return (
    <View style={styles.screen}>
      <View style={[styles.headerBar, { paddingTop: insets.top + 8 + webTopInset }]}>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{plan.title}</Text>
        <Pressable onPress={handleDelete}>
          <Ionicons name="trash-outline" size={22} color={Colors.danger} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + (Platform.OS === "web" ? 34 : 0) }]}
        showsVerticalScrollIndicator={false}
      >
        {isFinalized && (
          <View style={styles.finalizedBanner}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
            <Text style={styles.finalizedText}>Plan finalized</Text>
          </View>
        )}

        {plan.description ? (
          <Text style={styles.description}>{plan.description}</Text>
        ) : null}

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="people-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.metaText}>
              {plan.inviteeNames.length} invited
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="hand-left-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.metaText}>{totalVoters} voted</Text>
          </View>
        </View>

        {plan.inviteeNames.length > 0 && (
          <View style={styles.inviteeChips}>
            {plan.inviteeNames.map((name, i) => (
              <View key={i} style={styles.inviteeChip}>
                <Text style={styles.inviteeChipText}>{name}</Text>
              </View>
            ))}
          </View>
        )}

        <Pressable onPress={handleShare} style={({ pressed }) => [styles.shareButton, pressed && { opacity: 0.8 }]}>
          <Ionicons name="share-outline" size={18} color="#fff" />
          <Text style={styles.shareButtonText}>Share voting link</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>
          {isFinalized ? "Results" : "Options"}
        </Text>

        {sortedOptions.map((opt) => {
          const isWinner = isFinalized && opt.id === plan.finalizedOptionId;
          const isTopVoted = maxVotes > 0 && (opt.voteCount || 0) === maxVotes && !isFinalized;
          const barWidth = maxVotes > 0 ? ((opt.voteCount || 0) / maxVotes) * 100 : 0;

          return (
            <View
              key={opt.id}
              style={[
                styles.optionCard,
                isWinner && styles.optionCardWinner,
                isTopVoted && styles.optionCardTop,
              ]}
            >
              <View style={styles.optionHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionLabel}>{opt.label}</Text>
                  {opt.dateTime ? (
                    <View style={styles.optionMeta}>
                      <Ionicons name="calendar-outline" size={12} color={Colors.textTertiary} />
                      <Text style={styles.optionMetaText}>{opt.dateTime}</Text>
                    </View>
                  ) : null}
                  {opt.activity ? (
                    <View style={styles.optionMeta}>
                      <Ionicons name="sparkles-outline" size={12} color={Colors.textTertiary} />
                      <Text style={styles.optionMetaText}>{opt.activity}</Text>
                    </View>
                  ) : null}
                  {opt.location ? (
                    <View style={styles.optionMeta}>
                      <Ionicons name="location-outline" size={12} color={Colors.textTertiary} />
                      <Text style={styles.optionMetaText}>{opt.location}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.voteCountContainer}>
                  {isWinner && <Ionicons name="trophy" size={18} color={Colors.warning} style={{ marginBottom: 2 }} />}
                  <Text style={[styles.voteCount, isWinner && { color: Colors.warning }]}>
                    {opt.voteCount || 0}
                  </Text>
                  <Text style={styles.voteLabel}>votes</Text>
                </View>
              </View>

              {maxVotes > 0 && (
                <View style={styles.barContainer}>
                  <View
                    style={[
                      styles.bar,
                      { width: `${barWidth}%` },
                      isWinner && { backgroundColor: Colors.warning },
                      isTopVoted && { backgroundColor: Colors.primary },
                    ]}
                  />
                </View>
              )}

              {opt.votes && opt.votes.length > 0 && (
                <View style={styles.voterNames}>
                  {opt.votes.filter((v) => v.vote).map((v, i) => (
                    <Text key={i} style={styles.voterName}>{v.voterName}</Text>
                  ))}
                </View>
              )}

              {!isFinalized && (opt.voteCount || 0) > 0 && (
                <Pressable
                  onPress={() => handleFinalize(opt.id, opt.label)}
                  style={({ pressed }) => [styles.finalizeButton, pressed && { opacity: 0.8 }]}
                >
                  <Ionicons name="checkmark-circle-outline" size={16} color={Colors.success} />
                  <Text style={styles.finalizeButtonText}>Lock this in</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>
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
    gap: 12,
  },
  closeButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
    textAlign: "center",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: 15,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  finalizedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.success + "15",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  finalizedText: {
    fontSize: 14,
    fontFamily: "Nunito_700Bold",
    color: Colors.success,
  },
  description: {
    fontSize: 15,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: 14,
  },
  metaRow: {
    flexDirection: "row",
    gap: 20,
    marginBottom: 12,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  metaText: {
    fontSize: 13,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
  },
  inviteeChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 16,
  },
  inviteeChip: {
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  inviteeChipText: {
    fontSize: 12,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.text,
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 24,
  },
  shareButtonText: {
    fontSize: 15,
    fontFamily: "Nunito_700Bold",
    color: "#fff",
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
    marginBottom: 12,
  },
  optionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optionCardWinner: {
    borderColor: Colors.warning + "60",
    backgroundColor: Colors.warning + "08",
  },
  optionCardTop: {
    borderColor: Colors.primary + "40",
  },
  optionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  optionLabel: {
    fontSize: 16,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
    marginBottom: 4,
  },
  optionMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  optionMetaText: {
    fontSize: 12,
    fontFamily: "Nunito_400Regular",
    color: Colors.textTertiary,
  },
  voteCountContainer: {
    alignItems: "center",
    minWidth: 40,
  },
  voteCount: {
    fontSize: 22,
    fontFamily: "Nunito_800ExtraBold",
    color: Colors.primary,
  },
  voteLabel: {
    fontSize: 10,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textTertiary,
    marginTop: -2,
  },
  barContainer: {
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    marginTop: 10,
    overflow: "hidden",
  },
  bar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.circle3,
  },
  voterNames: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 8,
  },
  voterName: {
    fontSize: 11,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: "hidden",
  },
  finalizeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginTop: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.success + "15",
  },
  finalizeButtonText: {
    fontSize: 13,
    fontFamily: "Nunito_700Bold",
    color: Colors.success,
  },
});
