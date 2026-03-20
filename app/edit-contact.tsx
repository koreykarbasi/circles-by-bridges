import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  Platform,
  Alert,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { useContacts } from "@/lib/contacts-context";
import { CIRCLE_CONFIG } from "@/lib/types";
import { AVAILABLE_INTERESTS } from "@/lib/prompts";
import { formatLastContacted } from "@/lib/helpers";
import { Avatar } from "@/components/Avatar";
import * as Haptics from "expo-haptics";

const PREDEFINED_LABELS = [
  "Childhood Friend", "College Friend", "Work Friend", "Neighbor",
  "Family Friend", "Gym Buddy", "Travel Buddy", "Creative Partner",
  "Mentor", "Mentee",
];

export default function EditContactScreen() {
  const insets = useSafeAreaInsets();
  const { id, focusBirthday } = useLocalSearchParams<{ id: string; focusBirthday?: string }>();
  const { contacts, updateContact, deleteContact, markContacted, getCircleContacts } = useContacts();

  const contact = contacts.find((c) => c.id === id);

  const [name, setName] = useState(contact?.name ?? "");
  const [circleLevel, setCircleLevel] = useState<1 | 2 | 3>((contact?.circleLevel ?? 1) as 1 | 2 | 3);
  const [selectedInterests, setSelectedInterests] = useState<string[]>(contact?.interests ?? []);
  const [selectedLabels, setSelectedLabels] = useState<string[]>(contact?.labels ?? []);
  const [customLabelInput, setCustomLabelInput] = useState("");
  const [birthday, setBirthday] = useState(contact?.birthday ?? "");
  const [birthdayError, setBirthdayError] = useState(false);
  const [notes, setNotes] = useState(contact?.notes ?? "");
  const [photoUri, setPhotoUri] = useState<string | null>(contact?.photoUri ?? null);
  const [saving, setSaving] = useState(false);

  const birthdayInputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (focusBirthday === "true") {
      const timer = setTimeout(() => {
        birthdayInputRef.current?.focus();
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [focusBirthday]);

  const handlePickPhoto = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      const dataUri = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setPhotoUri(dataUri);
    }
  };

  if (!contact) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 60 }]}>
        <Text style={styles.errorText}>Contact not found</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backLink}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const toggleInterest = (interest: string) => {
    Haptics.selectionAsync();
    setSelectedInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest],
    );
  };

  const toggleLabel = (label: string) => {
    Haptics.selectionAsync();
    setSelectedLabels((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label],
    );
  };

  const addCustomLabel = () => {
    const trimmed = customLabelInput.trim();
    if (trimmed && !selectedLabels.includes(trimmed)) {
      Haptics.selectionAsync();
      setSelectedLabels((prev) => [...prev, trimmed]);
      setCustomLabelInput("");
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Name required", "Please enter a name.");
      return;
    }

    if (circleLevel === 1 && !birthday.trim()) {
      setBirthdayError(true);
      Alert.alert("Birthday required", "Birthday is required for Core Circle contacts.");
      return;
    }

    if (circleLevel !== contact.circleLevel) {
      const config = CIRCLE_CONFIG[circleLevel];
      const current = getCircleContacts(circleLevel).filter((c) => c.id !== contact.id);
      if (current.length >= config.max) {
        Alert.alert("Circle full", `${config.label} can have up to ${config.max} people.`);
        return;
      }
    }

    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    await updateContact({
      ...contact,
      name: name.trim(),
      circleLevel,
      interests: selectedInterests,
      labels: selectedLabels,
      birthday: birthday.trim() || undefined,
      notes: notes.trim() || undefined,
      photoUri,
    });

    router.back();
  };

  const handleDelete = () => {
    Alert.alert(
      "Remove Contact",
      `Remove ${contact.name} from your circles?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await deleteContact(contact.id);
            router.back();
          },
        },
      ],
    );
  };

  const handleMarkContacted = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    markContacted(contact.id);
  };

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  return (
    <View style={styles.container}>
      <View style={[styles.headerBar, { paddingTop: insets.top + 8 + webTopInset }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [pressed && { opacity: 0.5 }]}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Edit</Text>
        <Pressable
          onPress={handleSave}
          disabled={saving || !name.trim()}
          style={({ pressed }) => [pressed && { opacity: 0.5 }]}
        >
          <Ionicons
            name="checkmark"
            size={26}
            color={!name.trim() ? Colors.textTertiary : Colors.primary}
          />
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.photoSection}>
          <Pressable onPress={handlePickPhoto} style={({ pressed }) => [pressed && { opacity: 0.8 }]}>
            <View style={styles.photoWrapper}>
              <Avatar name={contact.name} color={contact.avatarColor} size={72} photoUri={photoUri} />
              <View style={styles.photoCameraIcon}>
                <Ionicons name="camera" size={14} color="#fff" />
              </View>
            </View>
          </Pressable>
        </View>

        <View style={styles.contactMeta}>
          <Text style={styles.lastContactLabel}>
            Last contacted: {formatLastContacted(contact.lastContacted ?? undefined)}
          </Text>
          <Pressable
            onPress={handleMarkContacted}
            style={({ pressed }) => [styles.markContactedBtn, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="checkmark-circle-outline" size={18} color={Colors.primary} />
            <Text style={styles.markContactedText}>Mark as contacted</Text>
          </Pressable>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Circle</Text>
          <View style={styles.circleOptions}>
            {([1, 2, 3] as const).map((level) => {
              const cfg = CIRCLE_CONFIG[level];
              const isActive = circleLevel === level;
              const count = getCircleContacts(level).filter((c) => c.id !== contact.id).length;
              return (
                <Pressable
                  key={level}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setCircleLevel(level);
                  }}
                  style={[
                    styles.circleOption,
                    isActive && { backgroundColor: cfg.color + "15", borderColor: cfg.color + "50" },
                  ]}
                >
                  <View style={[styles.circleOptionDot, { backgroundColor: cfg.color }]} />
                  <Text style={[styles.circleOptionLabel, isActive && { color: cfg.color }]} numberOfLines={1}>
                    {cfg.label}
                  </Text>
                  <Text style={[styles.circleOptionCount, isActive && { color: cfg.color }]}>
                    {count}/{cfg.max}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Shared Interests</Text>
          <View style={styles.interestsGrid}>
            {AVAILABLE_INTERESTS.map((interest) => {
              const isSelected = selectedInterests.includes(interest);
              return (
                <Pressable
                  key={interest}
                  onPress={() => toggleInterest(interest)}
                  style={[
                    styles.interestChip,
                    isSelected && styles.interestChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.interestChipText,
                      isSelected && styles.interestChipTextActive,
                    ]}
                  >
                    {interest}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Labels</Text>
          <View style={styles.interestsGrid}>
            {PREDEFINED_LABELS.map((label) => {
              const isSelected = selectedLabels.includes(label);
              return (
                <Pressable
                  key={label}
                  onPress={() => toggleLabel(label)}
                  style={[
                    styles.labelChip,
                    isSelected && styles.labelChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.labelChipText,
                      isSelected && styles.labelChipTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
            {selectedLabels
              .filter((l) => !PREDEFINED_LABELS.includes(l))
              .map((label) => (
                <Pressable
                  key={label}
                  onPress={() => toggleLabel(label)}
                  style={[styles.labelChip, styles.labelChipActive]}
                >
                  <Text style={[styles.labelChipText, styles.labelChipTextActive]}>
                    {label}
                  </Text>
                  <Ionicons name="close-circle" size={14} color={Colors.accent} style={{ marginLeft: 4 }} />
                </Pressable>
              ))}
          </View>
          <View style={styles.customLabelRow}>
            <TextInput
              style={[styles.input, styles.customLabelInput]}
              placeholder="Add custom label..."
              placeholderTextColor={Colors.textTertiary}
              value={customLabelInput}
              onChangeText={setCustomLabelInput}
              onSubmitEditing={addCustomLabel}
              returnKeyType="done"
            />
            <Pressable
              onPress={addCustomLabel}
              disabled={!customLabelInput.trim()}
              style={({ pressed }) => [
                styles.addLabelBtn,
                !customLabelInput.trim() && styles.addLabelBtnDisabled,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons name="add" size={20} color={!customLabelInput.trim() ? Colors.textTertiary : Colors.accent} />
            </Pressable>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Birthday{circleLevel === 1 ? " (required)" : ""}
          </Text>
          <TextInput
            ref={birthdayInputRef}
            style={[styles.input, birthdayError && styles.inputError]}
            placeholder="MM/DD (e.g. 03/15)"
            placeholderTextColor={Colors.textTertiary}
            value={birthday}
            onChangeText={(text) => {
              setBirthday(text);
              if (birthdayError) setBirthdayError(false);
            }}
            keyboardType="numbers-and-punctuation"
          />
          {birthdayError && (
            <Text style={styles.errorHint}>Birthday is required for Core Circle</Text>
          )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            placeholder="Anything to remember..."
            placeholderTextColor={Colors.textTertiary}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
          />
        </View>

        <Pressable
          onPress={handleSave}
          disabled={saving || !name.trim()}
          style={({ pressed }) => [
            styles.saveButton,
            (!name.trim() || saving) && styles.saveButtonDisabled,
            pressed && { opacity: 0.8 },
          ]}
        >
          <Text style={styles.saveButtonText}>{saving ? "Saving..." : "Save Changes"}</Text>
        </Pressable>

        <Pressable
          onPress={handleDelete}
          style={({ pressed }) => [styles.deleteButton, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="trash-outline" size={18} color={Colors.danger} />
          <Text style={styles.deleteButtonText}>Remove from circles</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    backgroundColor: Colors.background,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  contactMeta: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 14,
    padding: 14,
    marginBottom: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  lastContactLabel: {
    fontSize: 13,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    flex: 1,
  },
  markContactedBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: Colors.primary + "12",
  },
  markContactedText: {
    fontSize: 12,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.primary,
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: "Nunito_400Regular",
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  circleOptions: {
    gap: 8,
  },
  circleOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    gap: 10,
  },
  circleOptionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  circleOptionLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.text,
  },
  circleOptionCount: {
    fontSize: 13,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textTertiary,
  },
  interestsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  interestChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  interestChipActive: {
    backgroundColor: Colors.primary + "15",
    borderColor: Colors.primary + "40",
  },
  interestChipText: {
    fontSize: 13,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
  },
  interestChipTextActive: {
    color: Colors.primary,
  },
  labelChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    flexDirection: "row" as const,
    alignItems: "center" as const,
  },
  labelChipActive: {
    backgroundColor: Colors.accent + "15",
    borderColor: Colors.accent + "40",
  },
  labelChipText: {
    fontSize: 13,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
  },
  labelChipTextActive: {
    color: Colors.accent,
  },
  customLabelRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    marginTop: 10,
  },
  customLabelInput: {
    flex: 1,
  },
  addLabelBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.accent + "40",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  addLabelBtnDisabled: {
    borderColor: Colors.borderLight,
  },
  inputError: {
    borderColor: Colors.danger,
    borderWidth: 1.5,
  },
  errorHint: {
    fontSize: 12,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.danger,
    marginTop: 6,
  },
  saveButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
  },
  saveButtonDisabled: {
    backgroundColor: Colors.primaryMuted,
  },
  saveButtonText: {
    fontSize: 16,
    fontFamily: "Nunito_700Bold",
    color: "#fff",
  },
  photoSection: {
    alignItems: "center",
    marginBottom: 20,
  },
  photoWrapper: {
    position: "relative",
  },
  photoCameraIcon: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.background,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 16,
    marginTop: 16,
  },
  deleteButtonText: {
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.danger,
  },
  errorText: {
    fontSize: 16,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
    textAlign: "center",
  },
  backLink: {
    fontSize: 15,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.primary,
    textAlign: "center",
    marginTop: 12,
  },
});
