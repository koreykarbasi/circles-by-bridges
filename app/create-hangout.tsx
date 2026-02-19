import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, Platform, Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useContacts } from "@/lib/contacts-context";
import { apiRequest } from "@/lib/query-client";
import { queryClient } from "@/lib/query-client";
import { Avatar } from "@/components/Avatar";

interface OptionDraft {
  key: string;
  label: string;
  dateTime: string;
  activity: string;
  location: string;
}

export default function CreateHangoutScreen() {
  const insets = useSafeAreaInsets();
  const { contacts } = useContacts();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [options, setOptions] = useState<OptionDraft[]>([
    { key: "1", label: "", dateTime: "", activity: "", location: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const toggleContact = useCallback((id: string) => {
    Haptics.selectionAsync();
    setSelectedContacts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const addOption = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOptions((prev) => [
      ...prev,
      { key: Date.now().toString(), label: "", dateTime: "", activity: "", location: "" },
    ]);
  }, []);

  const updateOption = useCallback((key: string, field: keyof OptionDraft, value: string) => {
    setOptions((prev) =>
      prev.map((o) => (o.key === key ? { ...o, [field]: value } : o)),
    );
  }, []);

  const removeOption = useCallback((key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOptions((prev) => prev.filter((o) => o.key !== key));
  }, []);

  const canProceedStep1 = title.trim().length > 0;
  const canProceedStep2 = selectedContacts.size > 0;
  const canSubmit = options.some((o) => o.label.trim().length > 0);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const inviteeNames = contacts
        .filter((c) => selectedContacts.has(c.id))
        .map((c) => c.name);

      const validOptions = options
        .filter((o) => o.label.trim())
        .map((o) => ({
          label: o.label.trim(),
          dateTime: o.dateTime.trim() || null,
          activity: o.activity.trim() || null,
          location: o.location.trim() || null,
        }));

      await apiRequest("POST", "/api/hangouts", {
        title: title.trim(),
        description: description.trim() || null,
        inviteeNames,
        options: validOptions,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/hangouts"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err) {
      Alert.alert("Error", "Failed to create hangout. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const renderStep1 = () => (
    <>
      <Text style={styles.stepLabel}>Step 1 of 3</Text>
      <Text style={styles.stepTitle}>What's the plan?</Text>
      <Text style={styles.stepDescription}>Give your hangout a name and optional description.</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Title</Text>
        <TextInput
          style={styles.textInput}
          value={title}
          onChangeText={setTitle}
          placeholder="Saturday brunch, game night..."
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
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setStep(2);
          }}
          disabled={!canProceedStep1}
          style={({ pressed }) => [
            styles.nextButton,
            !canProceedStep1 && styles.nextButtonDisabled,
            pressed && { opacity: 0.8 },
          ]}
        >
          <Text style={styles.nextButtonText}>Next</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </Pressable>
      </View>
    </>
  );

  const renderStep2 = () => (
    <>
      <Text style={styles.stepLabel}>Step 2 of 3</Text>
      <Text style={styles.stepTitle}>Who's invited?</Text>
      <Text style={styles.stepDescription}>Pick friends from your circles to join.</Text>

      <View style={styles.contactsList}>
        {contacts.length === 0 ? (
          <Text style={styles.emptyText}>
            No contacts yet. Add some people to your circles first!
          </Text>
        ) : (
          contacts.map((c) => {
            const selected = selectedContacts.has(c.id);
            return (
              <Pressable
                key={c.id}
                onPress={() => toggleContact(c.id)}
                style={[styles.contactRow, selected && styles.contactRowSelected]}
              >
                <Avatar name={c.name} color={c.avatarColor} size={36} photoUri={c.photoUri} />
                <Text style={styles.contactName} numberOfLines={1}>{c.name}</Text>
                <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                  {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
              </Pressable>
            );
          })
        )}
      </View>

      <View style={styles.bottomActions}>
        <Pressable
          onPress={() => setStep(1)}
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="arrow-back" size={18} color={Colors.textSecondary} />
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setStep(3);
          }}
          disabled={!canProceedStep2}
          style={({ pressed }) => [
            styles.nextButton,
            !canProceedStep2 && styles.nextButtonDisabled,
            pressed && { opacity: 0.8 },
          ]}
        >
          <Text style={styles.nextButtonText}>Next</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </Pressable>
      </View>
    </>
  );

  const renderStep3 = () => (
    <>
      <Text style={styles.stepLabel}>Step 3 of 3</Text>
      <Text style={styles.stepTitle}>Add options to vote on</Text>
      <Text style={styles.stepDescription}>
        Create options your friends can vote on. Add dates, activities, or locations.
      </Text>

      {options.map((opt, idx) => (
        <View key={opt.key} style={styles.optionCard}>
          <View style={styles.optionHeader}>
            <Text style={styles.optionNumber}>Option {idx + 1}</Text>
            {options.length > 1 && (
              <Pressable onPress={() => removeOption(opt.key)}>
                <Ionicons name="close-circle" size={22} color={Colors.danger} />
              </Pressable>
            )}
          </View>
          <TextInput
            style={styles.textInput}
            value={opt.label}
            onChangeText={(v) => updateOption(opt.key, "label", v)}
            placeholder="Option name (e.g. 'Saturday morning')"
            placeholderTextColor={Colors.textTertiary}
          />
          <View style={styles.optionFields}>
            <View style={styles.optionField}>
              <Ionicons name="calendar-outline" size={14} color={Colors.textTertiary} />
              <TextInput
                style={styles.smallInput}
                value={opt.dateTime}
                onChangeText={(v) => updateOption(opt.key, "dateTime", v)}
                placeholder="Date/time"
                placeholderTextColor={Colors.textTertiary}
              />
            </View>
            <View style={styles.optionField}>
              <Ionicons name="sparkles-outline" size={14} color={Colors.textTertiary} />
              <TextInput
                style={styles.smallInput}
                value={opt.activity}
                onChangeText={(v) => updateOption(opt.key, "activity", v)}
                placeholder="Activity"
                placeholderTextColor={Colors.textTertiary}
              />
            </View>
            <View style={styles.optionField}>
              <Ionicons name="location-outline" size={14} color={Colors.textTertiary} />
              <TextInput
                style={styles.smallInput}
                value={opt.location}
                onChangeText={(v) => updateOption(opt.key, "location", v)}
                placeholder="Location"
                placeholderTextColor={Colors.textTertiary}
              />
            </View>
          </View>
        </View>
      ))}

      <Pressable onPress={addOption} style={({ pressed }) => [styles.addOptionButton, pressed && { opacity: 0.7 }]}>
        <Ionicons name="add-circle-outline" size={20} color={Colors.primaryLight} />
        <Text style={styles.addOptionText}>Add another option</Text>
      </Pressable>

      <View style={styles.bottomActions}>
        <Pressable
          onPress={() => setStep(2)}
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
        >
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
          <Ionicons name="paper-plane" size={16} color="#fff" />
          <Text style={styles.nextButtonText}>{submitting ? "Creating..." : "Create"}</Text>
        </Pressable>
      </View>
    </>
  );

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
          <View
            key={s}
            style={[styles.progressSegment, s <= step && styles.progressSegmentActive]}
          />
        ))}
      </View>

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + (Platform.OS === "web" ? 34 : 0) }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
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
  },
  closeButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
  },
  progressBar: {
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  progressSegment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.border,
  },
  progressSegmentActive: {
    backgroundColor: Colors.primary,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  stepLabel: {
    fontSize: 12,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.primary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  stepTitle: {
    fontSize: 24,
    fontFamily: "Nunito_800ExtraBold",
    color: Colors.text,
    marginBottom: 6,
  },
  stepDescription: {
    fontSize: 14,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    marginBottom: 24,
    lineHeight: 20,
  },
  inputGroup: {
    marginBottom: 18,
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Nunito_400Regular",
    color: Colors.text,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  contactsList: {
    gap: 6,
    marginBottom: 20,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    paddingVertical: 30,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  contactRowSelected: {
    borderColor: Colors.primary + "60",
    backgroundColor: Colors.primary + "10",
  },
  contactName: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.text,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  optionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  optionNumber: {
    fontSize: 13,
    fontFamily: "Nunito_700Bold",
    color: Colors.primaryLight,
  },
  optionFields: {
    gap: 8,
    marginTop: 10,
  },
  optionField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  smallInput: {
    flex: 1,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: "Nunito_400Regular",
    color: Colors.text,
  },
  addOptionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    marginBottom: 20,
  },
  addOptionText: {
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.primaryLight,
  },
  bottomActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  backButtonText: {
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
  },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  nextButtonDisabled: {
    opacity: 0.4,
  },
  nextButtonText: {
    fontSize: 15,
    fontFamily: "Nunito_700Bold",
    color: "#fff",
  },
  submitButton: {
    backgroundColor: Colors.success,
  },
});
