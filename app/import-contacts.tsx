import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useContacts } from "@/lib/contacts-context";
import { CIRCLE_CONFIG, AVATAR_COLORS } from "@/lib/types";
import { ContactsImport, ImportedContact } from "@/components/ContactsImport";
import * as Haptics from "expo-haptics";

export default function ImportContactsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ circle?: string }>();
  const initialCircle = params.circle ? (parseInt(params.circle) as 1 | 2 | 3) : 1;

  const { addContact, getCircleContacts } = useContacts();
  const [activeCircle, setActiveCircle] = useState<1 | 2 | 3>(initialCircle);
  const [selected, setSelected] = useState<ImportedContact[]>([]);
  const [saving, setSaving] = useState(false);

  const config = CIRCLE_CONFIG[activeCircle];
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const handleImport = async () => {
    if (selected.length === 0) {
      Alert.alert("No one selected", "Please select at least one person to import.");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (selected.length === 1) {
      const c = selected[0];
      router.replace({
        pathname: "/add-contact",
        params: {
          circle: String(activeCircle),
          prefillName: c.name,
          prefillPhone: c.phone ?? "",
          prefillBirthday: c.birthday ?? "",
          prefillPhotoUri: c.photoUri ?? "",
        },
      });
      return;
    }

    setSaving(true);
    try {
      const circleContacts = getCircleContacts(activeCircle);
      const slots = config.max - circleContacts.length;
      const toImport = selected.slice(0, Math.max(slots, 0));

      if (toImport.length === 0) {
        Alert.alert(
          "Circle full",
          `${config.label} is already full (${config.max} people). Move someone to a different circle first.`,
        );
        setSaving(false);
        return;
      }

      const importedIds: string[] = [];
      for (const c of toImport) {
        const created = await addContact({
          name: c.name,
          circleLevel: activeCircle,
          interests: [],
          labels: [],
          birthday: c.birthday ?? undefined,
          phone: c.phone ?? undefined,
          photoUri: c.photoUri ?? undefined,
          notes: undefined,
          lastContacted: undefined,
        });
        importedIds.push(created.id);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({
        pathname: "/complete-contacts",
        params: {
          count: String(toImport.length),
          importedIds: JSON.stringify(importedIds),
        },
      });
    } catch (err) {
      Alert.alert("Import failed", "Something went wrong. Please try again.");
      setSaving(false);
    }
  };

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
        <Text style={styles.headerTitle}>Import Contacts</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.circleTabs}>
        {([1, 2, 3] as const).map((level) => {
          const cfg = CIRCLE_CONFIG[level];
          const isActive = activeCircle === level;
          return (
            <Pressable
              key={level}
              onPress={() => {
                Haptics.selectionAsync();
                setActiveCircle(level);
                setSelected([]);
              }}
              style={[
                styles.circleTab,
                isActive && { backgroundColor: cfg.color + "18", borderColor: cfg.color + "50" },
              ]}
            >
              <View style={[styles.tabDot, { backgroundColor: cfg.color }]} />
              <Text style={[styles.tabLabel, isActive && { color: cfg.color }]} numberOfLines={1}>
                {cfg.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 100 + (Platform.OS === "web" ? 34 : 0) },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.hint}>
          Select people to add to your {config.label} (up to {config.max})
        </Text>
        <ContactsImport
          selectedContacts={selected}
          onSelect={(c) => setSelected((prev) => [...prev, c])}
          onDeselect={(name) => setSelected((prev) => prev.filter((c) => c.name !== name))}
          maxSelections={config.max}
        />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 + (Platform.OS === "web" ? 34 : 0) }]}>
        <Pressable
          onPress={handleImport}
          disabled={saving || selected.length === 0}
          style={({ pressed }) => [
            styles.importButton,
            (saving || selected.length === 0) && styles.importButtonDisabled,
            pressed && { opacity: 0.8 },
          ]}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.importButtonText}>
              {selected.length === 0
                ? "Select people to import"
                : selected.length === 1
                  ? "Continue with 1 person"
                  : `Import ${selected.length} people`}
            </Text>
          )}
        </Pressable>
      </View>
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
  circleTabs: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  circleTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  tabDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  tabLabel: {
    fontSize: 12,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  hint: {
    fontSize: 13,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    backgroundColor: Colors.background,
  },
  importButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  importButtonDisabled: {
    backgroundColor: Colors.primaryMuted,
  },
  importButtonText: {
    fontSize: 16,
    fontFamily: "Nunito_700Bold",
    color: "#fff",
  },
});
