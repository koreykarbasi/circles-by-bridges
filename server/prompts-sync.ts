import { getUncachableGoogleSheetClient } from "./googleSheets";
import { google } from "googleapis";
import * as fs from "fs";
import * as path from "path";

const CACHE_FILE = path.resolve(process.cwd(), "data", "prompts-cache.json");
const SPREADSHEET_ID_FILE = path.resolve(process.cwd(), "data", "spreadsheet-id.txt");

const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

const TAB_NAMES = [
  "Circle 1 Call",
  "Circle 1 Text",
  "Circle 1 Hangout",
  "Circle 2 Call",
  "Circle 2 Text",
  "Circle 2 Hangout",
  "Circle 3 Call",
  "Circle 3 Text",
  "Circle 3 Hangout",
  "Universal",
  "Birthday",
  "Overdue",
  "Label Prompts",
  "Interest Prompts",
];

export interface SyncedPrompts {
  circle1Call: string[];
  circle1Text: string[];
  circle1Hangout: string[];
  circle2Call: string[];
  circle2Text: string[];
  circle2Hangout: string[];
  circle3Call: string[];
  circle3Text: string[];
  circle3Hangout: string[];
  universal: string[];
  birthday: string[];
  overdue: string[];
  labelPrompts: Record<string, string[]>;
  interestPrompts: Record<string, string[]>;
  lastSynced: string | null;
}

function ensureDataDir() {
  const dataDir = path.resolve(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function getStoredSpreadsheetId(): string | null {
  try {
    if (fs.existsSync(SPREADSHEET_ID_FILE)) {
      return fs.readFileSync(SPREADSHEET_ID_FILE, "utf-8").trim();
    }
  } catch {}
  return null;
}

function storeSpreadsheetId(id: string) {
  ensureDataDir();
  fs.writeFileSync(SPREADSHEET_ID_FILE, id, "utf-8");
}

function getCachedPrompts(): SyncedPrompts | null {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch {}
  return null;
}

function saveCachedPrompts(prompts: SyncedPrompts) {
  ensureDataDir();
  fs.writeFileSync(CACHE_FILE, JSON.stringify(prompts, null, 2), "utf-8");
}

const HARDCODED_PROMPTS: SyncedPrompts = {
  circle1Call: [
    "Leave [Name] a voice note telling them why they matter to you.",
    "Call [Name] just to hear their voice - no agenda needed.",
    "Ask [Name] what's been weighing on them lately via a phone call.",
    "Call [Name] and ask what they need most right now and really listen.",
    "Leave [Name] a voice message sharing a vulnerable thought.",
  ],
  circle1Text: [
    "Tell [Name] something you deeply appreciate about who they are.",
    "Tell [Name] one way they've helped you grow.",
    "Send [Name] a reminder of one of your favorite shared memories.",
    "What's something you admire about how [Name] handles challenges?",
    "When's the last time you made [Name] laugh? Do it again.",
    "Send them a 'just because' message: no reason, just love.",
    "What's something [Name] does that makes you feel safe? Tell them.",
    "Share a vulnerable thought with [Name] - they can handle it.",
  ],
  circle1Hangout: [
    "Plan a spontaneous date or hangout with [Name] this week.",
    "Surprise [Name] with a home-cooked meal or dessert drop-off.",
    "Plan a no-phones evening with [Name] - just quality time.",
    "Invite [Name] to do something completely new together.",
  ],
  circle2Call: [
    "Call [Name] to catch up - even 10 minutes makes a difference.",
    "Leave [Name] a voice note checking in on how life's been.",
    "Phone [Name] and ask for advice on something you're working through.",
  ],
  circle2Text: [
    "Tell [Name] something you admire about how they live their life.",
    "Remind [Name] of a time they made your day better.",
    "Send a message: 'I've been thinking about you lately - how've you been?'",
    "Tell [Name] you're proud of them for something (big or small).",
    "Ask [Name] what's bringing them joy right now.",
    "Send [Name] a photo that reminds you of a good time together.",
    "Ask [Name] for advice on something - it shows you value their opinion.",
    "Share something new you've learned with [Name].",
  ],
  circle2Hangout: [
    "Plan a micro-hangout: a walk, coffee, or phone call with [Name].",
    "Suggest trying something new together with [Name].",
    "Invite [Name] to join you for a weekend activity.",
    "Plan a double date or group outing that includes [Name].",
    "Share a new spot you've discovered and invite [Name] to check it out.",
  ],
  circle3Call: [
    "Give [Name] a quick call to reconnect - keep it light and easy.",
    "Call [Name] to congratulate them on a recent milestone.",
  ],
  circle3Text: [
    "Tell [Name] something you admire from afar - a quality or habit.",
    "React to their recent story or post with something thoughtful.",
    "Send [Name] a relevant article, song, or meme that reminded you of them.",
    "Check in: 'Hey, it's been a minute - want to catch up sometime soon?'",
    "Ask what's new in their world and actually listen.",
    "Congratulate [Name] on a recent milestone or life event.",
    "Forward [Name] an opportunity you think they'd be interested in.",
  ],
  circle3Hangout: [
    "Invite [Name] to a group hangout or event coming up.",
    "Suggest grabbing coffee with [Name] to catch up properly.",
    "Invite [Name] along to something you're already doing this weekend.",
  ],
  universal: [
    "What's a compliment you haven't said out loud to [Name] yet?",
    "Which friend would love to hear a random thank-you from you today?",
    "Who's overdue for a celebration? Send some encouragement.",
  ],
  birthday: [
    "[Name]'s birthday is coming up! Plan something special.",
    "Start thinking about what would make [Name]'s birthday memorable.",
    "Set a reminder to wish [Name] happy birthday - make it personal, not generic.",
    "[Name]'s birthday is soon. A heartfelt voice note goes a long way.",
  ],
  overdue: [
    "It's been a while since you reached out to [Name]. A quick message can reignite the connection.",
    "Don't let too much time pass - send [Name] a quick 'thinking of you' today.",
    "[Name] might be wondering where you've been. Break the silence with something genuine.",
    "Reconnecting with [Name] doesn't have to be complicated. Just say hi.",
  ],
  labelPrompts: {
    "childhood friend": [
      "Reminisce about a memory from growing up with [Name].",
      "Ask [Name] if they've been back to your old neighborhood.",
      "Send [Name] a throwback photo from when you were kids.",
      "Ask [Name] if they still keep in touch with anyone else from back then.",
    ],
    "college friend": [
      "Remind [Name] of a ridiculous thing you did in college.",
      "Ask [Name] how their career has evolved since graduation.",
      "Send [Name] a memory from your college days together.",
      "Ask [Name] if they're going to any upcoming alumni events.",
    ],
    "work friend": [
      "Check in with [Name] about how their job is going.",
      "Suggest a lunch or coffee break with [Name].",
      "Ask [Name] if they've had any exciting projects lately.",
      "Share a professional article or opportunity with [Name].",
    ],
    "neighbor": [
      "Invite [Name] over for a casual backyard hangout.",
      "Ask [Name] if they need anything from the store.",
      "Suggest a neighborhood walk with [Name].",
      "Check in on [Name] - being a good neighbor goes a long way.",
    ],
    "family friend": [
      "Ask [Name] how their family is doing.",
      "Invite [Name]'s family over for dinner.",
      "Share a family update with [Name] and ask about theirs.",
      "Plan a family-friendly outing with [Name].",
    ],
    "gym buddy": [
      "Ask [Name] about their latest workout routine.",
      "Challenge [Name] to a fitness goal together.",
      "Suggest trying a new class or gym together.",
      "Check in on [Name]'s fitness progress.",
    ],
    "travel buddy": [
      "Start planning your next trip with [Name].",
      "Share a travel article or destination idea with [Name].",
      "Reminisce about your favorite trip together with [Name].",
      "Ask [Name] where they want to go next.",
    ],
    "creative partner": [
      "Ask [Name] what creative project they're working on.",
      "Suggest a creative collaboration with [Name].",
      "Share something inspiring you found that [Name] would appreciate.",
      "Give [Name] feedback on their latest work.",
    ],
    "mentor": [
      "Thank [Name] for something specific they've taught you.",
      "Ask [Name] for guidance on a challenge you're facing.",
      "Update [Name] on your progress - they'd love to hear it.",
      "Share a win with [Name] and credit their influence.",
    ],
    "mentee": [
      "Check in on [Name]'s progress and offer encouragement.",
      "Share a resource or tip that could help [Name].",
      "Ask [Name] what they're struggling with and offer support.",
      "Celebrate a recent achievement of [Name].",
    ],
  },
  interestPrompts: {
    fitness: [
      "Ask how their training is going",
      "Invite them to work out together this week",
      "Share a new exercise or routine you discovered",
    ],
    cooking: [
      "Ask them to share their latest recipe",
      "Suggest a cooking date or potluck",
      "Send them a recipe you think they'd love",
    ],
    music: [
      "Share a song that reminded you of them",
      "Ask what they've been listening to lately",
      "Suggest going to a concert or show together",
    ],
    travel: [
      "Ask about their next trip plans",
      "Share a travel destination you think they'd love",
      "Reminisce about a trip you took together",
    ],
    gaming: [
      "Ask what they've been playing lately",
      "Suggest a game night together",
      "Share a game you think they'd enjoy",
    ],
    reading: [
      "Ask what book they're reading now",
      "Share a book recommendation",
      "Start a mini book club with them",
    ],
    art: [
      "Ask to see what they've been creating lately",
      "Share an exhibit or gallery you think they'd enjoy",
      "Tell them you admire their creative work",
    ],
    sports: [
      "Ask if they caught the latest game",
      "Invite them to watch a game together",
      "Check in on their team's season",
    ],
    tech: [
      "Share an interesting tech article or tool",
      "Ask what projects they're working on",
      "Discuss a new tech trend with them",
    ],
    outdoors: [
      "Suggest a hike or outdoor adventure",
      "Share a beautiful spot you discovered",
      "Plan a camping or nature trip together",
    ],
  },
  lastSynced: null,
};

let currentPrompts: SyncedPrompts = { ...HARDCODED_PROMPTS };
let syncTimer: ReturnType<typeof setInterval> | null = null;

export function getPrompts(): SyncedPrompts {
  return currentPrompts;
}

function mergePrompts(base: SyncedPrompts, sheet: Partial<SyncedPrompts>): SyncedPrompts {
  const merged = { ...base };

  const simpleKeys: (keyof SyncedPrompts)[] = [
    "circle1Call", "circle1Text", "circle1Hangout",
    "circle2Call", "circle2Text", "circle2Hangout",
    "circle3Call", "circle3Text", "circle3Hangout",
    "universal", "birthday", "overdue",
  ];

  for (const key of simpleKeys) {
    const sheetList = sheet[key] as string[] | undefined;
    const baseList = base[key] as string[];
    if (sheetList && Array.isArray(sheetList)) {
      const seen = new Set(baseList);
      const newItems: string[] = [];
      for (const p of sheetList) {
        if (!seen.has(p)) {
          seen.add(p);
          newItems.push(p);
        }
      }
      if (newItems.length > 0) {
        (merged as any)[key] = [...baseList, ...newItems];
      }
    }
  }

  if (sheet.labelPrompts) {
    merged.labelPrompts = { ...base.labelPrompts };
    for (const [label, prompts] of Object.entries(sheet.labelPrompts)) {
      const seen = new Set(merged.labelPrompts[label] || []);
      const newItems: string[] = [];
      for (const p of prompts) {
        if (!seen.has(p)) { seen.add(p); newItems.push(p); }
      }
      if (newItems.length > 0) {
        merged.labelPrompts[label] = [...(merged.labelPrompts[label] || []), ...newItems];
      }
    }
  }

  if (sheet.interestPrompts) {
    merged.interestPrompts = { ...base.interestPrompts };
    for (const [interest, prompts] of Object.entries(sheet.interestPrompts)) {
      const seen = new Set(merged.interestPrompts[interest] || []);
      const newItems: string[] = [];
      for (const p of prompts) {
        if (!seen.has(p)) { seen.add(p); newItems.push(p); }
      }
      if (newItems.length > 0) {
        merged.interestPrompts[interest] = [...(merged.interestPrompts[interest] || []), ...newItems];
      }
    }
  }

  merged.lastSynced = new Date().toISOString();
  return merged;
}

interface TabReadResult {
  rows: string[][];
  success: boolean;
}

async function readSheetTab(sheets: any, spreadsheetId: string, tabName: string): Promise<TabReadResult> {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tabName}'!A:B`,
    });
    return { rows: response.data.values || [], success: true };
  } catch (e: any) {
    console.log(`[prompts-sync] Could not read tab "${tabName}": ${e.message}`);
    return { rows: [], success: false };
  }
}

function parseSimpleTab(rows: string[][]): string[] {
  return rows
    .slice(1)
    .map((row) => row[0]?.trim())
    .filter(Boolean);
}

function parseKeyedTab(rows: string[][]): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const row of rows.slice(1)) {
    const key = row[0]?.trim().toLowerCase();
    const prompt = row[1]?.trim();
    if (key && prompt) {
      if (!result[key]) result[key] = [];
      result[key].push(prompt);
    }
  }
  return result;
}

interface SheetReadResult {
  data: Partial<SyncedPrompts>;
  failedTabs: string[];
  totalTabs: number;
}

async function readAllFromSheet(spreadsheetId: string): Promise<SheetReadResult> {
  const sheets = await getUncachableGoogleSheetClient();
  const data: Partial<SyncedPrompts> = {};
  const failedTabs: string[] = [];

  const tabMapping: [string, keyof SyncedPrompts][] = [
    ["Circle 1 Call", "circle1Call"],
    ["Circle 1 Text", "circle1Text"],
    ["Circle 1 Hangout", "circle1Hangout"],
    ["Circle 2 Call", "circle2Call"],
    ["Circle 2 Text", "circle2Text"],
    ["Circle 2 Hangout", "circle2Hangout"],
    ["Circle 3 Call", "circle3Call"],
    ["Circle 3 Text", "circle3Text"],
    ["Circle 3 Hangout", "circle3Hangout"],
    ["Universal", "universal"],
    ["Birthday", "birthday"],
    ["Overdue", "overdue"],
  ];

  for (const [tabName, key] of tabMapping) {
    const { rows, success } = await readSheetTab(sheets, spreadsheetId, tabName);
    if (success) {
      (data as any)[key] = parseSimpleTab(rows);
    } else {
      failedTabs.push(tabName);
    }
  }

  const labelResult = await readSheetTab(sheets, spreadsheetId, "Label Prompts");
  if (labelResult.success) {
    data.labelPrompts = parseKeyedTab(labelResult.rows);
  } else {
    failedTabs.push("Label Prompts");
  }

  const interestResult = await readSheetTab(sheets, spreadsheetId, "Interest Prompts");
  if (interestResult.success) {
    data.interestPrompts = parseKeyedTab(interestResult.rows);
  } else {
    failedTabs.push("Interest Prompts");
  }

  return { data, failedTabs, totalTabs: 14 };
}

export async function createSpreadsheetWithPrompts(): Promise<string> {
  const sheets = await getUncachableGoogleSheetClient();

  const spreadsheet = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title: "Bridges Prompts",
      },
      sheets: TAB_NAMES.map((name, idx) => ({
        properties: {
          title: name,
          index: idx,
        },
      })),
    },
  });

  const spreadsheetId = spreadsheet.data.spreadsheetId!;
  console.log(`[prompts-sync] Created spreadsheet: ${spreadsheetId}`);

  const base = HARDCODED_PROMPTS;

  const simpleTabData: [string, string[]][] = [
    ["Circle 1 Call", base.circle1Call],
    ["Circle 1 Text", base.circle1Text],
    ["Circle 1 Hangout", base.circle1Hangout],
    ["Circle 2 Call", base.circle2Call],
    ["Circle 2 Text", base.circle2Text],
    ["Circle 2 Hangout", base.circle2Hangout],
    ["Circle 3 Call", base.circle3Call],
    ["Circle 3 Text", base.circle3Text],
    ["Circle 3 Hangout", base.circle3Hangout],
    ["Universal", base.universal],
    ["Birthday", base.birthday],
    ["Overdue", base.overdue],
  ];

  const batchData: any[] = [];

  for (const [tabName, prompts] of simpleTabData) {
    batchData.push({
      range: `'${tabName}'!A1`,
      values: [["Prompt"], ...prompts.map((p) => [p])],
    });
  }

  const labelRows: string[][] = [["Label", "Prompt"]];
  for (const [label, prompts] of Object.entries(base.labelPrompts)) {
    for (const prompt of prompts) {
      labelRows.push([label, prompt]);
    }
  }
  batchData.push({
    range: `'Label Prompts'!A1`,
    values: labelRows,
  });

  const interestRows: string[][] = [["Interest", "Prompt"]];
  for (const [interest, prompts] of Object.entries(base.interestPrompts)) {
    for (const prompt of prompts) {
      interestRows.push([interest, prompt]);
    }
  }
  batchData.push({
    range: `'Interest Prompts'!A1`,
    values: interestRows,
  });

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: batchData,
    },
  });

  console.log(`[prompts-sync] Populated spreadsheet with ${simpleTabData.reduce((n, [, p]) => n + p.length, 0)} simple prompts + label/interest prompts`);

  storeSpreadsheetId(spreadsheetId);
  return spreadsheetId;
}

export async function syncFromSheet(): Promise<{ success: boolean; newCount: number; error?: string }> {
  try {
    let spreadsheetId = getStoredSpreadsheetId();

    if (!spreadsheetId) {
      console.log("[prompts-sync] No spreadsheet found, creating one...");
      spreadsheetId = await createSpreadsheetWithPrompts();
      currentPrompts = { ...HARDCODED_PROMPTS, lastSynced: new Date().toISOString() };
      saveCachedPrompts(currentPrompts);
      return { success: true, newCount: 0 };
    }

    console.log(`[prompts-sync] Syncing from spreadsheet ${spreadsheetId}...`);
    const { data: sheetData, failedTabs, totalTabs } = await readAllFromSheet(spreadsheetId);

    if (failedTabs.length > totalTabs / 2) {
      console.error(`[prompts-sync] Too many tab failures (${failedTabs.length}/${totalTabs}). Keeping current data.`);
      return { success: false, newCount: 0, error: `${failedTabs.length} tabs failed to read` };
    }

    if (failedTabs.length > 0) {
      console.log(`[prompts-sync] Partial sync: ${failedTabs.length} tabs failed (${failedTabs.join(", ")}). Only merging successful tabs.`);
    }

    const previousTotal = countTotalPrompts(currentPrompts);
    currentPrompts = mergePrompts(currentPrompts, sheetData);
    const newTotal = countTotalPrompts(currentPrompts);
    const newCount = newTotal - previousTotal;

    saveCachedPrompts(currentPrompts);
    console.log(`[prompts-sync] Sync complete. ${newCount} new prompts found. Total: ${newTotal}`);
    return { success: true, newCount };
  } catch (e: any) {
    console.error(`[prompts-sync] Sync failed: ${e.message}`);
    return { success: false, newCount: 0, error: e.message };
  }
}

function countTotalPrompts(prompts: SyncedPrompts): number {
  let total = 0;
  const simpleKeys: (keyof SyncedPrompts)[] = [
    "circle1Call", "circle1Text", "circle1Hangout",
    "circle2Call", "circle2Text", "circle2Hangout",
    "circle3Call", "circle3Text", "circle3Hangout",
    "universal", "birthday", "overdue",
  ];
  for (const key of simpleKeys) {
    total += (prompts[key] as string[]).length;
  }
  for (const prompts2 of Object.values(prompts.labelPrompts)) {
    total += prompts2.length;
  }
  for (const prompts2 of Object.values(prompts.interestPrompts)) {
    total += prompts2.length;
  }
  return total;
}

export async function initPromptSync() {
  ensureDataDir();

  const cached = getCachedPrompts();
  if (cached) {
    currentPrompts = cached;
    console.log(`[prompts-sync] Loaded ${countTotalPrompts(cached)} cached prompts (last synced: ${cached.lastSynced})`);
  }

  try {
    await syncFromSheet();
  } catch (e: any) {
    console.log(`[prompts-sync] Initial sync failed (will use cached/hardcoded): ${e.message}`);
  }

  syncTimer = setInterval(async () => {
    console.log("[prompts-sync] Running scheduled sync...");
    await syncFromSheet();
  }, SYNC_INTERVAL_MS);

  console.log("[prompts-sync] Scheduled sync every 24 hours");
}

export function stopPromptSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}
