/**
 * Pure handler for the "Find in Contacts" picker path in NoPhoneSheet.
 *
 * All platform I/O (permission request, contact fetch) is injected as deps so
 * the function can be tested in Node without any React Native / Expo runtime.
 */

// ── Shared types ──────────────────────────────────────────────────────────────

export interface DeviceContact {
  id: string;
  name: string;
  phone: string;
  birthday?: string | null;
  imageUri?: string | null;
}

/** Shape of a raw contact record returned by expo-contacts getContactsAsync. */
export interface RawContactRecord {
  id?: string;
  name?: string;
  phoneNumbers?: Array<{ number?: string }> | null;
  birthday?: { year?: number; month?: number; day?: number } | null;
  image?: { uri?: string } | null;
  rawImage?: { base64?: string } | null;
}

export interface FindInContactsDeps {
  /** Injected Platform.OS so the function is testable outside React Native. */
  platform: { OS: string };
  /** Calls expo-contacts requestPermissionsAsync (or a test stub). */
  requestPermissions: () => Promise<{ status: string }>;
  /** Calls expo-contacts getContactsAsync (or a test stub). */
  getContacts: () => Promise<{ data: RawContactRecord[] }>;
  setError: (msg: string) => void;
  setLoadingContacts: (v: boolean) => void;
  setDeviceContacts: (contacts: DeviceContact[]) => void;
  setScreen: (screen: "entry" | "contacts" | "save") => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function formatDeviceBirthday(
  bday?: { year?: number; month?: number; day?: number } | null,
): string | undefined {
  if (!bday || !bday.month || !bday.day) return undefined;
  const m = String(bday.month).padStart(2, "0");
  const d = String(bday.day).padStart(2, "0");
  return `${m}/${d}`;
}

// ── Handler ───────────────────────────────────────────────────────────────────

/**
 * Requests contacts permission, fetches device contacts, filters to those with
 * a phone number, and hands the result to the sheet via the injected setters.
 *
 * On permission denial: sets the error message and stops the loading spinner.
 * On success:           populates deviceContacts and switches to the contacts screen.
 * On unexpected error:  sets a generic error message.
 */
export async function handleFindInContacts(deps: FindInContactsDeps): Promise<void> {
  if (deps.platform.OS === "web") return;

  deps.setLoadingContacts(true);
  deps.setError("");

  try {
    const { status } = await deps.requestPermissions();
    if (status !== "granted") {
      deps.setError("Contacts permission denied");
      deps.setLoadingContacts(false);
      return;
    }

    const { data } = await deps.getContacts();
    const withPhone: DeviceContact[] = [];

    for (const c of data) {
      if (!c.phoneNumbers || c.phoneNumbers.length === 0) continue;
      const phone = c.phoneNumbers[0].number ?? "";
      if (!phone) continue;

      let imageUri: string | null = null;
      if (c.rawImage?.base64) {
        imageUri = `data:image/jpeg;base64,${c.rawImage.base64}`;
      } else if (c.image?.uri) {
        imageUri = c.image.uri;
      }

      withPhone.push({
        id: c.id ?? Math.random().toString(),
        name: c.name ?? "Unknown",
        phone,
        birthday: formatDeviceBirthday(c.birthday),
        imageUri,
      });
    }

    withPhone.sort((a, b) => a.name.localeCompare(b.name));
    deps.setDeviceContacts(withPhone);
    deps.setScreen("contacts");
  } catch {
    deps.setError("Could not load contacts");
  } finally {
    deps.setLoadingContacts(false);
  }
}
