import { db } from "./db";
import { contacts, users, hangoutPlans, hangoutOptions, hangoutVotes } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const AVATAR_COLORS = [
  "#FF6B8A", "#9B7DFF", "#4ECDC4", "#FFB84D",
  "#FF8A65", "#7C4DFF", "#26A69A", "#EF5350",
  "#AB47BC", "#42A5F5", "#66BB6A", "#FFA726",
];

const DAY = 24 * 60 * 60 * 1000;

const SAMPLE_CONTACTS = [
  {
    name: "Maya Johnson",
    circleLevel: 1,
    interests: ["Fitness", "Cooking", "Travel"],
    labels: ["College Friend"],
    birthday: "03/15",
    lastContacted: new Date(Date.now() - 2 * DAY).toISOString(),
    lastHangout: new Date(Date.now() - 5 * DAY).toISOString(),
    notes: "Best friend since college. Loves Italian food.",
    avatarColor: AVATAR_COLORS[0],
  },
  {
    name: "Alex Chen",
    circleLevel: 1,
    interests: ["Tech", "Gaming", "Music"],
    labels: ["Work Friend", "Gym Buddy"],
    birthday: "07/22",
    lastContacted: new Date(Date.now() - 5 * DAY).toISOString(),
    lastHangout: new Date(Date.now() - 10 * DAY).toISOString(),
    notes: "Works at a startup. Great at board games.",
    avatarColor: AVATAR_COLORS[1],
  },
  {
    name: "Sarah Williams",
    circleLevel: 1,
    interests: ["Reading", "Yoga", "Art"],
    labels: ["Childhood Friend"],
    birthday: "11/08",
    lastContacted: new Date(Date.now() - 1 * DAY).toISOString(),
    lastHangout: new Date(Date.now() - 3 * DAY).toISOString(),
    avatarColor: AVATAR_COLORS[2],
  },
  {
    name: "Jordan Taylor",
    circleLevel: 2,
    interests: ["Sports", "Outdoors", "Photography"],
    labels: ["Gym Buddy"],
    birthday: "05/30",
    lastContacted: new Date(Date.now() - 14 * DAY).toISOString(),
    lastHangout: new Date(Date.now() - 14 * DAY).toISOString(),
    notes: "Met at a hiking group. Incredible photographer.",
    avatarColor: AVATAR_COLORS[3],
  },
  {
    name: "Priya Patel",
    circleLevel: 2,
    interests: ["Cooking", "Travel", "Podcasts"],
    labels: ["Work Friend"],
    birthday: "09/12",
    lastContacted: new Date(Date.now() - 21 * DAY).toISOString(),
    lastHangout: new Date(Date.now() - 28 * DAY).toISOString(),
    avatarColor: AVATAR_COLORS[4],
  },
  {
    name: "Marcus Thompson",
    circleLevel: 2,
    interests: ["Music", "Movies", "Gaming"],
    labels: ["Work Friend"],
    lastContacted: new Date(Date.now() - 35 * DAY).toISOString(),
    lastHangout: new Date(Date.now() - 56 * DAY).toISOString(),
    notes: "Former coworker. Amazing taste in music.",
    avatarColor: AVATAR_COLORS[5],
  },
  {
    name: "Emily Davis",
    circleLevel: 2,
    interests: ["Art", "Fashion", "Dancing"],
    labels: ["College Friend", "Creative Partner"],
    birthday: "02/28",
    lastContacted: new Date(Date.now() - 10 * DAY).toISOString(),
    lastHangout: new Date(Date.now() - 84 * DAY).toISOString(),
    avatarColor: AVATAR_COLORS[6],
  },
  {
    name: "Carlos Rivera",
    circleLevel: 3,
    interests: ["Sports", "Fitness", "Cooking"],
    labels: ["Gym Buddy"],
    lastContacted: new Date(Date.now() - 60 * DAY).toISOString(),
    lastHangout: new Date(Date.now() - 200 * DAY).toISOString(),
    avatarColor: AVATAR_COLORS[7],
  },
  {
    name: "Lisa Kim",
    circleLevel: 3,
    interests: ["Tech", "Reading", "Volunteering"],
    labels: ["Work Friend"],
    birthday: "12/01",
    lastContacted: new Date(Date.now() - 90 * DAY).toISOString(),
    notes: "Met at a conference. Very thoughtful person.",
    avatarColor: AVATAR_COLORS[8],
  },
  {
    name: "David Okafor",
    circleLevel: 3,
    interests: ["Outdoors", "Photography", "Travel"],
    labels: ["Travel Buddy"],
    lastContacted: new Date(Date.now() - 45 * DAY).toISOString(),
    lastHangout: new Date(Date.now() - 150 * DAY).toISOString(),
    avatarColor: AVATAR_COLORS[9],
  },
  {
    name: "Zoe Martinez",
    circleLevel: 3,
    interests: ["Music", "Art", "Writing"],
    labels: ["Creative Partner"],
    birthday: "08/19",
    lastContacted: new Date(Date.now() - 120 * DAY).toISOString(),
    avatarColor: AVATAR_COLORS[10],
  },
  {
    name: "Ryan Brooks",
    circleLevel: 3,
    interests: ["Gaming", "Movies", "Tech"],
    labels: ["Neighbor"],
    lastContacted: new Date(Date.now() - 75 * DAY).toISOString(),
    lastHangout: new Date(Date.now() - 90 * DAY).toISOString(),
    avatarColor: AVATAR_COLORS[11],
  },
];

const TEST1_CONTACTS = [
  { name: "Olivia Hart", circleLevel: 1, interests: ["Cooking", "Travel", "Yoga"], labels: ["Family Friend"], birthday: "01/14", notes: "Sister-in-law. Always brings amazing dishes." },
  { name: "Ethan Moore", circleLevel: 1, interests: ["Tech", "Gaming", "Fitness"], labels: ["Childhood Friend", "Gym Buddy"], birthday: "06/03", notes: "Best friend since high school." },
  { name: "Chloe Nguyen", circleLevel: 1, interests: ["Art", "Music", "Reading"], labels: ["College Friend", "Creative Partner"], birthday: "09/27", notes: "College roommate. Very creative." },
  { name: "Liam Foster", circleLevel: 1, interests: ["Sports", "Outdoors", "Photography"], labels: ["Gym Buddy"], birthday: "04/11", notes: "Workout buddy. Runs marathons." },
  { name: "Ava Sinclair", circleLevel: 1, interests: ["Podcasts", "Writing", "Travel"], labels: ["Family Friend"], birthday: "12/05", notes: "Partner's best friend. Great storyteller." },

  { name: "Noah Reeves", circleLevel: 2, interests: ["Music", "Movies", "Cooking"], labels: ["Neighbor"], birthday: "02/18" },
  { name: "Sophia Blake", circleLevel: 2, interests: ["Fitness", "Yoga", "Travel"], labels: ["Gym Buddy"], birthday: "08/09" },
  { name: "Mason Cruz", circleLevel: 2, interests: ["Tech", "Gaming", "Sports"], labels: ["Work Friend"], birthday: "05/22" },
  { name: "Isabella Park", circleLevel: 2, interests: ["Art", "Fashion", "Dancing"], labels: ["College Friend"], birthday: "10/30" },
  { name: "James Watts", circleLevel: 2, interests: ["Outdoors", "Photography", "Volunteering"], labels: ["Travel Buddy"], birthday: "03/07" },
  { name: "Emma Sullivan", circleLevel: 2, interests: ["Reading", "Podcasts", "Cooking"], labels: ["Work Friend"], birthday: "07/16" },
  { name: "Benjamin Cole", circleLevel: 2, interests: ["Sports", "Fitness", "Music"], labels: ["Gym Buddy"] },
  { name: "Mia Larson", circleLevel: 2, interests: ["Travel", "Art", "Writing"], labels: ["Creative Partner"], birthday: "11/21" },
  { name: "Lucas Ortiz", circleLevel: 2, interests: ["Movies", "Gaming", "Tech"], labels: ["Work Friend"] },
  { name: "Harper Quinn", circleLevel: 2, interests: ["Yoga", "Volunteering", "Outdoors"], labels: ["Mentor"], birthday: "01/29" },

  { name: "Aiden Murphy", circleLevel: 3, interests: ["Tech", "Gaming"], labels: ["Work Friend"] },
  { name: "Ella Fischer", circleLevel: 3, interests: ["Art", "Fashion"], labels: [] },
  { name: "Jack Romano", circleLevel: 3, interests: ["Sports", "Fitness"], labels: ["Gym Buddy"], birthday: "02/14" },
  { name: "Grace Keller", circleLevel: 3, interests: ["Reading", "Writing"], labels: ["Mentee"] },
  { name: "Henry Dawson", circleLevel: 3, interests: ["Music", "Movies"], labels: [] },
  { name: "Lily Chang", circleLevel: 3, interests: ["Cooking", "Travel"], labels: ["Neighbor"] },
  { name: "Owen Barrett", circleLevel: 3, interests: ["Outdoors", "Photography"], labels: ["Travel Buddy"] },
  { name: "Zara Mendez", circleLevel: 3, interests: ["Yoga", "Dancing"], labels: [], birthday: "06/19" },
  { name: "Caleb Hughes", circleLevel: 3, interests: ["Podcasts", "Tech"], labels: [] },
  { name: "Nora Jacobs", circleLevel: 3, interests: ["Volunteering", "Cooking"], labels: ["Neighbor"] },
  { name: "Dylan Price", circleLevel: 3, interests: ["Gaming", "Movies"], labels: [] },
  { name: "Aria Stone", circleLevel: 3, interests: ["Travel", "Photography"], labels: ["Travel Buddy"], birthday: "09/03" },
  { name: "Leo Chambers", circleLevel: 3, interests: ["Fitness", "Sports"], labels: ["Gym Buddy"] },
  { name: "Scarlett Webb", circleLevel: 3, interests: ["Fashion", "Art"], labels: [] },
  { name: "Isaac Ford", circleLevel: 3, interests: ["Music", "Writing"], labels: ["Creative Partner"] },
  { name: "Penelope Ross", circleLevel: 3, interests: ["Reading", "Yoga"], labels: [], birthday: "04/25" },
  { name: "Sebastian Lane", circleLevel: 3, interests: ["Tech", "Outdoors"], labels: [] },
  { name: "Violet Hayes", circleLevel: 3, interests: ["Dancing", "Music"], labels: [], birthday: "11/08" },
  { name: "Max Coleman", circleLevel: 3, interests: ["Sports", "Gaming"], labels: [] },
  { name: "Luna Perry", circleLevel: 3, interests: ["Cooking", "Podcasts"], labels: [] },
  { name: "Oscar Hunt", circleLevel: 3, interests: ["Movies", "Photography"], labels: [] },
  { name: "Ivy Marshall", circleLevel: 3, interests: ["Art", "Volunteering"], labels: ["Mentor"], birthday: "07/31" },
  { name: "Theo Palmer", circleLevel: 3, interests: ["Travel", "Fitness"], labels: [] },
  { name: "Stella Grant", circleLevel: 3, interests: ["Reading", "Fashion"], labels: [] },
  { name: "Felix Warren", circleLevel: 3, interests: ["Tech", "Music"], labels: ["Work Friend"] },
  { name: "Hazel Brooks", circleLevel: 3, interests: ["Yoga", "Writing"], labels: [], birthday: "03/12" },
  { name: "Miles Duncan", circleLevel: 3, interests: ["Sports", "Outdoors"], labels: [] },
  { name: "Ruby Saunders", circleLevel: 3, interests: ["Cooking", "Dancing"], labels: [] },
  { name: "Jasper Flynn", circleLevel: 3, interests: ["Gaming", "Podcasts"], labels: [] },
  { name: "Clara Bishop", circleLevel: 3, interests: ["Photography", "Travel"], labels: ["Travel Buddy"], birthday: "08/22" },
  { name: "Sienna Hale", circleLevel: 3, interests: ["Cooking", "Art"], labels: [] },
  { name: "Beckett Tran", circleLevel: 3, interests: ["Tech", "Fitness"], labels: ["Work Friend"], birthday: "05/17" },
  { name: "Wren Gallagher", circleLevel: 3, interests: ["Music", "Outdoors"], labels: [] },
  { name: "Piper Sandoval", circleLevel: 3, interests: ["Yoga", "Podcasts"], labels: [], birthday: "10/09" },
  { name: "Rowan Kemp", circleLevel: 3, interests: ["Sports", "Movies"], labels: [] },
];

// complete@bridges.app — Stage 2: 3 Core (all with birthdays), 2 Close, 1 Acquaintance, past finalized hangout
const COMPLETE_CONTACTS = [
  { name: "Jamie Rivera", circleLevel: 1, interests: ["Hiking", "Coffee", "Travel"], labels: ["College Friend"], birthday: "04/12", lastContacted: new Date(Date.now() - 1 * DAY).toISOString(), lastHangout: new Date(Date.now() - 4 * DAY).toISOString(), notes: "Best friend. Always up for an adventure.", avatarColor: AVATAR_COLORS[0] },
  { name: "Taylor Kim", circleLevel: 1, interests: ["Music", "Cooking", "Yoga"], labels: ["Childhood Friend"], birthday: "08/25", lastContacted: new Date(Date.now() - 3 * DAY).toISOString(), lastHangout: new Date(Date.now() - 7 * DAY).toISOString(), notes: "Known each other since 5th grade.", avatarColor: AVATAR_COLORS[1] },
  { name: "Morgan Lee", circleLevel: 1, interests: ["Gaming", "Tech", "Movies"], labels: ["Work Friend"], birthday: "11/03", lastContacted: new Date(Date.now() - 2 * DAY).toISOString(), lastHangout: new Date(Date.now() - 6 * DAY).toISOString(), notes: "Great colleague and friend.", avatarColor: AVATAR_COLORS[2] },
  { name: "Casey Nguyen", circleLevel: 2, interests: ["Photography", "Art", "Travel"], labels: ["Gym Buddy"], birthday: "02/14", lastContacted: new Date(Date.now() - 8 * DAY).toISOString(), lastHangout: new Date(Date.now() - 14 * DAY).toISOString(), avatarColor: AVATAR_COLORS[3] },
  { name: "Drew Patel", circleLevel: 2, interests: ["Running", "Podcasts", "Reading"], labels: ["Neighbor"], birthday: "06/30", lastContacted: new Date(Date.now() - 12 * DAY).toISOString(), lastHangout: new Date(Date.now() - 20 * DAY).toISOString(), avatarColor: AVATAR_COLORS[4] },
  { name: "Sam Brooks", circleLevel: 3, interests: ["Sports", "Movies"], labels: [], birthday: "09/15", lastContacted: new Date(Date.now() - 25 * DAY).toISOString(), lastHangout: new Date(Date.now() - 60 * DAY).toISOString(), avatarColor: AVATAR_COLORS[5] },
];

// half@bridges.app — Stage 1: 2 Core (one missing birthday), 1 Close, 0 Acquaintances
const HALF_CONTACTS = [
  { name: "Alex Foster", circleLevel: 1, interests: ["Fitness", "Cooking", "Music"], labels: ["College Friend"], birthday: "07/19", lastContacted: new Date(Date.now() - 4 * DAY).toISOString(), lastHangout: new Date(Date.now() - 10 * DAY).toISOString(), notes: "Great study partner from college.", avatarColor: AVATAR_COLORS[6] },
  { name: "Robin Chen", circleLevel: 1, interests: ["Art", "Travel", "Reading"], labels: ["Work Friend"], lastContacted: new Date(Date.now() - 6 * DAY).toISOString(), lastHangout: new Date(Date.now() - 15 * DAY).toISOString(), notes: "Creative soul. No birthday on file yet.", avatarColor: AVATAR_COLORS[7] },
  { name: "Jordan Walsh", circleLevel: 2, interests: ["Outdoors", "Gaming", "Sports"], labels: ["Gym Buddy"], birthday: "03/08", lastContacted: new Date(Date.now() - 20 * DAY).toISOString(), lastHangout: new Date(Date.now() - 30 * DAY).toISOString(), avatarColor: AVATAR_COLORS[8] },
];

function makeShareCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

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

      const hangoutThresholds = [14, 28, 56, 84, 105];
      for (let i = 0; i < TEST1_CONTACTS.length; i++) {
        const c = TEST1_CONTACTS[i];
        const daysAgo = c.circleLevel === 1 ? Math.floor(Math.random() * 7) : c.circleLevel === 2 ? Math.floor(Math.random() * 30) : Math.floor(Math.random() * 120);
        const hangoutDaysAgo = c.circleLevel === 2
          ? hangoutThresholds[i % hangoutThresholds.length]
          : c.circleLevel === 3
            ? (i % 3 === 0 ? 200 : i % 3 === 1 ? 100 : undefined)
            : Math.floor(Math.random() * 14);
        await db.insert(contacts).values({
          ...c,
          userId: test1User.id,
          lastContacted: new Date(Date.now() - daysAgo * DAY).toISOString(),
          lastHangout: hangoutDaysAgo ? new Date(Date.now() - hangoutDaysAgo * DAY).toISOString() : undefined,
          avatarColor: AVATAR_COLORS[i % AVATAR_COLORS.length],
        });
      }
      console.log(`Seeded test1 user (test1@bridges.app / test123) with ${TEST1_CONTACTS.length} contacts`);
    }

    // complete@bridges.app — Stage 2, full profile, past finalized hangout
    const completeExists = existingUsers.some((u) => u.email === "complete@bridges.app");
    if (!completeExists) {
      console.log("Seeding complete@bridges.app user...");
      const hashedPassword = await bcrypt.hash("test123", 10);
      const [completeUser] = await db
        .insert(users)
        .values({
          email: "complete@bridges.app",
          password: hashedPassword,
          username: "Complete User",
        })
        .returning();

      for (const contact of COMPLETE_CONTACTS) {
        await db.insert(contacts).values({
          ...contact,
          userId: completeUser.id,
        });
      }

      // Create a past finalized hangout
      const shareCode = makeShareCode();
      const [plan] = await db.insert(hangoutPlans).values({
        userId: completeUser.id,
        title: "Friday Night Dinner",
        description: "Let's catch up over dinner!",
        status: "finalized",
        shareCode,
        inviteeNames: ["Jamie Rivera", "Taylor Kim", "Morgan Lee"],
        surveyMode: "standard",
        includePlusOne: false,
      }).returning();

      const [opt1] = await db.insert(hangoutOptions).values({
        planId: plan.id,
        label: "Friday 7pm at Casa Luna",
        questionType: "time",
      }).returning();

      await db.insert(hangoutOptions).values({
        planId: plan.id,
        label: "Saturday 6pm at The Terrace",
        questionType: "time",
      });

      // Finalize on opt1
      await db.update(hangoutPlans).set({ finalizedOptionId: opt1.id }).where(eq(hangoutPlans.id, plan.id));

      // Add some votes
      for (const voter of ["Jamie Rivera", "Taylor Kim", "Morgan Lee"]) {
        await db.insert(hangoutVotes).values({ optionId: opt1.id, planId: plan.id, voterName: voter, rank: 1 });
      }

      console.log(`Seeded complete@bridges.app / test123 with ${COMPLETE_CONTACTS.length} contacts + 1 finalized hangout`);
    }

    // half@bridges.app — Stage 1, mid-funnel
    const halfExists = existingUsers.some((u) => u.email === "half@bridges.app");
    if (!halfExists) {
      console.log("Seeding half@bridges.app user...");
      const hashedPassword = await bcrypt.hash("test123", 10);
      const [halfUser] = await db
        .insert(users)
        .values({
          email: "half@bridges.app",
          password: hashedPassword,
          username: "Half User",
        })
        .returning();

      for (const contact of HALF_CONTACTS) {
        await db.insert(contacts).values({
          ...contact,
          userId: halfUser.id,
        });
      }
      console.log(`Seeded half@bridges.app / test123 with ${HALF_CONTACTS.length} contacts`);
    }

    // fresh@bridges.app — Brand new, 0 contacts
    const freshExists = existingUsers.some((u) => u.email === "fresh@bridges.app");
    if (!freshExists) {
      console.log("Seeding fresh@bridges.app user...");
      const hashedPassword = await bcrypt.hash("test123", 10);
      await db
        .insert(users)
        .values({
          email: "fresh@bridges.app",
          password: hashedPassword,
          username: "Fresh User",
        });
      console.log("Seeded fresh@bridges.app / test123 with 0 contacts");
    }
  } catch (err) {
    console.error("Error seeding database:", err);
  }
}

export async function updateExistingContactsWithLabels() {
  try {
    const allContacts = await db.select().from(contacts);
    const labelMap: Record<string, string[]> = {};
    for (const c of SAMPLE_CONTACTS) {
      labelMap[c.name] = c.labels || [];
    }
    for (const c of TEST1_CONTACTS) {
      labelMap[c.name] = c.labels || [];
    }
    const hangoutMap: Record<string, string | undefined> = {};
    for (const c of SAMPLE_CONTACTS) {
      hangoutMap[c.name] = (c as any).lastHangout;
    }

    let updated = 0;
    for (const contact of allContacts) {
      const newLabels = labelMap[contact.name];
      const newHangout = hangoutMap[contact.name];
      if (newLabels && newLabels.length > 0) {
        await db.update(contacts).set({ labels: newLabels }).where(eq(contacts.id, contact.id));
        updated++;
      }
      if (newHangout) {
        await db.update(contacts).set({ lastHangout: newHangout }).where(eq(contacts.id, contact.id));
      }
    }
    console.log(`Updated ${updated} existing contacts with labels and hangout dates`);
  } catch (err) {
    console.error("Error updating contacts:", err);
  }
}
