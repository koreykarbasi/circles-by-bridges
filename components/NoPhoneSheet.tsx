import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  Platform,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import * as Haptics from "expo-haptics";
import { buildExtraFromDeviceContact } from "@/lib/contact-extra";
import type { ExtraContactData } from "@/lib/contact-extra";

type Screen = "entry" | "contacts" | "save";

interface DeviceContact {
  id: string;
  name: string;
  phone: string;
  birthday?: string | null;
  imageUri?: string | null;
}

// Re-export so existing importers that pull ExtraContactData from this module
// continue to work without changes.
export type { ExtraContactData } from "@/lib/contact-extra";

interface NoPhoneSheetProps {
  visible: boolean;
  contactName: string;
  mode: "sms" | "call";
  onConfirm: (phone: string, shouldSave: boolean, extra?: ExtraContactData) => void;
  onDismiss: () => void;
}

function formatDeviceBirthday(bday?: { year?: number; month?: number; day?: number }): string | undefined {
  if (!bday || !bday.month || !bday.day) return undefined;
  const m = String(bday.month).padStart(2, "0");
  const d = String(bday.day).padStart(2, "0");
  return `${m}/${d}`;
}

export function NoPhoneSheet({ visible, contactName, mode, onConfirm, onDismiss }: NoPhoneSheetProps) {
  const [screen, setScreen] = useState<Screen>("entry");
  const [manualPhone, setManualPhone] = useState("");
  const [capturedPhone, setCapturedPhone] = useState("");
  const [capturedExtra, setCapturedExtra] = useState<ExtraContactData | undefined>(undefined);
  const [error, setError] = useState("");
  const [deviceContacts, setDeviceContacts] = useState<DeviceContact[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [loadingContacts, setLoadingContacts] = useState(false);

  const resetState = useCallback(() => {
    setScreen("entry");
    setManualPhone("");
    setCapturedPhone("");
    setCapturedExtra(undefined);
    setError("");
    setDeviceContacts([]);
    setContactSearch("");
  }, []);

  const handleDismiss = useCallback(() => {
    resetState();
    onDismiss();
  }, [onDismiss, resetState]);

  const proceedWithPhone = useCallback((phone: string, extra?: ExtraContactData) => {
    setCapturedPhone(phone);
    setCapturedExtra(extra);
    setScreen("save");
  }, []);

  const handleManualConfirm = useCallback(() => {
    const cleaned = manualPhone.trim();
    if (!cleaned) {
      setError("Please enter a phone number");
      return;
    }
    setError("");
    proceedWithPhone(cleaned, undefined);
  }, [manualPhone, proceedWithPhone]);

  const handleFindInContacts = useCallback(async () => {
    if (Platform.OS === "web") return;
    setLoadingContacts(true);
    setError("");
    try {
      const Contacts = await import("expo-contacts");
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        setError("Contacts permission denied");
        setLoadingContacts(false);
        return;
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Name,
          Contacts.Fields.Birthday,
          Contacts.Fields.Image,
          Contacts.Fields.RawImage,
        ],
      });
      const withPhone: DeviceContact[] = [];
      for (const c of data) {
        if (!c.phoneNumbers || c.phoneNumbers.length === 0) continue;
        const phone = c.phoneNumbers[0].number ?? "";
        if (!phone) continue;
        let imageUri: string | null = null;
        if ((c.rawImage as { base64?: string } | undefined)?.base64) {
          imageUri = `data:image/jpeg;base64,${(c.rawImage as { base64?: string }).base64}`;
        } else if ((c.image as { uri?: string } | undefined)?.uri) {
          imageUri = (c.image as { uri: string }).uri;
        }
        withPhone.push({
          id: c.id ?? Math.random().toString(),
          name: c.name ?? "Unknown",
          phone,
          birthday: formatDeviceBirthday(c.birthday as { year?: number; month?: number; day?: number } | undefined),
          imageUri,
        });
      }
      withPhone.sort((a, b) => a.name.localeCompare(b.name));
      setDeviceContacts(withPhone);
      setScreen("contacts");
    } catch {
      setError("Could not load contacts");
    } finally {
      setLoadingContacts(false);
    }
  }, []);

  const handlePickContact = useCallback((contact: DeviceContact) => {
    Haptics.selectionAsync();
    proceedWithPhone(contact.phone, buildExtraFromDeviceContact(contact));
  }, [proceedWithPhone]);

  const handleSaveYes = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const extra = capturedExtra;
    resetState();
    onConfirm(capturedPhone, true, extra);
  }, [capturedPhone, capturedExtra, onConfirm, resetState]);

  const handleSaveNo = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const phone = capturedPhone;
    resetState();
    onConfirm(phone, false, undefined);
  }, [capturedPhone, onConfirm, resetState]);

  const filteredContacts = contactSearch.trim()
    ? deviceContacts.filter(
        (c) =>
          c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
          c.phone.includes(contactSearch),
      )
    : deviceContacts;

  const modeLabel = mode === "sms" ? "open Messages" : "call";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleDismiss}>
      <Pressable style={styles.backdrop} onPress={handleDismiss} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
        pointerEvents="box-none"
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />

          {screen === "entry" && (
            <>
              <Text style={styles.title}>Add a phone number</Text>
              <Text style={styles.subtitle}>
                To {modeLabel}, {contactName} needs a phone number saved.
              </Text>

              {Platform.OS !== "web" && (
                <Pressable
                  onPress={handleFindInContacts}
                  disabled={loadingContacts}
                  style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.8 }]}
                >
                  {loadingContacts ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <View style={styles.btnRow}>
                      <Ionicons name="people-outline" size={18} color="#fff" />
                      <Text style={styles.primaryBtnText}>Find in Contacts</Text>
                    </View>
                  )}
                </Pressable>
              )}

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>{Platform.OS === "web" ? "enter phone number" : "or enter manually"}</Text>
                <View style={styles.dividerLine} />
              </View>

              <TextInput
                style={[styles.input, error ? styles.inputError : null]}
                placeholder="Phone number"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="phone-pad"
                value={manualPhone}
                onChangeText={(t) => {
                  setManualPhone(t);
                  if (error) setError("");
                }}
                returnKeyType="done"
                onSubmitEditing={handleManualConfirm}
              />
              {!!error && <Text style={styles.errorText}>{error}</Text>}

              <Pressable
                onPress={handleManualConfirm}
                style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.8 }]}
              >
                <Text style={styles.secondaryBtnText}>Continue</Text>
              </Pressable>

              <Pressable onPress={handleDismiss} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </>
          )}

          {screen === "contacts" && (
            <>
              <View style={styles.contactsHeader}>
                <Pressable onPress={() => setScreen("entry")} hitSlop={8}>
                  <Ionicons name="chevron-back" size={22} color={Colors.primaryLight} />
                </Pressable>
                <Text style={styles.title}>Choose a contact</Text>
              </View>

              <TextInput
                style={styles.input}
                placeholder="Search contacts"
                placeholderTextColor={Colors.textTertiary}
                value={contactSearch}
                onChangeText={setContactSearch}
                autoFocus
              />

              {filteredContacts.length === 0 ? (
                <View style={styles.emptyContacts}>
                  <Text style={styles.emptyText}>No contacts with phone numbers found</Text>
                </View>
              ) : (
                <FlatList
                  data={filteredContacts}
                  keyExtractor={(item) => item.id}
                  style={styles.contactsList}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => handlePickContact(item)}
                      style={({ pressed }) => [styles.contactRow, pressed && { opacity: 0.6 }]}
                    >
                      <View style={styles.contactAvatar}>
                        <Text style={styles.contactAvatarText}>{item.name[0]?.toUpperCase() ?? "?"}</Text>
                      </View>
                      <View style={styles.contactInfo}>
                        <Text style={styles.contactName} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.contactPhone}>{item.phone}</Text>
                      </View>
                    </Pressable>
                  )}
                />
              )}
            </>
          )}

          {screen === "save" && (
            <>
              <Text style={styles.title}>Save number?</Text>
              <Text style={styles.subtitle}>
                Save {capturedPhone} to {contactName} so you won't be asked again?
              </Text>

              <Pressable
                onPress={handleSaveYes}
                style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.8 }]}
              >
                <Text style={styles.primaryBtnText}>Save to {contactName}</Text>
              </Pressable>

              <Pressable
                onPress={handleSaveNo}
                style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.secondaryBtnText}>Just this time</Text>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  keyboardView: {
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
    minHeight: 280,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: 20,
  },
  contactsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    marginBottom: 20,
    lineHeight: 20,
  },
  btnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
    marginTop: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    fontSize: 12,
    fontFamily: "Nunito_400Regular",
    color: Colors.textTertiary,
  },
  input: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Nunito_400Regular",
    color: Colors.text,
    marginBottom: 12,
  },
  inputError: {
    borderColor: Colors.danger,
  },
  errorText: {
    fontSize: 12,
    fontFamily: "Nunito_400Regular",
    color: Colors.danger,
    marginBottom: 8,
    marginTop: -6,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  primaryBtnText: {
    fontSize: 15,
    fontFamily: "Nunito_700Bold",
    color: "#fff",
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary + "18",
    borderRadius: 12,
    paddingVertical: 13,
    marginBottom: 10,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.primaryLight,
  },
  cancelBtn: {
    alignItems: "center",
    paddingVertical: 10,
  },
  cancelText: {
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
  },
  contactsList: {
    maxHeight: 300,
    marginBottom: 8,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  contactAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary + "30",
    alignItems: "center",
    justifyContent: "center",
  },
  contactAvatarText: {
    fontSize: 15,
    fontFamily: "Nunito_700Bold",
    color: Colors.primaryLight,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.text,
  },
  contactPhone: {
    fontSize: 12,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    marginTop: 2,
  },
  emptyContacts: {
    paddingVertical: 24,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
  },
});
