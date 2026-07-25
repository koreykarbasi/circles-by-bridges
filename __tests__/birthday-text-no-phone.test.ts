/**
 * Unit tests for the birthday Text button end-to-end flow.
 *
 * Covers:
 *  1. handleBirthdayText — contact WITH a phone goes straight to SMS (no sheet).
 *  2. handleBirthdayText — contact WITHOUT a phone opens the NoPhoneSheet.
 *  3. handleBirthdaySheetConfirm — entering a number and choosing "Save" both
 *     persists the phone via savePhoneNumber AND sends the SMS.
 *  4. handleBirthdaySheetConfirm — choosing "Just this time" sends the SMS but
 *     does NOT call savePhoneNumber.
 *  5. sendBirthdayText — on web copies the birthday message to the clipboard.
 *  6. sendBirthdayText — on iOS opens the correct sms: URL.
 *  7. sendBirthdayText — on Android opens the sms: URL with encoded body.
 *  8. sendBirthdayText — uses suggestedMessage when provided, otherwise builds
 *     "Happy Birthday <name>! 🎂" as the fallback.
 *
 * Strategy: the handler logic from app/(tabs)/index.tsx and
 * app/(tabs)/suggestions.tsx is extracted as pure functions so Jest can test
 * it without needing React Native or Expo. Platform, Linking, and clipboard
 * are injected / stubbed via simple jest.fn() mocks.
 */

import type { Reminder } from "../lib/reminders";
import { buildExtraFromDeviceContact } from "../lib/contact-extra";
import {
  sendBirthdayText,
  handleBirthdayText,
  handleBirthdaySheetConfirm,
  type ContactWithPhone as Contact,
} from "../lib/birthday-text";

// ── Shared test data ──────────────────────────────────────────────────────────

function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: "birthday-0d-contact-1",
    contactId: "contact-1",
    contactName: "Alice",
    circleLevel: 1,
    type: "birthday",
    priority: 200,
    title: "Today is Alice's birthday",
    subtitle: "Today is their birthday",
    suggestedMessage: undefined,
    ...overrides,
  };
}

// ── Handler functions ─────────────────────────────────────────────────────────
//
// sendBirthdayText, handleBirthdayText, and handleBirthdaySheetConfirm are
// imported from lib/birthday-text.ts — the single source of truth shared by
// both app/(tabs)/index.tsx and app/(tabs)/suggestions.tsx.
//
// The tests below verify that shared implementation directly.

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("sendBirthdayText", () => {
  const baseReminder = makeReminder();
  const phone = "+14155551234";

  function makeDeps(os: "web" | "ios" | "android") {
    return {
      platform: { OS: os },
      clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
      linking: { openURL: jest.fn().mockResolvedValue(undefined) },
    };
  }

  describe("fallback message", () => {
    test("uses suggestedMessage when provided", async () => {
      const deps = makeDeps("ios");
      const reminder = makeReminder({ suggestedMessage: "🎉 Happy Bday Alice!" });
      await sendBirthdayText(reminder, phone, deps);
      const url = (deps.linking.openURL as jest.Mock).mock.calls[0][0] as string;
      expect(url).toContain("🎉 Happy Bday Alice!");
    });

    test("falls back to 'Happy Birthday <name>! 🎂' when suggestedMessage is absent", async () => {
      const deps = makeDeps("ios");
      await sendBirthdayText(baseReminder, phone, deps);
      const url = (deps.linking.openURL as jest.Mock).mock.calls[0][0] as string;
      expect(url).toContain("Happy Birthday Alice! 🎂");
    });
  });

  describe("web — copies to clipboard", () => {
    test("calls clipboard.writeText with the birthday message", async () => {
      const deps = makeDeps("web");
      await sendBirthdayText(baseReminder, phone, deps);
      expect(deps.clipboard.writeText).toHaveBeenCalledTimes(1);
      expect(deps.clipboard.writeText).toHaveBeenCalledWith("Happy Birthday Alice! 🎂");
    });

    test("does NOT call Linking.openURL on web", async () => {
      const deps = makeDeps("web");
      await sendBirthdayText(baseReminder, phone, deps);
      expect(deps.linking.openURL).not.toHaveBeenCalled();
    });
  });

  describe("iOS — opens sms: URL", () => {
    test("calls Linking.openURL with sms:<phone>&body=<message> format", async () => {
      const deps = makeDeps("ios");
      await sendBirthdayText(baseReminder, phone, deps);
      expect(deps.linking.openURL).toHaveBeenCalledTimes(1);
      const url = (deps.linking.openURL as jest.Mock).mock.calls[0][0] as string;
      expect(url).toBe(`sms:${phone}&body=Happy Birthday Alice! 🎂`);
    });

    test("does NOT call clipboard.writeText on iOS", async () => {
      const deps = makeDeps("ios");
      await sendBirthdayText(baseReminder, phone, deps);
      expect(deps.clipboard.writeText).not.toHaveBeenCalled();
    });
  });

  describe("Android — opens sms: URL with encoded body", () => {
    test("calls Linking.openURL with sms:<phone>?body=<encoded> format", async () => {
      const deps = makeDeps("android");
      await sendBirthdayText(baseReminder, phone, deps);
      expect(deps.linking.openURL).toHaveBeenCalledTimes(1);
      const url = (deps.linking.openURL as jest.Mock).mock.calls[0][0] as string;
      const expectedBody = encodeURIComponent("Happy Birthday Alice! 🎂");
      expect(url).toBe(`sms:${phone}?body=${expectedBody}`);
    });

    test("Android URL uses ?body= (not &body=)", async () => {
      const deps = makeDeps("android");
      await sendBirthdayText(baseReminder, phone, deps);
      const url = (deps.linking.openURL as jest.Mock).mock.calls[0][0] as string;
      expect(url).toContain("?body=");
      expect(url).not.toContain("&body=");
    });

    test("iOS URL uses &body= (not ?body=)", async () => {
      const deps = makeDeps("ios");
      await sendBirthdayText(baseReminder, phone, deps);
      const url = (deps.linking.openURL as jest.Mock).mock.calls[0][0] as string;
      expect(url).toContain("&body=");
      expect(url).not.toContain("?body=");
    });
  });

  describe("resilience — errors in platform APIs are swallowed", () => {
    test("does not throw when clipboard.writeText rejects on web", async () => {
      const deps = makeDeps("web");
      (deps.clipboard.writeText as jest.Mock).mockRejectedValueOnce(new Error("denied"));
      await expect(sendBirthdayText(baseReminder, phone, deps)).resolves.toBeUndefined();
    });

    test("does not throw when Linking.openURL rejects on iOS", async () => {
      const deps = makeDeps("ios");
      (deps.linking.openURL as jest.Mock).mockRejectedValueOnce(new Error("no handler"));
      await expect(sendBirthdayText(baseReminder, phone, deps)).resolves.toBeUndefined();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("handleBirthdayText", () => {
  const reminder = makeReminder({ contactId: "contact-1" });

  test("opens NoPhoneSheet (calls setBirthdaySheet) when contact has no phone", async () => {
    const contacts: Contact[] = [{ id: "contact-1", phone: null }];
    const setBirthdaySheet = jest.fn();
    const sendText = jest.fn();

    await handleBirthdayText(reminder, contacts, { setBirthdaySheet, sendBirthdayText: sendText });

    expect(setBirthdaySheet).toHaveBeenCalledTimes(1);
    expect(setBirthdaySheet).toHaveBeenCalledWith({ reminder });
    expect(sendText).not.toHaveBeenCalled();
  });

  test("opens NoPhoneSheet when contact exists but phone is undefined", async () => {
    const contacts: Contact[] = [{ id: "contact-1" }]; // phone omitted
    const setBirthdaySheet = jest.fn();
    const sendText = jest.fn();

    await handleBirthdayText(reminder, contacts, { setBirthdaySheet, sendBirthdayText: sendText });

    expect(setBirthdaySheet).toHaveBeenCalledWith({ reminder });
    expect(sendText).not.toHaveBeenCalled();
  });

  test("opens NoPhoneSheet when contact is not found in the contacts list", async () => {
    const contacts: Contact[] = [{ id: "different-contact", phone: "+15551234567" }];
    const setBirthdaySheet = jest.fn();
    const sendText = jest.fn();

    await handleBirthdayText(reminder, contacts, { setBirthdaySheet, sendBirthdayText: sendText });

    expect(setBirthdaySheet).toHaveBeenCalledWith({ reminder });
    expect(sendText).not.toHaveBeenCalled();
  });

  test("sends SMS directly when contact has a phone number — sheet is NOT shown", async () => {
    const contacts: Contact[] = [{ id: "contact-1", phone: "+14155559999" }];
    const setBirthdaySheet = jest.fn();
    const sendText = jest.fn().mockResolvedValue(undefined);

    await handleBirthdayText(reminder, contacts, { setBirthdaySheet, sendBirthdayText: sendText });

    expect(setBirthdaySheet).not.toHaveBeenCalled();
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText).toHaveBeenCalledWith(reminder, "+14155559999");
  });

  test("does nothing when reminder has no contactId", async () => {
    const noContactIdReminder = makeReminder({ contactId: undefined });
    const contacts: Contact[] = [{ id: "contact-1", phone: "+14155559999" }];
    const setBirthdaySheet = jest.fn();
    const sendText = jest.fn();

    await handleBirthdayText(noContactIdReminder, contacts, { setBirthdaySheet, sendBirthdayText: sendText });

    expect(setBirthdaySheet).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("handleBirthdaySheetConfirm", () => {
  const reminder = makeReminder({ contactId: "contact-1" });
  const birthdaySheet = { reminder };
  const phone = "+14155558888";

  test("does nothing when birthdaySheet is null", async () => {
    const setBirthdaySheet = jest.fn();
    const savePhoneNumber = jest.fn();
    const sendText = jest.fn();

    await handleBirthdaySheetConfirm(phone, true, undefined, null, {
      setBirthdaySheet,
      savePhoneNumber,
      sendBirthdayText: sendText,
    });

    expect(setBirthdaySheet).not.toHaveBeenCalled();
    expect(savePhoneNumber).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
  });

  describe("shouldSave = true (user chose 'Save to contact')", () => {
    test("calls savePhoneNumber with the contactId and entered phone", async () => {
      const setBirthdaySheet = jest.fn();
      const savePhoneNumber = jest.fn().mockResolvedValue(undefined);
      const sendText = jest.fn().mockResolvedValue(undefined);

      await handleBirthdaySheetConfirm(phone, true, undefined, birthdaySheet, {
        setBirthdaySheet,
        savePhoneNumber,
        sendBirthdayText: sendText,
      });

      expect(savePhoneNumber).toHaveBeenCalledTimes(1);
      expect(savePhoneNumber).toHaveBeenCalledWith("contact-1", phone, undefined);
    });

    test("also calls sendBirthdayText after saving", async () => {
      const setBirthdaySheet = jest.fn();
      const savePhoneNumber = jest.fn().mockResolvedValue(undefined);
      const sendText = jest.fn().mockResolvedValue(undefined);

      await handleBirthdaySheetConfirm(phone, true, undefined, birthdaySheet, {
        setBirthdaySheet,
        savePhoneNumber,
        sendBirthdayText: sendText,
      });

      expect(sendText).toHaveBeenCalledTimes(1);
      expect(sendText).toHaveBeenCalledWith(reminder, phone);
    });

    test("passes extra data (birthday, photoUri) to savePhoneNumber", async () => {
      const extra = { birthday: "03/15", photoUri: "data:image/jpeg;base64,abc" };
      const setBirthdaySheet = jest.fn();
      const savePhoneNumber = jest.fn().mockResolvedValue(undefined);
      const sendText = jest.fn().mockResolvedValue(undefined);

      await handleBirthdaySheetConfirm(phone, true, extra, birthdaySheet, {
        setBirthdaySheet,
        savePhoneNumber,
        sendBirthdayText: sendText,
      });

      expect(savePhoneNumber).toHaveBeenCalledWith("contact-1", phone, extra);
    });

    test("closes the sheet (setBirthdaySheet(null)) before sending", async () => {
      const callOrder: string[] = [];
      const setBirthdaySheet = jest.fn().mockImplementation(() => { callOrder.push("setSheet"); });
      const savePhoneNumber = jest.fn().mockImplementation(async () => { callOrder.push("save"); });
      const sendText = jest.fn().mockImplementation(async () => { callOrder.push("send"); });

      await handleBirthdaySheetConfirm(phone, true, undefined, birthdaySheet, {
        setBirthdaySheet,
        savePhoneNumber,
        sendBirthdayText: sendText,
      });

      expect(callOrder[0]).toBe("setSheet");
    });

    test("still calls sendBirthdayText even if savePhoneNumber throws", async () => {
      const setBirthdaySheet = jest.fn();
      const savePhoneNumber = jest.fn().mockRejectedValue(new Error("network error"));
      const sendText = jest.fn().mockResolvedValue(undefined);

      await handleBirthdaySheetConfirm(phone, true, undefined, birthdaySheet, {
        setBirthdaySheet,
        savePhoneNumber,
        sendBirthdayText: sendText,
      });

      expect(sendText).toHaveBeenCalledTimes(1);
    });
  });

  describe("shouldSave = false (user chose 'Just this time')", () => {
    test("does NOT call savePhoneNumber", async () => {
      const setBirthdaySheet = jest.fn();
      const savePhoneNumber = jest.fn();
      const sendText = jest.fn().mockResolvedValue(undefined);

      await handleBirthdaySheetConfirm(phone, false, undefined, birthdaySheet, {
        setBirthdaySheet,
        savePhoneNumber,
        sendBirthdayText: sendText,
      });

      expect(savePhoneNumber).not.toHaveBeenCalled();
    });

    test("still calls sendBirthdayText with the entered phone", async () => {
      const setBirthdaySheet = jest.fn();
      const savePhoneNumber = jest.fn();
      const sendText = jest.fn().mockResolvedValue(undefined);

      await handleBirthdaySheetConfirm(phone, false, undefined, birthdaySheet, {
        setBirthdaySheet,
        savePhoneNumber,
        sendBirthdayText: sendText,
      });

      expect(sendText).toHaveBeenCalledTimes(1);
      expect(sendText).toHaveBeenCalledWith(reminder, phone);
    });

    test("closes the sheet regardless of shouldSave", async () => {
      const setBirthdaySheet = jest.fn();
      const savePhoneNumber = jest.fn();
      const sendText = jest.fn().mockResolvedValue(undefined);

      await handleBirthdaySheetConfirm(phone, false, undefined, birthdaySheet, {
        setBirthdaySheet,
        savePhoneNumber,
        sendBirthdayText: sendText,
      });

      expect(setBirthdaySheet).toHaveBeenCalledTimes(1);
      expect(setBirthdaySheet).toHaveBeenCalledWith(null);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("full flow integration — contact with no phone → sheet → confirm → SMS", () => {
  test("entering a number and confirming with Save calls savePhoneNumber then opens SMS", async () => {
    // Step 1: user taps Text on a birthday card for a contact without a phone
    const reminder = makeReminder({ contactId: "alice-id", contactName: "Alice" });
    const contacts: Contact[] = [{ id: "alice-id", phone: null }];

    let capturedSheet: { reminder: Reminder } | null = null;
    const setBirthdaySheet = jest.fn().mockImplementation((s) => { capturedSheet = s; });
    const savePhoneNumber = jest.fn().mockResolvedValue(undefined);
    const openURL = jest.fn().mockResolvedValue(undefined);
    const clipboard = { writeText: jest.fn() };
    const platform = { OS: "ios" as const };

    const sendText = (r: Reminder, p: string) =>
      sendBirthdayText(r, p, { platform, clipboard, linking: { openURL } });

    await handleBirthdayText(reminder, contacts, { setBirthdaySheet, sendBirthdayText: sendText });

    // Sheet must have opened with the correct reminder
    expect(capturedSheet).toEqual({ reminder });
    expect(openURL).not.toHaveBeenCalled();

    // Step 2: user enters a phone number in the sheet and taps "Save to Alice"
    const enteredPhone = "+14155557777";
    await handleBirthdaySheetConfirm(enteredPhone, true, undefined, capturedSheet, {
      setBirthdaySheet,
      savePhoneNumber,
      sendBirthdayText: sendText,
    });

    // Phone was saved
    expect(savePhoneNumber).toHaveBeenCalledWith("alice-id", enteredPhone, undefined);

    // SMS was launched
    expect(openURL).toHaveBeenCalledTimes(1);
    const smsUrl = (openURL as jest.Mock).mock.calls[0][0] as string;
    expect(smsUrl).toMatch(/^sms:\+14155557777/);
    expect(smsUrl).toContain("Happy Birthday Alice! 🎂");
  });

  test("entering a number and choosing 'Just this time' sends SMS without saving", async () => {
    const reminder = makeReminder({ contactId: "bob-id", contactName: "Bob" });
    const contacts: Contact[] = [{ id: "bob-id", phone: undefined }];

    let capturedSheet: { reminder: Reminder } | null = null;
    const setBirthdaySheet = jest.fn().mockImplementation((s) => { capturedSheet = s; });
    const savePhoneNumber = jest.fn();
    const openURL = jest.fn().mockResolvedValue(undefined);
    const platform = { OS: "android" as const };
    const clipboard = { writeText: jest.fn() };

    const sendText = (r: Reminder, p: string) =>
      sendBirthdayText(r, p, { platform, clipboard, linking: { openURL } });

    await handleBirthdayText(reminder, contacts, { setBirthdaySheet, sendBirthdayText: sendText });
    expect(capturedSheet).toEqual({ reminder });

    const enteredPhone = "+14155556666";
    await handleBirthdaySheetConfirm(enteredPhone, false, undefined, capturedSheet, {
      setBirthdaySheet,
      savePhoneNumber,
      sendBirthdayText: sendText,
    });

    // Phone was NOT saved
    expect(savePhoneNumber).not.toHaveBeenCalled();

    // SMS was still launched
    expect(openURL).toHaveBeenCalledTimes(1);
    const smsUrl = (openURL as jest.Mock).mock.calls[0][0] as string;
    expect(smsUrl).toMatch(/^sms:\+14155556666\?body=/);
    expect(smsUrl).toContain(encodeURIComponent("Happy Birthday Bob! 🎂"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//
// handlePickContact → proceedWithPhone → handleSaveYes / handleSaveNo
//
// These tests cover the "Find in Contacts" path in NoPhoneSheet.tsx.
//
// The internal state machine is:
//   1. handlePickContact(contact)
//        calls buildExtraFromDeviceContact(contact) [imported from lib/contact-extra.ts]
//        then calls proceedWithPhone(contact.phone, extra)
//   2. proceedWithPhone(phone, extra)
//        stores capturedPhone + capturedExtra, moves to "save" screen
//   3. handleSaveYes()  → onConfirm(capturedPhone, true,  capturedExtra)
//      handleSaveNo()   → onConfirm(capturedPhone, false, undefined)
//
// buildExtraFromDeviceContact is the real production function from
// lib/contact-extra.ts, imported at the top of this file. Tests that
// exercise it here will fail on actual regressions in that module.
// ─────────────────────────────────────────────────────────────────────────────

// Mirrors the DeviceContact shape used internally in NoPhoneSheet.tsx.
interface DeviceContactFixture {
  id: string;
  name: string;
  phone: string;
  birthday?: string | null;
  imageUri?: string | null;
}

/**
 * Simulates the full handlePickContact → proceedWithPhone → handleSaveYes /
 * handleSaveNo state machine using the real production buildExtraFromDeviceContact.
 *
 * saveChoice=true  ≈ user tapped "Save to <contact>"  → onConfirm(phone, true,  extra)
 * saveChoice=false ≈ user tapped "Just this time"     → onConfirm(phone, false, undefined)
 */
function simulatePickAndSave(
  contact: DeviceContactFixture,
  saveChoice: boolean,
  onConfirm: (phone: string, shouldSave: boolean, extra?: { birthday?: string; photoUri?: string }) => void,
): void {
  // handlePickContact calls the real production helper
  const extra = buildExtraFromDeviceContact(contact);
  // proceedWithPhone stores phone + extra in component state

  // handleSaveYes / handleSaveNo
  if (saveChoice) {
    onConfirm(contact.phone, true, extra);       // handleSaveYes path
  } else {
    onConfirm(contact.phone, false, undefined);  // handleSaveNo path
  }
}

describe("handlePickContact → proceedWithPhone → handleSaveYes / handleSaveNo", () => {
  // ── buildExtraFromDeviceContact — the real production helper ──────────────
  //
  // These tests exercise lib/contact-extra.ts directly, which is the same
  // module that NoPhoneSheet.tsx imports.  A regression in the field mapping
  // (wrong key name, missing null-check, etc.) will fail here.

  describe("buildExtraFromDeviceContact — extra field construction (production function)", () => {
    test("returns both birthday and photoUri when contact has both", () => {
      const extra = buildExtraFromDeviceContact({
        birthday: "03/15",
        imageUri: "data:image/jpeg;base64,abc123",
      });
      expect(extra).toEqual({ birthday: "03/15", photoUri: "data:image/jpeg;base64,abc123" });
    });

    test("returns only birthday when imageUri is absent", () => {
      const extra = buildExtraFromDeviceContact({ birthday: "07/04" });
      expect(extra).toEqual({ birthday: "07/04" });
      expect(extra).not.toHaveProperty("photoUri");
    });

    test("returns only photoUri when birthday is absent", () => {
      const extra = buildExtraFromDeviceContact({ imageUri: "file:///path/to/image.jpg" });
      expect(extra).toEqual({ photoUri: "file:///path/to/image.jpg" });
      expect(extra).not.toHaveProperty("birthday");
    });

    test("returns undefined when contact has no birthday and no imageUri", () => {
      const extra = buildExtraFromDeviceContact({});
      expect(extra).toBeUndefined();
    });

    test("returns undefined when birthday and imageUri are both null", () => {
      const extra = buildExtraFromDeviceContact({ birthday: null, imageUri: null });
      expect(extra).toBeUndefined();
    });

    test("maps imageUri to the photoUri key (not imageUri)", () => {
      // Regression guard: the key rename imageUri → photoUri must not silently drop.
      const extra = buildExtraFromDeviceContact({ imageUri: "file:///photo.jpg" });
      expect(extra).toHaveProperty("photoUri", "file:///photo.jpg");
      expect(extra).not.toHaveProperty("imageUri");
    });
  });

  // ── handleSaveYes path (shouldSave = true) ────────────────────────────────

  describe("handleSaveYes path — onConfirm called with shouldSave=true", () => {
    test("forwards birthday and photoUri as extra when contact has both", () => {
      const onConfirm = jest.fn();
      simulatePickAndSave(
        { id: "c1", name: "Alice", phone: "+14155551111", birthday: "03/15", imageUri: "data:image/jpeg;base64,abc123" },
        true,
        onConfirm,
      );
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onConfirm).toHaveBeenCalledWith(
        "+14155551111",
        true,
        { birthday: "03/15", photoUri: "data:image/jpeg;base64,abc123" },
      );
    });

    test("forwards only birthday in extra when contact has no image", () => {
      const onConfirm = jest.fn();
      simulatePickAndSave(
        { id: "c2", name: "Bob", phone: "+14155552222", birthday: "12/25" },
        true,
        onConfirm,
      );
      expect(onConfirm).toHaveBeenCalledWith("+14155552222", true, { birthday: "12/25" });
    });

    test("forwards only photoUri in extra when contact has no birthday", () => {
      const onConfirm = jest.fn();
      simulatePickAndSave(
        { id: "c3", name: "Carol", phone: "+14155553333", imageUri: "file:///carol.jpg" },
        true,
        onConfirm,
      );
      expect(onConfirm).toHaveBeenCalledWith("+14155553333", true, { photoUri: "file:///carol.jpg" });
    });

    test("calls onConfirm with extra=undefined when contact has no birthday or image", () => {
      const onConfirm = jest.fn();
      simulatePickAndSave(
        { id: "c4", name: "Dave", phone: "+14155554444" },
        true,
        onConfirm,
      );
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onConfirm).toHaveBeenCalledWith("+14155554444", true, undefined);
    });
  });

  // ── handleSaveNo path (shouldSave = false) ────────────────────────────────

  describe("handleSaveNo path — onConfirm called with shouldSave=false, extra=undefined", () => {
    test("calls onConfirm(phone, false, undefined) even when contact has birthday+image", () => {
      const onConfirm = jest.fn();
      simulatePickAndSave(
        { id: "c1", name: "Alice", phone: "+14155551111", birthday: "03/15", imageUri: "data:image/jpeg;base64,abc123" },
        false,
        onConfirm,
      );
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onConfirm).toHaveBeenCalledWith("+14155551111", false, undefined);
    });

    test("calls onConfirm(phone, false, undefined) when contact has no birthday or image", () => {
      const onConfirm = jest.fn();
      simulatePickAndSave(
        { id: "c5", name: "Eve", phone: "+14155555555" },
        false,
        onConfirm,
      );
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onConfirm).toHaveBeenCalledWith("+14155555555", false, undefined);
    });

    test("does NOT forward extra data to onConfirm on the 'Just this time' path", () => {
      const onConfirm = jest.fn();
      simulatePickAndSave(
        { id: "c6", name: "Frank", phone: "+14155556666", birthday: "06/01", imageUri: "file:///frank.jpg" },
        false,
        onConfirm,
      );
      const [, , extra] = (onConfirm as jest.Mock).mock.calls[0] as [string, boolean, { birthday?: string; photoUri?: string } | undefined];
      expect(extra).toBeUndefined();
    });
  });

  // ── Full picker flow integration ──────────────────────────────────────────

  describe("full picker flow — contact picked → sheet confirm → SMS", () => {
    test("picking a contact with birthday+image and saving calls savePhoneNumber with extra then sends SMS", async () => {
      const reminder = makeReminder({ contactId: "alice-id", contactName: "Alice" });
      const contacts: Contact[] = [{ id: "alice-id", phone: null }];

      // Step 1: no phone → sheet opens
      let capturedSheet: { reminder: Reminder } | null = null;
      const setBirthdaySheet = jest.fn().mockImplementation((s) => { capturedSheet = s; });
      const savePhoneNumber = jest.fn().mockResolvedValue(undefined);
      const openURL = jest.fn().mockResolvedValue(undefined);
      const platform = { OS: "ios" as const };
      const clipboard = { writeText: jest.fn() };

      const sendText = (r: Reminder, p: string) =>
        sendBirthdayText(r, p, { platform, clipboard, linking: { openURL } });

      await handleBirthdayText(reminder, contacts, { setBirthdaySheet, sendBirthdayText: sendText });
      expect(capturedSheet).toEqual({ reminder });

      // Step 2: user picks a device contact — extra built by the real production helper
      const pickedContact: DeviceContactFixture = {
        id: "device-alice",
        name: "Alice",
        phone: "+14155559999",
        birthday: "03/15",
        imageUri: "data:image/jpeg;base64,xyz",
      };
      const pickedPhone = pickedContact.phone;
      const pickedExtra = buildExtraFromDeviceContact(pickedContact); // same call the component makes

      // Simulate proceedWithPhone + handleSaveYes via handleBirthdaySheetConfirm
      await handleBirthdaySheetConfirm(pickedPhone, true, pickedExtra, capturedSheet, {
        setBirthdaySheet,
        savePhoneNumber,
        sendBirthdayText: sendText,
      });

      // Extra data forwarded to savePhoneNumber
      expect(savePhoneNumber).toHaveBeenCalledWith("alice-id", pickedPhone, pickedExtra);
      expect(pickedExtra).toEqual({ birthday: "03/15", photoUri: "data:image/jpeg;base64,xyz" });

      // SMS launched
      expect(openURL).toHaveBeenCalledTimes(1);
      const smsUrl = (openURL as jest.Mock).mock.calls[0][0] as string;
      expect(smsUrl).toMatch(/^sms:\+14155559999/);
      expect(smsUrl).toContain("Happy Birthday Alice! 🎂");
    });

    test("picking a contact with no birthday/image and choosing 'Just this time' sends SMS without saving", async () => {
      const reminder = makeReminder({ contactId: "bob-id", contactName: "Bob" });
      const contacts: Contact[] = [{ id: "bob-id", phone: null }];

      let capturedSheet: { reminder: Reminder } | null = null;
      const setBirthdaySheet = jest.fn().mockImplementation((s) => { capturedSheet = s; });
      const savePhoneNumber = jest.fn();
      const openURL = jest.fn().mockResolvedValue(undefined);
      const platform = { OS: "android" as const };
      const clipboard = { writeText: jest.fn() };

      const sendText = (r: Reminder, p: string) =>
        sendBirthdayText(r, p, { platform, clipboard, linking: { openURL } });

      await handleBirthdayText(reminder, contacts, { setBirthdaySheet, sendBirthdayText: sendText });
      expect(capturedSheet).toEqual({ reminder });

      // Contact with no birthday or image — extra must be undefined
      const pickedContact: DeviceContactFixture = { id: "device-bob", name: "Bob", phone: "+14155558888" };
      const pickedPhone = pickedContact.phone;
      const pickedExtra = buildExtraFromDeviceContact(pickedContact);
      expect(pickedExtra).toBeUndefined(); // guard: confirms no extra leaked in

      // User taps "Just this time" — handleSaveNo path
      await handleBirthdaySheetConfirm(pickedPhone, false, pickedExtra, capturedSheet, {
        setBirthdaySheet,
        savePhoneNumber,
        sendBirthdayText: sendText,
      });

      // Phone NOT saved
      expect(savePhoneNumber).not.toHaveBeenCalled();

      // SMS still launched
      expect(openURL).toHaveBeenCalledTimes(1);
      const smsUrl = (openURL as jest.Mock).mock.calls[0][0] as string;
      expect(smsUrl).toMatch(/^sms:\+14155558888\?body=/);
      expect(smsUrl).toContain(encodeURIComponent("Happy Birthday Bob! 🎂"));
    });
  });
});
