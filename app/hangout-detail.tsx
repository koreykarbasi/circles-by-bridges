import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, Platform, Alert, Linking,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { apiRequest, getApiUrl, queryClient } from "@/lib/query-client";
import type { HangoutPlan, HangoutOption } from "@/lib/types";
import { markHangoutViewed } from "@/lib/hangout-notifications";
import { useAuth } from "@/lib/auth-context";

const MONTH_MAP: Record<string, number> = {
  January: 0, February: 1, March: 2, April: 3, May: 4, June: 5,
  July: 6, August: 7, September: 8, October: 9, November: 10, December: 11,
};

function addDayOfWeek(label: string): string {
  if (!label) return label;
  const atIdx = label.indexOf(" at ");
  const datePart = atIdx >= 0 ? label.substring(0, atIdx) : label;
  try {
    // Parse "Month DD, YYYY" manually — Hermes (React Native) does not
    // reliably parse non-ISO strings with new Date("June 12, 2026")
    const m = datePart.match(/^(\w+)\s+(\d+),\s*(\d+)$/);
    if (!m) return label;
    const monthNum = MONTH_MAP[m[1]];
    if (monthNum === undefined) return label;
    const d = new Date(parseInt(m[3], 10), monthNum, parseInt(m[2], 10));
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return days[d.getDay()] + ". " + label;
  } catch {
    return label;
  }
}

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
  lockedOptionId,
  isFinalized,
  onFinalize,
}: {
  title: string;
  options: HangoutOption[];
  lockedOptionId?: string | null;
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
        const isWinner = isFinalized && opt.id === lockedOptionId;
        const isLocked = !isFinalized && opt.id === lockedOptionId;
        const barPct = maxScore > 0 ? ((opt.bordaScore || 0) / maxScore) * 100 : 0;
        const rankColor = getBordaColor(idx + 1, sorted.length);

        return (
          <View
            key={opt.id}
            style={[
              ss.optionCard,
              isWinner && ss.optionCardWinner,
              isLocked && ss.optionCardLocked,
              idx === 0 && !isFinalized && !lockedOptionId && maxScore > 0 && ss.optionCardTop,
            ]}
          >
            <View style={ss.optionHeaderRow}>
              <View style={[ss.rankDot, { backgroundColor: rankColor + "25", borderColor: rankColor + "50" }]}>
                {isWinner
                  ? <Ionicons name="trophy" size={13} color={Colors.warning} />
                  : isLocked
                    ? <Ionicons name="checkmark" size={13} color={Colors.success} />
                    : <Text style={[ss.rankNum, { color: rankColor }]}>{idx + 1}</Text>
                }
              </View>
              <View style={{ flex: 1 }}>
                <Text style={ss.optionLabel}>
                  {opt.questionType === "time" ? addDayOfWeek(opt.label) : opt.label}
                </Text>
              </View>
              <View style={ss.scoreBox}>
                <Text style={[ss.scoreNum, isWinner && { color: Colors.warning }, isLocked && { color: Colors.success }]}>
                  {opt.bordaScore || 0}
                </Text>
                <Text style={ss.scoreSub}>pts</Text>
              </View>
            </View>

            {maxScore > 0 && (
              <View style={ss.barTrack}>
                <View style={[
                  ss.barFill,
                  { width: `${barPct}%` as any, backgroundColor: isWinner ? Colors.warning : isLocked ? Colors.success : rankColor },
                ]} />
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

            {isLocked && (
              <View style={ss.lockedBadge}>
                <Ionicons name="checkmark-circle" size={13} color={Colors.success} />
                <Text style={ss.lockedBadgeText}>Locked in</Text>
              </View>
            )}

            {!isFinalized && !lockedOptionId && onFinalize && (opt.bordaScore || 0) > 0 && (
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
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const [linkCopied, setLinkCopied] = useState(false);
  const [copiedInviteeName, setCopiedInviteeName] = useState<string | null>(null);
  const [msgCopied, setMsgCopied] = useState(false);
  const [guestsCopied, setGuestsCopied] = useState(false);
  const [showIndividualVotes, setShowIndividualVotes] = useState(false);

  const { data: plan, isLoading } = useQuery<HangoutPlan>({
    queryKey: ["/api/hangouts", id],
    enabled: !!id,
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (plan?.id) {
      markHangoutViewed(plan.id, user?.id ?? "");
    }
  }, [plan?.id]);

  const finalizeActivityMutation = useMutation({
    mutationFn: async (optionId: string) => {
      await apiRequest("PUT", `/api/hangouts/${id}`, { finalizedOptionId: optionId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hangouts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hangouts", id] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const finalizeTimeMutation = useMutation({
    mutationFn: async ({ optionId, finalizePlan }: { optionId: string; finalizePlan: boolean }) => {
      await apiRequest("PUT", `/api/hangouts/${id}`, {
        finalizedTimeOptionId: optionId,
        ...(finalizePlan ? { status: "finalized" } : {}),
      });
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

  const emailInvitesMutation = useMutation({
    mutationFn: async (): Promise<{ sent: string[]; missing: string[] }> => {
      const res = await apiRequest("POST", `/api/hangouts/${id}/email-invites`, {});
      return res.json();
    },
    onSuccess: (result) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const sentLine = result.sent.length > 0 ? `Sent to: ${result.sent.join(", ")}` : null;
      const missingLine = result.missing.length > 0
        ? `No email on file: ${result.missing.join(", ")}`
        : null;
      const parts = [sentLine, missingLine].filter(Boolean).join("\n\n");
      if (result.sent.length === 0 && result.missing.length > 0) {
        Alert.alert(
          "No emails found",
          `None of your invitees have an email address on file.\n\nNeed to follow up manually: ${result.missing.join(", ")}`,
        );
      } else {
        Alert.alert("Invites sent", parts || "Done.");
      }
    },
    onError: () => {
      Alert.alert("Error", "Could not send email invites. Please try again.");
    },
  });

  const getVoteUrl = useCallback(() => {
    const base = getApiUrl();
    return `${base}vote/${plan?.shareCode}`;
  }, [plan]);

  const getVoteUrlForToken = useCallback((token: string) => {
    return `${getVoteUrl()}?token=${encodeURIComponent(token)}`;
  }, [getVoteUrl]);

  const copyToClipboard = useCallback(async (text: string): Promise<boolean> => {
    try {
      await Clipboard.setStringAsync(text);
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

  const handleCopyInviteeLink = useCallback(async (name: string, token: string) => {
    const url = getVoteUrlForToken(token);
    const ok = await copyToClipboard(url);
    if (ok) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCopiedInviteeName(name);
      setTimeout(() => setCopiedInviteeName((cur) => (cur === name ? null : cur)), 2000);
    }
  }, [getVoteUrlForToken, copyToClipboard]);

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

  const handleShareWithGuests = useCallback(async (timeLabel: string, locationLabel: string | null) => {
    if (!plan) return;
    const locationLine = locationLabel ? `\nWhere: ${locationLabel}` : "";
    const msg = `Join us for ${plan.title}!\nWhen: ${timeLabel}${locationLine}\n\nSee you there!`;
    const ok = await copyToClipboard(msg);
    if (ok) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setGuestsCopied(true);
      setTimeout(() => setGuestsCopied(false), 2500);
    }
  }, [plan, copyToClipboard]);

  const handleFinalizeActivity = useCallback((optionId: string, label: string) => {
    Alert.alert(
      "Lock in Activity",
      `Choose "${label}" as the activity?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Lock in", onPress: () => finalizeActivityMutation.mutate(optionId) },
      ],
    );
  }, [finalizeActivityMutation]);

  const handleFinalizeTime = useCallback((optionId: string, label: string) => {
    if (!plan) return;
    const hasActivityOptions = (plan.options || []).some(o => o.questionType === "activity");
    const activityAlreadyLocked = !!plan.finalizedOptionId;

    if (hasActivityOptions && !activityAlreadyLocked) {
      Alert.alert("Lock in Activity First", "Please choose an activity before locking in a time slot.");
      return;
    }

    const finalizePlan = !hasActivityOptions || activityAlreadyLocked;
    Alert.alert(
      "Lock in Time",
      `Choose "${label}" as the time?${finalizePlan ? " This will finalize the plan." : ""}`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Lock in", onPress: () => finalizeTimeMutation.mutate({ optionId, finalizePlan }) },
      ],
    );
  }, [plan, finalizeTimeMutation]);

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
  const activityLocked = !!plan.finalizedOptionId && !isFinalized;
  const rec = plan.bestRecommendation;
  const totalVoters = rec?.totalVoters || 0;

  const activityOptions = (plan.options || []).filter((o) => o.questionType === "activity");
  const timeOptions = (plan.options || []).filter((o) => o.questionType === "time");
  const locationOptions = (plan.options || []).filter((o) => o.questionType === "location");

  const isDeadlinePassed = plan.deadline ? new Date(plan.deadline) < new Date() : false;

  const lockedTimeOption = (plan.options || []).find(o => o.id === plan.finalizedTimeOptionId);
  const lockedLocationOption = locationOptions.length > 0
    ? [...locationOptions].sort((a, b) => (b.bordaScore || 0) - (a.bordaScore || 0))[0]
    : null;

  const timeLabel = lockedTimeOption ? addDayOfWeek(lockedTimeOption.label) : "TBD";
  const locationLabel = lockedLocationOption?.label || null;

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
        {/* Finalized summary card */}
        {isFinalized && (
          <View style={styles.finalizedCard}>
            <View style={styles.finalizedCardHeader}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
              <Text style={styles.finalizedCardTitle}>{plan.title}</Text>
            </View>
            <View style={styles.finalizedCardDetail}>
              <Ionicons name="calendar-outline" size={15} color={Colors.textSecondary} />
              <Text style={styles.finalizedCardDetailText}>{timeLabel}</Text>
            </View>
            {locationLabel && (
              <View style={styles.finalizedCardDetail}>
                <Ionicons name="location-outline" size={15} color={Colors.textSecondary} />
                <Text style={styles.finalizedCardDetailText}>{locationLabel}</Text>
              </View>
            )}
            <View style={styles.finalizedCardActions}>
              <Pressable
                onPress={handleCalendarInvite}
                style={({ pressed }) => [styles.calendarBtn, pressed && { opacity: 0.8 }]}
              >
                <Ionicons name="calendar" size={16} color={Colors.success} />
                <Text style={styles.calendarBtnText}>Add to my calendar</Text>
              </Pressable>
              <Pressable
                onPress={() => handleShareWithGuests(timeLabel, locationLabel)}
                style={({ pressed }) => [styles.shareGuestsBtn, pressed && { opacity: 0.8 }]}
              >
                <Ionicons name={guestsCopied ? "checkmark" : "share-outline"} size={16} color={Colors.primaryLight} />
                <Text style={styles.shareGuestsBtnText}>{guestsCopied ? "Copied!" : "Share with guests"}</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={() => emailInvitesMutation.mutate()}
              disabled={emailInvitesMutation.isPending}
              style={({ pressed }) => [styles.emailInviteBtn, (pressed || emailInvitesMutation.isPending) && { opacity: 0.7 }]}
            >
              <Ionicons name="mail-outline" size={16} color={Colors.primaryLight} />
              <Text style={styles.emailInviteBtnText}>
                {emailInvitesMutation.isPending ? "Sending..." : "Email calendar invite to guests"}
              </Text>
            </Pressable>
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
        {!isFinalized && rec && (rec.bestActivity || rec.bestTime || rec.bestLocation) && (
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
                <Text style={styles.recRowValue}>{addDayOfWeek(rec.bestTime.label)}</Text>
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

        {/* Share buttons (pre-finalization) */}
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

        {/* Personalized per-invitee voting links (prevents impersonation) */}
        {!isFinalized && plan.voterLinks && plan.voterLinks.length > 0 && (
          <View style={styles.inviteeLinksSection}>
            <Text style={styles.inviteeLinksTitle}>Personal invite links</Text>
            <Text style={styles.inviteeLinksSubtitle}>
              Each invitee has their own link so votes can&apos;t be faked under their name.
            </Text>
            {plan.voterLinks.map((vl) => (
              <View key={vl.name} style={styles.inviteeLinkRow}>
                <Text style={styles.inviteeLinkName} numberOfLines={1}>{vl.name}</Text>
                <Pressable
                  onPress={() => handleCopyInviteeLink(vl.name, vl.token)}
                  style={({ pressed }) => [styles.inviteeLinkBtn, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons
                    name={copiedInviteeName === vl.name ? "checkmark" : "copy-outline"}
                    size={14}
                    color={Colors.primaryLight}
                  />
                  <Text style={styles.inviteeLinkBtnText}>
                    {copiedInviteeName === vl.name ? "Copied!" : "Copy"}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* Progress hint: activity locked, time still needed */}
        {activityLocked && timeOptions.length > 0 && (
          <View style={styles.progressHint}>
            <Ionicons name="checkmark-circle" size={15} color={Colors.success} />
            <Text style={styles.progressHintText}>Activity chosen — now lock in a time slot below</Text>
          </View>
        )}

        {/* Results by question type */}
        <SurveySection
          title="Activity"
          options={activityOptions}
          lockedOptionId={plan.finalizedOptionId}
          isFinalized={isFinalized}
          onFinalize={handleFinalizeActivity}
        />
        <SurveySection
          title="When"
          options={timeOptions}
          lockedOptionId={plan.finalizedTimeOptionId}
          isFinalized={isFinalized}
          onFinalize={handleFinalizeTime}
        />
        <SurveySection
          title="Where"
          options={locationOptions}
          lockedOptionId={null}
          isFinalized={isFinalized}
          onFinalize={undefined}
        />

        {/* Individual votes — collapsible, creator-only view */}
        {(() => {
          const allOptions = plan.options || [];
          // Collect all votes across every option
          const allVotes = allOptions.flatMap((opt) =>
            (opt.votes || []).map((v) => ({
              voterName: v.voterName,
              optionLabel: opt.label,
              questionType: opt.questionType,
              rank: v.rank ?? null,
              optionId: opt.id,
            }))
          );
          if (allVotes.length === 0) return null;

          // Build per-voter summaries: { voterName -> sorted votes }
          const voterMap = new Map<string, typeof allVotes>();
          for (const v of allVotes) {
            const key = v.voterName;
            if (!voterMap.has(key)) voterMap.set(key, []);
            voterMap.get(key)!.push(v);
          }
          const voters = Array.from(voterMap.entries()).sort(([a], [b]) =>
            a.localeCompare(b)
          );

          // Label each question type with a readable category name
          const categoryLabel = (qt: string) =>
            qt === "activity" ? "Activity" : qt === "time" ? "When" : qt === "location" ? "Where" : qt;

          const ordinal = (n: number) =>
            n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;

          return (
            <View style={styles.indvSection}>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowIndividualVotes((v) => !v);
                }}
                style={({ pressed }) => [styles.indvToggle, pressed && { opacity: 0.75 }]}
              >
                <Text style={styles.indvToggleText}>
                  Individual votes ({voters.length})
                </Text>
                <Ionicons
                  name={showIndividualVotes ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={Colors.textSecondary}
                />
              </Pressable>

              {showIndividualVotes && (
                <View style={styles.indvBody}>
                  {voters.map(([voterName, voterVotes], vi) => {
                    // Group this voter's picks by question type, sorted by rank
                    const byType = new Map<string, typeof voterVotes>();
                    for (const v of voterVotes) {
                      if (!byType.has(v.questionType)) byType.set(v.questionType, []);
                      byType.get(v.questionType)!.push(v);
                    }
                    // Sort each group by rank ascending (null ranks go last)
                    for (const arr of byType.values()) {
                      arr.sort((a, b) => {
                        if (a.rank === null && b.rank === null) return 0;
                        if (a.rank === null) return 1;
                        if (b.rank === null) return -1;
                        return a.rank - b.rank;
                      });
                    }
                    const typeOrder = ["activity", "time", "location"];
                    const types = typeOrder.filter((t) => byType.has(t));

                    return (
                      <View
                        key={voterName}
                        style={[
                          styles.indvVoterCard,
                          vi < voters.length - 1 && styles.indvVoterCardDivider,
                        ]}
                      >
                        <Text style={styles.indvVoterName}>{voterName}</Text>
                        {types.map((qt) => (
                          <View key={qt} style={styles.indvTypeBlock}>
                            <Text style={styles.indvTypeLabel}>{categoryLabel(qt)}</Text>
                            {byType.get(qt)!.map((v) => (
                              <View key={v.optionId} style={styles.indvPickRow}>
                                {v.rank !== null ? (
                                  <View style={styles.indvRankBadge}>
                                    <Text style={styles.indvRankText}>{ordinal(v.rank)}</Text>
                                  </View>
                                ) : (
                                  <View style={[styles.indvRankBadge, styles.indvRankBadgeSkipped]}>
                                    <Text style={[styles.indvRankText, { color: Colors.textTertiary }]}>—</Text>
                                  </View>
                                )}
                                <Text style={styles.indvPickLabel} numberOfLines={1}>
                                  {v.optionLabel}
                                </Text>
                              </View>
                            ))}
                          </View>
                        ))}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })()}
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
  optionCardLocked: { borderColor: Colors.success + "50", backgroundColor: Colors.success + "06" },
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
  lockedBadge: {
    flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8,
  },
  lockedBadgeText: { fontSize: 12, fontFamily: "Nunito_600SemiBold", color: Colors.success },
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
  finalizedCard: {
    backgroundColor: Colors.success + "10",
    borderRadius: 16, borderWidth: 1, borderColor: Colors.success + "30",
    paddingHorizontal: 16, paddingVertical: 14, marginBottom: 20,
  },
  finalizedCardHeader: {
    flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10,
  },
  finalizedCardTitle: {
    fontSize: 17, fontFamily: "Nunito_800ExtraBold", color: Colors.text, flex: 1,
  },
  finalizedCardDetail: {
    flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 6,
  },
  finalizedCardDetailText: {
    fontSize: 14, fontFamily: "Nunito_600SemiBold", color: Colors.textSecondary, flex: 1,
  },
  finalizedCardActions: {
    flexDirection: "row", gap: 10, marginTop: 12,
  },
  calendarBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 10, borderRadius: 10,
    backgroundColor: Colors.success + "18",
    borderWidth: 1, borderColor: Colors.success + "40",
  },
  calendarBtnText: { fontSize: 13, fontFamily: "Nunito_700Bold", color: Colors.success },
  shareGuestsBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 10, borderRadius: 10,
    backgroundColor: Colors.primary + "15",
    borderWidth: 1, borderColor: Colors.primary + "40",
  },
  shareGuestsBtnText: { fontSize: 13, fontFamily: "Nunito_700Bold", color: Colors.primaryLight },
  emailInviteBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 10, borderRadius: 10, marginTop: 8,
    backgroundColor: Colors.primary + "15",
    borderWidth: 1, borderColor: Colors.primary + "40",
  },
  emailInviteBtnText: { fontSize: 13, fontFamily: "Nunito_700Bold", color: Colors.primaryLight },
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
  inviteeLinksSection: {
    backgroundColor: Colors.primary + "0D",
    borderWidth: 1, borderColor: Colors.primary + "25",
    borderRadius: 14, padding: 14, marginBottom: 20,
  },
  inviteeLinksTitle: { fontSize: 14, fontFamily: "Nunito_700Bold", color: Colors.text, marginBottom: 4 },
  inviteeLinksSubtitle: { fontSize: 12, fontFamily: "Nunito_400Regular", color: Colors.textSecondary, marginBottom: 12 },
  inviteeLinkRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.primary + "15",
  },
  inviteeLinkName: { flex: 1, fontSize: 14, fontFamily: "Nunito_600SemiBold", color: Colors.text, marginRight: 10 },
  inviteeLinkBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: Colors.primary + "15",
  },
  inviteeLinkBtnText: { fontSize: 12, fontFamily: "Nunito_700Bold", color: Colors.primaryLight },
  progressHint: {
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: Colors.success + "10", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 20,
    borderWidth: 1, borderColor: Colors.success + "25",
  },
  progressHintText: {
    fontSize: 13, fontFamily: "Nunito_600SemiBold", color: Colors.success, flex: 1,
  },
  indvSection: {
    marginTop: 8, marginBottom: 32,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  indvToggle: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 14,
  },
  indvToggleText: {
    fontSize: 13, fontFamily: "Nunito_600SemiBold", color: Colors.textSecondary,
  },
  indvBody: {
    backgroundColor: Colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, overflow: "hidden",
  },
  indvVoterCard: { paddingHorizontal: 14, paddingVertical: 12 },
  indvVoterCardDivider: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  indvVoterName: {
    fontSize: 14, fontFamily: "Nunito_700Bold", color: Colors.text, marginBottom: 8,
  },
  indvTypeBlock: { marginBottom: 8 },
  indvTypeLabel: {
    fontSize: 10, fontFamily: "Nunito_700Bold", color: Colors.textTertiary,
    textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4,
  },
  indvPickRow: {
    flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3,
  },
  indvRankBadge: {
    width: 34, height: 20, borderRadius: 5,
    backgroundColor: Colors.primary + "20",
    alignItems: "center", justifyContent: "center",
  },
  indvRankBadgeSkipped: { backgroundColor: Colors.border },
  indvRankText: {
    fontSize: 11, fontFamily: "Nunito_700Bold", color: Colors.primary,
  },
  indvPickLabel: {
    fontSize: 13, fontFamily: "Nunito_400Regular", color: Colors.textSecondary, flex: 1,
  },
});
