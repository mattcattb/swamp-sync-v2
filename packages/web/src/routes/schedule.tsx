import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {createFileRoute, Link, Navigate} from "@tanstack/react-router";
import {parseResponse, type InferResponseType} from "hono/client";
import {type FormEvent, useState} from "react";
import {Button} from "../components/ui/button";
import {Card, CardContent} from "../components/ui/card";
import {EmptyState} from "../components/ui/empty";
import {Input} from "../components/ui/input";
import {Label} from "../components/ui/label";
import {Progress} from "../components/ui/progress";
import {Tabs} from "../components/ui/tabs";
import {useSession} from "../lib/auth";
import {getRpcErrorMessage, rpcClient} from "../lib/rpc.client";

export const Route = createFileRoute("/schedule")({
  component: SchedulePage,
});

const eventsApi = rpcClient.api.events;

type EventRow = InferResponseType<typeof eventsApi.$get>[number];

const eventsKey = ["events"] as const;

const toDateTimeLocal = (value: string | Date) => {
  const date = new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

const toIsoFromLocal = (value: string) => new Date(value).toISOString();

const formatDateTime = (value: string | Date) =>
  new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });

const dateKey = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

const startOfWeek = (date: Date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return start;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
};

const atHour = (date: Date, hour: number) => {
  const next = new Date(date);
  next.setHours(hour, 0, 0, 0);
  return next;
};

const shortDate = new Intl.DateTimeFormat([], {
  weekday: "short",
  month: "short",
  day: "numeric",
});

function SchedulePage() {
  const {data: session, isPending} = useSession();
  const queryClient = useQueryClient();

  const eventsQuery = useQuery({
    queryKey: eventsKey,
    queryFn: () => parseResponse(eventsApi.$get()),
  });

  if (!isPending && !session) {
    return <Navigate to="/login" replace />;
  }

  const events = Array.isArray(eventsQuery.data) ? eventsQuery.data : [];

  return (
    <div>
      {session ? (
        <EventsPanel
          events={events}
          isLoading={eventsQuery.isLoading}
          onChanged={() => queryClient.invalidateQueries({queryKey: eventsKey})}
        />
      ) : null}
    </div>
  );
}

function EventsPanel({
  events,
  isLoading,
  onChanged,
}: {
  events: EventRow[];
  isLoading: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<EventRow | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startAt, setStartAt] = useState(toDateTimeLocal(new Date()));
  const [endAt, setEndAt] = useState(
    toDateTimeLocal(new Date(Date.now() + 60 * 60_000)),
  );
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [viewMode, setViewMode] = useState("extended");

  const reset = () => {
    setEditing(null);
    setTitle("");
    setDescription("");
    setStartAt(toDateTimeLocal(new Date()));
    setEndAt(toDateTimeLocal(new Date(Date.now() + 60 * 60_000)));
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const json = {
        title,
        description: description || null,
        startAt: toIsoFromLocal(startAt),
        endAt: toIsoFromLocal(endAt),
      };

      if (editing) {
        return parseResponse(
          eventsApi[":id"].$patch({
            param: {id: editing.id},
            json,
          }),
        );
      }

      return parseResponse(eventsApi.$post({json}));
    },
    onSuccess: () => {
      reset();
      onChanged();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      parseResponse(
        eventsApi[":id"].$delete({
          param: {id},
        }),
      ),
    onSuccess: onChanged,
  });

  const editEvent = (event: EventRow) => {
    setEditing(event);
    setTitle(event.title);
    setDescription(event.description ?? "");
    setStartAt(toDateTimeLocal(event.startAt));
    setEndAt(toDateTimeLocal(event.endAt));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    saveMutation.mutate();
  };

  const selectBlock = (date: Date, hour: number) => {
    const start = atHour(date, hour);
    const end = atHour(date, hour + 1);
    setEditing(null);
    setTitle("Busy");
    setDescription("");
    setStartAt(toDateTimeLocal(start));
    setEndAt(toDateTimeLocal(end));
  };

  const weekDays = Array.from({length: 7}, (_, index) =>
    addDays(weekStart, index),
  );
  const hourRange =
    viewMode === "workday"
      ? {start: 9, end: 17}
      : viewMode === "evening"
        ? {start: 17, end: 22}
        : {start: 7, end: 19};
  const hours = Array.from(
    {length: hourRange.end - hourRange.start + 1},
    (_, index) => index + hourRange.start,
  );
  const weekEnd = addDays(weekStart, 6);
  const weekEvents = events.filter((event) => {
    const start = new Date(event.startAt);
    return start >= weekStart && start <= addDays(weekEnd, 1);
  });
  const utilization = Math.min(
    100,
    Math.round((weekEvents.length / Math.max(1, hours.length * 7)) * 100),
  );

  return (
    <Card className="border-primary/15">
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Link
              to="/dashboard"
              aria-label="Back to home"
              className="mt-1 grid h-9 w-9 place-items-center rounded-md border border-primary/20 text-lg font-extrabold text-primary transition hover:border-primary hover:bg-primary/10"
            >
              ←
            </Link>
            <div>
              <p className="gator-kicker mb-2">Schedule</p>
              <h2 className="text-2xl font-extrabold text-primary sm:text-3xl">
                Manage availability
              </h2>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setWeekStart(addDays(weekStart, -7))}
            >
              Prev
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setWeekStart(startOfWeek(new Date()))}
            >
              Today
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setWeekStart(addDays(weekStart, 7))}
            >
              Next
            </Button>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
          <Tabs
            value={viewMode}
            onValueChange={setViewMode}
            items={[
              {value: "workday", label: "Workday"},
              {value: "extended", label: "Extended"},
              {value: "evening", label: "Evening"},
            ]}
          />
          <div className="rounded-lg border border-border bg-surface-elevated p-3">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-bold text-primary">Week coverage</span>
              <span className="text-muted-foreground">{utilization}%</span>
            </div>
            <Progress value={utilization} />
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border bg-white">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[72px_repeat(7,minmax(92px,1fr))] border-b border-border bg-surface-elevated">
              <div className="px-2 py-3 text-xs font-bold text-muted-foreground">
                {shortDate.format(weekStart)} - {shortDate.format(weekEnd)}
              </div>
              {weekDays.map((day) => (
                <div
                  key={dateKey(day)}
                  className="border-l border-border px-2 py-3 text-center"
                >
                  <div className="text-sm font-extrabold text-primary">
                    {shortDate.format(day)}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid">
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="grid min-h-16 grid-cols-[72px_repeat(7,minmax(92px,1fr))] border-b border-border last:border-b-0"
                >
                  <div className="px-2 py-2 text-xs font-semibold text-muted-foreground">
                    {`${String(hour).padStart(2, "0")}:00`}
                  </div>
                  {weekDays.map((day) => {
                    const cellEvents = events.filter((event) => {
                      const start = new Date(event.startAt);
                      return dateKey(start) === dateKey(day) && start.getHours() === hour;
                    });

                    return (
                      <button
                        key={`${dateKey(day)}-${hour}`}
                        type="button"
                        onClick={() => selectBlock(day, hour)}
                        className="border-l border-border p-1 text-left transition hover:bg-primary/10"
                      >
                        {cellEvents.length === 0 ? (
                          <span className="block h-full rounded-md border border-dashed border-transparent" />
                        ) : (
                          <span className="grid gap-1">
                            {cellEvents.map((event) => (
                              <span
                                key={event.id}
                                className="block rounded bg-accent/15 px-2 py-1 text-xs font-semibold text-foreground"
                              >
                                {event.title}
                              </span>
                            ))}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <form onSubmit={handleSubmit} className="grid gap-3 rounded-lg border border-border bg-surface-elevated p-4">
            {saveMutation.error ? (
              <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                {getRpcErrorMessage(saveMutation.error, "Could not save event")}
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="event-title">Title</Label>
                <Input
                  id="event-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Class, work, gym"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-description">Description</Label>
                <Input
                  id="event-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="event-start">Start</Label>
                <Input
                  id="event-start"
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-end">End</Label>
                <Input
                  id="event-end"
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={saveMutation.isPending}>
                {editing ? "Save event" : "Add block"}
              </Button>
              {editing ? (
                <Button type="button" variant="outline" onClick={reset}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>

          <div className="space-y-2">
            <h3 className="font-extrabold text-primary">Busy blocks</h3>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading events...</p>
            ) : null}
            {deleteMutation.error ? (
              <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                {getRpcErrorMessage(deleteMutation.error, "Could not delete event")}
              </div>
            ) : null}
            {events.map((event) => (
              <div
                key={event.id}
                className="flex items-start justify-between gap-3 rounded-md border border-border bg-surface-elevated p-3 shadow-sm shadow-primary/5"
              >
                <button
                  type="button"
                  className="min-w-0 text-left"
                  onClick={() => editEvent(event)}
                >
                  <div className="font-medium">{event.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDateTime(event.startAt)} - {formatDateTime(event.endAt)}
                  </div>
                </button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => deleteMutation.mutate(event.id)}
                >
                  Delete
                </Button>
              </div>
            ))}
            {!isLoading && events.length === 0 ? (
              <EmptyState
                title="No busy blocks"
                description="Click a block in the weekly board to add your first unavailable window."
              />
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
