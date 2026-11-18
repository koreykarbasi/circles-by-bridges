import {
  fillOnlyEmptyChanges,
  type ContactRefreshChanges,
  type ContactRefreshPreview,
  type RefreshContact,
  type RefreshField,
  type RefreshValues,
} from "@shared/contact-refresh";

export interface ContactRefreshResult {
  contactId: string;
  name: string;
  status: "updated" | "skipped" | "failed";
  message: string;
}

/** Applying an approved preview never regenerates proposals or adds unpreviewed fields. */
export async function applyContactRefreshPreview(
  preview: readonly ContactRefreshPreview[],
  deps: {
    getContact: (id: string) => RefreshContact | undefined;
    getDraft?: (id: string) => RefreshValues | undefined;
    save: (id: string, changes: ContactRefreshChanges) => Promise<{ contact: RefreshContact; appliedFields: RefreshField[] }>;
    onApplied?: (id: string, changes: ContactRefreshChanges) => void;
  },
): Promise<ContactRefreshResult[]> {
  const results: ContactRefreshResult[] = [];
  for (const entry of preview) {
    const base = { contactId: entry.contactId, name: entry.name };
    if (entry.reason) {
      results.push({ ...base, status: "skipped", message: entry.reason });
      continue;
    }
    const current = deps.getContact(entry.contactId);
    const changes = current ? fillOnlyEmptyChanges(current, entry.changes, deps.getDraft?.(entry.contactId)) : {};
    if (!Object.keys(changes).length) {
      results.push({ ...base, status: "skipped", message: current
        ? "Details changed since preview; nothing was overwritten."
        : "This contact is no longer available." });
      continue;
    }
    try {
      const saved = await deps.save(entry.contactId, changes);
      const applied: ContactRefreshChanges = {};
      for (const field of saved.appliedFields) {
        const value = saved.contact[field];
        if (changes[field] && typeof value === "string") applied[field] = value;
      }
      const fields = Object.keys(applied);
      deps.onApplied?.(entry.contactId, applied);
      results.push({ ...base, status: fields.length ? "updated" : "skipped",
        message: fields.length
          ? `Updated ${fields.map(field => field === "photoUri" ? "photo" : field).join(", ")}.${
            fields.length < Object.keys(entry.changes).length ? " Other details were left unchanged." : ""}`
          : "Details changed before saving; nothing was overwritten." });
    } catch {
      results.push({ ...base, status: "failed", message: "Could not save these details. Please try again." });
    }
  }
  return results;
}
