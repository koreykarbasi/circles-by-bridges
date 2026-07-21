import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import type { Contact } from "./types";
import { AVATAR_COLORS } from "./types";
import { Platform } from "react-native";
import { apiRequest, getApiUrl } from "./query-client";
import { fetch as expoFetch } from "expo/fetch";
import { useAuth } from "./auth-context";
import { clearElevation, invalidateElevationCache } from "./checkin-state";

const fetchFn = Platform.OS === "web" ? globalThis.fetch : expoFetch;

interface ContactsContextValue {
  contacts: Contact[];
  isLoading: boolean;
  refreshContacts: () => Promise<void>;
  addContact: (data: Omit<Contact, "id" | "avatarColor" | "createdAt">) => Promise<Contact>;
  updateContact: (contact: Contact) => Promise<void>;
  deleteContact: (id: string) => Promise<void>;
  markContacted: (id: string, date?: Date, label?: string) => Promise<void>;
  markHangout: (id: string, date?: Date, label?: string) => Promise<void>;
  savePhoneNumber: (id: string, phone: string, extra?: { birthday?: string; photoUri?: string }) => Promise<void>;
  getCircleContacts: (level: 1 | 2 | 3) => Contact[];
  getOverdueContacts: () => Contact[];
  getUpcomingBirthdays: () => Contact[];
  reorderCircleContacts: (circleLevel: 1 | 2 | 3, orderedIds: string[]) => Promise<void>;
}

const ContactsContext = createContext<ContactsContextValue | null>(null);

export function ContactsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchContacts = useCallback(async () => {
    setIsLoading(true);
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/contacts", baseUrl);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setContacts(data);
      } else {
        setContacts([]);
      }
    } catch (err) {
      console.error("Failed to fetch contacts:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchContacts();
    } else {
      setContacts([]);
      setIsLoading(false);
    }
  }, [user, fetchContacts]);

  const addContactFn = useCallback(async (data: Omit<Contact, "id" | "avatarColor" | "createdAt">): Promise<Contact> => {
    const body = {
      ...data,
      avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    };
    const resp = await apiRequest("POST", "/api/contacts", body);
    const created = (await resp.json()) as Contact;
    await fetchContacts();
    return created;
  }, [fetchContacts]);

  const updateContactFn = useCallback(async (contact: Contact) => {
    await apiRequest("PUT", `/api/contacts/${contact.id}`, {
      name: contact.name,
      circleLevel: contact.circleLevel,
      interests: contact.interests,
      labels: contact.labels,
      birthday: contact.birthday,
      lastContacted: contact.lastContacted,
      lastHangout: contact.lastHangout,
      notes: contact.notes,
      phone: contact.phone,
      email: contact.email,
      avatarColor: contact.avatarColor,
      photoUri: contact.photoUri,
      customReminders: contact.customReminders ?? [],
    });
    await fetchContacts();
  }, [fetchContacts]);

  const deleteContactFn = useCallback(async (id: string) => {
    await apiRequest("DELETE", `/api/contacts/${id}`);
    await fetchContacts();
  }, [fetchContacts]);

  const markContactedFn = useCallback(async (id: string, date?: Date, label?: string) => {
    const ts = (date ?? new Date()).toISOString();
    const previous = contacts.find((c) => c.id === id);
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, lastContacted: ts, lastContactedLabel: label ?? null } : c)),
    );
    const body: Record<string, string> = {};
    if (date) body.contactedAt = ts;
    if (label) body.label = label;
    try {
      await apiRequest("POST", `/api/contacts/${id}/mark-contacted`, Object.keys(body).length ? body : undefined);
      clearElevation(id, "checkin").catch(() => {});
      invalidateElevationCache().catch(() => {});
      fetchContacts();
    } catch (err) {
      if (previous) {
        setContacts((prev) =>
          prev.map((c) => (c.id === id ? { ...c, lastContacted: previous.lastContacted ?? null, lastContactedLabel: previous.lastContactedLabel ?? null } : c)),
        );
      }
      throw err;
    }
  }, [contacts, fetchContacts]);

  const savePhoneNumberFn = useCallback(async (id: string, phone: string, extra?: { birthday?: string; photoUri?: string }) => {
    const previousPhone = contacts.find((c) => c.id === id)?.phone ?? null;
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, phone } : c)),
    );
    try {
      const res = await apiRequest("PUT", `/api/contacts/${id}/phone`, {
        phone,
        birthday: extra?.birthday,
        photoUri: extra?.photoUri,
      });
      const updated = await res.json() as Contact;
      setContacts((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...updated } : c)),
      );
    } catch (err) {
      console.error("Failed to save phone number:", err);
      setContacts((prev) =>
        prev.map((c) => (c.id === id ? { ...c, phone: previousPhone } : c)),
      );
      throw err;
    }
  }, [contacts]);

  // DISABLED: hangout tracking — markHangout is a no-op while hangout logging is disabled
  const markHangoutFn = useCallback(async (_id: string, _date?: Date, _label?: string) => {
    // Hangout date logging is currently disabled. Uncomment the block below to re-enable.
    // const ts = (_date ?? new Date()).toISOString();
    // setContacts((prev) =>
    //   prev.map((c) => (c.id === _id ? { ...c, lastHangout: ts, lastHangoutLabel: _label ?? null } : c)),
    // );
    // const body: Record<string, string> = { hangoutAt: ts };
    // if (_label) body.label = _label;
    // apiRequest("POST", `/api/contacts/${_id}/mark-hangout`, body)
    //   .then(() => clearElevation(_id, "hangout").catch(() => {}))
    //   .then(() => invalidateElevationCache().catch(() => {}))
    //   .then(fetchContacts);
  }, []);

  const reorderCircleContactsFn = useCallback(async (circleLevel: 1 | 2 | 3, orderedIds: string[]) => {
    const previous = [...contacts];
    setContacts((prev) => {
      const others = prev.filter((c) => c.circleLevel !== circleLevel);
      const reordered = orderedIds
        .map((id) => prev.find((c) => c.id === id))
        .filter((c): c is Contact => !!c);
      return [...others, ...reordered].sort((a, b) => {
        if (a.circleLevel !== b.circleLevel) return a.circleLevel - b.circleLevel;
        return 0;
      });
    });
    try {
      await apiRequest("PUT", "/api/contacts/reorder", { contactIds: orderedIds });
    } catch (err) {
      setContacts(previous);
      throw err;
    }
  }, [contacts]);

  const getCircleContacts = useCallback(
    (level: 1 | 2 | 3) => contacts.filter((c) => c.circleLevel === level),
    [contacts],
  );

  const getOverdueContacts = useCallback(() => {
    const now = new Date();
    return contacts.filter((c) => {
      if (!c.lastContacted) return true;
      const last = new Date(c.lastContacted);
      const daysSince = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
      if (c.circleLevel === 1) return daysSince > 7;
      if (c.circleLevel === 2) return daysSince > 30;
      return daysSince > 90;
    });
  }, [contacts]);

  const getUpcomingBirthdays = useCallback(() => {
    const now = new Date();
    return contacts
      .filter((c) => {
        if (!c.birthday) return false;
        const parts = c.birthday.split("/");
        if (parts.length !== 2) return false;
        const month = parseInt(parts[0], 10) - 1;
        const day = parseInt(parts[1], 10);
        const thisYearBday = new Date(now.getFullYear(), month, day);
        if (thisYearBday < now) {
          thisYearBday.setFullYear(thisYearBday.getFullYear() + 1);
        }
        const daysUntil = Math.floor((thisYearBday.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return daysUntil <= 30;
      })
      .sort((a, b) => {
        const now2 = new Date();
        const getNext = (d: string) => {
          const parts = d.split("/");
          const month = parseInt(parts[0], 10) - 1;
          const day = parseInt(parts[1], 10);
          const next = new Date(now2.getFullYear(), month, day);
          if (next < now2) next.setFullYear(next.getFullYear() + 1);
          return next.getTime();
        };
        return getNext(a.birthday!) - getNext(b.birthday!);
      });
  }, [contacts]);

  const value = useMemo(
    () => ({
      contacts,
      isLoading,
      refreshContacts: fetchContacts,
      addContact: addContactFn,
      updateContact: updateContactFn,
      deleteContact: deleteContactFn,
      markContacted: markContactedFn,
      markHangout: markHangoutFn,
      savePhoneNumber: savePhoneNumberFn,
      getCircleContacts,
      getOverdueContacts,
      getUpcomingBirthdays,
      reorderCircleContacts: reorderCircleContactsFn,
    }),
    [contacts, isLoading, fetchContacts, addContactFn, updateContactFn, deleteContactFn, markContactedFn, markHangoutFn, savePhoneNumberFn, getCircleContacts, getOverdueContacts, getUpcomingBirthdays, reorderCircleContactsFn],
  );

  return <ContactsContext.Provider value={value}>{children}</ContactsContext.Provider>;
}

export function useContacts() {
  const ctx = useContext(ContactsContext);
  if (!ctx) throw new Error("useContacts must be used within ContactsProvider");
  return ctx;
}
