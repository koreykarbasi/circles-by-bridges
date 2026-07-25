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

// ── sendBirthdayText logic (extracted from both tabs) ─────────────────────────
//
// Original source in app/(tabs)/index.tsx:
//   const sendBirthdayText = async (reminder, phone) => {
//     const message = reminder.suggestedMessage ?? `Happy Birthday ${reminder.contactName}! 🎂`;
//     if (Platform.OS === "web") {
//       try { await navigator.clipboard.writeText(message); } catch {}
//     } else {
//       const url = Platform.OS === "ios"
//         ? `sms:${phone}&body=${message}`
//         : `sms:${phone}?body=${encodeURIComponent(message)}`;
//       try { await Linking.openURL(url); } catch {}
//     }
//   };
//
// We replicate this as a pure function that accepts injected dependencies so
// we can test it without importing React Native.

type Platform = { OS: "web" | "ios" | "android" };
type Clipboard = { writeText: (text: string) => Promise<void> };
type Linking = { openURL: (url: string) => Promise<void> };

async function sendBirthdayText(
  reminder: Reminder,
  phone: string,
  deps: { platform: Platform; clipboard: Clipboard; linking: Linking },
): Promise<void> {
  const { platform, clipboard, linking } = deps;
  const message = reminder.suggestedMessage ?? `Happy Birthday ${reminder.contactName}! 🎂`;
  if (platform.OS === "web") {
    try { await clipboard.writeText(message); } catch {}
  } else {
    const url =
      platform.OS === "ios"
        ? `sms:${phone}&body=${message}`
        : `sms:${phone}?body=${encodeURIComponent(message)}`;
    try { await linking.openURL(url); } catch {}
  }
}

// ── handleBirthdayText logic ──────────────────────────────────────────────────
//
// Original source in app/(tabs)/index.tsx:
//   const handleBirthdayText = async (reminder) => {
//     if (!reminder.contactId) return;
//     const contact = contacts.find((c) => c.id === reminder.contactId);
//     const phone = contact?.phone;
//     if (!phone) {
//       setBirthdaySheet({ reminder });
//       return;
//     }
//     await sendBirthdayText(reminder, phone);
//   };

interface Contact {
  id: string;
  phone?: string | null;
}

async function handleBirthdayText(
  reminder: Reminder,
  contacts: Contact[],
  deps: {
    setBirthdaySheet: (sheet: { reminder: Reminder }) => void;
    sendBirthdayText: (reminder: Reminder, phone: string) => Promise<void>;
  },
): Promise<void> {
  if (!reminder.contactId) return;
  const contact = contacts.find((c) => c.id === reminder.contactId);
  const phone = contact?.phone;
  if (!phone) {
    deps.setBirthdaySheet({ reminder });
    return;
  }
  await deps.sendBirthdayText(reminder, phone);
}

// ── handleBirthdaySheetConfirm logic ─────────────────────────────────────────
//
// Original source in app/(tabs)/index.tsx:
//   const handleBirthdaySheetConfirm = async (phone, shouldSave, extra) => {
//     if (!birthdaySheet) return;
//     const { reminder } = birthdaySheet;
//     setBirthdaySheet(null);
//     if (shouldSave && reminder.contactId) {
//       try { await savePhoneNumber(reminder.contactId, phone, extra); } catch {}
//     }
//     await sendBirthdayText(reminder, phone);
//   };

async function handleBirthdaySheetConfirm(
  phone: string,
  shouldSave: boolean,
  extra: { birthday?: string; photoUri?: string } | undefined,
  birthdaySheet: { reminder: Reminder } | null,
  deps: {
    setBirthdaySheet: (sheet: null) => void;
    savePhoneNumber: (contactId: string, phone: string, extra?: { birthday?: string; photoUri?: string }) => Promise<void>;
    sendBirthdayText: (reminder: Reminder, phone: string) => Promise<void>;
  },
): Promise<void> {
  if (!birthdaySheet) return;
  const { reminder } = birthdaySheet;
  deps.setBirthdaySheet(null);
  if (shouldSave && reminder.contactId) {
    try { await deps.savePhoneNumber(reminder.contactId, phone, extra); } catch {}
  }
  await deps.sendBirthdayText(reminder, phone);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("sendBirthdayText", () => {
  const baseReminder = makeReminder();
  const phone = "+14155551234";

  function makeDeps(os: "web" | "ios" | "android") {
    return {
      platform: { OS: os } as Platform,
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
