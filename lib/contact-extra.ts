/**
 * Pure helpers for the "Find in Contacts" picker path.
 *
 * Exported as a standalone module so they can be imported by
 * NoPhoneSheet.tsx (production) and unit tests (via ts-jest / Node) alike
 * without pulling in any React Native / Expo dependencies.
 */

export interface ExtraContactData {
  birthday?: string;
  photoUri?: string;
}

/**
 * Builds the ExtraContactData payload that handlePickContact forwards to
 * proceedWithPhone / onConfirm.  Returns undefined when the picked contact
 * carries no birthday and no image so callers receive a clean absence signal.
 */
export function buildExtraFromDeviceContact(contact: {
  birthday?: string | null;
  imageUri?: string | null;
}): ExtraContactData | undefined {
  const extra: ExtraContactData = {};
  if (contact.birthday) extra.birthday = contact.birthday;
  if (contact.imageUri) extra.photoUri = contact.imageUri;
  return Object.keys(extra).length > 0 ? extra : undefined;
}
