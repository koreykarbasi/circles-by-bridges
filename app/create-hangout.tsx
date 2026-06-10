import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, Platform, Alert, Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useContacts } from "@/lib/contacts-context";
import { apiRequest, queryClient } from "@/lib/query-client";
import { Avatar } from "@/components/Avatar";
import { DateWheelPicker } from "@/components/DateWheelPicker";
import { useSequentialHints, HINT_TEXT } from "@/lib/hints-store";
import { HintTooltip } from "@/components/HintTooltip";

type SurveyMode = "standard" | "fixed-activity";

interface OptionDraft {
  key: string;
  label: string;
}

const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function defaultDatetimeLabel(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return `${MONTHS_FULL[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} at 7:00 PM`;
}

export default function CreateHangoutScreen() {
  const insets = useSafeAreaInsets();
  const { contacts } = useContacts();
  const { contactName, prefillTitle } = useLocalSearchParams<{ contactName?: string; prefillTitle?: string }>();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1
  const [title, setTitle] = useState(prefillTitle ?? "");
  const [description, setDescription] = useState("");

  // Step 2
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());

  useEffect(() => {
    const nameParam = Array.isArray(contactName) ? contactName[0] : contactName;
    if (nameParam && contacts.length > 0) {
      const match = contacts.find(
        (c) => c.name.toLowerCase() === nameParam.toLowerCase()
      );
      if (match) {
        setSelectedContacts((prev) => {
          if (prev.has(match.id)) return prev;
          return new Set([match.id]);
        });
      }
    }
  }, [contactName]);

  // Step 3 - survey builder
  const [surveyMode, setSurveyMode] = useState<SurveyMode>("standard");
  const [fixedActivity, setFixedActivity] = useState("");
  const [activityOptions, setActivityOptions] = useState<OptionDraft[]>([
    { key: "a1", label: "" },
    { key: "a2", label: "" },
  ]);
  const [timeOptions, setTimeOptions] = useState<OptionDraft[]>(() => [
    { key: "t1", label: defaultDatetimeLabel(7) },
    { key: "t2", label: defaultDatetimeLabel(14) },
  ]);
  const [expandedTimeKey, setExpandedTimeKey] = useState<string | null>("t1");
  const [locationOptions, setLocationOptions] = useState<OptionDraft[]>([
    { key: "l1", label: "" },
  ]);
  const [includeLocation, setIncludeLocation] = useState(false);
  const [includePlusOne, setIncludePlusOne] = useState(false);
  const [deadline, setDeadline] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const [activeHint, dismissHint] = useSequentialHints(["create_hangout_survey"]);

  const defaultDeadline = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return `${["January","February","March","April","May","June","July","August","September","October","November","December"][d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }, []);

  const toggleContact = useCallback((id: string) => {
    Haptics.selectionAsync();
    setSelectedContacts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const addOption = (setter: React.Dispatch<React.SetStateAction<OptionDraft[]>>, prefix: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setter((prev) => [...prev, { key: prefix + Date.now(), label: "" }]);
  };

  const updateOption = (setter: React.Dispatch<React.SetStateAction<OptionDraft[]>>, key: string, value: string) => {
    setter((prev) => prev.map((o) => (o.key === key ? { ...o, label: value } : o)));
  };

  const removeOption = (setter: React.Dispatch<React.SetStateAction<OptionDraft[]>>, key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setter((prev) => prev.filter((o) => o.key !== key));
  };

  const canProceedStep1 = title.trim().length > 0;
  const canProceedStep2 = selectedContacts.size > 0;
  const canSubmit = (() => {
    const hasTime = timeOptions.length > 0;
    if (surveyMode === "standard") {
      return hasTime && activityOptions.some((o) => o.label.trim().length > 0);
    }
    return hasTime && fixedActivity.trim().length > 0;
  })();

  const removeTimeOption = (key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeOptions((prev) => prev.filter((o) => o.key !== key));
    if (expandedTimeKey === key) setExpandedTimeKey(null);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const inviteeNames = contacts
        .filter((c) => selectedContacts.has(c.id))
        .map((c) => c.name);

      interface OptionPayload { label: string; questionType: string; }
      const options: OptionPayload[] = [];

      if (surveyMode === "standard") {
        activityOptions
          .filter((o) => o.label.trim())
          .forEach((o) => options.push({ label: o.label.trim(), questionType: "activity" }));
      }

      timeOptions
        .filter((o) => o.label.trim())
        .forEach((o) => options.push({ label: o.label.trim(), questionType: "time" }));

      if (surveyMode === "fixed-activity" && includeLocation) {
        locationOptions
          .filter((o) => o.label.trim())
          .forEach((o) => options.push({ label: o.label.trim(), questionType: "location" }));
      }

      await apiRequest("POST", "/api/hangouts", {
        title: title.trim(),
        description: description.trim() || null,
        inviteeNames,
        options,
        surveyMode,
        fixedActivity: surveyMode === "fixed-activity" ? fixedActivity.trim() : null,
        deadline: deadline.trim() || null,
        includePlusOne,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/hangouts"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.startsWith("401:")) {
        Alert.alert("Session expired", "Please log in again.", [
          { text: "OK", onPress: () => router.replace("/auth") },
        ]);
      } else {
        const detail = message.replace(/^\d+:\s*/, "") || "Failed to create survey. Please try again.";
        Alert.alert("Error", detail);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const renderOptionList = (
    opts: OptionDraft[],
    setter: React.Dispatch<React.SetStateAction<OptionDraft[]>>,
    prefix: string,
    placeholder: string,
    maxOptions: number = 5,
  ) => (
    <>
      {opts.map((opt, idx) => (
        <View key={opt.key} style={styles.optionRow}>
          <View style={styles.rankBadge}>
            <Text style={styles.rankBadgeText}>{idx + 1}</Text>
          </View>
          <TextInput
            style={styles.optionInput}
            value={opt.label}
            onChangeText={(v) => updateOption(setter, opt.key, v)}
            placeholder={placeholder}
            placeholderTextColor={Colors.textTertiary}
          />
          {opts.length > 1 && (
            <Pressable onPress={() => removeOption(setter, opt.key)} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color={Colors.danger} />
            </Pressable>
          )}
        </View>
      ))}
      {opts.length < maxOptions && (
        <Pressable
          onPress={() => addOption(setter, prefix)}
          style={({ pressed }) => [styles.addOptionBtn, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="add-circle-outline" size={18} color={Colors.primaryLight} />
          <Text style={styles.addOptionText}>Add option</Text>
        </Pressable>
      )}
    </>
  );

  const renderStep1 = () => (
    <>
      <Text style={styles.stepLabel}>Step 1 of 3</Text>
      <Text style={styles.stepTitle}>Name your hangout</Text>
      <Text style={styles.stepDescription}>Give it a title and optional description.</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Title</Text>
        <TextInput
          style={styles.textInput}
          value={title}
          onChangeText={setTitle}
          placeholder="Saturday brunch, birthday party..."
          placeholderTextColor={Colors.textTertiary}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Description (optional)</Text>
        <TextInput
          style={[styles.textInput, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Any extra details..."
          placeholderTextColor={Colors.textTertiary}
          multiline
          numberOfLines={3}
        />
      </View>

      <View style={styles.bottomActions}>
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setStep(2); }}
          disabled={!canProceedStep1}
          style={({ pressed }) => [styles.nextButton, !canProceedStep1 && styles.nextButtonDisabled, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.nextButtonText}>Next</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </Pressable>
      </View>
    </>
  );

  const sortedContacts = useMemo(() =>
    [...contacts].sort((a, b) => {
      if (a.circleLevel !== b.circleLevel) return a.circleLevel - b.circleLevel;
      return a.name.localeCompare(b.name);
    }),
    [contacts]
  );

  const renderStep2 = () => (
    <>
      <Text style={styles.stepLabel}>Step 2 of 3</Text>
      <Text style={styles.stepTitle}>Who's invited?</Text>
      <Text style={styles.stepDescription}>Select friends from your circles.</Text>

      <View style={styles.contactsList}>
        {sortedContacts.length === 0 ? (
          <Text style={styles.emptyText}>No contacts yet. Add people to your circles first.</Text>
        ) : (
          sortedContacts.map((c) => {
            const selected = selectedContacts.has(c.id);
            const badge = CIRCLE_BADGE[c.circleLevel];
            return (
              <Pressable
                key={c.id}
                onPress={() => toggleContact(c.id)}
                style={[styles.contactRow, selected && styles.contactRowSelected]}
              >
                <Avatar name={c.name} color={c.avatarColor} size={36} photoUri={c.photoUri} />
                <Text style={styles.contactName} numberOfLines={1}>{c.name}</Text>
                {badge && (
                  <View style={[styles.circleBadge, { backgroundColor: badge.color + "22", borderColor: badge.color + "55" }]}>
                    <Text style={[styles.circleBadgeText, { color: badge.color }]}>{badge.label}</Text>
                  </View>
                )}
                <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                  {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
              </Pressable>
            );
          })
        )}
      </View>
    </>
  );

  const renderStep3 = () => (
    <>
      <Text style={styles.stepLabel}>Step 3 of 3</Text>
      <Text style={styles.stepTitle}>Build the survey</Text>
      <Text style={styles.stepDescription}>Set up what your friends will rank and vote on.</Text>

      {/* Activity mode toggle */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionCardTitle}>Activity</Text>
        <View style={styles.modeToggleRow}>
          <Pressable
            onPress={() => { Haptics.selectionAsync(); setSurveyMode("standard"); }}
            style={[styles.modeToggleBtn, surveyMode === "standard" && styles.modeToggleBtnActive]}
          >
            <Text style={[styles.modeToggleBtnText, surveyMode === "standard" && styles.modeToggleBtnTextActive]}>
              Multiple options
            </Text>
          </Pressable>
          <Pressable
            onPress={() => { Haptics.selectionAsync(); setSurveyMode("fixed-activity"); }}
            style={[styles.modeToggleBtn, surveyMode === "fixed-activity" && styles.modeToggleBtnActive]}
          >
            <Text style={[styles.modeToggleBtnText, surveyMode === "fixed-activity" && styles.modeToggleBtnTextActive]}>
              Fixed activity
            </Text>
          </Pressable>
        </View>

        {surveyMode === "standard" ? (
          <>
            <Text style={styles.fieldHint}>Friends will rank these options (3–5 max)</Text>
            {renderOptionList(activityOptions, setActivityOptions, "a", "e.g. Bowling, dinner, park...", 5)}
          </>
        ) : (
          <>
            <Text style={styles.fieldHint}>Activity is already decided</Text>
            <TextInput
              style={styles.textInput}
              value={fixedActivity}
              onChangeText={setFixedActivity}
              placeholder="e.g. My birthday, Canada Day BBQ..."
              placeholderTextColor={Colors.textTertiary}
            />
          </>
        )}
      </View>

      {/* Time options — datetime picker accordion */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionCardTitle}>When</Text>
        <Text style={styles.fieldHint}>Add time options for friends to vote on</Text>
        {timeOptions.map((opt, idx) => {
          const isExpanded = expandedTimeKey === opt.key;
          return (
            <View key={opt.key} style={styles.timeOptionItem}>
              {/* Row: toggle area + delete button as siblings to avoid nested Pressable issues */}
              <View style={[styles.timeOptionRow, isExpanded && styles.timeOptionRowExpanded]}>
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    setExpandedTimeKey(isExpanded ? null : opt.key);
                  }}
                  style={({ pressed }) => [
                    styles.timeOptionToggle,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankBadgeText}>{idx + 1}</Text>
                  </View>
                  <Text style={styles.timeOptionLabel} numberOfLines={1}>
                    {opt.label || "Pick a date and time"}
                  </Text>
                  <Ionicons
                    name={isExpanded ? "chevron-up" : "chevron-down"}
                    size={15}
                    color={Colors.textTertiary}
                  />
                </Pressable>
                {timeOptions.length > 1 && (
                  <Pressable
                    onPress={() => removeTimeOption(opt.key)}
                    hitSlop={10}
                    style={{ paddingLeft: 8 }}
                  >
                    <Ionicons name="close-circle" size={20} color={Colors.danger} />
                  </Pressable>
                )}
              </View>
              {isExpanded && (
                <View style={{ marginTop: 10, marginBottom: 4 }}>
                  <DateWheelPicker
                    mode="datetime"
                    value={opt.label}
                    onChange={(val) => updateOption(setTimeOptions, opt.key, val)}
                  />
                </View>
              )}
            </View>
          );
        })}
        {timeOptions.length < 5 && (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              const key = "t" + Date.now();
              const label = defaultDatetimeLabel(7 + timeOptions.length * 7);
              setTimeOptions((prev) => [...prev, { key, label }]);
              setExpandedTimeKey(key);
            }}
            style={({ pressed }) => [styles.addOptionBtn, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="add-circle-outline" size={18} color={Colors.primaryLight} />
            <Text style={styles.addOptionText}>Add time option</Text>
          </Pressable>
        )}
      </View>

      {/* Location options - only for fixed activity */}
      {surveyMode === "fixed-activity" && (
        <View style={styles.sectionCard}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionCardTitle}>Where (optional)</Text>
              <Text style={styles.fieldHint}>Let friends vote on the location too</Text>
            </View>
            <Switch
              value={includeLocation}
              onValueChange={(v) => { Haptics.selectionAsync(); setIncludeLocation(v); }}
              trackColor={{ false: Colors.border, true: Colors.primary + "60" }}
              thumbColor={includeLocation ? Colors.primary : Colors.textTertiary}
            />
          </View>
          {includeLocation && (
            <View style={{ marginTop: 12 }}>
              {renderOptionList(locationOptions, setLocationOptions, "l", "e.g. My place, John's house...", 5)}
            </View>
          )}
        </View>
      )}

      {/* Plus one */}
      <View style={styles.sectionCard}>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionCardTitle}>Plus one</Text>
            <Text style={styles.fieldHint}>Ask friends if they're bringing guests</Text>
          </View>
          <Switch
            value={includePlusOne}
            onValueChange={(v) => { Haptics.selectionAsync(); setIncludePlusOne(v); }}
            trackColor={{ false: Colors.border, true: Colors.primary + "60" }}
            thumbColor={includePlusOne ? Colors.primary : Colors.textTertiary}
          />
        </View>
      </View>

      {/* Deadline */}
      <View style={styles.sectionCard}>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionCardTitle}>Voting deadline (optional)</Text>
            <Text style={styles.fieldHint}>Closes voting automatically after this date</Text>
          </View>
          <Switch
            value={deadline !== ""}
            onValueChange={(v) => {
              Haptics.selectionAsync();
              setDeadline(v ? defaultDeadline : "");
            }}
            trackColor={{ false: Colors.border, true: Colors.primary + "60" }}
            thumbColor={deadline !== "" ? Colors.primary : Colors.textTertiary}
          />
        </View>
        {deadline !== "" && (
          <View style={{ marginTop: 12 }}>
            <DateWheelPicker
              mode="deadline"
              value={deadline}
              onChange={setDeadline}
            />
          </View>
        )}
      </View>

      <View style={styles.bottomActions}>
        <Pressable onPress={() => setStep(2)} style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}>
          <Ionicons name="arrow-back" size={18} color={Colors.textSecondary} />
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit || submitting}
          style={({ pressed }) => [
            styles.nextButton,
            styles.submitButton,
            (!canSubmit || submitting) && styles.nextButtonDisabled,
            pressed && { opacity: 0.8 },
          ]}
        >
          <Ionicons name="link-outline" size={16} color="#fff" />
          <Text style={styles.nextButtonText}>{submitting ? "Creating..." : "Create survey"}</Text>
        </Pressable>
      </View>
    </>
  );

  const step2FooterBottom = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  return (
    <View style={styles.screen}>
      <View style={[styles.headerBar, { paddingTop: insets.top + 8 + webTopInset }]}>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Plan a Hangout</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.progressBar}>
        {[1, 2, 3].map((s) => (
          <View key={s} style={[styles.progressSegment, s <= step && styles.progressSegmentActive]} />
        ))}
      </View>

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: step === 2 ? 80 + step2FooterBottom : 40 + (Platform.OS === "web" ? 34 : 0) },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </ScrollView>

      {step === 2 && (
        <View style={[styles.stickyFooter, { paddingBottom: step2FooterBottom + 8 }]}>
          <Pressable onPress={() => setStep(1)} style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}>
            <Ionicons name="arrow-back" size={18} color={Colors.textSecondary} />
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setStep(3); }}
            disabled={!canProceedStep2}
            style={({ pressed }) => [styles.nextButton, !canProceedStep2 && styles.nextButtonDisabled, pressed && { opacity: 0.8 }]}
          >
            <Text style={styles.nextButtonText}>Next</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </Pressable>
        </View>
      )}

      <HintTooltip
        visible={step === 3 && activeHint === "create_hangout_survey"}
        text={HINT_TEXT.create_hangout_survey}
        onDismiss={dismissHint}
        bottomOffset={20}
      />
    </View>
  );
}

const CIRCLE_BADGE: Record<number, { label: string; color: string }> = {
  1: { label: "Core", color: "#FF6B8A" },
  2: { label: "Close", color: "#9B7DFF" },
  3: { label: "Friend", color: "#4ECDC4" },
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  headerBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 12, backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  closeButton: { padding: 4 },
  headerTitle: { fontSize: 17, fontFamily: "Nunito_700Bold", color: Colors.text },
  progressBar: { flexDirection: "row", gap: 4, paddingHorizontal: 20, paddingVertical: 12 },
  progressSegment: { flex: 1, height: 3, borderRadius: 2, backgroundColor: Colors.border },
  progressSegmentActive: { backgroundColor: Colors.primary },
  scrollContainer: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },
  stepLabel: {
    fontSize: 12, fontFamily: "Nunito_600SemiBold", color: Colors.primary,
    textTransform: "uppercase", letterSpacing: 1, marginBottom: 6,
  },
  stepTitle: { fontSize: 24, fontFamily: "Nunito_800ExtraBold", color: Colors.text, marginBottom: 6 },
  stepDescription: {
    fontSize: 14, fontFamily: "Nunito_400Regular", color: Colors.textSecondary,
    marginBottom: 24, lineHeight: 20,
  },
  inputGroup: { marginBottom: 18 },
  inputLabel: { fontSize: 13, fontFamily: "Nunito_600SemiBold", color: Colors.textSecondary, marginBottom: 6 },
  textInput: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: "Nunito_400Regular", color: Colors.text,
  },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  sectionCard: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: Colors.border,
  },
  sectionCardTitle: {
    fontSize: 15, fontFamily: "Nunito_700Bold", color: Colors.text, marginBottom: 4,
  },
  fieldHint: {
    fontSize: 12, fontFamily: "Nunito_400Regular", color: Colors.textTertiary,
    marginBottom: 12, lineHeight: 16,
  },
  modeToggleRow: {
    flexDirection: "row", gap: 8, marginBottom: 14,
  },
  modeToggleBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: "center", backgroundColor: Colors.background,
  },
  modeToggleBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + "15" },
  modeToggleBtnText: { fontSize: 13, fontFamily: "Nunito_600SemiBold", color: Colors.textSecondary },
  modeToggleBtnTextActive: { color: Colors.primaryLight },
  optionRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  rankBadge: {
    width: 26, height: 26, borderRadius: 8, backgroundColor: Colors.primary + "20",
    alignItems: "center", justifyContent: "center",
  },
  rankBadgeText: { fontSize: 12, fontFamily: "Nunito_800ExtraBold", color: Colors.primaryLight },
  optionInput: {
    flex: 1, backgroundColor: Colors.surfaceElevated, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9, fontSize: 14,
    fontFamily: "Nunito_400Regular", color: Colors.text,
  },
  addOptionBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 8, marginTop: 2,
  },
  addOptionText: { fontSize: 13, fontFamily: "Nunito_600SemiBold", color: Colors.primaryLight },
  timeOptionItem: { marginBottom: 8 },
  timeOptionRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: Colors.surfaceElevated, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  timeOptionRowExpanded: {
    borderColor: Colors.primary + "60",
    backgroundColor: Colors.primary + "0C",
  },
  timeOptionToggle: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 10,
  },
  timeOptionLabel: {
    flex: 1, fontSize: 14, fontFamily: "Nunito_600SemiBold", color: Colors.text,
  },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  contactsList: { gap: 6, marginBottom: 20 },
  emptyText: {
    fontSize: 14, fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary, textAlign: "center", paddingVertical: 30,
  },
  contactRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  contactRowSelected: { borderColor: Colors.primary + "60", backgroundColor: Colors.primary + "10" },
  contactName: { flex: 1, fontSize: 15, fontFamily: "Nunito_600SemiBold", color: Colors.text },
  circleBadge: {
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
    borderWidth: 1, marginRight: 4,
  },
  circleBadgeText: { fontSize: 11, fontFamily: "Nunito_700Bold" },
  checkbox: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2,
    borderColor: Colors.border, alignItems: "center", justifyContent: "center",
  },
  checkboxSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  bottomActions: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  stickyFooter: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingTop: 12,
    backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  backButton: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingVertical: 10, paddingHorizontal: 14,
  },
  backButtonText: { fontSize: 14, fontFamily: "Nunito_600SemiBold", color: Colors.textSecondary },
  nextButton: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: Colors.primary, paddingVertical: 12,
    paddingHorizontal: 24, borderRadius: 12,
  },
  nextButtonDisabled: { opacity: 0.4 },
  nextButtonText: { fontSize: 15, fontFamily: "Nunito_700Bold", color: "#fff" },
  submitButton: { backgroundColor: Colors.primary },
});
