import React from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import Colors from "@/constants/colors";
import { Avatar } from "./Avatar";
import type { Contact } from "@/lib/types";

interface CirclesVisualizationProps {
  contacts: Contact[];
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const VIZ_SIZE = Math.min(SCREEN_WIDTH - 48, 320);

export function CirclesVisualization({ contacts }: CirclesVisualizationProps) {
  const c1 = contacts.filter((c) => c.circleLevel === 1);
  const c2 = contacts.filter((c) => c.circleLevel === 2);
  const c3 = contacts.filter((c) => c.circleLevel === 3);

  const outerRadius = VIZ_SIZE / 2;
  const middleRadius = outerRadius * 0.68;
  const innerRadius = outerRadius * 0.38;

  const renderAvatarsInRing = (contactsList: Contact[], radius: number, avatarSize: number) => {
    if (contactsList.length === 0) return null;
    const count = contactsList.length;
    const angleStep = (2 * Math.PI) / Math.max(count, 1);
    const startAngle = -Math.PI / 2;

    return contactsList.map((contact, i) => {
      const angle = startAngle + angleStep * i;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      return (
        <View
          key={contact.id}
          style={{
            position: "absolute",
            left: outerRadius + x - avatarSize / 2,
            top: outerRadius + y - avatarSize / 2,
          }}
        >
          <Avatar name={contact.name} color={contact.avatarColor} size={avatarSize} />
        </View>
      );
    });
  };

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
        {renderAvatarsInRing(c3, (outerRadius + middleRadius) / 2, 28)}
        {renderAvatarsInRing(c2, (middleRadius + innerRadius) / 2, 32)}
        {renderAvatarsInRing(c1, 0, 36)}
        {contacts.length === 0 && (
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
