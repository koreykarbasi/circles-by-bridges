export const REFRESH_FIELDS = ["email", "phone", "photoUri", "birthday"] as const;
export type RefreshField = typeof REFRESH_FIELDS[number];
export type ContactRefreshChanges = Partial<Record<RefreshField, string>>;
export type RefreshValues = Partial<Record<RefreshField, string | null>>;

export interface RefreshContact extends RefreshValues {
  id: string;
  name: string;
}

export interface RefreshDeviceContact {
  id: string;
  name: string;
  phones: string[];
  emails: string[];
  photoUri?: string;
  birthday?: string;
}

export interface ContactRefreshPreview {
  contactId: string;
  name: string;
  changes: ContactRefreshChanges;
  reason?: string;
}

export const isEmptyContactField = (value: string | null | undefined) => !value?.trim();

export function normalizeContactPhone(value: string | null | undefined): string {
  const digits = (value ?? "").trim().replace(/^00/, "").replace(/\D/g, "");
  // NANP's explicit +1 and the same ten-digit local number identify the same line.
  // Do not use suffix matching: different international numbers must stay distinct.
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export function matchPhoneContact(
  contact: RefreshContact,
  devices: readonly RefreshDeviceContact[],
): { contact?: RefreshDeviceContact; reason?: string } {
  const phone = normalizeContactPhone(contact.phone);
  const email = contact.email?.trim().toLowerCase();
  const name = contact.name.trim().toLowerCase();
  const criteria = [
    (device: RefreshDeviceContact) => !!phone && device.phones.some(p => normalizeContactPhone(p) === phone),
    (device: RefreshDeviceContact) => !!email && device.emails.some(e => e.trim().toLowerCase() === email),
    (device: RefreshDeviceContact) => !!name && device.name.trim().toLowerCase() === name,
  ];
  for (const criterion of criteria) {
    const matches = devices.filter(criterion);
    if (matches.length > 1) return { reason: "Multiple phone contacts match; skipped to protect your details." };
    if (matches.length === 1) return { contact: matches[0] };
  }
  return { reason: "No matching phone contact found." };
}

/** Used again at apply time, and on the server under a transaction lock. */
export function fillOnlyEmptyChanges(
  current: RefreshValues,
  proposed: ContactRefreshChanges,
  draft: RefreshValues = {},
): ContactRefreshChanges {
  const changes: ContactRefreshChanges = {};
  for (const field of REFRESH_FIELDS) {
    if (isEmptyContactField(current[field]) && isEmptyContactField(draft[field]) &&
        typeof proposed[field] === "string" && !isEmptyContactField(proposed[field])) {
      changes[field] = proposed[field]!.trim();
    }
  }
  return changes;
}

export function previewContactRefresh(
  contact: RefreshContact,
  devices: readonly RefreshDeviceContact[],
  draft?: RefreshValues,
): ContactRefreshPreview {
  const match = matchPhoneContact(contact, devices);
  if (!match.contact) return { contactId: contact.id, name: contact.name, changes: {}, reason: match.reason };
  const device = match.contact;
  const changes = fillOnlyEmptyChanges(contact, {
    email: device.emails.find(e => !!e.trim()),
    phone: device.phones.find(p => !!p.trim()),
    photoUri: device.photoUri,
    birthday: device.birthday,
  }, draft);
  return {
    contactId: contact.id, name: contact.name, changes,
    reason: Object.keys(changes).length ? undefined : "No empty fields to fill from this phone contact.",
  };
}
