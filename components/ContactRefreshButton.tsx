import React, { useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useContacts } from "@/lib/contacts-context";
import { useThemeColors } from "@/lib/theme-context";
import { loadPhoneContactsForRefresh, PhoneContactsPermissionError } from "@/lib/phone-contact-refresh";
import { applyContactRefreshPreview, type ContactRefreshResult } from "@/lib/contact-refresh-flow";
import {
  previewContactRefresh, REFRESH_FIELDS, type ContactRefreshChanges, type ContactRefreshPreview, type RefreshValues,
} from "@shared/contact-refresh";

interface Props {
  contactId?: string;
  draft?: RefreshValues;
  onApplied?: (changes: ContactRefreshChanges) => void;
}

const fieldLabels = { email: "Email", phone: "Phone", photoUri: "Photo", birthday: "Birthday" };

export function ContactRefreshButton({ contactId, draft, onApplied }: Props) {
  const { contacts, isLoading, fillContactFields } = useContacts();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<"idle" | "loading" | "preview" | "applying" | "result">("idle");
  const [preview, setPreview] = useState<ContactRefreshPreview[]>([]);
  const [results, setResults] = useState<ContactRefreshResult[]>([]);
  const [limited, setLimited] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  // Re-read current context and editor draft when Apply is tapped, not when preview was built.
  const latest = useRef({ contacts, draft, onApplied, fillContactFields });
  latest.current = { contacts, draft, onApplied, fillContactFields };
  const busy = phase === "loading" || phase === "applying";
  const title = contactId ? "Refresh from phone contacts" : "Refresh all";
  const close = () => { if (!pending.current) setPhase("idle"); };
  const start = async () => {
    if (pending.current) return;
    pending.current = true;
    setError("");
    setPhase("loading");
    try {
      const phone = await loadPhoneContactsForRefresh();
      const targets = latest.current.contacts.filter(c => !contactId || c.id === contactId);
      setPreview(targets.map(c => previewContactRefresh(c, phone.contacts, contactId ? latest.current.draft : undefined)));
      setLimited(phone.limited);
      setResults([]);
      setPhase("preview");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not read phone contacts. Please try again.";
      setError(message);
      setPhase("idle");
      if (err instanceof PhoneContactsPermissionError) {
        Alert.alert("Contacts access needed", message, [
          { text: "Not now", style: "cancel" },
          { text: "Open Settings", onPress: () => { void Linking.openSettings().catch(() => setError("Open your device Settings and enable Contacts access for Bridges.")); } },
        ]);
      }
    } finally {
      pending.current = false;
    }
  };
  const apply = async () => {
    if (pending.current) return;
    pending.current = true;
    setPhase("applying");
    try {
      const outcome = await applyContactRefreshPreview(preview, {
        getContact: id => latest.current.contacts.find(c => c.id === id),
        getDraft: id => id === contactId ? latest.current.draft : undefined,
        save: (id, changes) => latest.current.fillContactFields(id, changes),
        onApplied: (id, changes) => { if (id === contactId) latest.current.onApplied?.(changes); },
      });
      setResults(outcome);
      setPhase("result");
    } finally {
      pending.current = false;
    }
  };
  const changeCount = preview.filter(entry => Object.keys(entry.changes).length > 0).length;
  const updatedCount = results.filter(result => result.status === "updated").length;
  const bodyColor = { color: colors.textSecondary };
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button" accessibilityLabel={title}
        accessibilityState={{ disabled: busy || isLoading, busy }}
        disabled={busy || isLoading} onPress={start}
        style={({ pressed }) => [styles.trigger, { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed || busy || isLoading ? 0.6 : 1 }]}
      >
        {busy ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="sync-outline" size={20} color={colors.primary} />}
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: colors.text }]}>{phase === "loading" ? "Reading phone contacts…" : title}</Text>
          <Text style={[styles.body, bodyColor]}>Preview and fill missing details only</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
      </Pressable>
      {!!error && <Text accessibilityRole="alert" style={[styles.body, { color: colors.danger, marginTop: 8 }]}>{error}</Text>}
      <Modal visible={phase === "preview" || phase === "applying" || phase === "result"} transparent animationType="slide" onRequestClose={close}>
        <View style={styles.overlay}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close contact refresh" onPress={close} style={StyleSheet.absoluteFill} />
          <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 20) }]}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{phase === "result" ? "Refresh results" : "Preview contact refresh"}</Text>
            <Text style={[styles.body, bodyColor, { marginVertical: 12 }]}>
              {phase === "result" ? `${updatedCount} ${updatedCount === 1 ? "contact" : "contacts"} updated. Review individual results below.`
                : `${changeCount} ${changeCount === 1 ? "contact has" : "contacts have"} missing details to fill. Nothing is saved until you apply.`}
            </Text>
            {limited && <Text style={[styles.body, bodyColor, { marginBottom: 12 }]}>Bridges can only see the phone contacts you've shared. To include others, allow more Contacts access in device Settings.</Text>}
            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
              {!preview.length && <Text style={[styles.body, bodyColor]}>No Bridges contacts are available to refresh.</Text>}
              {phase === "result" ? results.map(result => (
                <View key={result.contactId} style={[styles.entry, { borderColor: colors.border }]}>
                  <Text style={[styles.label, { color: colors.text }]}>{result.name}</Text>
                  <Text style={[styles.body, { color: result.status === "failed" ? colors.danger : colors.textSecondary }]}>{result.status === "updated" ? "Updated" : result.status === "failed" ? "Failed" : "Skipped"} · {result.message}</Text>
                </View>
              )) : preview.map(entry => (
                <View key={entry.contactId} style={[styles.entry, { borderColor: colors.border }]}>
                  <Text style={[styles.label, { color: colors.text }]}>{entry.name}</Text>
                  {entry.reason ? <Text style={[styles.body, bodyColor]}>Skipped · {entry.reason}</Text> : REFRESH_FIELDS.map(field => {
                    const value = entry.changes[field];
                    if (!value) return null;
                    return (
                      <View key={field} style={{ marginTop: 8 }}>
                        <Text style={[styles.body, bodyColor]}>{fieldLabels[field]} · Empty → {field === "photoUri" ? "Phone contact photo" : value}</Text>
                        {field === "photoUri" && <Image accessibilityLabel={`New photo for ${entry.name}`} source={{ uri: value }} style={styles.photo} />}
                      </View>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
            {phase === "result" ? (
              <Pressable accessibilityRole="button" onPress={close} style={[styles.primary, { backgroundColor: colors.primary }]}>
                <Text style={[styles.label, { color: colors.onPrimary }]}>Done</Text>
              </Pressable>
            ) : (
              <View style={styles.actions}>
                <Pressable accessibilityRole="button" onPress={close} disabled={busy} style={styles.cancel}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Cancel</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={apply} disabled={busy || !changeCount} style={[styles.primary, { flex: 1, backgroundColor: colors.primary, opacity: busy || !changeCount ? 0.5 : 1 }]}>
                  {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.label, { color: colors.onPrimary }]}>Apply changes</Text>}
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  trigger: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderWidth: 1, borderRadius: 14 },
  label: { fontSize: 15, fontFamily: "Nunito_700Bold" },
  body: { fontSize: 14, lineHeight: 21, fontFamily: "Nunito_600SemiBold" },
  title: { fontSize: 20, fontFamily: "Nunito_800ExtraBold" },
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "#00000080" },
  sheet: { maxHeight: "85%", padding: 22, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  entry: { paddingVertical: 14, borderBottomWidth: 1 },
  photo: { width: 64, height: 64, borderRadius: 16, marginTop: 8 },
  actions: { flexDirection: "row", alignItems: "center", gap: 16, paddingTop: 10 },
  primary: { minHeight: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", padding: 12 },
  cancel: { minHeight: 46, padding: 12, justifyContent: "center" },
});
