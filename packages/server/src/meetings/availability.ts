export type BusyInterval = {
  startAt: Date;
  endAt: Date;
};

export type MeetingWindow = {
  startDate: string;
  endDate: string;
  selectedWeekdays: number[];
  dailyStartMinutes: number;
  dailyEndMinutes: number;
  durationMinutes: number;
};

export type SuggestedInterval = {
  startAt: string;
  endAt: string;
};

const MINUTES_IN_DAY = 24 * 60;

const parseDateOnly = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    throw new Error("Invalid date");
  }
  return new Date(Date.UTC(year, month - 1, day));
};

const addMinutes = (date: Date, minutes: number) =>
  new Date(date.getTime() + minutes * 60_000);

const addDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * MINUTES_IN_DAY * 60_000);

const getDayWindow = (
  day: Date,
  dailyStartMinutes: number,
  dailyEndMinutes: number,
) => ({
  startAt: addMinutes(day, dailyStartMinutes),
  endAt: addMinutes(day, dailyEndMinutes),
});

export const mergeBusyIntervals = (intervals: BusyInterval[]) => {
  const sorted = intervals
    .filter((interval) => interval.startAt < interval.endAt)
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  const merged: BusyInterval[] = [];

  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (!previous || interval.startAt > previous.endAt) {
      merged.push({...interval});
      continue;
    }

    if (interval.endAt > previous.endAt) {
      previous.endAt = interval.endAt;
    }
  }

  return merged;
};

export const findSuggestedMeetingTimes = (
  window: MeetingWindow,
  busyIntervals: BusyInterval[],
): SuggestedInterval[] => {
  const startDate = parseDateOnly(window.startDate);
  const endDate = parseDateOnly(window.endDate);
  const selectedWeekdays = new Set(window.selectedWeekdays);
  const mergedBusy = mergeBusyIntervals(busyIntervals);
  const suggestions: SuggestedInterval[] = [];

  for (
    let day = startDate;
    day <= endDate;
    day = addDays(day, 1)
  ) {
    if (!selectedWeekdays.has(day.getUTCDay())) {
      continue;
    }

    const dayWindow = getDayWindow(
      day,
      window.dailyStartMinutes,
      window.dailyEndMinutes,
    );
    let cursor = dayWindow.startAt;

    for (const busy of mergedBusy) {
      if (busy.endAt <= dayWindow.startAt || busy.startAt >= dayWindow.endAt) {
        continue;
      }

      const busyStart = busy.startAt > dayWindow.startAt
        ? busy.startAt
        : dayWindow.startAt;
      const busyEnd = busy.endAt < dayWindow.endAt
        ? busy.endAt
        : dayWindow.endAt;

      if (addMinutes(cursor, window.durationMinutes) <= busyStart) {
        suggestions.push({
          startAt: cursor.toISOString(),
          endAt: busyStart.toISOString(),
        });
      }

      if (busyEnd > cursor) {
        cursor = busyEnd;
      }
    }

    if (addMinutes(cursor, window.durationMinutes) <= dayWindow.endAt) {
      suggestions.push({
        startAt: cursor.toISOString(),
        endAt: dayWindow.endAt.toISOString(),
      });
    }
  }

  return suggestions;
};
