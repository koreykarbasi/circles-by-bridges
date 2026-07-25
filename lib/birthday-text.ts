/**
 * Shared birthday-text handler logic used by both the Home tab and the
 * Suggestions tab.  Extracted here so a fix in one place is automatically
 * reflected in both, and so unit tests can import and verify a single
 * implementation.
 *
 * All three functions are pure (no React hooks) — callers supply their
 * dependencies explicitly, which also makes them trivially testable.
 */

import type { Reminder } from "./reminders";

// ── Injected-dependency types (mirrors what React Native provides) ──────────

export type PlatformDep = { OS: "web" | "ios" | "android" | string };
export type ClipboardDep = { writeText: (text: string) => Promise<void> };
export type LinkingDep = { openURL: (url: string) => Promise<void> };

export interface ContactWithPhone {
  id: string;
  phone?: string | null;
}

// ── sendBirthdayText ───────────────────────────────────────────────────────

/**
 * Opens the native SMS composer (iOS/Android) or copies the birthday message
 * to the clipboard (web).  Errors from either platform API are silently
 * swallowed so the UI never crashes.
 */
export async function sendBirthdayText(
  reminder: Reminder,
  phone: string,
  deps: { platform: PlatformDep; clipboard: ClipboardDep; linking: LinkingDep },
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

// ── handleBirthdayText ────────────────────────────────────────────────────

/**
 * Called when the user taps the "Text" button on a birthday reminder.
 *
 * - If the contact already has a phone number, opens the SMS composer
 *   immediately.
 * - Otherwise, opens the NoPhoneSheet so the user can enter / pick a number.
 */
export async function handleBirthdayText(
  reminder: Reminder,
  contacts: ContactWithPhone[],
  deps: {
    setBirthdaySheet: (sheet: { reminder: Reminder }) => void;
    sendBirthdayText: (reminder: Reminder, phone: string) => Promise<void>;
    showError?: (message: string) => void;
  },
): Promise<void> {
  if (!reminder.contactId) {
    deps.showError?.("Couldn't open this contact — try refreshing the app");
    return;
  }
  const contact = contacts.find((c) => c.id === reminder.contactId);
  const phone = contact?.phone;
  if (!phone) {
    deps.setBirthdaySheet({ reminder });
    return;
  }
  await deps.sendBirthdayText(reminder, phone);
}

// ── handleBirthdaySheetConfirm ─────────────────────────────────────────────

/**
 * Called when the user confirms a phone number in the NoPhoneSheet.
 *
 * - Closes the sheet.
 * - Optionally persists the number via `savePhoneNumber` (when
 *   `shouldSave` is true).  Errors from `savePhoneNumber` are swallowed so
 *   the SMS send always proceeds.
 * - Opens the SMS composer with the entered phone number.
 */
export async function handleBirthdaySheetConfirm(
  phone: string,
  shouldSave: boolean,
  extra: { birthday?: string; photoUri?: string } | undefined,
  birthdaySheet: { reminder: Reminder } | null,
  deps: {
    setBirthdaySheet: (sheet: null) => void;
    savePhoneNumber: (
      contactId: string,
      phone: string,
      extra?: { birthday?: string; photoUri?: string },
    ) => Promise<void>;
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
