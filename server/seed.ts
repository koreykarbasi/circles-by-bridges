import { db } from "./db";
import { contacts, users } from "@shared/schema";
import bcrypt from "bcryptjs";

const AVATAR_COLORS = [
  "#FF6B8A", "#9B7DFF", "#4ECDC4", "#FFB84D",
  "#FF8A65", "#7C4DFF", "#26A69A", "#EF5350",
  "#AB47BC", "#42A5F5", "#66BB6A", "#FFA726",
];

const SAMPLE_CONTACTS = [
  {
    name: "Maya Johnson",
    circleLevel: 1,
    interests: ["Fitness", "Cooking", "Travel"],
    birthday: "03/15",
    lastContacted: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    notes: "Best friend since college. Loves Italian food.",
    avatarColor: AVATAR_COLORS[0],
  },
  {
    name: "Alex Chen",
    circleLevel: 1,
    interests: ["Tech", "Gaming", "Music"],
    birthday: "07/22",
    lastContacted: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    notes: "Works at a startup. Great at board games.",
    avatarColor: AVATAR_COLORS[1],
  },
  {
    name: "Sarah Williams",
    circleLevel: 1,
    interests: ["Reading", "Yoga", "Art"],
    birthday: "11/08",
    lastContacted: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    avatarColor: AVATAR_COLORS[2],
  },
  {
    name: "Jordan Taylor",
    circleLevel: 2,
    interests: ["Sports", "Outdoors", "Photography"],
    birthday: "05/30",
    lastContacted: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    notes: "Met at a hiking group. Incredible photographer.",
    avatarColor: AVATAR_COLORS[3],
  },
  {
    name: "Priya Patel",
    circleLevel: 2,
    interests: ["Cooking", "Travel", "Podcasts"],
    birthday: "09/12",
    lastContacted: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
    avatarColor: AVATAR_COLORS[4],
  },
  {
    name: "Marcus Thompson",
    circleLevel: 2,
    interests: ["Music", "Movies", "Gaming"],
    lastContacted: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(),
    notes: "Former coworker. Amazing taste in music.",
    avatarColor: AVATAR_COLORS[5],
  },
  {
    name: "Emily Davis",
    circleLevel: 2,
    interests: ["Art", "Fashion", "Dancing"],
    birthday: "02/28",
    lastContacted: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    avatarColor: AVATAR_COLORS[6],
  },
  {
    name: "Carlos Rivera",
    circleLevel: 3,
    interests: ["Sports", "Fitness", "Cooking"],
    lastContacted: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    avatarColor: AVATAR_COLORS[7],
  },
  {
    name: "Lisa Kim",
    circleLevel: 3,
    interests: ["Tech", "Reading", "Volunteering"],
    birthday: "12/01",
    lastContacted: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    notes: "Met at a conference. Very thoughtful person.",
    avatarColor: AVATAR_COLORS[8],
  },
  {
    name: "David Okafor",
    circleLevel: 3,
    interests: ["Outdoors", "Photography", "Travel"],
    lastContacted: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
    avatarColor: AVATAR_COLORS[9],
  },
  {
    name: "Zoe Martinez",
    circleLevel: 3,
    interests: ["Music", "Art", "Writing"],
    birthday: "08/19",
    lastContacted: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(),
    avatarColor: AVATAR_COLORS[10],
  },
  {
    name: "Ryan Brooks",
    circleLevel: 3,
    interests: ["Gaming", "Movies", "Tech"],
    lastContacted: new Date(Date.now() - 75 * 24 * 60 * 60 * 1000).toISOString(),
    avatarColor: AVATAR_COLORS[11],
  },
];

export async function seedDatabase() {
  try {
    const existingUsers = await db.select().from(users);
    const demoExists = existingUsers.some((u) => u.email === "demo@bridges.app");

    if (demoExists) {
      console.log("Demo user already exists, skipping seed");
      return;
    }

    console.log("Seeding database with demo user and sample contacts...");
    const hashedPassword = await bcrypt.hash("demo123", 10);
    const [demoUser] = await db
      .insert(users)
      .values({
        email: "demo@bridges.app",
        password: hashedPassword,
        username: "Demo User",
      })
      .returning();

    for (const contact of SAMPLE_CONTACTS) {
      await db.insert(contacts).values({
        ...contact,
        userId: demoUser.id,
      });
    }

    console.log(`Seeded demo user (demo@bridges.app / demo123) with ${SAMPLE_CONTACTS.length} contacts`);
  } catch (err) {
    console.error("Error seeding database:", err);
  }
}
