import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Alert,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { useContacts } from "@/lib/contacts-context";
import { useOnboarding } from "@/lib/onboarding-context";
import { useAuth } from "@/lib/auth-context";
import { CIRCLE_CONFIG } from "@/lib/types";
import * as Haptics from "expo-haptics";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { contacts } = useContacts();
  const { resetOnboarding } = useOnboarding();
  const { user, logout, updateProfilePhoto, updateNotificationPreferences } = useAuth();

  const [notifFreq, setNotifFreq] = useState<string>(user?.suggestionNotifFrequency ?? "daily");
  const [notifTime, setNotifTime] = useState<string>(user?.suggestionNotifTime ?? "morning");

  // Keep local state in sync when the auth context user hydrates after mount
  React.useEffect(() => {
    if (user?.suggestionNotifFrequency) setNotifFreq(user.suggestionNotifFrequency);
    if (user?.suggestionNotifTime) setNotifTime(user.suggestionNotifTime);
  }, [user?.suggestionNotifFrequency, user?.suggestionNotifTime]);

  const FREQ_OPTIONS = [
    { value: "daily", label: "Daily" },
    { value: "3x_week", label: "3x / week" },
    { value: "weekly", label: "Weekly" },
    { value: "off", label: "Off" },
  ];

  const TIME_OPTIONS = [
    { value: "morning", label: "Morning", sub: "9am" },
    { value: "afternoon", label: "Afternoon", sub: "5pm" },
  ];

  const handleFreqChange = async (freq: string) => {
    setNotifFreq(freq);
    try {
      await updateNotificationPreferences(freq, freq !== "off" ? notifTime : null);
    } catch {
      // Non-fatal
    }
  };

  const handleTimeChange = async (t: string) => {
    setNotifTime(t);
    try {
      await updateNotificationPreferences(notifFreq, t);
    } catch {
      // Non-fatal
    }
  };

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const circle1Count = contacts.filter((c) => c.circleLevel === 1).length;
  const circle2Count = contacts.filter((c) => c.circleLevel === 2).length;
  const circle3Count = contacts.filter((c) => c.circleLevel === 3).length;

  const handleReplayWalkthrough = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Replay Walkthrough",
      "This will show you the introductory walkthrough again. Your contacts won't be affected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Replay",
          onPress: async () => {
            await resetOnboarding();
          },
        },
      ],
    );
  };

  const handleLogout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            await logout();
            router.replace("/auth");
          },
        },
      ],
    );
  };

  const handlePickPhoto = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.base64) {
        const estimatedBytes = asset.base64.length * 0.75;
        if (estimatedBytes > 5 * 1024 * 1024) {
          Alert.alert("Photo is too large", "Please choose a smaller image (under 5 MB).");
          return;
        }
        const dataUri = `data:image/jpeg;base64,${asset.base64}`;
        await updateProfilePhoto(dataUri);
      }
    }
  };

  return (
    <View style={[styles.container]}>
      <View style={[styles.headerBar, { paddingTop: insets.top + 8 + webTopInset }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [pressed && { opacity: 0.5 }]}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 + webBottomInset }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.avatarSection}>
          <Pressable onPress={handlePickPhoto} style={({ pressed }) => [pressed && { opacity: 0.8 }]}>
            <View style={styles.avatarLarge}>
              {user?.profilePhotoUri ? (
                <Image source={{ uri: user.profilePhotoUri }} style={styles.avatarImage} />
              ) : (
                <Ionicons name="person" size={40} color={Colors.primaryLight} />
              )}
              <View style={styles.cameraButton}>
                <Ionicons name="camera" size={14} color="#fff" />
              </View>
            </View>
          </Pressable>
          <Text style={styles.userName}>{user?.name || user?.email || "My Bridges"}</Text>
          <Text style={styles.userStat}>
            {contacts.length} {contacts.length === 1 ? "connection" : "connections"}
          </Text>
        </View>

        <View style={styles.statsRow}>
          {([1, 2, 3] as const).map((level) => {
            const cfg = CIRCLE_CONFIG[level];
            const count = level === 1 ? circle1Count : level === 2 ? circle2Count : circle3Count;
            return (
              <View key={level} style={styles.statItem}>
                <View style={[styles.statDot, { backgroundColor: cfg.color }]} />
                <Text style={styles.statCount}>{count}</Text>
                <Text style={styles.statLabel}>{cfg.label}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Notifications</Text>
          <View style={[styles.menuItem, { flexDirection: "column", alignItems: "flex-start", gap: 12 }]}>
            <Text style={styles.menuTitle}>Suggestion nudges</Text>
            <View style={profileNotifStyles.tilesGrid}>
              {FREQ_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={[profileNotifStyles.tile, notifFreq === opt.value && profileNotifStyles.tileActive]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    handleFreqChange(opt.value);
                  }}
                >
                  <Text style={[profileNotifStyles.tileLabel, notifFreq === opt.value && profileNotifStyles.tileLabelActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {notifFreq !== "off" && (
              <View style={{ width: "100%" }}>
                <Text style={[styles.menuDesc, { marginBottom: 8 }]}>Time of day</Text>
                <View style={profileNotifStyles.timeRow}>
                  {TIME_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.value}
                      style={[profileNotifStyles.timeTile, notifTime === opt.value && profileNotifStyles.timeTileActive]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        handleTimeChange(opt.value);
                      }}
                    >
                      <Text style={[profileNotifStyles.timeTileLabel, notifTime === opt.value && profileNotifStyles.timeTileLabelActive]}>
                        {opt.label}
                      </Text>
                      <Text style={[profileNotifStyles.timeTileSub, notifTime === opt.value && profileNotifStyles.timeTileSubActive]}>
                        {opt.sub}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Help</Text>
          <Pressable
            onPress={handleReplayWalkthrough}
            style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]}
          >
            <View style={[styles.menuIcon, { backgroundColor: Colors.primary + "18" }]}>
              <Ionicons name="help-circle-outline" size={20} color={Colors.primary} />
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>Replay Walkthrough</Text>
              <Text style={styles.menuDesc}>Review how Bridges works</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>About</Text>
          <View style={styles.menuItem}>
            <View style={[styles.menuIcon, { backgroundColor: Colors.circle3 + "18" }]}>
              <Ionicons name="information-circle-outline" size={20} color={Colors.circle3} />
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>About Bridges</Text>
              <Text style={styles.menuDesc}>
                Built on Dunbar's theory of relationship layers
              </Text>
            </View>
          </View>
          <View style={styles.menuItem}>
            <View style={[styles.menuIcon, { backgroundColor: Colors.warning + "18" }]}>
              <MaterialCommunityIcons name="bridge" size={20} color={Colors.warning} />
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>Version</Text>
              <Text style={styles.menuDesc}>1.0.0</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Account</Text>
          <Pressable
            onPress={handleLogout}
            style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]}
          >
            <View style={[styles.menuIcon, { backgroundColor: Colors.danger + "18" }]}>
              <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
            </View>
            <View style={styles.menuContent}>
              <Text style={[styles.menuTitle, { color: Colors.danger }]}>Sign Out</Text>
              <Text style={styles.menuDesc}>{user?.email}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
          </Pressable>
        </View>
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
    paddingTop: 24,
  },
  avatarSection: {
    alignItems: "center",
    marginBottom: 24,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary + "20",
    borderWidth: 2,
    borderColor: Colors.primary + "40",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    overflow: "hidden",
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  cameraButton: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.background,
  },
  userName: {
    fontSize: 18,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
  },
  userStat: {
    fontSize: 14,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 28,
  },
  statItem: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  statDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 6,
  },
  statCount: {
    fontSize: 20,
    fontFamily: "Nunito_800ExtraBold",
    color: Colors.text,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textTertiary,
    marginTop: 2,
    textAlign: "center",
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: "Nunito_700Bold",
    color: Colors.textTertiary,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    marginBottom: 10,
    paddingLeft: 4,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    marginBottom: 8,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 15,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.text,
  },
  menuDesc: {
    fontSize: 12,
    fontFamily: "Nunito_400Regular",
    color: Colors.textTertiary,
    marginTop: 1,
  },
});

const profileNotifStyles = StyleSheet.create({
  tilesGrid: {
    flexDirection: "row",
    flexWrap: "wrap" as const,
    gap: 8,
    width: "100%",
  },
  tile: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.background,
  },
  tileActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + "18",
  },
  tileLabel: {
    fontSize: 13,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
  },
  tileLabelActive: {
    color: Colors.primary,
  },
  timeRow: {
    flexDirection: "row" as const,
    gap: 8,
    width: "100%",
  },
  timeTile: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.background,
    alignItems: "center" as const,
    gap: 2,
  },
  timeTileActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + "18",
  },
  timeTileLabel: {
    fontSize: 13,
    fontFamily: "Nunito_700Bold",
    color: Colors.textSecondary,
  },
  timeTileLabelActive: {
    color: Colors.primary,
  },
  timeTileSub: {
    fontSize: 11,
    fontFamily: "Nunito_400Regular",
    color: Colors.textTertiary,
  },
  timeTileSubActive: {
    color: Colors.primary + "cc",
  },
});
