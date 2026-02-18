import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import type { Contact } from "./types";
import { AVATAR_COLORS } from "./types";
import * as storage from "./storage";
import * as Crypto from "expo-crypto";

interface ContactsContextValue {
  contacts: Contact[];
  isLoading: boolean;
  addContact: (data: Omit<Contact, "id" | "avatarColor">) => Promise<void>;
  updateContact: (contact: Contact) => Promise<void>;
  deleteContact: (id: string) => Promise<void>;
  markContacted: (id: string) => Promise<void>;
  getCircleContacts: (level: 1 | 2 | 3) => Contact[];
  getOverdueContacts: () => Contact[];
  getUpcomingBirthdays: () => Contact[];
}

const ContactsContext = createContext<ContactsContextValue | null>(null);

export function ContactsProvider({ children }: { children: ReactNode }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    storage.loadContacts().then((c) => {
      setContacts(c);
      setIsLoading(false);
    });
  }, []);

  const addContactFn = useCallback(async (data: Omit<Contact, "id" | "avatarColor">) => {
    const newContact: Contact = {
      ...data,
      id: Crypto.randomUUID(),
      avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    };
    const updated = await storage.addContact(newContact);
    setContacts(updated);
  }, []);

  const updateContactFn = useCallback(async (contact: Contact) => {
    const updated = await storage.updateContact(contact);
    setContacts(updated);
  }, []);

  const deleteContactFn = useCallback(async (id: string) => {
    const updated = await storage.deleteContact(id);
    setContacts(updated);
  }, []);

  const markContactedFn = useCallback(async (id: string) => {
    const updated = await storage.markContacted(id);
    setContacts(updated);
  }, []);

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
        const bday = new Date(c.birthday);
        const thisYearBday = new Date(now.getFullYear(), bday.getMonth(), bday.getDate());
        if (thisYearBday < now) {
          thisYearBday.setFullYear(thisYearBday.getFullYear() + 1);
        }
        const daysUntil = Math.floor((thisYearBday.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return daysUntil <= 30;
      })
      .sort((a, b) => {
        const now2 = new Date();
        const getNext = (d: string) => {
          const bday = new Date(d);
          const next = new Date(now2.getFullYear(), bday.getMonth(), bday.getDate());
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
      addContact: addContactFn,
      updateContact: updateContactFn,
      deleteContact: deleteContactFn,
      markContacted: markContactedFn,
      getCircleContacts,
      getOverdueContacts,
      getUpcomingBirthdays,
    }),
    [contacts, isLoading, addContactFn, updateContactFn, deleteContactFn, markContactedFn, getCircleContacts, getOverdueContacts, getUpcomingBirthdays],
  );

  return <ContactsContext.Provider value={value}>{children}</ContactsContext.Provider>;
}

export function useContacts() {
  const ctx = useContext(ContactsContext);
  if (!ctx) throw new Error("useContacts must be used within ContactsProvider");
  return ctx;
}
