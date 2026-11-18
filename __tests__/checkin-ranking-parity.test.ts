import { readFileSync } from "fs";
import { join } from "path";
import vm from "vm";
import ts from "typescript";
import { generateReminders } from "../lib/reminders";
import { CHECKIN_THRESHOLDS, getCheckinThreshold } from "../shared/reminder-thresholds";
import { getCheckinDaysSince } from "../shared/checkin-time";
import type { Contact } from "../lib/types";

test("Circle 1 client priorities and ordering match the actual server priority function", () => {
  jest.useFakeTimers().setSystemTime(new Date("2026-11-18T12:00:00Z"));
  try {
    const contacts: Contact[] = Array.from({ length: 100 }, (_, index) => ({
      id: `ranking-${index}`, name: `Person ${index}`, circleLevel: 1,
      lastContacted: "2026-09-19T12:00:00Z", createdAt: "2026-01-01T12:00:00Z",
      interests: [], labels: [], avatarColor: "#FFFFFF",
    }));
    const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
    const serverSource = readFileSync(join(__dirname, "../server/push-notifications.ts"), "utf8");
    const ast = ts.createSourceFile("server.ts", serverSource, ts.ScriptTarget.Latest, true);
    let expression = "";
    function visit(node: ts.Node) {
      if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "reminderPriority") {
        expression = node.initializer!.getText(ast);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
    expect(expression).not.toBe("");
    const code = ts.transpileModule(`const priority = ${expression}; priority;`, {
      compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const serverPriority = vm.runInNewContext(code, {
      contactsById, tz: "UTC", getContactDaysSince: getCheckinDaysSince,
      getCheckinThreshold, CHECKIN_THRESHOLDS,
    }) as (msg: { contactId?: string }) => number;
    const reminders = generateReminders(contacts).filter((r) => r.type === "check-in-quickpick");
    expect(reminders.length).toBeGreaterThan(10);
    expect(new Set(reminders.map((r) => r.priority)).size).toBeGreaterThan(2);
    for (const reminder of reminders) expect(reminder.priority).toBe(serverPriority(reminder));
    expect(reminders.map((r) => r.contactId)).toEqual(
      [...reminders].sort((a, b) => serverPriority(b) - serverPriority(a)).map((r) => r.contactId),
    );
  } finally {
    jest.useRealTimers();
  }
});
