import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  Platform,
  Alert,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { useContacts } from "@/lib/contacts-context";
import { CIRCLE_CONFIG } from "@/lib/types";
import type { CustomReminder } from "@/lib/types";
import { AVAILABLE_INTERESTS } from "@/lib/prompts";
import { formatLastContacted } from "@/lib/helpers";
import { Avatar } from "@/components/Avatar";
import { DateWheelPicker } from "@/components/DateWheelPicker";
import * as Haptics from "expo-haptics";

const PREDEFINED_LABELS = [
  "Family", "Childhood Friend", "College Friend", "Work Friend", "Neighbor",
  "Family Friend", "International Friend", "Gym Buddy", "Travel Buddy",
  "Mentor",
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

function formatCustomReminderDate(date: string): string {
  return formatBirthdayDisplay(date);
}

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
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [birthday, setBirthday] = useState(contact?.birthday ?? "");
  const [birthdayError, setBirthdayError] = useState(false);
  const [notes, setNotes] = useState(contact?.notes ?? "");
  const [photoUri, setPhotoUri] = useState<string | null>(contact?.photoUri ?? null);
  const [saving, setSaving] = useState(false);
  const [showBirthdayPicker, setShowBirthdayPicker] = useState(focusBirthday === "true");
  const [showMoreDetails, setShowMoreDetails] = useState(!!(contact?.phone || contact?.email));
  const [customReminders, setCustomReminders] = useState<CustomReminder[]>(
    (contact?.customReminders ?? []).filter((r) => r && r.label && r.date)
  );
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [newReminderLabel, setNewReminderLabel] = useState("");
  const [newReminderDate, setNewReminderDate] = useState("03/23");

  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (focusBirthday === "true") {
      setShowBirthdayPicker(true);
      const timer = setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [focusBirthday]);

  const handlePickPhoto = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.4,
        base64: true,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        if (asset.base64) {
          setPhotoUri(`data:image/jpeg;base64,${asset.base64}`);
        }
      }
    } catch {
      Alert.alert("Photo error", "Could not process the photo. Please try a different image.");
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
      setShowBirthdayPicker(true);
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
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      photoUri,
      customReminders,
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

  const QUICK_CONTACT_CHIPS: Array<{ label: string; daysAgo: number }> = [
    { label: "Today", daysAgo: 0 },
    { label: "This week", daysAgo: 4 },
    { label: "This month", daysAgo: 14 },
    { label: "Earlier this year", daysAgo: 120 },
  ];

  const handleQuickContact = useCallback(async (label: string, daysAgo: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    try {
      await markContacted(contact.id, date, label);
    } catch {
      Alert.alert("Could not save", "Failed to update last contacted. Please try again.");
    }
  }, [contact.id, markContacted]);

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
          <View style={styles.contactMetaHeader}>
            <Text style={styles.lastContactLabel}>Last contacted</Text>
            <Text style={styles.lastContactValue}>
              {contact.lastContactedLabel ?? formatLastContacted(contact.lastContacted ?? undefined)}
            </Text>
          </View>
          <View style={styles.quickContactRow}>
            {QUICK_CONTACT_CHIPS.map(({ label, daysAgo }) => {
              const currentLabel = contact.lastContactedLabel ?? formatLastContacted(contact.lastContacted ?? undefined);
              const isSelected = currentLabel === label;
              return (
                <Pressable
                  key={label}
                  onPress={() => handleQuickContact(label, daysAgo)}
                  style={({ pressed }) => [
                    styles.quickChip,
                    isSelected && styles.quickChipSelected,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={[styles.quickChipText, isSelected && styles.quickChipTextSelected]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
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
          <View style={styles.birthdayHeader}>
            <Text style={styles.label}>
              Birthday{circleLevel === 1 ? " (required)" : ""}
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
              const count = getCircleContacts(level).filter((c) => c.id !== contact.id).length;
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
                  <Text style={[styles.circleOptionLabel, isActive && { color: cfg.color }]} numberOfLines={1}>
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
          <Text style={styles.label}>Email</Text>
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
          <Text style={styles.label}>Custom Reminders</Text>
          {customReminders.map((cr, idx) => (
            <View key={`${cr.label}-${idx}`} style={styles.customReminderChip}>
              <Ionicons name="star-outline" size={14} color={Colors.primary} />
              <Text style={styles.customReminderChipText} numberOfLines={1}>
                {cr.label}
              </Text>
              <Text style={styles.customReminderChipDate}>
                {formatCustomReminderDate(cr.date)}
              </Text>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setCustomReminders((prev) => prev.filter((_, i) => i !== idx));
                }}
                hitSlop={8}
                style={({ pressed }) => [pressed && { opacity: 0.5 }]}
              >
                <Ionicons name="close-circle" size={16} color={Colors.textTertiary} />
              </Pressable>
            </View>
          ))}

          {!showAddReminder ? (
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setShowAddReminder(true);
                setNewReminderLabel("");
                setNewReminderDate("03/23");
              }}
              style={({ pressed }) => [styles.addReminderBtn, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
              <Text style={styles.addReminderBtnText}>Add reminder</Text>
            </Pressable>
          ) : (
            <View style={styles.addReminderForm}>
              <TextInput
                style={[styles.input, styles.reminderLabelInput]}
                placeholder="Name (e.g. Wedding anniversary)"
                placeholderTextColor={Colors.textTertiary}
                value={newReminderLabel}
                onChangeText={setNewReminderLabel}
                autoFocus
                returnKeyType="done"
              />
              <Text style={styles.reminderDateLabel}>Date (month and day)</Text>
              <DateWheelPicker
                value={newReminderDate}
                onChange={setNewReminderDate}
                mode="birthday"
              />
              <View style={styles.addReminderActions}>
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    setShowAddReminder(false);
                    setNewReminderLabel("");
                  }}
                  style={({ pressed }) => [styles.addReminderCancel, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.addReminderCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    const trimmed = newReminderLabel.trim();
                    if (!trimmed) {
                      Alert.alert("Name required", "Please enter a name for this reminder.");
                      return;
                    }
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    setCustomReminders((prev) => [...prev, { label: trimmed, date: newReminderDate }]);
                    setShowAddReminder(false);
                    setNewReminderLabel("");
                    setNewReminderDate("03/23");
                  }}
                  style={({ pressed }) => [styles.addReminderSave, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.addReminderSaveText}>Save</Text>
                </Pressable>
              </View>
            </View>
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
              <Text style={styles.label}>Phone</Text>
              <View style={styles.phoneRow}>
                <TextInput
                  style={[styles.input, styles.phoneInput]}
                  placeholder="Enter phone number"
                  placeholderTextColor={Colors.textTertiary}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                />
                {phone.trim().length > 0 && (
                  <Pressable
                    onPress={() => {
                      const cleaned = phone.replace(/\s/g, "");
                      Linking.openURL(`tel:${cleaned}`);
                    }}
                    style={({ pressed }) => [styles.callButton, pressed && { opacity: 0.7 }]}
                  >
                    <Ionicons name="call" size={20} color="#fff" />
                  </Pressable>
                )}
              </View>
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
    backgroundColor: Colors.primary + "0D",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.primary + "20",
  },
  contactMetaHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  lastContactLabel: {
    fontSize: 12,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  lastContactValue: {
    fontSize: 13,
    fontFamily: "Nunito_700Bold",
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
  phoneRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  phoneInput: {
    flex: 1,
  },
  callButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.success,
    alignItems: "center" as const,
    justifyContent: "center" as const,
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
  quickContactRow: {
    flexDirection: "row" as const,
    gap: 6,
  },
  quickChip: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: Colors.primary + "08",
    borderWidth: 1.5,
    borderColor: Colors.primary + "18",
  },
  quickChipSelected: {
    backgroundColor: Colors.primary + "20",
    borderColor: Colors.primary + "60",
  },
  quickChipText: {
    fontSize: 11,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
    textAlign: "center" as const,
  },
  quickChipTextSelected: {
    color: Colors.primary,
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
  customReminderChip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    backgroundColor: Colors.primary + "10",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.primary + "25",
  },
  customReminderChipText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.text,
  },
  customReminderChipDate: {
    fontSize: 13,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
  },
  addReminderBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  addReminderBtnText: {
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.primary,
  },
  addReminderForm: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: 10,
  },
  reminderLabelInput: {
    marginBottom: 0,
  },
  reminderDateLabel: {
    fontSize: 13,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
    marginBottom: 4,
    marginTop: 2,
  },
  addReminderActions: {
    flexDirection: "row" as const,
    gap: 10,
    marginTop: 4,
  },
  addReminderCancel: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    alignItems: "center" as const,
  },
  addReminderCancelText: {
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
  },
  addReminderSave: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: "center" as const,
  },
  addReminderSaveText: {
    fontSize: 14,
    fontFamily: "Nunito_700Bold",
    color: "#fff",
  },
});
