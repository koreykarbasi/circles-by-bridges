import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, Platform, Modal, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useContacts } from "@/lib/contacts-context";
import { ContactCard } from "@/components/ContactCard";
import { EmptyState } from "@/components/EmptyState";
import { CIRCLE_CONFIG } from "@/lib/types";
import type { Contact } from "@/lib/types";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { computeProfileCompletion } from "@/lib/profile-completion";
import { BellSheet, computeBellDotColor } from "@/components/BellSheet";
import { useSequentialHints, HINT_TEXT } from "@/lib/hints-store";
import { HintTooltip } from "@/components/HintTooltip";
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from "react-native-draggable-flatlist";

function isMissingEnrichment(c: Contact): boolean {
  return (c.interests ?? []).length === 0;
}

export default function CirclesScreen() {
  const insets = useSafeAreaInsets();
  const { contacts, getCircleContacts, markContacted, isLoading, reorderCircleContacts } = useContacts();
  const { circle: circleParam, filter: filterParam } = useLocalSearchParams<{ circle?: string; filter?: string }>();
  const [activeCircle, setActiveCircle] = useState<1 | 2 | 3>(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [bellSheetOpen, setBellSheetOpen] = useState(false);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const searchRef = useRef<TextInput>(null);
  const [activeHint, dismissHint] = useSequentialHints(["circles_viz", "circles_calendar"]);

  useEffect(() => {
    const parsed = parseInt(circleParam ?? "", 10);
    if (parsed === 1 || parsed === 2 || parsed === 3) {
      setActiveCircle(parsed);
    }
  }, [circleParam]);

  useEffect(() => {
    if (filterParam) {
      setActiveFilter(filterParam);
      setSearchQuery("");
    }
  }, [filterParam]);

  useEffect(() => {
    if (!activeFilter) setSearchQuery("");
  }, [activeCircle]);

  const circleContacts = getCircleContacts(activeCircle);

  const filteredContacts = useMemo(() => {
    if (activeFilter === "yellow-dot") {
      return contacts.filter(isMissingEnrichment);
    }
    const base = activeFilter === "missing-birthday-c1"
      ? circleContacts.filter((c) => !c.birthday)
      : activeFilter === "missing-birthday-c2"
        ? circleContacts.filter((c) => !c.birthday || isMissingEnrichment(c))
        : circleContacts;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter((c) => c.name.toLowerCase().includes(q));
  }, [circleContacts, contacts, searchQuery, activeFilter]);

  const config = CIRCLE_CONFIG[activeCircle];
  const isCircleFull = circleContacts.length >= config.max;
  const profileCompletion = useMemo(() => computeProfileCompletion(contacts), [contacts]);
  const bellDotColor = useMemo(
    () => computeBellDotColor(contacts, profileCompletion.isComplete),
    [contacts, profileCompletion.isComplete],
  );
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const canDrag = Platform.OS !== "web" && !searchQuery && !activeFilter;

  const showAddOptions = () => {
    if (isCircleFull) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setAddSheetOpen(true);
  };

  const handleDragEnd = useCallback(
    ({ data }: { data: Contact[] }) => {
      const orderedIds = data.map((c) => c.id);
      reorderCircleContacts(activeCircle, orderedIds).catch(() => {});
    },
    [activeCircle, reorderCircleContacts],
  );

  const incompleteContactIds = useMemo(
    () => new Set(profileCompletion.incompleteAnyContact.map((c) => c.id)),
    [profileCompletion.incompleteAnyContact],
  );

  const renderItem = useCallback(
    ({ item: contact, drag, isActive }: RenderItemParams<Contact>) => {
      return (
        <ScaleDecorator activeScale={1.03}>
          <View style={isActive ? styles.draggingCard : undefined}>
            <ContactCard
              contact={contact}
              onPress={() =>
                router.push({ pathname: "/edit-contact", params: { id: contact.id } })
              }
              onMarkContacted={() => markContacted(contact.id)}
              onPlanHangout={() => {
                markContacted(contact.id);
                router.push({ pathname: "/create-hangout", params: { contactName: contact.name } });
              }}
              onLongPress={canDrag ? drag : undefined}
              showCircleLabel={activeFilter === "yellow-dot"}
              isProfileIncomplete={incompleteContactIds.has(contact.id)}
            />
            {!activeFilter && activeCircle === 1 && !contact.birthday && profileCompletion.stage === 1 && (
              <Pressable
                onPress={() => router.push({ pathname: "/edit-contact", params: { id: contact.id, focusBirthday: "true" } })}
                style={({ pressed }) => [styles.birthdayNudge, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="gift-outline" size={14} color={Colors.accent} />
                <Text style={styles.birthdayNudgeText}>Add {contact.name.split(" ")[0]}'s birthday</Text>
                <Ionicons name="chevron-forward" size={13} color={Colors.textTertiary} />
              </Pressable>
            )}
          </View>
        </ScaleDecorator>
      );
    },
    [canDrag, activeCircle, markContacted, profileCompletion.stage, activeFilter, incompleteContactIds],
  );

  const filterBannerLabel = useMemo(() => {
    if (activeFilter === "missing-birthday-c1") return "Showing Core contacts missing a birthday";
    if (activeFilter === "missing-birthday-c2") return "Showing Close contacts missing birthday or details";
    if (activeFilter === "yellow-dot") return "Showing all contacts missing a birthday or interests";
    return null;
  }, [activeFilter]);

  const listHeader = useMemo(() => (
    <View style={[styles.headerWrapper, { paddingTop: insets.top + 16 + webTopInset }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Circles</Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/hangouts");
            }}
            style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="calendar-outline" size={22} color={Colors.primaryLight} />
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setBellSheetOpen(true);
            }}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
          >
            <View style={styles.bellBtn}>
              <Ionicons name="notifications-outline" size={20} color={Colors.primaryLight} />
              {bellDotColor && (
                <View style={[styles.bellDot, { backgroundColor: bellDotColor }]} />
              )}
            </View>
          </Pressable>
          <Pressable
            onPress={showAddOptions}
            disabled={isCircleFull}
            style={({ pressed }) => [
              styles.addButton,
              isCircleFull && styles.addButtonDisabled,
              !isCircleFull && pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="add" size={24} color={isCircleFull ? Colors.textTertiary : "#fff"} />
          </Pressable>
        </View>
      </View>

      <View style={styles.tabs}>
        {([1, 2, 3] as const).map((level) => {
          const cfg = CIRCLE_CONFIG[level];
          const count = getCircleContacts(level).length;
          const isActive = activeCircle === level;
          return (
            <Pressable
              key={level}
              onPress={() => {
                Haptics.selectionAsync();
                setActiveCircle(level);
                setActiveFilter(null);
              }}
              style={[
                styles.tab,
                isActive && { backgroundColor: cfg.color + "18", borderColor: cfg.color + "40" },
              ]}
            >
              <View style={[styles.tabDot, { backgroundColor: cfg.color }]} />
              <Text
                style={[styles.tabLabel, isActive && { color: cfg.color }]}
                numberOfLines={1}
              >
                {cfg.label}
              </Text>
              <Text style={[styles.tabCount, isActive && { color: cfg.color }]}>
                {count}/{cfg.max}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {filterBannerLabel ? (
        <Pressable
          onPress={() => setActiveFilter(null)}
          style={({ pressed }) => [styles.filterBanner, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="funnel" size={13} color={Colors.primary} />
          <Text style={styles.filterBannerText} numberOfLines={1}>{filterBannerLabel}</Text>
          <Ionicons name="close-circle" size={16} color={Colors.textTertiary} />
        </Pressable>
      ) : (
        <Text style={styles.circleDescription}>{config.description}</Text>
      )}

      {!activeFilter && circleContacts.length > 0 && (
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={16} color={Colors.textTertiary} style={styles.searchIcon} />
          <TextInput
            ref={searchRef}
            style={styles.searchInput}
            placeholder={`Search ${config.label}...`}
            placeholderTextColor={Colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && Platform.OS !== "ios" && (
            <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={Colors.textTertiary} />
            </Pressable>
          )}
        </View>
      )}

      {isLoading ? (
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 48 }} />
      ) : !activeFilter && circleContacts.length === 0 ? (
        <EmptyState
          icon="person-add-outline"
          title={`No one in ${config.label}`}
          subtitle={`Add up to ${config.max} people to this circle`}
          actionLabel="Add someone"
          onAction={showAddOptions}
        />
      ) : activeFilter && filteredContacts.length === 0 ? (
        <View style={styles.noResults}>
          <Text style={styles.noResultsText}>No contacts to show here</Text>
        </View>
      ) : !activeFilter && filteredContacts.length === 0 ? (
        <View style={styles.noResults}>
          <Text style={styles.noResultsText}>No contacts match "{searchQuery}"</Text>
        </View>
      ) : null}
    </View>
  ), [insets.top, webTopInset, bellDotColor, isCircleFull, activeCircle, config, circleContacts.length, filteredContacts.length, searchQuery, isLoading, getCircleContacts, activeFilter, filterBannerLabel]);

  const listFooter = useMemo(() => (
    !searchQuery && circleContacts.length < config.max && circleContacts.length > 0 ? (
      <View style={styles.footerWrapper}>
        <Pressable
          onPress={showAddOptions}
          style={({ pressed }) => [styles.addSomeoneButton, pressed && { opacity: 0.7 }]}
        >
          <View style={styles.addSomeoneIcon}>
            <Ionicons name="add" size={18} color={Colors.primary} />
          </View>
          <Text style={styles.addSomeoneText}>Add someone to {config.label}</Text>
        </Pressable>
      </View>
    ) : null
  ), [searchQuery, circleContacts.length, config.max, config.label]);

  return (
    <View style={styles.container}>
      <DraggableFlatList
        data={filteredContacts}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onDragEnd={handleDragEnd}
        onDragBegin={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
        activationDistance={10}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: 100 + (Platform.OS === "web" ? 34 : 0) },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />

      <BellSheet
        visible={bellSheetOpen}
        onClose={() => setBellSheetOpen(false)}
        contacts={contacts}
        isComplete={profileCompletion.isComplete}
      />

      <Modal
        visible={addSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setAddSheetOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setAddSheetOpen(false)} />
        <View style={[styles.addSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Add to {config.label}</Text>
          <Pressable
            onPress={() => {
              setAddSheetOpen(false);
              router.push({ pathname: "/import-contacts", params: { circle: String(activeCircle) } });
            }}
            style={({ pressed }) => [styles.sheetOption, pressed && { opacity: 0.7 }]}
          >
            <View style={styles.sheetOptionIcon}>
              <Ionicons name="people-outline" size={22} color={Colors.primary} />
            </View>
            <View style={styles.sheetOptionText}>
              <Text style={styles.sheetOptionLabel}>Import from Contacts</Text>
              <Text style={styles.sheetOptionSub}>Pick from your phone's contacts</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
          </Pressable>
          <Pressable
            onPress={() => {
              setAddSheetOpen(false);
              router.push({ pathname: "/add-contact", params: { circle: String(activeCircle) } });
            }}
            style={({ pressed }) => [styles.sheetOption, pressed && { opacity: 0.7 }]}
          >
            <View style={styles.sheetOptionIcon}>
              <Ionicons name="person-add-outline" size={22} color={Colors.primary} />
            </View>
            <View style={styles.sheetOptionText}>
              <Text style={styles.sheetOptionLabel}>Add Manually</Text>
              <Text style={styles.sheetOptionSub}>Enter a name and details by hand</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
          </Pressable>
        </View>
      </Modal>

      <HintTooltip
        visible={!!activeHint}
        text={activeHint ? HINT_TEXT[activeHint] : ""}
        onDismiss={dismissHint}
        bottomOffset={80}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  listContent: {
    paddingHorizontal: 20,
  },
  headerWrapper: {
    paddingBottom: 4,
  },
  footerWrapper: {
    marginTop: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontFamily: "Nunito_800ExtraBold",
    color: Colors.text,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary + "18",
    borderWidth: 1,
    borderColor: Colors.primary + "30",
    alignItems: "center",
    justifyContent: "center",
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  bellBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary + "18",
    borderWidth: 1,
    borderColor: Colors.primary + "30",
    alignItems: "center",
    justifyContent: "center",
  },
  bellDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Colors.background,
  },
  tabs: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: 4,
  },
  tabDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tabLabel: {
    fontSize: 12,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
    textAlign: "center",
  },
  tabCount: {
    fontSize: 11,
    fontFamily: "Nunito_700Bold",
    color: Colors.textTertiary,
  },
  circleDescription: {
    fontSize: 13,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    marginBottom: 12,
    textAlign: "center",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    paddingHorizontal: 12,
    marginBottom: 14,
    height: 40,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Nunito_400Regular",
    color: Colors.text,
    height: 40,
  },
  noResults: {
    paddingVertical: 32,
    alignItems: "center",
  },
  noResultsText: {
    fontSize: 14,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
  },
  filterBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.primary + "12",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.primary + "25",
  },
  filterBannerText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.primaryLight,
  },
  addSomeoneButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.primary + "30",
    borderStyle: "dashed",
    backgroundColor: Colors.primary + "08",
    marginTop: 8,
  },
  addSomeoneIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  addSomeoneText: {
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.primary,
  },
  draggingCard: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 12,
  },
  birthdayNudge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: Colors.accent + "12",
    borderRadius: 8,
    marginTop: -4,
    marginBottom: 8,
    marginHorizontal: 2,
  },
  birthdayNudgeText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.accent,
  },
  addButtonDisabled: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  addSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 17,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
    marginBottom: 16,
  },
  sheetOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  sheetOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetOptionText: {
    flex: 1,
  },
  sheetOptionLabel: {
    fontSize: 15,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.text,
  },
  sheetOptionSub: {
    fontSize: 12,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
