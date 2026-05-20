import React, { useEffect, useMemo } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
  SharedValue,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { Avatar } from "./Avatar";
import type { Contact } from "@/lib/types";
import type { AuthUser } from "@/lib/types";

interface CirclesVisualizationProps {
  contacts: Contact[];
  user?: AuthUser | null;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const VIZ_SIZE = Math.min(SCREEN_WIDTH - 48, 320);
const MAX_OUTER_SHOWN = 15;

function OrbitingAvatar({
  contact,
  index,
  total,
  radius,
  avatarSize,
  center,
  ringRotation,
}: {
  contact: Contact;
  index: number;
  total: number;
  radius: number;
  avatarSize: number;
  center: number;
  ringRotation: SharedValue<number>;
}) {
  const baseAngle = (360 / Math.max(total, 1)) * index - 90;

  const animatedStyle = useAnimatedStyle(() => {
    const angle = ((baseAngle + ringRotation.value) * Math.PI) / 180;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    return {
      position: "absolute" as const,
      left: center + x - avatarSize / 2,
      top: center + y - avatarSize / 2,
    };
  });

  return (
    <Animated.View style={animatedStyle}>
      <Avatar
        name={contact.name}
        color={contact.avatarColor}
        size={avatarSize}
        photoUri={contact.photoUri}
      />
    </Animated.View>
  );
}

function OverflowBadge({
  count,
  radius,
  center,
  totalSlots,
  slotIndex,
  ringRotation,
}: {
  count: number;
  radius: number;
  center: number;
  totalSlots: number;
  slotIndex: number;
  ringRotation: SharedValue<number>;
}) {
  const baseAngle = (360 / Math.max(totalSlots, 1)) * slotIndex - 90;
  const size = 26;

  const animatedStyle = useAnimatedStyle(() => {
    const angle = ((baseAngle + ringRotation.value) * Math.PI) / 180;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    return {
      position: "absolute" as const,
      left: center + x - size / 2,
      top: center + y - size / 2,
    };
  });

  return (
    <Animated.View style={animatedStyle}>
      <View style={[styles.overflowBadge, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={styles.overflowText}>+{count}</Text>
      </View>
    </Animated.View>
  );
}

function useRingRotation(speed: number) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = 0;
    rotation.value = withRepeat(
      withTiming(360, { duration: speed, easing: Easing.linear }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(rotation);
    };
  }, [speed]);

  return rotation;
}

export function CirclesVisualization({ contacts, user }: CirclesVisualizationProps) {
  const c1 = contacts.filter((c) => c.circleLevel === 1);
  const c2 = contacts.filter((c) => c.circleLevel === 2);
  const c3All = contacts.filter((c) => c.circleLevel === 3);

  const c3Shown = useMemo(() => {
    if (c3All.length <= MAX_OUTER_SHOWN) return c3All;
    return [...c3All].sort((a, b) => a.id.localeCompare(b.id)).slice(0, MAX_OUTER_SHOWN);
  }, [c3All.length]);

  const c3Overflow = c3All.length - c3Shown.length;
  const c3TotalSlots = c3Shown.length + (c3Overflow > 0 ? 1 : 0);

  const outerRadius = VIZ_SIZE / 2;
  const middleRadius = outerRadius * 0.68;
  const innerRadius = outerRadius * 0.38;
  const centerSize = 44;

  const c1OrbitRadius = innerRadius * 0.65;
  const c2OrbitRadius = (middleRadius + innerRadius) / 2;
  const c3OrbitRadius = (outerRadius + middleRadius) / 2;

  const ring1Rotation = useRingRotation(60000);
  const ring2Rotation = useRingRotation(90000);
  const ring3Rotation = useRingRotation(120000);

  return (
    <View style={styles.wrapper}>
      <View style={[styles.vizContainer, { width: VIZ_SIZE, height: VIZ_SIZE }]}>
        <View
          style={[
            styles.ring,
            {
              width: outerRadius * 2,
              height: outerRadius * 2,
              borderRadius: outerRadius,
              borderColor: Colors.circle3 + "30",
              backgroundColor: Colors.circle3 + "06",
            },
          ]}
        />
        <View
          style={[
            styles.ring,
            {
              width: middleRadius * 2,
              height: middleRadius * 2,
              borderRadius: middleRadius,
              borderColor: Colors.circle2 + "35",
              backgroundColor: Colors.circle2 + "08",
            },
          ]}
        />
        <View
          style={[
            styles.ring,
            {
              width: innerRadius * 2,
              height: innerRadius * 2,
              borderRadius: innerRadius,
              borderColor: Colors.circle1 + "40",
              backgroundColor: Colors.circle1 + "10",
            },
          ]}
        />

        {c3Shown.map((contact, i) => (
          <OrbitingAvatar
            key={contact.id}
            contact={contact}
            index={i}
            total={c3TotalSlots}
            radius={c3OrbitRadius}
            avatarSize={24}
            center={outerRadius}
            ringRotation={ring3Rotation}
          />
        ))}
        {c3Overflow > 0 && (
          <OverflowBadge
            count={c3Overflow}
            radius={c3OrbitRadius}
            center={outerRadius}
            totalSlots={c3TotalSlots}
            slotIndex={c3Shown.length}
            ringRotation={ring3Rotation}
          />
        )}

        {c2.map((contact, i) => (
          <OrbitingAvatar
            key={contact.id}
            contact={contact}
            index={i}
            total={c2.length}
            radius={c2OrbitRadius}
            avatarSize={26}
            center={outerRadius}
            ringRotation={ring2Rotation}
          />
        ))}

        {c1.map((contact, i) => (
          <OrbitingAvatar
            key={contact.id}
            contact={contact}
            index={i}
            total={c1.length}
            radius={c1OrbitRadius}
            avatarSize={28}
            center={outerRadius}
            ringRotation={ring1Rotation}
          />
        ))}

        {contacts.length > 0 ? (
          <View style={[styles.centerIcon, { width: centerSize, height: centerSize, borderRadius: centerSize / 2 }]}>
            {user?.profilePhotoUri ? (
              <Animated.Image
                source={{ uri: user.profilePhotoUri }}
                style={{ width: centerSize, height: centerSize, borderRadius: centerSize / 2 }}
              />
            ) : (
              <Ionicons name="person" size={20} color={Colors.primaryLight} />
            )}
          </View>
        ) : (
          <View style={styles.emptyCenter}>
            <Text style={styles.emptyText}>Add people to your circles</Text>
          </View>
        )}
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.circle1 }]} />
          <Text style={styles.legendText}>Core ({c1.length})</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.circle2 }]} />
          <Text style={styles.legendText}>Close ({c2.length})</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.circle3 }]} />
          <Text style={styles.legendText}>Acquaintances ({c3All.length})</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    paddingVertical: 8,
  },
  vizContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    borderWidth: 1.5,
    borderStyle: "dashed",
  },
  centerIcon: {
    backgroundColor: Colors.primary + "20",
    borderWidth: 2,
    borderColor: Colors.primary + "40",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  emptyCenter: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "Nunito_400Regular",
    color: Colors.textTertiary,
    textAlign: "center",
    width: 100,
  },
  overflowBadge: {
    backgroundColor: Colors.circle3 + "30",
    borderWidth: 1.5,
    borderColor: Colors.circle3 + "60",
    alignItems: "center",
    justifyContent: "center",
  },
  overflowText: {
    fontSize: 9,
    fontFamily: "Nunito_700Bold",
    color: Colors.circle3,
  },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    marginTop: 16,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
  },
});
