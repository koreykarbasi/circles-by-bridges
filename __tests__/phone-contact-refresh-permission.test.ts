jest.mock("expo-contacts", () => ({}));
jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));
import { PhoneContactsPermissionError, readPhoneContacts } from "../lib/phone-contact-refresh";

test.each(["ios", "android"])("%s denial explains Settings and does not read the address book", async platform => {
  const getContacts = jest.fn();
  await expect(readPhoneContacts({
    platform, requestPermission: async () => ({ status: "denied" }), getContacts,
  })).rejects.toBeInstanceOf(PhoneContactsPermissionError);
  expect(getContacts).not.toHaveBeenCalled();
});

test("limited access imports only shared contacts and reports the limitation", async () => {
  const result = await readPhoneContacts({
    platform: "ios", requestPermission: async () => ({ status: "granted", accessPrivileges: "limited" }),
    getContacts: async () => ({ data: [{
      id: "shared", name: "Shared", phoneNumbers: [{ number: "123" }, { number: "456" }],
      emails: [{ email: "one@example.test" }, { email: "two@example.test" }],
      birthday: { month: 0, day: 1 }, imageAvailable: true, rawImage: { base64: "photo" },
    }] }),
  });
  expect(result.limited).toBe(true);
  expect(result.contacts).toEqual([{
    id: "shared", name: "Shared", phones: ["123", "456"], emails: ["one@example.test", "two@example.test"],
    birthday: "01/01", photoUri: "data:image/jpeg;base64,photo",
  }]);
});

test("web explains native availability, without requesting permission", async () => {
  const requestPermission = jest.fn();
  await expect(readPhoneContacts({ platform: "web", requestPermission, getContacts: jest.fn() })).rejects.toThrow("iPhone or Android");
  expect(requestPermission).not.toHaveBeenCalled();
});

test("address-book failures are surfaced, not reported as an empty successful scan", async () => {
  await expect(readPhoneContacts({
    platform: "android", requestPermission: async () => ({ status: "granted" }),
    getContacts: async () => { throw new Error("Device read failed"); },
  })).rejects.toThrow("Device read failed");
});
