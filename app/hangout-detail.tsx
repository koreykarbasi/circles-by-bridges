import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, Platform, Alert, Share, Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { apiRequest, getApiUrl, queryClient } from "@/lib/query-client";
import type { HangoutPlan, HangoutOption } from "@/lib/types";

function getBordaColor(rank: number, total: number): string {
  if (total <= 1) return Colors.primary;
  const pct = 1 - (rank - 1) / (total - 1);
  const r = Math.round(155 * pct + 80 * (1 - pct));
  const g = Math.round(125 * pct + 80 * (1 - pct));
  const b = Math.round(255 * pct + 120 * (1 - pct));
  return `rgb(${r},${g},${b})`;
}

function SurveySection({
  title,
  options,
  finalizedOptionId,
  isFinalized,
  onFinalize,
}: {
  title: string;
  options: HangoutOption[];
  finalizedOptionId?: string | null;
  isFinalized: boolean;
  onFinalize?: (id: string, label: string) => void;
}) {
  if (options.length === 0) return null;
  const sorted = [...options].sort((a, b) => (b.bordaScore || 0) - (a.bordaScore || 0));
  const maxScore = sorted[0]?.bordaScore || 0;

  return (
    <View style={ss.block}>
      <Text style={ss.sectionTitle}>{title}</Text>
      {sorted.map((opt, idx) => {
        const isWinner = isFinalized && opt.id === finalizedOptionId;
        const barPct = maxScore > 0 ? ((opt.bordaScore || 0) / maxScore) * 100 : 0;
        const rankColor = getBordaColor(idx + 1, sorted.length);

        return (
          <View
            key={opt.id}
            style={[ss.optionCard, isWinner && ss.optionCardWinner, idx === 0 && !isFinalized && maxScore > 0 && ss.optionCardTop]}
          >
            <View style={ss.optionHeaderRow}>
              <View style={[ss.rankDot, { backgroundColor: rankColor + "25", borderColor: rankColor + "50" }]}>
                {isWinner
                  ? <Ionicons name="trophy" size={13} color={Colors.warning} />
                  : <Text style={[ss.rankNum, { color: rankColor }]}>{idx + 1}</Text>
                }
              </View>
              <View style={{ flex: 1 }}>
                <Text style={ss.optionLabel}>{opt.label}</Text>
              </View>
              <View style={ss.scoreBox}>
                <Text style={[ss.scoreNum, isWinner && { color: Colors.warning }]}>
                  {opt.bordaScore || 0}
                </Text>
                <Text style={ss.scoreSub}>pts</Text>
              </View>
            </View>

            {maxScore > 0 && (
              <View style={ss.barTrack}>
                <View style={[ss.barFill, { width: `${barPct}%` as any, backgroundColor: isWinner ? Colors.warning : rankColor }]} />
              </View>
            )}

            <View style={ss.voterRow}>
              <Text style={ss.voterCount}>{opt.voteCount || 0} voter{(opt.voteCount || 0) !== 1 ? "s" : ""}</Text>
              {(opt.votes || []).filter((v) => v.rank && v.rank > 0).map((v, i) => (
                <View key={i} style={ss.voterChip}>
                  <Text style={ss.voterChipText}>{v.voterName}</Text>
                </View>
              ))}
            </View>

            {!isFinalized && onFinalize && (opt.bordaScore || 0) > 0 && (
              <Pressable
                onPress={() => onFinalize(opt.id, opt.label)}
                style={({ pressed }) => [ss.lockBtn, pressed && { opacity: 0.8 }]}
              >
                <Ionicons name="checkmark-circle-outline" size={15} color={Colors.success} />
                <Text style={ss.lockBtnText}>Lock this in</Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

export default function HangoutDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const [linkCopied, setLinkCopied] = useState(false);
  const [msgCopied, setMsgCopied] = useState(false);

  const { data: plan, isLoading } = useQuery<HangoutPlan>({
    queryKey: ["/api/hangouts", id],
    enabled: !!id,
    refetchInterval: 15000,
  });

  const finalizeMutation = useMutation({
    mutationFn: async (optionId: string) => {
      await apiRequest("PUT", `/api/hangouts/${id}`, { status: "finalized", finalizedOptionId: optionId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hangouts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hangouts", id] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => { await apiRequest("DELETE", `/api/hangouts/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hangouts"] });
      router.back();
    },
  });

  const getVoteUrl = useCallback(() => {
    const base = getApiUrl();
    return `${base}vote/${plan?.shareCode}`;
  }, [plan]);

  const copyToClipboard = useCallback(async (text: string): Promise<boolean> => {
    try {
      if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      // Native fallback via Share
      await Share.share({ message: text });
      return true;
    } catch {
      return false;
    }
  }, []);

  const handleCopyLink = useCallback(async () => {
    if (!plan) return;
    const url = getVoteUrl();
    const ok = await copyToClipboard(url);
    if (ok) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  }, [plan, getVoteUrl, copyToClipboard]);

  const handleCopyMessage = useCallback(async () => {
    if (!plan) return;
    const url = getVoteUrl();
    const msg = `Hey! Let's plan a hangout — "${plan.title}". Rank your preferred options here: ${url}`;
    const ok = await copyToClipboard(msg);
    if (ok) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setMsgCopied(true);
      setTimeout(() => setMsgCopied(false), 2000);
    }
  }, [plan, getVoteUrl, copyToClipboard]);

  const handleShare = useCallback(async () => {
    if (!plan) return;
    const url = getVoteUrl();
    try {
      await Share.share({ message: `"${plan.title}" — rank your options: ${url}`, url });
    } catch { /* cancelled */ }
  }, [plan, getVoteUrl]);

  const handleCalendarInvite = useCallback(() => {
    if (!plan) return;
    const base = getApiUrl();
    const calUrl = `${base}api/hangouts/${plan.id}/calendar`;
    if (Platform.OS === "web") {
      window.open(calUrl, "_blank");
    } else {
      Linking.openURL(calUrl).catch(() => Alert.alert("Error", "Could not open calendar invite."));
    }
  }, [plan]);

  const handleFinalize = useCallback((optionId: string, label: string) => {
    Alert.alert(
      "Finalize Plan",
      `Lock in "${label}" as the chosen option?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Finalize", onPress: () => finalizeMutation.mutate(optionId) },
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
  const rec = plan.bestRecommendation;
  const totalVoters = rec?.totalVoters || 0;

  const activityOptions = (plan.options || []).filter((o) => o.questionType === "activity");
  const timeOptions = (plan.options || []).filter((o) => o.questionType === "time");
  const locationOptions = (plan.options || []).filter((o) => o.questionType === "location");

  const isDeadlinePassed = plan.deadline ? new Date(plan.deadline) < new Date() : false;

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
        {/* Status banner */}
        {isFinalized && (
          <View style={styles.finalizedBanner}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
            <Text style={styles.finalizedText}>Plan finalized</Text>
          </View>
        )}

        {/* Description */}
        {plan.description ? <Text style={styles.description}>{plan.description}</Text> : null}

        {/* Meta row */}
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="people-outline" size={15} color={Colors.textSecondary} />
            <Text style={styles.metaText}>{plan.inviteeNames.length} invited</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="hand-left-outline" size={15} color={Colors.textSecondary} />
            <Text style={styles.metaText}>{totalVoters} voted</Text>
          </View>
          {plan.deadline && (
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={15} color={isDeadlinePassed ? Colors.danger : Colors.textSecondary} />
              <Text style={[styles.metaText, isDeadlinePassed && { color: Colors.danger }]}>
                {isDeadlinePassed ? "Closed" : `Closes ${plan.deadline}`}
              </Text>
            </View>
          )}
        </View>

        {/* Invitee chips */}
        {plan.inviteeNames.length > 0 && (
          <View style={styles.chips}>
            {plan.inviteeNames.map((name, i) => (
              <View key={i} style={styles.chip}>
                <Text style={styles.chipText}>{name}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Fixed activity badge */}
        {plan.surveyMode === "fixed-activity" && plan.fixedActivity && (
          <View style={styles.fixedActivityBadge}>
            <Ionicons name="star" size={14} color={Colors.primaryLight} />
            <Text style={styles.fixedActivityText}>{plan.fixedActivity}</Text>
          </View>
        )}

        {/* Best recommendation banner */}
        {rec && (rec.bestActivity || rec.bestTime || rec.bestLocation) && (
          <View style={styles.recBanner}>
            <Text style={styles.recBannerTitle}>Best picks so far</Text>
            {rec.bestActivity && (
              <View style={styles.recRow}>
                <Text style={styles.recRowLabel}>Activity</Text>
                <Text style={styles.recRowValue}>{rec.bestActivity.label}</Text>
              </View>
            )}
            {rec.bestTime && (
              <View style={styles.recRow}>
                <Text style={styles.recRowLabel}>When</Text>
                <Text style={styles.recRowValue}>{rec.bestTime.label}</Text>
              </View>
            )}
            {rec.bestLocation && (
              <View style={styles.recRow}>
                <Text style={styles.recRowLabel}>Where</Text>
                <Text style={styles.recRowValue}>{rec.bestLocation.label}</Text>
              </View>
            )}
            {plan.includePlusOne && rec.plusOneTotal !== undefined && rec.plusOneTotal > 0 && (
              <View style={styles.recRow}>
                <Text style={styles.recRowLabel}>Guests</Text>
                <Text style={styles.recRowValue}>{rec.plusOneTotal} extra</Text>
              </View>
            )}
          </View>
        )}

        {/* Share buttons */}
        {!isFinalized && (
          <View style={styles.shareRow}>
            <Pressable
              onPress={handleCopyLink}
              style={({ pressed }) => [styles.shareBtn, styles.shareBtnPrimary, pressed && { opacity: 0.8 }]}
            >
              <Ionicons name={linkCopied ? "checkmark" : "link-outline"} size={16} color="#fff" />
              <Text style={styles.shareBtnText}>{linkCopied ? "Copied!" : "Copy link"}</Text>
            </Pressable>
            <Pressable
              onPress={handleCopyMessage}
              style={({ pressed }) => [styles.shareBtn, styles.shareBtnSecondary, pressed && { opacity: 0.8 }]}
            >
              <Ionicons name={msgCopied ? "checkmark" : "chatbubble-outline"} size={16} color={Colors.primaryLight} />
              <Text style={[styles.shareBtnText, { color: Colors.primaryLight }]}>
                {msgCopied ? "Copied!" : "Copy message"}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Results by question type */}
        <SurveySection
          title="Activity"
          options={activityOptions}
          finalizedOptionId={plan.finalizedOptionId}
          isFinalized={isFinalized}
          onFinalize={handleFinalize}
        />
        <SurveySection
          title="When"
          options={timeOptions}
          finalizedOptionId={plan.finalizedOptionId}
          isFinalized={isFinalized}
          onFinalize={handleFinalize}
        />
        <SurveySection
          title="Where"
          options={locationOptions}
          finalizedOptionId={plan.finalizedOptionId}
          isFinalized={isFinalized}
          onFinalize={handleFinalize}
        />

        {/* Calendar invite after finalization */}
        {isFinalized && (
          <Pressable
            onPress={handleCalendarInvite}
            style={({ pressed }) => [styles.calendarBtn, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="calendar-outline" size={18} color={Colors.success} />
            <Text style={styles.calendarBtnText}>Get calendar invite (.ics)</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const ss = StyleSheet.create({
  block: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 16, fontFamily: "Nunito_700Bold", color: Colors.text, marginBottom: 10,
  },
  optionCard: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: Colors.border,
  },
  optionCardWinner: { borderColor: Colors.warning + "50", backgroundColor: Colors.warning + "06" },
  optionCardTop: { borderColor: Colors.primary + "40" },
  optionHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  rankDot: {
    width: 28, height: 28, borderRadius: 8, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  rankNum: { fontSize: 13, fontFamily: "Nunito_800ExtraBold" },
  optionLabel: { fontSize: 15, fontFamily: "Nunito_700Bold", color: Colors.text, flex: 1 },
  scoreBox: { alignItems: "center", minWidth: 38 },
  scoreNum: { fontSize: 20, fontFamily: "Nunito_800ExtraBold", color: Colors.primary, lineHeight: 22 },
  scoreSub: { fontSize: 9, fontFamily: "Nunito_600SemiBold", color: Colors.textTertiary, marginTop: -2 },
  barTrack: { height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: "hidden", marginBottom: 8 },
  barFill: { height: 4, borderRadius: 2 },
  voterRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, alignItems: "center" },
  voterCount: { fontSize: 11, fontFamily: "Nunito_600SemiBold", color: Colors.textTertiary, marginRight: 4 },
  voterChip: { backgroundColor: Colors.surfaceElevated, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  voterChipText: { fontSize: 11, fontFamily: "Nunito_600SemiBold", color: Colors.textSecondary },
  lockBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, marginTop: 10, paddingVertical: 8, borderRadius: 8,
    backgroundColor: Colors.success + "12",
  },
  lockBtnText: { fontSize: 13, fontFamily: "Nunito_700Bold", color: Colors.success },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  headerBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 12, backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 12,
  },
  closeButton: { padding: 4 },
  headerTitle: {
    flex: 1, fontSize: 17, fontFamily: "Nunito_700Bold",
    color: Colors.text, textAlign: "center",
  },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { fontSize: 15, fontFamily: "Nunito_400Regular", color: Colors.textSecondary },
  scrollContainer: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16 },
  finalizedBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.success + "15", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16,
  },
  finalizedText: { fontSize: 14, fontFamily: "Nunito_700Bold", color: Colors.success },
  description: {
    fontSize: 15, fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary, lineHeight: 22, marginBottom: 14,
  },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginBottom: 12 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { fontSize: 13, fontFamily: "Nunito_600SemiBold", color: Colors.textSecondary },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 16 },
  chip: { backgroundColor: Colors.surfaceElevated, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  chipText: { fontSize: 12, fontFamily: "Nunito_600SemiBold", color: Colors.text },
  fixedActivityBadge: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.primary + "12", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.primary + "30",
  },
  fixedActivityText: { fontSize: 14, fontFamily: "Nunito_700Bold", color: Colors.primaryLight },
  recBanner: {
    backgroundColor: Colors.primary + "10", borderRadius: 14,
    borderWidth: 1, borderColor: Colors.primary + "25",
    paddingHorizontal: 16, paddingVertical: 14, marginBottom: 20,
  },
  recBannerTitle: {
    fontSize: 11, fontFamily: "Nunito_700Bold", color: Colors.primary,
    textTransform: "uppercase", letterSpacing: 1, marginBottom: 10,
  },
  recRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  recRowLabel: {
    fontSize: 12, fontFamily: "Nunito_600SemiBold", color: Colors.textTertiary, width: 56,
  },
  recRowValue: { fontSize: 14, fontFamily: "Nunito_700Bold", color: Colors.text, flex: 1 },
  shareRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  shareBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 7, paddingVertical: 12, borderRadius: 12,
  },
  shareBtnPrimary: { backgroundColor: Colors.primary },
  shareBtnSecondary: {
    backgroundColor: Colors.primary + "15",
    borderWidth: 1, borderColor: Colors.primary + "40",
  },
  shareBtnText: { fontSize: 14, fontFamily: "Nunito_700Bold", color: "#fff" },
  calendarBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: Colors.success + "12",
    borderWidth: 1, borderColor: Colors.success + "30",
    borderRadius: 14, paddingVertical: 14, marginTop: 8,
  },
  calendarBtnText: { fontSize: 15, fontFamily: "Nunito_700Bold", color: Colors.success },
});
