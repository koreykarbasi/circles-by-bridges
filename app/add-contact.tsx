import React, { useState, useEffect } from "react";
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
import { DateWheelPicker } from "@/components/DateWheelPicker";
import * as Haptics from "expo-haptics";

const PREDEFINED_LABELS = [
  "Childhood Friend", "College Friend", "Work Friend", "Neighbor",
  "Family Friend", "International Friend", "Gym Buddy", "Travel Buddy", "Creative Partner",
  "Mentor", "Mentee",
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatBirthdayDisplay(birthday: string): string {
  const mmdd = birthday.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!mmdd) return birthday;
  const m = parseInt(mmdd[1], 10) - 1;
  const d = parseInt(mmdd[2], 10);
  if (m < 0 || m > 11) return birthday;
  return `${MONTH_NAMES[m]} ${d}`;
}

export default function AddContactScreen() {
  const insets = useSafeAreaInsets();
  const { addContact, getCircleContacts } = useContacts();
  const params = useLocalSearchParams<{
    circle?: string;
    prefillName?: string;
    prefillPhone?: string;
    prefillBirthday?: string;
    prefillPhotoUri?: string;
  }>();
  const initialCircle = params.circle ? (parseInt(params.circle) as 1 | 2 | 3) : 1;

  const [name, setName] = useState(params.prefillName ?? "");
  const [circleLevel, setCircleLevel] = useState<1 | 2 | 3>(initialCircle);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [customLabelInput, setCustomLabelInput] = useState("");
  const [phone, setPhone] = useState(params.prefillPhone ?? "");
  const [email, setEmail] = useState("");
  const [birthday, setBirthday] = useState(
    params.prefillBirthday ?? (initialCircle === 1 ? "03/23" : ""),
  );
  const [birthdayError, setBirthdayError] = useState(false);
  const [notes, setNotes] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(
    params.prefillPhotoUri ? params.prefillPhotoUri : null,
  );
  const [saving, setSaving] = useState(false);
  const [showBirthdayPicker, setShowBirthdayPicker] = useState(
    !!params.prefillBirthday || initialCircle === 1,
  );
  const [showMoreDetails, setShowMoreDetails] = useState(
    !!(params.prefillPhone),
  );

  useEffect(() => {
    if (circleLevel === 1 && !birthday) {
      setShowBirthdayPicker(true);
    }
  }, [circleLevel]);

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.base64) {
        const estimatedBytes = asset.base64.length * 0.75;
        if (estimatedBytes > 5 * 1024 * 1024) {
          Alert.alert("Photo is too large", "Please choose a smaller image (under 5 MB).");
          return;
        }
        const mimeType = asset.mimeType || "image/jpeg";
        setPhotoUri(`data:${mimeType};base64,${asset.base64}`);
      } else {
        setPhotoUri(asset.uri);
      }
    }
  };

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
      Alert.alert("Name required", "Please enter a name for your contact.");
      return;
    }

    if (circleLevel === 1 && !birthday.trim()) {
      setBirthdayError(true);
      setShowBirthdayPicker(true);
      Alert.alert("Birthday required", "Birthday is required for Core Circle contacts.");
      return;
    }

    const config = CIRCLE_CONFIG[circleLevel];
    const current = getCircleContacts(circleLevel);
    if (current.length >= config.max) {
      Alert.alert(
        "Circle full",
        `${config.label} can have up to ${config.max} people. Move someone to a different circle first.`,
      );
      return;
    }

    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    await addContact({
      name: name.trim(),
      circleLevel,
      interests: selectedInterests,
      labels: selectedLabels,
      birthday: birthday.trim() || undefined,
      notes: notes.trim() || undefined,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      lastContacted: undefined,
      photoUri: photoUri || undefined,
    });

    router.back();
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
          <Ionicons name="close" size={26} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Add Person</Text>
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
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.photoSection}>
          <Pressable onPress={pickPhoto} style={({ pressed }) => [styles.photoPicker, pressed && { opacity: 0.7 }]}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photoImage} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Ionicons name="camera-outline" size={28} color={Colors.primaryLight} />
              </View>
            )}
          </Pressable>
          <Pressable onPress={pickPhoto}>
            <Text style={styles.photoLabel}>{photoUri ? "Change Photo" : "Add Photo"}</Text>
          </Pressable>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter name"
            placeholderTextColor={Colors.textTertiary}
            value={name}
            onChangeText={setName}
            autoFocus={!params.prefillName}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.inputGroup}>
          <View style={styles.birthdayHeader}>
            <Text style={styles.label}>
              Birthday{circleLevel === 1 ? " (required)" : " (optional)"}
            </Text>
            {birthday ? (
              <Pressable
                onPress={() => {
                  setBirthday("");
                  setBirthdayError(false);
                  setShowBirthdayPicker(false);
                }}
                hitSlop={8}
              >
                <Text style={styles.clearText}>Clear</Text>
              </Pressable>
            ) : null}
          </View>

          {!showBirthdayPicker && !birthday ? (
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setShowBirthdayPicker(true);
                if (!birthday) setBirthday("03/23");
              }}
              style={({ pressed }) => [
                styles.birthdayTrigger,
                birthdayError && styles.birthdayTriggerError,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons name="gift-outline" size={18} color={birthdayError ? Colors.danger : Colors.textTertiary} />
              <Text style={[styles.birthdayTriggerText, birthdayError && { color: Colors.danger }]}>
                {birthdayError ? "Birthday is required for Core Circle" : "Set birthday"}
              </Text>
            </Pressable>
          ) : (
            <View>
              {birthday && !showBirthdayPicker && (
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    setShowBirthdayPicker(true);
                  }}
                  style={({ pressed }) => [styles.birthdayDisplay, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons name="gift-outline" size={18} color={Colors.accent} />
                  <Text style={styles.birthdayDisplayText}>{formatBirthdayDisplay(birthday)}</Text>
                  <Ionicons name="pencil-outline" size={15} color={Colors.textTertiary} />
                </Pressable>
              )}
              {showBirthdayPicker && (
                <>
                  {birthday && (
                    <Text style={styles.birthdaySelectedText}>
                      {formatBirthdayDisplay(birthday)}
                    </Text>
                  )}
                  <DateWheelPicker
                    value={birthday || "03/23"}
                    onChange={(val) => {
                      setBirthday(val);
                      if (birthdayError) setBirthdayError(false);
                    }}
                  />
                  {birthdayError && (
                    <Text style={styles.birthdayInlineError}>
                      Birthday is required for Core Circle
                    </Text>
                  )}
                  <Pressable
                    onPress={() => setShowBirthdayPicker(false)}
                    style={({ pressed }) => [styles.pickerDoneBtn, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={styles.pickerDoneText}>Confirm</Text>
                  </Pressable>
                </>
              )}
            </View>
          )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Circle</Text>
          <View style={styles.circleOptions}>
            {([1, 2, 3] as const).map((level) => {
              const cfg = CIRCLE_CONFIG[level];
              const isActive = circleLevel === level;
              const count = getCircleContacts(level).length;
              const isFull = count >= cfg.max && !isActive;
              return (
                <Pressable
                  key={level}
                  onPress={() => {
                    if (isFull) return;
                    Haptics.selectionAsync();
                    setCircleLevel(level);
                  }}
                  style={[
                    styles.circleOption,
                    isActive && { backgroundColor: cfg.color + "15", borderColor: cfg.color + "50" },
                    isFull && { opacity: 0.38 },
                  ]}
                >
                  <View style={[styles.circleOptionDot, { backgroundColor: cfg.color }]} />
                  <Text
                    style={[styles.circleOptionLabel, isActive && { color: cfg.color }]}
                    numberOfLines={1}
                  >
                    {cfg.label}
                  </Text>
                  <Text style={[styles.circleOptionCount, isActive && { color: cfg.color }]}>
                    {isFull ? "Full" : `${count}/${cfg.max}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter email address"
            placeholderTextColor={Colors.textTertiary}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
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
          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            placeholder="Anything to remember about them..."
            placeholderTextColor={Colors.textTertiary}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
          />
        </View>

        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            setShowMoreDetails((v) => !v);
          }}
          style={({ pressed }) => [styles.moreDetailsToggle, pressed && { opacity: 0.7 }]}
        >
          <Ionicons
            name={showMoreDetails ? "chevron-up" : "chevron-down"}
            size={16}
            color={Colors.textTertiary}
          />
          <Text style={styles.moreDetailsText}>
            {showMoreDetails ? "Fewer details" : "Add phone number"}
          </Text>
        </Pressable>

        {showMoreDetails && (
          <View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter phone number"
                placeholderTextColor={Colors.textTertiary}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </View>
          </View>
        )}

        <Pressable
          onPress={handleSave}
          disabled={saving || !name.trim()}
          style={({ pressed }) => [
            styles.saveButton,
            (!name.trim() || saving) && styles.saveButtonDisabled,
            pressed && { opacity: 0.8 },
          ]}
        >
          <Text style={styles.saveButtonText}>
            {saving ? "Saving..." : "Add to Circle"}
          </Text>
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
    paddingTop: 20,
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
  birthdayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  clearText: {
    fontSize: 13,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textTertiary,
  },
  birthdayTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  birthdayTriggerError: {
    borderColor: Colors.danger,
    borderWidth: 1.5,
  },
  birthdayTriggerText: {
    fontSize: 15,
    fontFamily: "Nunito_400Regular",
    color: Colors.textTertiary,
  },
  birthdayDisplay: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.accent + "12",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.accent + "30",
    marginBottom: 10,
  },
  birthdayDisplayText: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.accent,
  },
  birthdaySelectedText: {
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.accent,
    marginBottom: 10,
    textAlign: "center",
  },
  birthdayInlineError: {
    fontSize: 12,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.danger,
    marginTop: 8,
    marginBottom: 4,
  },
  pickerDoneBtn: {
    marginTop: 10,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: Colors.primary + "15",
    borderRadius: 10,
  },
  pickerDoneText: {
    fontSize: 14,
    fontFamily: "Nunito_700Bold",
    color: Colors.primary,
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
  moreDetailsToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
    paddingVertical: 8,
  },
  moreDetailsText: {
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
  },
  photoSection: {
    alignItems: "center",
    marginBottom: 20,
    gap: 8,
  },
  photoPicker: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: "hidden",
  },
  photoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary + "15",
    borderWidth: 2,
    borderColor: Colors.primary + "30",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  photoImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  photoLabel: {
    fontSize: 13,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.primaryLight,
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
});
