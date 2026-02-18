import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Contact } from "./types";

const CONTACTS_KEY = "bridges_contacts";

export async function loadContacts(): Promise<Contact[]> {
  try {
    const data = await AsyncStorage.getItem(CONTACTS_KEY);
    if (data) {
      return JSON.parse(data);
    }
    return [];
  } catch {
    return [];
  }
}

export async function saveContacts(contacts: Contact[]): Promise<void> {
  await AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
}

export async function addContact(contact: Contact): Promise<Contact[]> {
  const contacts = await loadContacts();
  contacts.push(contact);
  await saveContacts(contacts);
  return contacts;
}

export async function updateContact(updated: Contact): Promise<Contact[]> {
  const contacts = await loadContacts();
  const idx = contacts.findIndex((c) => c.id === updated.id);
  if (idx !== -1) {
    contacts[idx] = updated;
  }
  await saveContacts(contacts);
  return contacts;
}

export async function deleteContact(id: string): Promise<Contact[]> {
  let contacts = await loadContacts();
  contacts = contacts.filter((c) => c.id !== id);
  await saveContacts(contacts);
  return contacts;
}

export async function markContacted(id: string): Promise<Contact[]> {
  const contacts = await loadContacts();
  const idx = contacts.findIndex((c) => c.id === id);
  if (idx !== -1) {
    contacts[idx].lastContacted = new Date().toISOString();
  }
  await saveContacts(contacts);
  return contacts;
}
