import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { storage } from "./storage";

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/contacts", async (_req, res) => {
    try {
      const contacts = await storage.getAllContacts();
      res.json(contacts);
    } catch (err) {
      console.error("Error fetching contacts:", err);
      res.status(500).json({ message: "Failed to fetch contacts" });
    }
  });

  app.get("/api/contacts/:id", async (req, res) => {
    try {
      const contact = await storage.getContact(req.params.id);
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      res.json(contact);
    } catch (err) {
      console.error("Error fetching contact:", err);
      res.status(500).json({ message: "Failed to fetch contact" });
    }
  });

  app.post("/api/contacts", async (req, res) => {
    try {
      const contact = await storage.createContact(req.body);
      res.status(201).json(contact);
    } catch (err) {
      console.error("Error creating contact:", err);
      res.status(500).json({ message: "Failed to create contact" });
    }
  });

  app.put("/api/contacts/:id", async (req, res) => {
    try {
      const contact = await storage.updateContact(req.params.id, req.body);
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      res.json(contact);
    } catch (err) {
      console.error("Error updating contact:", err);
      res.status(500).json({ message: "Failed to update contact" });
    }
  });

  app.delete("/api/contacts/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteContact(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Contact not found" });
      }
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting contact:", err);
      res.status(500).json({ message: "Failed to delete contact" });
    }
  });

  app.post("/api/contacts/:id/mark-contacted", async (req, res) => {
    try {
      const contact = await storage.updateContact(req.params.id, {
        lastContacted: new Date().toISOString(),
      });
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      res.json(contact);
    } catch (err) {
      console.error("Error marking contact:", err);
      res.status(500).json({ message: "Failed to mark contact" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
