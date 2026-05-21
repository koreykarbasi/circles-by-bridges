import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Pressable,
  Platform,
  ActivityIndicator,
} from "react-native";
import * as Contacts from "expo-contacts";
import * as FileSystem from "expo-file-system";
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
}

interface DeviceContact {
  id: string;
  name: string;
  phone?: string;
  birthday?: string;
  photoUri?: string;
}

export function ContactsImport({ selectedContacts, onSelect, onDeselect, maxSelections }: ContactsImportProps) {
  const [permission, setPermission] = useState<Contacts.PermissionResponse | null>(null);
  const [deviceContacts, setDeviceContacts] = useState<DeviceContact[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [manualName, setManualName] = useState("");

  const requestPermission = useCallback(async () => {
    if (Platform.OS === "web") {
      return;
    }
    setLoading(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      setPermission({ status, granted: status === "granted", canAskAgain: true, expires: "never" } as Contacts.PermissionResponse);
      if (status === "granted") {
        const { data } = await Contacts.getContactsAsync({
          fields: [
            Contacts.Fields.Name,
            Contacts.Fields.PhoneNumbers,
            Contacts.Fields.Birthday,
            Contacts.Fields.Image,
          ],
          sort: Contacts.SortTypes.FirstName,
        });
        const mapped: DeviceContact[] = await Promise.all(
          data
            .filter((c) => c.name)
            .map(async (c) => {
              let birthday: string | undefined;
              if (c.birthday && c.birthday.month != null && c.birthday.day != null) {
                const month = c.birthday.month + 1;
                birthday = `${String(month).padStart(2, "0")}/${String(c.birthday.day).padStart(2, "0")}`;
              }
              let photoUri: string | undefined;
              if (c.imageAvailable && c.image?.uri) {
                try {
                  const base64 = await FileSystem.readAsStringAsync(c.image.uri, {
                    encoding: FileSystem.EncodingType.Base64,
                  });
                  if (base64) {
                    photoUri = `data:image/jpeg;base64,${base64}`;
                  }
                } catch {
                }
              }
              return {
                id: c.id ?? c.name ?? "",
                name: c.name ?? "",
                phone: c.phoneNumbers?.[0]?.number,
                birthday,
                photoUri,
              };
            })
        );
        setDeviceContacts(mapped);
      }
    } catch (err) {
      console.error("Error loading contacts:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const filteredContacts = deviceContacts.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  );

  const isSelected = (name: string) =>
    selectedContacts.some((s) => s.name === name);

  const handleToggle = (contact: DeviceContact) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isSelected(contact.name)) {
      onDeselect(contact.name);
    } else {
      if (maxSelections && selectedContacts.length >= maxSelections) return;
      onSelect({
        name: contact.name,
        phone: contact.phone,
        birthday: contact.birthday,
        photoUri: contact.photoUri,
      });
    }
  };

  const handleAddManual = () => {
    if (!manualName.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (maxSelections && selectedContacts.length >= maxSelections) return;
    onSelect({ name: manualName.trim() });
    setManualName("");
  };

  const isWeb = Platform.OS === "web";

  if (isWeb || (permission && !permission.granted)) {
    return (
      <View style={styles.container}>
        <View style={styles.manualEntry}>
          <Text style={styles.manualLabel}>
            {isWeb ? "Add people by name" : "Contacts access not available. Add manually:"}
          </Text>
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
        {selectedContacts.length > 0 && (
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
        )}
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={styles.container}>
        <Pressable
          onPress={requestPermission}
          style={({ pressed }) => [styles.enableButton, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="people-outline" size={22} color="#fff" />
          <Text style={styles.enableButtonText}>Enable Contacts</Text>
        </Pressable>
        <View style={styles.manualEntry}>
          <Text style={styles.orText}>or add manually</Text>
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
        {selectedContacts.length > 0 && (
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
        )}
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading contacts...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {selectedContacts.length > 0 && (
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
      )}
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
          const disabled = !selected && !!maxSelections && selectedContacts.length >= maxSelections;
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
                <Text style={styles.contactName} numberOfLines={1}>{item.name}</Text>
                {item.phone && (
                  <Text style={styles.contactPhone} numberOfLines={1}>{item.phone}</Text>
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
  enableButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    marginBottom: 16,
  },
  enableButtonText: {
    fontSize: 16,
    fontFamily: "Nunito_700Bold",
    color: "#fff",
  },
  manualEntry: {
    marginTop: 8,
  },
  manualLabel: {
    fontSize: 13,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  orText: {
    fontSize: 13,
    fontFamily: "Nunito_400Regular",
    color: Colors.textTertiary,
    textAlign: "center",
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
