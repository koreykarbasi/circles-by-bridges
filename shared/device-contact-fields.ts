export interface DeviceContactFields {
  imageAvailable?: boolean;
  image?: { uri?: string } | null;
  rawImage?: { base64?: string } | null;
  birthday?: { month?: number; day?: number } | null;
}

/** Expo months are zero-based. Preserve the importer's existing MM/DD format. */
export function deviceBirthday(record: DeviceContactFields): string | undefined {
  const month = record.birthday?.month;
  const day = record.birthday?.day;
  if (month == null || day == null || month < 0 || month > 11 || !Number.isInteger(month) ||
      !Number.isInteger(day) || day < 1 || day > new Date(Date.UTC(2000, month + 1, 0)).getUTCDate()) return;
  return `${String(month + 1).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
}

/** Shared with phone import: prefer a durable embedded photo, then the device URI. */
export function devicePhoto(record: DeviceContactFields): string | undefined {
  if (!record.imageAvailable) return;
  if (record.rawImage?.base64) return `data:image/jpeg;base64,${record.rawImage.base64}`;
  return record.image?.uri || undefined;
}
