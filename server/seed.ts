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

const TEST1_CONTACTS = [
  { name: "Olivia Hart", circleLevel: 1, interests: ["Cooking", "Travel", "Yoga"], birthday: "01/14", notes: "Sister-in-law. Always brings amazing dishes." },
  { name: "Ethan Moore", circleLevel: 1, interests: ["Tech", "Gaming", "Fitness"], birthday: "06/03", notes: "Best friend since high school." },
  { name: "Chloe Nguyen", circleLevel: 1, interests: ["Art", "Music", "Reading"], birthday: "09/27", notes: "College roommate. Very creative." },
  { name: "Liam Foster", circleLevel: 1, interests: ["Sports", "Outdoors", "Photography"], birthday: "04/11", notes: "Workout buddy. Runs marathons." },
  { name: "Ava Sinclair", circleLevel: 1, interests: ["Podcasts", "Writing", "Travel"], birthday: "12/05", notes: "Partner's best friend. Great storyteller." },

  { name: "Noah Reeves", circleLevel: 2, interests: ["Music", "Movies", "Cooking"], birthday: "02/18" },
  { name: "Sophia Blake", circleLevel: 2, interests: ["Fitness", "Yoga", "Travel"], birthday: "08/09" },
  { name: "Mason Cruz", circleLevel: 2, interests: ["Tech", "Gaming", "Sports"], birthday: "05/22" },
  { name: "Isabella Park", circleLevel: 2, interests: ["Art", "Fashion", "Dancing"], birthday: "10/30" },
  { name: "James Watts", circleLevel: 2, interests: ["Outdoors", "Photography", "Volunteering"], birthday: "03/07" },
  { name: "Emma Sullivan", circleLevel: 2, interests: ["Reading", "Podcasts", "Cooking"], birthday: "07/16" },
  { name: "Benjamin Cole", circleLevel: 2, interests: ["Sports", "Fitness", "Music"] },
  { name: "Mia Larson", circleLevel: 2, interests: ["Travel", "Art", "Writing"], birthday: "11/21" },
  { name: "Lucas Ortiz", circleLevel: 2, interests: ["Movies", "Gaming", "Tech"] },
  { name: "Harper Quinn", circleLevel: 2, interests: ["Yoga", "Volunteering", "Outdoors"], birthday: "01/29" },

  { name: "Aiden Murphy", circleLevel: 3, interests: ["Tech", "Gaming"] },
  { name: "Ella Fischer", circleLevel: 3, interests: ["Art", "Fashion"] },
  { name: "Jack Romano", circleLevel: 3, interests: ["Sports", "Fitness"], birthday: "02/14" },
  { name: "Grace Keller", circleLevel: 3, interests: ["Reading", "Writing"] },
  { name: "Henry Dawson", circleLevel: 3, interests: ["Music", "Movies"] },
  { name: "Lily Chang", circleLevel: 3, interests: ["Cooking", "Travel"] },
  { name: "Owen Barrett", circleLevel: 3, interests: ["Outdoors", "Photography"] },
  { name: "Zara Mendez", circleLevel: 3, interests: ["Yoga", "Dancing"], birthday: "06/19" },
  { name: "Caleb Hughes", circleLevel: 3, interests: ["Podcasts", "Tech"] },
  { name: "Nora Jacobs", circleLevel: 3, interests: ["Volunteering", "Cooking"] },
  { name: "Dylan Price", circleLevel: 3, interests: ["Gaming", "Movies"] },
  { name: "Aria Stone", circleLevel: 3, interests: ["Travel", "Photography"], birthday: "09/03" },
  { name: "Leo Chambers", circleLevel: 3, interests: ["Fitness", "Sports"] },
  { name: "Scarlett Webb", circleLevel: 3, interests: ["Fashion", "Art"] },
  { name: "Isaac Ford", circleLevel: 3, interests: ["Music", "Writing"] },
  { name: "Penelope Ross", circleLevel: 3, interests: ["Reading", "Yoga"], birthday: "04/25" },
  { name: "Sebastian Lane", circleLevel: 3, interests: ["Tech", "Outdoors"] },
  { name: "Violet Hayes", circleLevel: 3, interests: ["Dancing", "Music"], birthday: "11/08" },
  { name: "Max Coleman", circleLevel: 3, interests: ["Sports", "Gaming"] },
  { name: "Luna Perry", circleLevel: 3, interests: ["Cooking", "Podcasts"] },
  { name: "Oscar Hunt", circleLevel: 3, interests: ["Movies", "Photography"] },
  { name: "Ivy Marshall", circleLevel: 3, interests: ["Art", "Volunteering"], birthday: "07/31" },
  { name: "Theo Palmer", circleLevel: 3, interests: ["Travel", "Fitness"] },
  { name: "Stella Grant", circleLevel: 3, interests: ["Reading", "Fashion"] },
  { name: "Felix Warren", circleLevel: 3, interests: ["Tech", "Music"] },
  { name: "Hazel Brooks", circleLevel: 3, interests: ["Yoga", "Writing"], birthday: "03/12" },
  { name: "Miles Duncan", circleLevel: 3, interests: ["Sports", "Outdoors"] },
  { name: "Ruby Saunders", circleLevel: 3, interests: ["Cooking", "Dancing"] },
  { name: "Jasper Flynn", circleLevel: 3, interests: ["Gaming", "Podcasts"] },
  { name: "Clara Bishop", circleLevel: 3, interests: ["Photography", "Travel"], birthday: "08/22" },
  { name: "Sienna Hale", circleLevel: 3, interests: ["Cooking", "Art"] },
  { name: "Beckett Tran", circleLevel: 3, interests: ["Tech", "Fitness"], birthday: "05/17" },
  { name: "Wren Gallagher", circleLevel: 3, interests: ["Music", "Outdoors"] },
  { name: "Piper Sandoval", circleLevel: 3, interests: ["Yoga", "Podcasts"], birthday: "10/09" },
  { name: "Rowan Kemp", circleLevel: 3, interests: ["Sports", "Movies"] },
];

export async function seedDatabase() {
  try {
    const existingUsers = await db.select().from(users);
    const demoExists = existingUsers.some((u) => u.email === "demo@bridges.app");

    if (!demoExists) {
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
    }

    const test1Exists = existingUsers.some((u) => u.email === "test1@bridges.app");
    if (!test1Exists) {
      console.log("Seeding test1 user with full circles...");
      const hashedPassword = await bcrypt.hash("test123", 10);
      const [test1User] = await db
        .insert(users)
        .values({
          email: "test1@bridges.app",
          password: hashedPassword,
          username: "test1",
        })
        .returning();

      for (let i = 0; i < TEST1_CONTACTS.length; i++) {
        const c = TEST1_CONTACTS[i];
        const daysAgo = c.circleLevel === 1 ? Math.floor(Math.random() * 7) : c.circleLevel === 2 ? Math.floor(Math.random() * 30) : Math.floor(Math.random() * 120);
        await db.insert(contacts).values({
          ...c,
          userId: test1User.id,
          lastContacted: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
          avatarColor: AVATAR_COLORS[i % AVATAR_COLORS.length],
        });
      }
      console.log(`Seeded test1 user (test1@bridges.app / test123) with ${TEST1_CONTACTS.length} contacts`);
    }
  } catch (err) {
    console.error("Error seeding database:", err);
  }
}
