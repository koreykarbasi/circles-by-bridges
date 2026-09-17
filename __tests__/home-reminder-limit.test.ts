import {
  MAX_HOME_CHECKIN_REMINDERS,
  selectHomeReminders,
  type Reminder,
} from "../lib/reminders";

function reminder(
  id: string,
  type: Reminder["type"],
  priority: number,
): Reminder {
  return {
    id,
    contactId: id,
    contactName: id,
    circleLevel: 1,
    type,
    priority,
    title: id,
    subtitle: id,
  };
}

describe("Home reminder selection", () => {
  test.each([3, 5, 10])(
    "shows at most three of %i priority-ordered check-ins",
    (checkinCount) => {
      const input = Array.from({ length: checkinCount }, (_, index) =>
        reminder(`checkin-${index + 1}`, "check-in-quickpick", 100 - index),
      );

      const result = selectHomeReminders(input);

      expect(result).toHaveLength(Math.min(checkinCount, MAX_HOME_CHECKIN_REMINDERS));
      expect(result.map((item) => item.id)).toEqual(
        input.slice(0, MAX_HOME_CHECKIN_REMINDERS).map((item) => item.id),
      );
    },
  );

  test("keeps every birthday, custom, and other reminder while limiting check-ins", () => {
    const input = [
      reminder("birthday-1", "birthday", 200),
      reminder("checkin-1", "check-in-quickpick", 190),
      reminder("custom-1", "custom-reminder", 185),
      reminder("checkin-2", "check-in-quickpick", 180),
      reminder("birthday-2", "birthday", 175),
      reminder("checkin-3", "check-in-quickpick", 170),
      reminder("hangout-1", "hangout-quickpick", 165),
      reminder("checkin-4", "check-in-quickpick", 160),
      reminder("custom-2", "custom-reminder", 150),
    ];

    expect(selectHomeReminders(input).map((item) => item.id)).toEqual([
      "birthday-1",
      "checkin-1",
      "custom-1",
      "checkin-2",
      "birthday-2",
      "checkin-3",
      "hangout-1",
      "custom-2",
    ]);
  });

  test("promotes the next check-in when a visible one is removed", () => {
    const input = Array.from({ length: 5 }, (_, index) =>
      reminder(`checkin-${index + 1}`, "check-in-quickpick", 100 - index),
    );

    const afterAnsweringFirst = input.filter((item) => item.id !== "checkin-1");

    expect(selectHomeReminders(afterAnsweringFirst).map((item) => item.id)).toEqual([
      "checkin-2",
      "checkin-3",
      "checkin-4",
    ]);
  });

  test("preserves stable priority order when check-ins are tied", () => {
    const input = [
      reminder("checkin-a", "check-in-quickpick", 100),
      reminder("checkin-b", "check-in-quickpick", 100),
      reminder("checkin-c", "check-in-quickpick", 100),
      reminder("checkin-d", "check-in-quickpick", 100),
    ];

    expect(selectHomeReminders(input).map((item) => item.id)).toEqual([
      "checkin-a",
      "checkin-b",
      "checkin-c",
    ]);
  });
});