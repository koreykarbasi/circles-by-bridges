import React from "react";
import { Text, View } from "react-native";
import { useThemeColors } from "@/lib/theme-context";
import { ContactCardActionIcon, ContactUrgencyDot, ContactWarningGlyph } from "./ContactCardSymbols";
import { SnoozeGlyph, SNOOZE_ACTIVE_COLOR } from "./SnoozeGlyph";

export function ContactSymbolLegend() {
  const Colors = useThemeColors();
  const entries = [
    { key: "contacted", symbol: <ContactCardActionIcon action="contacted" size={26} color={Colors.primaryLight} />, text: "Mark contacted: record that you connected today." },
    { key: "move", symbol: <ContactCardActionIcon action="move" size={19} color={Colors.primary} />, text: "Move circle: move this contact, or swap people between full circles." },
    { key: "snooze", symbol: <SnoozeGlyph color={Colors.primary} />, text: "Snooze: pause check-in nudges and suggestions for 30 days. Tap again to end the snooze. Birthdays and custom reminders still come through." },
    { key: "snoozed", symbol: <View style={{ backgroundColor: SNOOZE_ACTIVE_COLOR, borderColor: SNOOZE_ACTIVE_COLOR, borderWidth: 1, borderRadius: 10, width: 34, height: 34, alignItems: "center", justifyContent: "center" }}><SnoozeGlyph color={Colors.primaryDeep} /></View>, text: "Orange-filled Zzz: this contact is currently snoozed." },
    { key: "warning", symbol: <ContactWarningGlyph color={Colors.yellow} />, text: "Exclamation badge: profile information is missing. Red or orange highlights a missing birthday; yellow highlights missing details." },
    { key: "birthday", symbol: <ContactCardActionIcon action="birthday" size={14} color={Colors.accent} />, text: "Gift: tap the birthday hint to add this contact's birthday." },
    { key: "overdue", symbol: <ContactUrgencyDot color={Colors.danger} />, text: "Red dot: overdue for a check-in." },
    { key: "soon", symbol: <ContactUrgencyDot color={Colors.warning} />, text: "Orange dot: a check-in is due soon." },
    { key: "ontrack", symbol: <ContactUrgencyDot color={Colors.success} />, text: "Green dot: your recent contact is on track." },
  ];
  return (
    <View style={{ gap: 18 }}>
      <Text style={{ color: Colors.text, fontSize: 15, lineHeight: 22, fontFamily: "Nunito_600SemiBold" }}>
        To set up a custom reminder for a contact, tap their card to open the contact edit page, then add a custom reminder there.
      </Text>
      {entries.map(({ key, symbol, text }) => (
        <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 34, alignItems: "center", justifyContent: "center" }}>{symbol}</View>
          <Text style={{ flex: 1, color: Colors.textSecondary, fontSize: 14, lineHeight: 20, fontFamily: "Nunito_400Regular" }}>{text}</Text>
        </View>
      ))}
    </View>
  );
}
