import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import type { Contact } from "@/lib/types";
import { STAGE1_GOALS } from "@/lib/profile-completion";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";

interface BellSheetProps {
  visible: boolean;
  onClose: () => void;
  contacts: Contact[];
  isComplete: boolean;
}

interface BellTask {
  id: string;
  priority: "red" | "orange" | "yellow";
  title: string;
  subtitle: string;
  onPress: () => void;
}

export function computeBellDotColor(contacts: Contact[], isComplete: boolean): string | null {
  if (contacts.length === 0) return null;
  const c1Missing = contacts.filter((c) => c.circleLevel === 1 && !c.birthday);
  if (c1Missing.length > 0) return Colors.danger;
  if (!isComplete) return Colors.warning;
  const c2Missing = contacts.filter((c) => c.circleLevel === 2 && !c.birthday);
  if (c2Missing.length > 0) return Colors.warning;
  const missingEnrichment = contacts.filter(
    (c) => (c.labels ?? []).length === 0 && (c.interests ?? []).length === 0,
  );
  if (missingEnrichment.length > 0) return Colors.yellow;
  return Colors.success;
}

export function BellSheet({ visible, onClose, contacts, isComplete }: BellSheetProps) {
  const insets = useSafeAreaInsets();

  const { urgent, recommended, missingEnrichmentCount } = useMemo(() => {
    const urgent: BellTask[] = [];
    const recommended: BellTask[] = [];

    const circle1 = contacts.filter((c) => c.circleLevel === 1);
    const circle2 = contacts.filter((c) => c.circleLevel === 2);
    const circle3 = contacts.filter((c) => c.circleLevel === 3);

    circle1.filter((c) => !c.birthday).forEach((c) => {
      urgent.push({
        id: `c1-bday-${c.id}`,
        priority: "red",
        title: `Add ${c.name.split(" ")[0]}'s birthday`,
        subtitle: "Required for Core Circle contacts",
        onPress: () => {
          onClose();
          router.push({ pathname: "/edit-contact", params: { id: c.id, focusBirthday: "true" } });
        },
      });
    });

    circle2.filter((c) => !c.birthday).forEach((c) => {
      recommended.push({
        id: `c2-bday-${c.id}`,
        priority: "orange",
        title: `Add ${c.name.split(" ")[0]}'s birthday`,
        subtitle: "Helps with timely birthday reminders",
        onPress: () => {
          onClose();
          router.push({ pathname: "/edit-contact", params: { id: c.id, focusBirthday: "true" } });
        },
      });
    });

    const c1WithBday = circle1.filter((c) => !!c.birthday).length;

    if (c1WithBday < STAGE1_GOALS.circle1WithBirthday) {
      const needed = STAGE1_GOALS.circle1WithBirthday - c1WithBday;
      recommended.push({
        id: "fill-c1",
        priority: "orange",
        title: "Fill your Core Circle",
        subtitle: `${needed} more Core friend${needed !== 1 ? "s" : ""} with birthdays needed`,
        onPress: () => {
          onClose();
          router.push({ pathname: "/(tabs)/circles", params: { circle: "1" } });
        },
      });
    }

    if (circle2.length < STAGE1_GOALS.circle2) {
      const needed = STAGE1_GOALS.circle2 - circle2.length;
      recommended.push({
        id: "fill-c2",
        priority: "orange",
        title: "Add Close Friends",
        subtitle: `${needed} more person${needed !== 1 ? "s" : ""} needed`,
        onPress: () => {
          onClose();
          router.push({ pathname: "/(tabs)/circles", params: { circle: "2" } });
        },
      });
    }

    if (circle3.length < STAGE1_GOALS.circle3) {
      recommended.push({
        id: "fill-c3",
        priority: "orange",
        title: "Add a Friend",
        subtitle: "Start building your outer circle",
        onPress: () => {
          onClose();
          router.push({ pathname: "/(tabs)/circles", params: { circle: "3" } });
        },
      });
    }

    const missingEnrichmentCount = contacts.filter(
      (c) => (c.labels ?? []).length === 0 && (c.interests ?? []).length === 0,
    ).length;

    return { urgent, recommended, missingEnrichmentCount };
  }, [contacts, onClose]);

  const totalTasks = urgent.length + recommended.length;
  const allDone = totalTasks === 0 && missingEnrichmentCount === 0;
  const dotColor = computeBellDotColor(contacts, isComplete);

  function getPriorityColor(priority: BellTask["priority"]): string {
    if (priority === "red") return Colors.danger;
    if (priority === "orange") return Colors.warning;
    return Colors.yellow;
  }

  function renderTask(task: BellTask) {
    return (
      <Pressable
        key={task.id}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          task.onPress();
        }}
        style={({ pressed }) => [styles.taskItem, pressed && { opacity: 0.7 }]}
      >
        <View style={[styles.taskDot, { backgroundColor: getPriorityColor(task.priority) }]} />
        <View style={styles.taskContent}>
          <Text style={styles.taskTitle}>{task.title}</Text>
          <Text style={styles.taskSubtitle}>{task.subtitle}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
      </Pressable>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <View style={styles.handle} />
        <View style={styles.sheetHeader}>
          {dotColor ? (
            <View style={[styles.dotIndicator, { backgroundColor: allDone ? Colors.success : dotColor }]} />
          ) : null}
          <Text style={styles.sheetTitle}>Profile Completion</Text>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.5 }]}
          >
            <Ionicons name="close" size={20} color={Colors.textSecondary} />
          </Pressable>
        </View>

        {allDone ? (
          <View style={styles.allDoneContainer}>
            <Ionicons name="checkmark-circle" size={40} color={Colors.success} />
            <Text style={styles.allDoneTitle}>Your circles are complete</Text>
            <Text style={styles.allDoneSub}>Everything looks great. Keep it up!</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} style={styles.taskList}>
            {urgent.length > 0 && (
              <>
                <Text style={styles.groupLabel}>Action Required</Text>
                {urgent.map(renderTask)}
              </>
            )}
            {recommended.length > 0 && (
              <>
                <Text style={[styles.groupLabel, urgent.length > 0 && { marginTop: 16 }]}>Recommended</Text>
                {recommended.map(renderTask)}
              </>
            )}
            {missingEnrichmentCount > 0 && (
              <>
                <Text style={[styles.groupLabel, (urgent.length > 0 || recommended.length > 0) && { marginTop: 16 }]}>
                  For Better Suggestions
                </Text>
                <View style={styles.infoItem}>
                  <View style={[styles.infoIcon, { backgroundColor: Colors.yellow + "22" }]}>
                    <Text style={styles.infoIconText}>!</Text>
                  </View>
                  <View style={styles.taskContent}>
                    <Text style={styles.taskTitle}>
                      {missingEnrichmentCount} contact{missingEnrichmentCount !== 1 ? "s" : ""} tagged with{" "}
                      <Text style={{ color: Colors.yellow }}>!</Text>
                    </Text>
                    <Text style={styles.taskSubtitle}>
                      Missing labels and shared activities. Complete profiles for more curated suggestions.
                    </Text>
                  </View>
                </View>
              </>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 20,
    maxHeight: "70%",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 8,
  },
  dotIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  sheetTitle: {
    flex: 1,
    fontSize: 17,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
  },
  closeBtn: {
    padding: 4,
  },
  allDoneContainer: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 8,
  },
  allDoneTitle: {
    fontSize: 18,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
  },
  allDoneSub: {
    fontSize: 14,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
  },
  taskList: {
    maxHeight: 420,
  },
  groupLabel: {
    fontSize: 11,
    fontFamily: "Nunito_700Bold",
    color: Colors.textTertiary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  taskItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  taskDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  taskContent: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.text,
  },
  taskSubtitle: {
    fontSize: 12,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    marginTop: 2,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  infoIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  infoIconText: {
    fontSize: 14,
    fontFamily: "Nunito_800ExtraBold",
    color: Colors.yellow,
  },
});
