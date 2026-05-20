import {describe, expect, test} from "bun:test";
import {findSuggestedMeetingTimes, mergeBusyIntervals} from "./availability";

describe("availability", () => {
  test("merges overlapping busy intervals", () => {
    const merged = mergeBusyIntervals([
      {
        startAt: new Date("2026-06-01T14:00:00.000Z"),
        endAt: new Date("2026-06-01T15:00:00.000Z"),
      },
      {
        startAt: new Date("2026-06-01T14:30:00.000Z"),
        endAt: new Date("2026-06-01T16:00:00.000Z"),
      },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.startAt.toISOString()).toBe("2026-06-01T14:00:00.000Z");
    expect(merged[0]?.endAt.toISOString()).toBe("2026-06-01T16:00:00.000Z");
  });

  test("returns only free intervals that fit the requested duration", () => {
    const suggestions = findSuggestedMeetingTimes(
      {
        startDate: "2026-06-01",
        endDate: "2026-06-01",
        selectedWeekdays: [1],
        dailyStartMinutes: 9 * 60,
        dailyEndMinutes: 17 * 60,
        durationMinutes: 90,
      },
      [
        {
          startAt: new Date("2026-06-01T10:00:00.000Z"),
          endAt: new Date("2026-06-01T11:00:00.000Z"),
        },
        {
          startAt: new Date("2026-06-01T13:00:00.000Z"),
          endAt: new Date("2026-06-01T16:00:00.000Z"),
        },
      ],
    );

    expect(suggestions).toEqual([
      {
        startAt: "2026-06-01T11:00:00.000Z",
        endAt: "2026-06-01T13:00:00.000Z",
      },
    ]);
  });
});
