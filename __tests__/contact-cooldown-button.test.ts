import React from "react";
import { Alert, Platform } from "react-native";
import { readFileSync } from "fs";
import { join } from "path";
import ts from "typescript";
import { darkColors } from "../constants/colors";

const mockSetCooldown = jest.fn();
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useState: jest.fn(),
  useRef: jest.fn(),
  useMemo: (factory: () => unknown) => factory(),
}));
jest.mock("react-native", () => ({
  View: "View", Text: "Text", Pressable: "Pressable",
  Platform: { OS: "ios" },
  Alert: { alert: jest.fn() },
  StyleSheet: { create: (value: unknown) => value },
}));
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: "light" },
}));
jest.mock("@/lib/contacts-context", () => ({
  useContacts: () => ({ setContactCooldown: mockSetCooldown }),
}));
jest.mock("@/lib/theme-context", () => ({
  useThemeColors: () => require("../constants/colors").darkColors,
}));

const compiled = ts.transpileModule(
  readFileSync(join(__dirname, "../components/ContactCooldownButton.tsx"), "utf8"),
  { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true } },
).outputText;
const exportsObject: Record<string, any> = {};
new Function("require", "exports", compiled)(
  (id: string) => id === "./SnoozeGlyph"
    ? { SnoozeGlyph: "SnoozeGlyph", SNOOZE_ACTIVE_COLOR: "#FFBE85" }
    : require(id),
  exportsObject,
);

function buttonIn(tree: any): any {
  if (!React.isValidElement(tree)) return;
  const element = tree as React.ReactElement<any>;
  if (element.type === ("Pressable" as any)) return element;
  for (const child of React.Children.toArray(element.props.children)) {
    const found = buttonIn(child);
    if (found) return found;
  }
}

describe.each(["ios", "android"])("snooze button on %s", (platform) => {
  beforeEach(() => { jest.clearAllMocks(); (Platform as any).OS = platform; });

  function harness(compact = true) {
    let busy = false;
    const pending = { current: false };
    const contact = { id: "person", notificationsCooldownUntil: null as string | null };
    mockSetCooldown.mockImplementation(async (_id: string, enabled: boolean) => {
      contact.notificationsCooldownUntil = enabled
        ? new Date(Date.now() + 30 * 86400000).toISOString() : null;
    });
    (React.useState as jest.Mock).mockImplementation(() => [
      busy, (value: boolean) => { busy = value; },
    ]);
    (React.useRef as jest.Mock).mockReturnValue(pending);
    const render = () => buttonIn(exportsObject.ContactCooldownButton({ contact, compact }));
    const press = async () => {
      await render().props.onPress({ stopPropagation: jest.fn() });
      await Promise.resolve();
    };
    return { render, press, contact };
  }

  test.each([true, false])("confirms start, reflects persisted state, then ends without popup (compact=%s)", async (compact) => {
    const h = harness(compact);
    expect(h.render().props.accessibilityState.selected).toBe(false);
    await h.press();
    expect(mockSetCooldown).not.toHaveBeenCalled();
    const [title, message, buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(title).toBe("Snooze contact?");
    expect(message).toBe("Pauses check-in nudges and suggestions for this contact for 30 days. Birthdays and your custom reminders still come through.");
    expect(buttons.map((button: any) => button.text)).toEqual(["Cancel", "Snooze"]);
    await buttons[1].onPress();
    await Promise.resolve();
    expect(mockSetCooldown).toHaveBeenLastCalledWith("person", true);
    expect(h.render().props.accessibilityState.selected).toBe(true);
    const activeStyles = h.render().props.style({ pressed: false });
    expect(activeStyles.some((s: any) => s?.backgroundColor === "#FFBE85")).toBe(true);
    await h.press();
    expect(mockSetCooldown).toHaveBeenLastCalledWith("person", false);
    expect(h.render().props.accessibilityState.selected).toBe(false);
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    if (compact) {
      expect(h.render().props.style({ pressed: false })[0]).toMatchObject({
        width: 34, height: 34, borderColor: darkColors.primary,
      });
    }
  });

  test("cancel makes no request and every subsequent snooze asks again", async () => {
    const h = harness();
    await h.press();
    (Alert.alert as jest.Mock).mock.calls[0][2][0].onPress();
    expect(mockSetCooldown).not.toHaveBeenCalled();
    await h.press();
    expect(Alert.alert).toHaveBeenCalledTimes(2);
  });

  test("a failed request leaves the contact unsnoozed and retryable", async () => {
    const h = harness();
    mockSetCooldown.mockRejectedValueOnce(new Error("Offline"));
    await h.press();
    await (Alert.alert as jest.Mock).mock.calls[0][2][1].onPress();
    await Promise.resolve();
    expect(h.render().props.accessibilityState.selected).toBe(false);
    expect(h.render().props.disabled).toBe(false);
    expect(Alert.alert).toHaveBeenLastCalledWith(
      "Could not update cooldown", "Please check your connection and try again.",
    );
  });
});
