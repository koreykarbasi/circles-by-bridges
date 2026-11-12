import React, { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CIRCLE_CONFIG, type Contact } from "@/lib/types";
import { useContacts } from "@/lib/contacts-context";
import { useThemeColors } from "@/lib/theme-context";
import type { ThemeColors } from "@/constants/colors";
import { projectCircleMoves, validateCircleMoves, type CircleMove } from "@shared/circle-moves";
import type { CircleLevel } from "@shared/circles";

const LEVELS: CircleLevel[] = [1, 2, 3, 4];

interface CircleMoveButtonProps {
  contact: Contact;
  compact?: boolean;
}

function circleColor(level: CircleLevel, Colors: ThemeColors) {
  return Colors[`circle${level}` as "circle1" | "circle2" | "circle3" | "circle4"];
}

export function CircleMoveButton({ contact, compact = false }: CircleMoveButtonProps) {
  const Colors = useThemeColors();
  const styles = useMemo(() => createStyles(Colors), [Colors]);
  const { contacts, moveContacts, refreshContacts } = useContacts();
  const [open, setOpen] = useState(false);
  const [movesById, setMovesById] = useState<Record<string, CircleLevel>>({});
  const [activeContactId, setActiveContactId] = useState(contact.id);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState("");

  const moves: CircleMove[] = useMemo(
    () => Object.entries(movesById).map(([contactId, circleLevel]) => ({ contactId, circleLevel })),
    [movesById],
  );
  const projection = useMemo(() => {
    try {
      return projectCircleMoves(contacts, moves);
    } catch {
      return projectCircleMoves(contacts, []);
    }
  }, [contacts, moves]);
  const assignments = useMemo(
    () => new Map(projection.assignments.map((assignment) => [assignment.id, assignment.circleLevel])),
    [projection.assignments],
  );
  const activeContact = contacts.find((person) => person.id === activeContactId) ?? contact;
  const isBalanced = projection.overfullCircles.length === 0;
  const hasChanges = moves.length > 0;

  const begin = () => {
    setMovesById({});
    setActiveContactId(contact.id);
    setError("");
    setOpen(true);
  };

  const stageDestination = (destination: CircleLevel) => {
    setError("");
    setMovesById((previous) => {
      const next = { ...previous };
      const person = contacts.find((item) => item.id === activeContactId);
      if (!person) return previous;
      if (person.circleLevel === destination) delete next[activeContactId];
      else next[activeContactId] = destination;
      return next;
    });
  };

  const undoMove = (contactId: string) => {
    setMovesById((previous) => {
      const next = { ...previous };
      delete next[contactId];
      return next;
    });
    setError("");
  };

  const handleSave = async () => {
    if (savingRef.current || !hasChanges || !isBalanced) return;
    try {
      validateCircleMoves(contacts, moves);
      savingRef.current = true;
      setSaving(true);
      setError("");
      await moveContacts(moves);
      await refreshContacts();
      setOpen(false);
      setMovesById({});
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not move contacts. Please try again.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Move ${contact.name} to another circle`}
        onPress={begin}
        hitSlop={8}
        style={({ pressed }) => [compact ? styles.compactTrigger : styles.fullTrigger, pressed && styles.pressed]}
      >
        <Ionicons name="swap-horizontal-outline" size={compact ? 19 : 17} color={Colors.primary} />
        {!compact && <Text style={styles.triggerText}>Move circle</Text>}
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => !saving && setOpen(false)}
        statusBarTranslucent
      >
        <View style={styles.scrim}>
          <View style={styles.dialog} accessibilityViewIsModal>
            <View style={styles.header}>
              <View style={styles.headingCopy}>
                <Text style={styles.eyebrow}>YOUR CIRCLES</Text>
                <Text style={styles.title}>Move people</Text>
                <Text style={styles.subtitle}>
                  Start with {contact.name}. If a circle is full, move someone out before saving.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close circle move dialog"
                disabled={saving}
                onPress={() => setOpen(false)}
                hitSlop={10}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.countsGrid}>
                {LEVELS.map((level) => {
                  const cfg = CIRCLE_CONFIG[level];
                  const count = projection.counts[level];
                  const overfull = count > cfg.max;
                  const color = circleColor(level, Colors);
                  return (
                    <View key={level} style={[styles.countCell, overfull && styles.countCellOver]}>
                      <View style={[styles.countDot, { backgroundColor: color }]} />
                      <Text style={styles.countName} numberOfLines={1}>{cfg.label}</Text>
                      <Text style={[styles.countValue, overfull && styles.overfullText]}>
                        {count}<Text style={styles.countLimit}> / {cfg.max}</Text>
                      </Text>
                    </View>
                  );
                })}
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>CHOOSE A DESTINATION</Text>
                <Text style={styles.activeMove}>
                  {activeContact.name}
                  <Text style={styles.activeSource}> · currently in {CIRCLE_CONFIG[activeContact.circleLevel as CircleLevel]?.label ?? "a circle"}</Text>
                </Text>
                <View style={styles.destinationList}>
                  {LEVELS.map((level) => {
                    const cfg = CIRCLE_CONFIG[level];
                    const selected = assignments.get(activeContact.id) === level;
                    const color = circleColor(level, Colors);
                    const count = projection.counts[level];
                    return (
                      <Pressable
                        key={level}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => stageDestination(level)}
                        style={({ pressed }) => [
                          styles.destination,
                          selected && { borderColor: color, backgroundColor: `${color}12` },
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={[styles.destinationDot, { backgroundColor: color }]} />
                        <View style={styles.destinationCopy}>
                          <Text style={styles.destinationName}>{cfg.label}</Text>
                          <Text style={styles.destinationCount}>
                            {count} of {cfg.max} after staged moves
                            {count >= cfg.max ? " · at capacity" : ""}
                          </Text>
                        </View>
                        {selected && <Ionicons name="checkmark-circle" size={20} color={color} />}
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {moves.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>STAGED MOVES · NOT SAVED</Text>
                  {moves.map((move) => {
                    const person = contacts.find((item) => item.id === move.contactId);
                    if (!person) return null;
                    const source = CIRCLE_CONFIG[person.circleLevel as CircleLevel]?.label ?? "Circle";
                    const destination = CIRCLE_CONFIG[move.circleLevel].label;
                    return (
                      <View key={move.contactId} style={styles.stagedRow}>
                        <View style={styles.stagedCopy}>
                          <Text style={styles.stagedName}>{person.name}</Text>
                          <Text style={styles.stagedRoute}>{source} <Text style={styles.routeArrow}>→</Text> {destination}</Text>
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Undo move for ${person.name}`}
                          onPress={() => undoMove(person.id)}
                          hitSlop={8}
                          style={styles.undoButton}
                        >
                          <Ionicons name="arrow-undo-outline" size={17} color={Colors.textSecondary} />
                          <Text style={styles.undoText}>Undo</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              )}

              {projection.overfullCircles.length > 0 && (
                <View style={styles.displacementPanel}>
                  <View style={styles.displacementHeading}>
                    <Ionicons name="people-outline" size={18} color={Colors.warning} />
                    <Text style={styles.displacementTitle}>Make room to continue</Text>
                  </View>
                  <Text style={styles.displacementHint}>
                    Choose someone in each over-capacity circle, then pick where they belong. You can move people into another full circle and resolve that next.
                  </Text>
                  {projection.overfullCircles.map((level) => {
                    const members = contacts.filter((person) => assignments.get(person.id) === level);
                    return (
                      <View key={level} style={styles.overfullGroup}>
                        <Text style={styles.overfullHeading}>
                          {CIRCLE_CONFIG[level].label} · {projection.counts[level]} / {CIRCLE_CONFIG[level].max}
                        </Text>
                        {members.map((person) => {
                          const staged = movesById[person.id] !== undefined;
                          const selected = activeContactId === person.id;
                          return (
                            <Pressable
                              key={person.id}
                              accessibilityRole="button"
                              accessibilityLabel={`Choose ${person.name} from ${CIRCLE_CONFIG[level].label} to move`}
                              accessibilityState={{ selected }}
                              onPress={() => {
                                setActiveContactId(person.id);
                                setError("");
                              }}
                              style={({ pressed }) => [
                                styles.personRow,
                                selected && styles.personRowSelected,
                                pressed && styles.pressed,
                              ]}
                            >
                              <View style={styles.personCopy}>
                                <Text style={styles.personName}>{person.name}</Text>
                                <Text style={styles.personDetail}>
                                  {staged
                                    ? `Staged for ${CIRCLE_CONFIG[movesById[person.id]].label}`
                                    : selected
                                      ? "Selected · choose a destination above"
                                      : "Tap to choose"}
                                </Text>
                              </View>
                              {staged ? (
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={`Undo move for ${person.name}`}
                                  onPress={() => undoMove(person.id)}
                                  style={styles.inlineUndo}
                                >
                                  <Ionicons name="arrow-undo-outline" size={17} color={Colors.textSecondary} />
                                </Pressable>
                              ) : (
                                <Ionicons name="chevron-forward" size={17} color={Colors.textTertiary} />
                              )}
                            </Pressable>
                          );
                        })}
                      </View>
                    );
                  })}
                </View>
              )}

              {!hasChanges && (
                <Text style={styles.noChanges}>No moves staged. Nothing changes until you save.</Text>
              )}
              {!!error && (
                <View accessibilityRole="alert" style={styles.errorBox}>
                  <Ionicons name="alert-circle-outline" size={18} color={Colors.danger} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.footer}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setOpen(false)}
                disabled={saving}
                style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !hasChanges || !isBalanced || saving, busy: saving }}
                onPress={handleSave}
                disabled={!hasChanges || !isBalanced || saving}
                style={({ pressed }) => [
                  styles.saveButton,
                  (!hasChanges || !isBalanced || saving) && styles.saveDisabled,
                  pressed && !saving && styles.pressed,
                ]}
              >
                {saving ? <ActivityIndicator size="small" color={Colors.onPrimary} /> : <Text style={styles.saveText}>Save moves</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const createStyles = (Colors: ThemeColors) => StyleSheet.create({
  compactTrigger: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: Colors.primary + "12",
  },
  fullTrigger: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  triggerText: { color: Colors.primary, fontSize: 14, fontFamily: "Nunito_700Bold" },
  pressed: { opacity: 0.72 },
  scrim: {
    flex: 1,
    backgroundColor: "rgba(24, 29, 42, 0.48)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 24,
  },
  dialog: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "94%",
    backgroundColor: Colors.background,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headingCopy: { flex: 1, paddingRight: 12 },
  eyebrow: { color: Colors.primary, fontSize: 10, letterSpacing: 1.4, fontFamily: "Nunito_800ExtraBold" },
  title: { marginTop: 4, color: Colors.text, fontSize: 24, fontFamily: "Nunito_800ExtraBold" },
  subtitle: { marginTop: 5, color: Colors.textSecondary, fontSize: 13, lineHeight: 19, fontFamily: "Nunito_400Regular" },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { flexShrink: 1 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12 },
  countsGrid: { flexDirection: "row", gap: 6, marginBottom: 20 },
  countCell: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 7,
    borderRadius: 13,
    backgroundColor: Colors.surface,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  countCellOver: { borderColor: Colors.danger + "80", backgroundColor: Colors.danger + "0A" },
  countDot: { width: 7, height: 7, borderRadius: 4, marginBottom: 5 },
  countName: { color: Colors.textSecondary, fontSize: 9, fontFamily: "Nunito_700Bold", textAlign: "center" },
  countValue: { marginTop: 2, color: Colors.text, fontSize: 13, fontFamily: "Nunito_800ExtraBold" },
  countLimit: { color: Colors.textTertiary, fontSize: 10, fontFamily: "Nunito_600SemiBold" },
  overfullText: { color: Colors.danger },
  section: { marginBottom: 19 },
  sectionLabel: { color: Colors.textTertiary, fontSize: 10, letterSpacing: 1.1, fontFamily: "Nunito_800ExtraBold", marginBottom: 8 },
  activeMove: { color: Colors.text, fontSize: 15, fontFamily: "Nunito_800ExtraBold", marginBottom: 9 },
  activeSource: { color: Colors.textSecondary, fontSize: 12, fontFamily: "Nunito_400Regular" },
  destinationList: { gap: 7 },
  destination: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  destinationDot: { width: 10, height: 10, borderRadius: 5 },
  destinationCopy: { flex: 1 },
  destinationName: { color: Colors.text, fontSize: 13, fontFamily: "Nunito_700Bold" },
  destinationCount: { color: Colors.textTertiary, fontSize: 11, marginTop: 1, fontFamily: "Nunito_400Regular" },
  stagedRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stagedCopy: { flex: 1 },
  stagedName: { color: Colors.text, fontSize: 13, fontFamily: "Nunito_700Bold" },
  stagedRoute: { color: Colors.textSecondary, fontSize: 11, marginTop: 2, fontFamily: "Nunito_400Regular" },
  routeArrow: { color: Colors.primary, fontFamily: "Nunito_800ExtraBold" },
  undoButton: { flexDirection: "row", alignItems: "center", gap: 4, padding: 5 },
  undoText: { color: Colors.textSecondary, fontSize: 11, fontFamily: "Nunito_700Bold" },
  displacementPanel: {
    padding: 13,
    marginBottom: 13,
    borderWidth: 1,
    borderColor: Colors.warning + "55",
    backgroundColor: Colors.warning + "0C",
    borderRadius: 15,
  },
  displacementHeading: { flexDirection: "row", alignItems: "center", gap: 7 },
  displacementTitle: { color: Colors.text, fontSize: 14, fontFamily: "Nunito_800ExtraBold" },
  displacementHint: { color: Colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 5, marginBottom: 9, fontFamily: "Nunito_400Regular" },
  overfullGroup: { marginTop: 8 },
  overfullHeading: { color: Colors.danger, fontSize: 11, fontFamily: "Nunito_800ExtraBold", marginBottom: 5 },
  personRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "transparent",
  },
  personRowSelected: { borderColor: Colors.primary + "70", backgroundColor: Colors.primary + "0C" },
  personCopy: { flex: 1 },
  personName: { color: Colors.text, fontSize: 13, fontFamily: "Nunito_700Bold" },
  personDetail: { color: Colors.textTertiary, fontSize: 10, marginTop: 1, fontFamily: "Nunito_400Regular" },
  inlineUndo: { padding: 7 },
  noChanges: { color: Colors.textTertiary, fontSize: 12, textAlign: "center", paddingVertical: 8, fontFamily: "Nunito_400Regular" },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 11,
    borderRadius: 12,
    backgroundColor: Colors.danger + "12",
    marginTop: 4,
  },
  errorText: { flex: 1, color: Colors.danger, fontSize: 12, lineHeight: 17, fontFamily: "Nunito_600SemiBold" },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 16,
    flexDirection: "row",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  cancelButton: {
    minHeight: 46,
    minWidth: 90,
    paddingHorizontal: 16,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { color: Colors.textSecondary, fontSize: 14, fontFamily: "Nunito_700Bold" },
  saveButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  saveDisabled: { opacity: 0.42 },
  saveText: { color: Colors.onPrimary, fontSize: 14, fontFamily: "Nunito_800ExtraBold" },
});
