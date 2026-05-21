import {Button} from "./button";
import {cn} from "../../lib/cn";

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const fromDateKey = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
};

const monthLabel = new Intl.DateTimeFormat([], {
  month: "long",
  year: "numeric",
});

const buildMonthDays = (month: Date) => {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(start.getDate() - start.getDay());

  return Array.from({length: 42}, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
};

export function CalendarRangePicker({
  startDate,
  endDate,
  onChange,
}: {
  startDate: string;
  endDate: string;
  onChange: (range: {startDate: string; endDate: string}) => void;
}) {
  const start = fromDateKey(startDate);
  const month = new Date(start.getFullYear(), start.getMonth(), 1);
  const days = buildMonthDays(month);

  const selectDay = (date: Date) => {
    const selected = toDateKey(date);

    if (startDate !== endDate) {
      onChange({startDate: selected, endDate: selected});
      return;
    }

    if (selected < startDate) {
      onChange({startDate: selected, endDate: startDate});
      return;
    }

    onChange({startDate, endDate: selected});
  };

  const moveMonth = (offset: number) => {
    const next = new Date(month);
    next.setMonth(month.getMonth() + offset);
    const selected = toDateKey(next);
    onChange({startDate: selected, endDate: selected});
  };

  return (
    <div className="rounded-lg border border-border bg-white p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => moveMonth(-1)}
        >
          Prev
        </Button>
        <div className="text-sm font-extrabold text-primary">
          {monthLabel.format(month)}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => moveMonth(1)}
        >
          Next
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-muted-foreground">
        {dayLabels.map((day) => (
          <div key={day} className="py-1">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((date) => {
          const key = toDateKey(date);
          const isOutsideMonth = date.getMonth() !== month.getMonth();
          const isInRange = key >= startDate && key <= endDate;
          const isEdge = key === startDate || key === endDate;

          return (
            <button
              key={key}
              type="button"
              onClick={() => selectDay(date)}
              className={cn(
                "h-12 rounded-md border text-sm font-semibold transition",
                isOutsideMonth
                  ? "border-transparent text-muted-foreground/50"
                  : "border-border bg-surface-elevated text-foreground hover:border-primary",
                isInRange && "border-primary/30 bg-primary/10 text-primary",
                isEdge && "border-primary bg-primary text-primary-foreground",
              )}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
