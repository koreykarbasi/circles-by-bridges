import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Pressable,
  Platform,
  ActivityIndicator,
  Linking,
} from "react-native";
import * as Contacts from "expo-contacts";
import { Ionicons } from "@expo/vector-icons";
import { Avatar } from "./Avatar";
import Colors from "@/constants/colors";
import { AVATAR_COLORS } from "@/lib/types";
import * as Haptics from "expo-haptics";

export interface ImportedContact {
  name: string;
  phone?: string;
  birthday?: string;
  photoUri?: string;
}

interface ContactsImportProps {
  selectedContacts: ImportedContact[];
  onSelect: (contact: ImportedContact) => void;
  onDeselect: (name: string) => void;
  maxSelections?: number;
  /** @deprecated No longer used — permission is now always gated behind an explicit tap */
  isActive?: boolean;
}

interface DeviceContact {
  id: string;
  name: string;
  phone?: string;
  birthday?: string;
  photoUri?: string;
}

type PermissionState = "idle" | "loading" | "granted" | "denied";

async function loadDeviceContacts(): Promise<DeviceContact[]> {
  const { data } = await Contacts.getContactsAsync({
    fields: [
      Contacts.Fields.Name,
      Contacts.Fields.PhoneNumbers,
      Contacts.Fields.Birthday,
      Contacts.Fields.Image,
      Contacts.Fields.RawImage,
    ],
    sort: Contacts.SortTypes.FirstName,
  });
  return data
    .filter((c) => c.name)
    .map((c) => {
      let birthday: string | undefined;
      if (c.birthday && c.birthday.month != null && c.birthday.day != null) {
        const month = c.birthday.month + 1;
        birthday = `${String(month).padStart(2, "0")}/${String(c.birthday.day).padStart(2, "0")}`;
      }
      let photoUri: string | undefined;
      if (c.imageAvailable) {
        if (c.rawImage?.base64) {
          photoUri = `data:image/jpeg;base64,${c.rawImage.base64}`;
        } else if (c.image?.uri) {
          photoUri = c.image.uri;
        }
      }
      return {
        id: c.id ?? c.name ?? "",
        name: c.name ?? "",
        phone: c.phoneNumbers?.[0]?.number,
        birthday,
        photoUri,
      };
    });
}

export function ContactsImport({
  selectedContacts,
  onSelect,
  onDeselect,
  maxSelections,
}: ContactsImportProps) {
  const [permState, setPermState] = useState<PermissionState>("idle");
  const [deviceContacts, setDeviceContacts] = useState<DeviceContact[]>([]);
  const [search, setSearch] = useState("");
  const [manualName, setManualName] = useState("");

  const handleImportTap = useCallback(async () => {
    if (Platform.OS === "web") return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPermState("loading");
    try {
      const { status, canAskAgain } = await Contacts.requestPermissionsAsync();
      if (status === "granted") {
        setPermState("granted");
        const contacts = await loadDeviceContacts();
        setDeviceContacts(contacts);
      } else if (!canAskAgain || status === "denied") {
        setPermState("denied");
      } else {
        setPermState("denied");
      }
    } catch {
      setPermState("denied");
    }
  }, []);

  const handleOpenSettings = useCallback(() => {
    Linking.openSettings().catch(() => {});
  }, []);

  const handleAddManual = () => {
    if (!manualName.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (maxSelections !== undefined && selectedContacts.length >= maxSelections) return;
    onSelect({ name: manualName.trim() });
    setManualName("");
  };

  const handleToggle = (contact: DeviceContact) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const isSelected = selectedContacts.some((s) => s.name === contact.name);
    if (isSelected) {
      onDeselect(contact.name);
    } else {
      if (maxSelections !== undefined && selectedContacts.length >= maxSelections) return;
      onSelect({
        name: contact.name,
        phone: contact.phone,
        birthday: contact.birthday,
        photoUri: contact.photoUri,
      });
    }
  };

  const isSelected = (name: string) => selectedContacts.some((s) => s.name === name);

  const filteredContacts = deviceContacts.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  );

  const SelectedChips = () =>
    selectedContacts.length > 0 ? (
      <View style={styles.selectedList}>
        {selectedContacts.map((c) => (
          <View key={c.name} style={styles.selectedChip}>
            <Text style={styles.selectedChipText}>{c.name}</Text>
            <Pressable onPress={() => onDeselect(c.name)} hitSlop={6}>
              <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
            </Pressable>
          </View>
        ))}
      </View>
    ) : null;

  const ManualEntry = () => (
    <View style={styles.manualEntry}>
      <Text style={styles.manualLabel}>Or add by name</Text>
      <View style={styles.manualRow}>
        <TextInput
          style={styles.manualInput}
          placeholder="Enter a name..."
          placeholderTextColor={Colors.textTertiary}
          value={manualName}
          onChangeText={setManualName}
          onSubmitEditing={handleAddManual}
          autoCapitalize="words"
        />
        <Pressable
          onPress={handleAddManual}
          disabled={!manualName.trim()}
          style={({ pressed }) => [
            styles.manualAddBtn,
            !manualName.trim() && { opacity: 0.4 },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="add" size={22} color="#fff" />
        </Pressable>
      </View>
    </View>
  );

  if (Platform.OS === "web") {
    return (
      <View style={styles.container}>
        <SelectedChips />
        <ManualEntry />
      </View>
    );
  }

  if (permState === "idle") {
    return (
      <View style={styles.container}>
        <SelectedChips />
        <Pressable
          onPress={handleImportTap}
          style={({ pressed }) => [styles.importCta, pressed && { opacity: 0.75 }]}
        >
          <Ionicons name="people-outline" size={22} color={Colors.primary} />
          <Text style={styles.importCtaText}>Import from phone contacts</Text>
        </Pressable>
        <ManualEntry />
      </View>
    );
  }

  if (permState === "loading") {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading contacts...</Text>
      </View>
    );
  }

  if (permState === "denied") {
    return (
      <View style={styles.container}>
        <SelectedChips />
        <View style={styles.deniedBox}>
          <Ionicons name="lock-closed-outline" size={20} color={Colors.textSecondary} />
          <Text style={styles.deniedText}>
            Contacts access is off. Enable it in Settings so Bridges can read your phone contacts.
          </Text>
          <Pressable
            onPress={handleOpenSettings}
            style={({ pressed }) => [styles.settingsBtn, pressed && { opacity: 0.75 }]}
          >
            <Text style={styles.settingsBtnText}>Open Settings</Text>
          </Pressable>
        </View>
        <ManualEntry />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SelectedChips />
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={Colors.textTertiary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search contacts..."
          placeholderTextColor={Colors.textTertiary}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
      </View>
      <FlatList
        data={filteredContacts.slice(0, 50)}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        renderItem={({ item }) => {
          const selected = isSelected(item.name);
          const disabled =
            !selected && maxSelections !== undefined && selectedContacts.length >= maxSelections;
          return (
            <Pressable
              onPress={() => handleToggle(item)}
              disabled={disabled}
              style={({ pressed }) => [
                styles.contactRow,
                selected && styles.contactRowSelected,
                disabled && { opacity: 0.4 },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Avatar
                name={item.name}
                color={AVATAR_COLORS[Math.abs(item.name.charCodeAt(0)) % AVATAR_COLORS.length]}
                size={36}
              />
              <View style={styles.contactInfo}>
                <Text style={styles.contactName} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.phone && (
                  <Text style={styles.contactPhone} numberOfLines={1}>
                    {item.phone}
                  </Text>
                )}
              </View>
              {selected ? (
                <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />
              ) : (
                <Ionicons name="add-circle-outline" size={24} color={Colors.textTertiary} />
              )}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {search ? "No contacts found" : "No contacts available"}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    marginTop: 12,
  },
  importCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.primary + "60",
    backgroundColor: Colors.primary + "0D",
    marginBottom: 20,
  },
  importCtaText: {
    fontSize: 15,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.primary,
  },
  deniedBox: {
    gap: 10,
    padding: 16,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
    alignItems: "center",
  },
  deniedText: {
    fontSize: 13,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
  settingsBtn: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    marginTop: 4,
  },
  settingsBtnText: {
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: "#fff",
  },
  manualEntry: {
    marginTop: 4,
  },
  manualLabel: {
    fontSize: 13,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  manualRow: {
    flexDirection: "row",
    gap: 8,
  },
  manualInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Nunito_400Regular",
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  manualAddBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  selectedList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  selectedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.primary + "20",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.primary + "40",
  },
  selectedChipText: {
    fontSize: 13,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.primaryLight,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  searchIcon: {
    paddingLeft: 14,
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Nunito_400Regular",
    color: Colors.text,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  contactRowSelected: {
    backgroundColor: Colors.primary + "10",
  },
  contactInfo: {
    flex: 1,
    marginLeft: 10,
  },
  contactName: {
    fontSize: 15,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.text,
  },
  contactPhone: {
    fontSize: 12,
    fontFamily: "Nunito_400Regular",
    color: Colors.textTertiary,
    marginTop: 1,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Nunito_400Regular",
    color: Colors.textTertiary,
    textAlign: "center",
    paddingVertical: 20,
  },
});
