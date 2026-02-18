import { db } from "./db";
import { contacts, users } from "@shared/schema";
import type { User, InsertUser, Contact, InsertContact } from "@shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllContacts(): Promise<Contact[]>;
  getContact(id: string): Promise<Contact | undefined>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: string, data: Partial<InsertContact>): Promise<Contact | undefined>;
  deleteContact(id: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getAllContacts(): Promise<Contact[]> {
    return db.select().from(contacts);
  }

  async getContact(id: string): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
    return contact;
  }

  async createContact(data: InsertContact): Promise<Contact> {
    const [contact] = await db.insert(contacts).values(data).returning();
    return contact;
  }

  async updateContact(id: string, data: Partial<InsertContact>): Promise<Contact | undefined> {
    const [contact] = await db
      .update(contacts)
      .set(data)
      .where(eq(contacts.id, id))
      .returning();
    return contact;
  }

  async deleteContact(id: string): Promise<boolean> {
    const result = await db.delete(contacts).where(eq(contacts.id, id)).returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
