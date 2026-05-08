import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import type { Contact } from "@/lib/types";
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
  priority: "red" | "yellow";
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
  return Colors.success;
}

export function BellSheet({ visible, onClose, contacts, isComplete }: BellSheetProps) {
  const insets = useSafeAreaInsets();

  const tasks = useMemo((): BellTask[] => {
    const result: BellTask[] = [];
    const circle1 = contacts.filter((c) => c.circleLevel === 1);
    const circle2 = contacts.filter((c) => c.circleLevel === 2);
    const circle3 = contacts.filter((c) => c.circleLevel === 3);

    circle1.filter((c) => !c.birthday).forEach((c) => {
      result.push({
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
      result.push({
        id: `c2-bday-${c.id}`,
        priority: "yellow",
        title: `Add ${c.name.split(" ")[0]}'s birthday`,
        subtitle: "Helps with timely birthday reminders",
        onPress: () => {
          onClose();
          router.push({ pathname: "/edit-contact", params: { id: c.id, focusBirthday: "true" } });
        },
      });
    });

    const c1WithBday = circle1.filter((c) => !!c.birthday).length;
    const C1_GOAL = 3;
    const C2_GOAL = 2;
    const C3_GOAL = 1;

    if (c1WithBday < C1_GOAL) {
      const needed = C1_GOAL - c1WithBday;
      result.push({
        id: "fill-c1",
        priority: "yellow",
        title: "Fill your Core Circle",
        subtitle: `${needed} more Core friend${needed !== 1 ? "s" : ""} with birthdays needed`,
        onPress: () => {
          onClose();
          router.push({ pathname: "/(tabs)/circles" });
        },
      });
    }

    if (circle2.length < C2_GOAL) {
      const needed = C2_GOAL - circle2.length;
      result.push({
        id: "fill-c2",
        priority: "yellow",
        title: "Add Close Friends",
        subtitle: `${needed} more person${needed !== 1 ? "s" : ""} needed`,
        onPress: () => {
          onClose();
          router.push({ pathname: "/(tabs)/circles" });
        },
      });
    }

    if (circle3.length < C3_GOAL) {
      result.push({
        id: "fill-c3",
        priority: "yellow",
        title: "Add an Acquaintance",
        subtitle: "Start building your outer circle",
        onPress: () => {
          onClose();
          router.push({ pathname: "/(tabs)/circles" });
        },
      });
    }

    return result;
  }, [contacts, onClose]);

  const dotColor = computeBellDotColor(contacts, isComplete);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <View style={styles.handle} />
        <View style={styles.sheetHeader}>
          {dotColor ? (
            <View style={[styles.dotIndicator, { backgroundColor: tasks.length === 0 ? Colors.success : dotColor }]} />
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

        {tasks.length === 0 ? (
          <View style={styles.allDoneContainer}>
            <Ionicons name="checkmark-circle" size={40} color={Colors.success} />
            <Text style={styles.allDoneTitle}>Your circles are complete</Text>
            <Text style={styles.allDoneSub}>Everything looks great. Keep it up!</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} style={styles.taskList}>
            {tasks.map((task) => (
              <Pressable
                key={task.id}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  task.onPress();
                }}
                style={({ pressed }) => [styles.taskItem, pressed && { opacity: 0.7 }]}
              >
                <View
                  style={[
                    styles.taskDot,
                    { backgroundColor: task.priority === "red" ? Colors.danger : Colors.warning },
                  ]}
                />
                <View style={styles.taskContent}>
                  <Text style={styles.taskTitle}>{task.title}</Text>
                  <Text style={styles.taskSubtitle}>{task.subtitle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
              </Pressable>
            ))}
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
});
