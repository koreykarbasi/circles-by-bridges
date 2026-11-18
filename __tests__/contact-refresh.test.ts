import {
  fillOnlyEmptyChanges, matchPhoneContact, normalizeContactPhone, previewContactRefresh,
  type RefreshDeviceContact, type ContactRefreshChanges,
} from "../shared/contact-refresh";
import { deviceBirthday, devicePhoto } from "../shared/device-contact-fields";
import { applyContactRefreshPreview } from "../lib/contact-refresh-flow";

const person = { id: "bridges-1", name: "Alex Smith", phone: "", email: "", birthday: "", photoUri: null };
const device = (overrides: Partial<RefreshDeviceContact> = {}): RefreshDeviceContact => ({
  id: "phone-1", name: "alex smith", phones: ["+1 (416) 555-1234"], emails: ["alex@example.test"],
  birthday: "02/29", photoUri: "data:image/jpeg;base64,photo", ...overrides,
});

describe("safe device contact matching", () => {
  test.each(["+1 (416) 555-1234", "416.555.1234", "0014165551234"])("normalizes %s", phone => {
    expect(normalizeContactPhone(phone)).toBe("4165551234");
  });
  test("checks every device phone and email, not just the first", () => {
    const phones = [device({ name: "Other", phones: ["999", "4165551234"] })];
    expect(matchPhoneContact({ ...person, phone: "+14165551234" }, phones).contact).toBe(phones[0]);
    const emails = [device({ name: "Other", emails: ["other@example.test", " ALEX@example.test "] })];
    expect(matchPhoneContact({ ...person, email: "alex@EXAMPLE.test" }, emails).contact).toBe(emails[0]);
  });
  test("phone has precedence over a different email or name match", () => {
    const devices = [device({ id: "phone", name: "Different", emails: [] }), device({ id: "email", phones: ["999"] })];
    expect(matchPhoneContact({ ...person, phone: "4165551234", email: "alex@example.test" }, devices).contact?.id).toBe("phone");
  });
  test("falls back from phone to email, then exact case-insensitive name", () => {
    expect(matchPhoneContact({ ...person, phone: "000", email: "ALEX@example.test" }, [device({ name: "Different" })]).contact).toBeDefined();
    expect(matchPhoneContact(person, [device()]).contact).toBeDefined();
    expect(matchPhoneContact({ ...person, name: "Alex" }, [device()]).contact).toBeUndefined();
  });
  test("ambiguous phone matches never fall back to a unique email or name", () => {
    expect(matchPhoneContact({ ...person, phone: "4165551234", email: "alex@example.test" }, [
      device(), device({ id: "duplicate", name: "Different", emails: [] }),
    ])).toMatchObject({ reason: expect.stringContaining("Multiple") });
  });
  test("ambiguous email/name and unmatched contacts are skipped", () => {
    expect(matchPhoneContact({ ...person, email: "alex@example.test" }, [device(), device({ id: "two" })]).reason).toContain("Multiple");
    expect(matchPhoneContact(person, [device(), device({ id: "two" })]).reason).toContain("Multiple");
    expect(matchPhoneContact({ ...person, name: "Nobody" }, [device()]).reason).toContain("No matching");
  });
  test("never guesses by international-number suffix, blank name, or blank phone", () => {
    expect(matchPhoneContact({ ...person, name: "", phone: "+44 20 5555 1234" }, [device({ name: "", phones: ["+33 20 5555 1234"] })]).contact).toBeUndefined();
    expect(matchPhoneContact({ ...person, name: "" }, [device({ name: "", phones: [""] })]).contact).toBeUndefined();
  });
});

describe("fill-only-empty proposals", () => {
  test("only proposes the four allowed fields and leaves originals untouched", () => {
    const original = { ...person, circleLevel: 4, lastContacted: "2026-01-01", notes: "Keep", labels: ["Friend"], notificationsCooldownUntil: "2027-01-01" };
    const copy = JSON.stringify(original);
    expect(previewContactRefresh(original, [device()]).changes).toEqual({
      phone: "+1 (416) 555-1234", email: "alex@example.test", birthday: "02/29", photoUri: "data:image/jpeg;base64,photo",
    });
    expect(JSON.stringify(original)).toBe(copy);
    expect(fillOnlyEmptyChanges({}, { ...device(), notes: "Replace", circleLevel: 1 } as any)).not.toHaveProperty("notes");
  });
  test("never overwrites saved values or unsaved input", () => {
    expect(previewContactRefresh({ ...person, email: "mine@example.test", photoUri: "my-photo" }, [device()], {
      phone: "User typed this", birthday: "03/14",
    })).toMatchObject({ changes: {}, reason: expect.stringContaining("No empty fields") });
  });
  test("empty whitespace can be filled, while missing device fields are not proposed", () => {
    expect(previewContactRefresh({ ...person, phone: "  ", email: "\t" }, [device({ phones: [], photoUri: undefined, birthday: undefined })]).changes)
      .toEqual({ email: "alex@example.test" });
  });
  test("unmatched and ambiguous results include the Bridges name and reason", () => {
    expect(previewContactRefresh({ ...person, name: "Nobody" }, [device()])).toMatchObject({
      name: "Nobody", changes: {}, reason: expect.stringContaining("No matching"),
    });
  });
});

describe("phone import field reuse", () => {
  test.each([[0, 1, "01/01"], [1, 29, "02/29"], [11, 31, "12/31"]])("zero-based month %s day %s becomes %s", (month, day, expected) => {
    expect(deviceBirthday({ birthday: { month: month as number, day: day as number } })).toBe(expected);
  });
  test("does not invent a birthday for missing or invalid dates", () => {
    expect(deviceBirthday({})).toBeUndefined();
    expect(deviceBirthday({ birthday: { month: 1, day: 30 } })).toBeUndefined();
    expect(deviceBirthday({ birthday: { month: 12, day: 1 } })).toBeUndefined();
  });
  test("uses the importer's base64-first photo handling, then device URI", () => {
    expect(devicePhoto({ imageAvailable: true, rawImage: { base64: "raw" }, image: { uri: "file://photo" } })).toBe("data:image/jpeg;base64,raw");
    expect(devicePhoto({ imageAvailable: true, image: { uri: "file://photo" } })).toBe("file://photo");
    expect(devicePhoto({ imageAvailable: false, rawImage: { base64: "raw" } })).toBeUndefined();
  });
});

describe("applying an approved preview", () => {
  test("only fills still-empty approved fields, protecting edits made after preview", async () => {
    const preview = previewContactRefresh(person, [device()]);
    const save = jest.fn(async (_id: string, changes: ContactRefreshChanges) => ({ contact: { ...person, ...changes }, appliedFields: Object.keys(changes) as any }));
    const onApplied = jest.fn();
    const results = await applyContactRefreshPreview([preview], {
      getContact: () => ({ ...person, email: "changed@example.test" }),
      getDraft: () => ({ phone: "new draft phone" }), save, onApplied,
    });
    expect(save).toHaveBeenCalledWith(person.id, { birthday: "02/29", photoUri: "data:image/jpeg;base64,photo" });
    expect(onApplied).toHaveBeenCalledWith(person.id, { birthday: "02/29", photoUri: "data:image/jpeg;base64,photo" });
    expect(results[0].message).toContain("Other details were left unchanged");
  });
  test("does not save deleted, ambiguous, or already-filled contacts", async () => {
    const save = jest.fn();
    const preview = previewContactRefresh(person, [device()]);
    expect((await applyContactRefreshPreview([preview], { getContact: () => undefined, save }))[0].status).toBe("skipped");
    await applyContactRefreshPreview([{ ...preview, reason: "Multiple matches" }], { getContact: () => person, save });
    await applyContactRefreshPreview([preview], { getContact: () => ({ ...person, ...preview.changes }), save });
    expect(save).not.toHaveBeenCalled();
  });
  test("reports actual fields applied by the server, not just requested fields", async () => {
    const onApplied = jest.fn();
    const result = await applyContactRefreshPreview([previewContactRefresh(person, [device()])], {
      getContact: () => person, onApplied,
      save: async () => ({ contact: { ...person, birthday: "02/29" }, appliedFields: ["birthday"] }),
    });
    expect(onApplied).toHaveBeenCalledWith(person.id, { birthday: "02/29" });
    expect(result[0]).toMatchObject({ status: "updated", message: expect.stringContaining("Updated birthday") });
  });
  test("bulk saves continue after one failure and report partial results accurately", async () => {
    const first = previewContactRefresh(person, [device()]);
    const second = { ...first, contactId: "second", name: "Second" };
    const save = jest.fn().mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce({
      contact: { ...person, ...second.changes }, appliedFields: ["email", "phone", "photoUri", "birthday"],
    });
    const result = await applyContactRefreshPreview([first, second], { getContact: () => person, save });
    expect(result.map(r => r.status)).toEqual(["failed", "updated"]);
  });
});
