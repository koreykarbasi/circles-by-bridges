import * as Contacts from "expo-contacts";
import { Platform } from "react-native";
import { deviceBirthday, devicePhoto, type DeviceContactFields } from "@shared/device-contact-fields";
import type { RefreshDeviceContact } from "@shared/contact-refresh";

export class PhoneContactsPermissionError extends Error {}

interface PhoneContactRecord extends DeviceContactFields {
  id?: string;
  name?: string;
  phoneNumbers?: { number?: string }[];
  emails?: { email?: string }[];
}

/** Injected I/O keeps permission and limited-access handling testable without native modules. */
export async function readPhoneContacts(deps: {
  platform: string;
  requestPermission: () => Promise<{ status: string; accessPrivileges?: string }>;
  getContacts: () => Promise<{ data: PhoneContactRecord[] }>;
}): Promise<{ contacts: RefreshDeviceContact[]; limited: boolean }> {
  if (deps.platform === "web") throw new Error("Open Bridges on your iPhone or Android phone to refresh from phone contacts.");
  const permission = await deps.requestPermission();
  if (permission.status !== "granted") throw new PhoneContactsPermissionError(
    "To refresh contact details, enable Contacts access for Bridges in your device Settings, then try again.",
  );
  const { data } = await deps.getContacts();
  return {
    limited: permission.accessPrivileges === "limited",
    contacts: data.map((record, index) => ({
      id: record.id ?? `device-${index}`,
      name: record.name ?? "",
      phones: record.phoneNumbers?.flatMap(p => p.number?.trim() ? [p.number] : []) ?? [],
      emails: record.emails?.flatMap(e => e.email?.trim() ? [e.email] : []) ?? [],
      photoUri: devicePhoto(record),
      birthday: deviceBirthday(record),
    })),
  };
}

export function loadPhoneContactsForRefresh() {
  return readPhoneContacts({
    platform: Platform.OS,
    requestPermission: () => Contacts.requestPermissionsAsync(),
    getContacts: () => Contacts.getContactsAsync({
      fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails,
        Contacts.Fields.Birthday, Contacts.Fields.Image, Contacts.Fields.RawImage],
    }),
  });
}
