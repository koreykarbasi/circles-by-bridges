import React, { useEffect } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
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

function OrbitingAvatar({
  contact,
  index,
  total,
  radius,
  avatarSize,
  center,
  speed,
}: {
  contact: Contact;
  index: number;
  total: number;
  radius: number;
  avatarSize: number;
  center: number;
  speed: number;
}) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: speed, easing: Easing.linear }),
      -1,
      false,
    );
  }, []);

  const baseAngle = (360 / Math.max(total, 1)) * index - 90;

  const animatedStyle = useAnimatedStyle(() => {
    const angle = ((baseAngle + rotation.value) * Math.PI) / 180;
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

export function CirclesVisualization({ contacts, user }: CirclesVisualizationProps) {
  const c1 = contacts.filter((c) => c.circleLevel === 1);
  const c2 = contacts.filter((c) => c.circleLevel === 2);
  const c3 = contacts.filter((c) => c.circleLevel === 3);

  const outerRadius = VIZ_SIZE / 2;
  const middleRadius = outerRadius * 0.68;
  const innerRadius = outerRadius * 0.38;
  const centerSize = 44;

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

        {c3.map((contact, i) => (
          <OrbitingAvatar
            key={contact.id}
            contact={contact}
            index={i}
            total={c3.length}
            radius={(outerRadius + middleRadius) / 2}
            avatarSize={28}
            center={outerRadius}
            speed={120000}
          />
        ))}

        {c2.map((contact, i) => (
          <OrbitingAvatar
            key={contact.id}
            contact={contact}
            index={i}
            total={c2.length}
            radius={(middleRadius + innerRadius) / 2}
            avatarSize={28}
            center={outerRadius}
            speed={90000}
          />
        ))}

        {c1.map((contact, i) => (
          <OrbitingAvatar
            key={contact.id}
            contact={contact}
            index={i}
            total={c1.length}
            radius={innerRadius * 0.7}
            avatarSize={28}
            center={outerRadius}
            speed={60000}
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
          <Text style={styles.legendText}>Acquaintances ({c3.length})</Text>
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
