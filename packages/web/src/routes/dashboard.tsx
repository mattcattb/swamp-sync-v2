import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {createFileRoute, Navigate} from "@tanstack/react-router";
import {parseResponse, type InferResponseType} from "hono/client";
import {type FormEvent, useMemo, useState} from "react";
import {Badge} from "../components/ui/badge";
import {Button} from "../components/ui/button";
import {Card, CardContent} from "../components/ui/card";
import {Input} from "../components/ui/input";
import {Label} from "../components/ui/label";
import {Textarea} from "../components/ui/textarea";
import {useSession} from "../lib/auth";
import {rpcClient} from "../lib/rpc.client";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

const eventsApi = rpcClient.events;
const meetingsApi = rpcClient.meetings;
const meetingDetailApi = meetingsApi[":id"];
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type EventRow = InferResponseType<typeof eventsApi.$get>[number];
type MeetingDetail = InferResponseType<typeof meetingDetailApi.$get>;

const eventsKey = ["events"] as const;
const meetingsKey = ["meetings"] as const;
const meetingKey = (id: string | null) => ["meeting", id] as const;
const suggestionsKey = (id: string | null) => ["meeting-suggestions", id] as const;

const toDateTimeLocal = (value: string | Date) => {
  const date = new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

const toIsoFromLocal = (value: string) => new Date(value).toISOString();

const minutesFromTime = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
};

const timeFromMinutes = (value: number) => {
  const hours = Math.floor(value / 60).toString().padStart(2, "0");
  const minutes = (value % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
};

const formatDateTime = (value: string | Date) =>
  new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });

function DashboardPage() {
  const {data: session, isPending} = useSession();

  if (!isPending && !session) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="space-y-8">
      <section className="border-b border-border pb-5">
        <h2 className="text-3xl font-bold text-primary">Home</h2>
        <p className="text-muted-foreground">
          Welcome back, {session?.user.name ?? session?.user.email}.
        </p>
      </section>

      {session ? <SwampDashboard /> : null}
    </div>
  );
}

function SwampDashboard() {
  const queryClient = useQueryClient();
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);

  const eventsQuery = useQuery({
    queryKey: eventsKey,
    queryFn: () => parseResponse(eventsApi.$get()),
  });

  const meetingsQuery = useQuery({
    queryKey: meetingsKey,
    queryFn: () => parseResponse(meetingsApi.$get()),
  });

  const meetingQuery = useQuery({
    queryKey: meetingKey(selectedMeetingId),
    queryFn: () =>
      parseResponse(
        meetingDetailApi.$get({
          param: {id: selectedMeetingId ?? ""},
        }),
      ),
    enabled: Boolean(selectedMeetingId),
  });

  const suggestionsQuery = useQuery({
    queryKey: suggestionsKey(selectedMeetingId),
    queryFn: () =>
      parseResponse(
        meetingDetailApi.suggestions.$get({
          param: {id: selectedMeetingId ?? ""},
        }),
      ),
    enabled: Boolean(selectedMeetingId),
  });

  const refreshMeetings = async (meeting?: MeetingDetail) => {
    await queryClient.invalidateQueries({queryKey: meetingsKey});
    if (meeting) {
      setSelectedMeetingId(meeting.id);
      queryClient.setQueryData(meetingKey(meeting.id), meeting);
      await queryClient.invalidateQueries({queryKey: suggestionsKey(meeting.id)});
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
      <section className="space-y-6">
        <QuickNav />
        <EventsPanel
          events={eventsQuery.data ?? []}
          isLoading={eventsQuery.isLoading}
          onChanged={() => queryClient.invalidateQueries({queryKey: eventsKey})}
        />
        <JoinCodePanel onJoined={refreshMeetings} />
      </section>

      <section className="space-y-6">
        <MeetingCreatePanel onCreated={refreshMeetings} />
        <MeetingsPanel
          data={meetingsQuery.data}
          selectedMeetingId={selectedMeetingId}
          onSelect={setSelectedMeetingId}
          onChanged={refreshMeetings}
        />
        <MeetingDetailPanel
          meeting={meetingQuery.data}
          suggestions={suggestionsQuery.data ?? []}
          isLoading={meetingQuery.isLoading}
          onChanged={refreshMeetings}
        />
      </section>
    </div>
  );
}

function QuickNav() {
  return (
    <Card className="bg-primary text-white">
      <CardContent className="space-y-3 p-4">
        <h3 className="text-lg font-bold">Swamp Sync</h3>
        <div className="grid gap-2 text-sm font-semibold">
          <a href="#events" className="rounded-md px-2 py-1 hover:bg-white/10">
            Schedule
          </a>
          <a href="#meetings" className="rounded-md px-2 py-1 hover:bg-white/10">
            Meetings
          </a>
          <a href="#invites" className="rounded-md px-2 py-1 hover:bg-white/10">
            Invites
          </a>
        </div>
      </CardContent>
    </Card>
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

  return (
    <Card id="events">
      <CardContent className="space-y-5 p-5">
        <div>
          <h3 className="text-lg font-bold text-primary">Schedule</h3>
          <p className="text-sm text-muted-foreground">
            Add busy blocks that should count against your availability.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-3">
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
              {editing ? "Save event" : "Add event"}
            </Button>
            {editing ? (
              <Button type="button" variant="outline" onClick={reset}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>

        <div className="space-y-2">
          {isLoading ? <p className="text-sm text-muted-foreground">Loading events...</p> : null}
          {events.map((event) => (
            <div
              key={event.id}
              className="flex items-start justify-between gap-3 rounded-md border border-border bg-white p-3"
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
        </div>
      </CardContent>
    </Card>
  );
}

function MeetingCreatePanel({
  onCreated,
}: {
  onCreated: (meeting: MeetingDetail) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedWeekdays, setSelectedWeekdays] = useState([1, 2, 3, 4, 5]);
  const [dailyStart, setDailyStart] = useState("09:00");
  const [dailyEnd, setDailyEnd] = useState("17:00");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [inviteEmails, setInviteEmails] = useState("");

  const createMutation = useMutation({
    mutationFn: () =>
      parseResponse(
        meetingsApi.$post({
          json: {
            name,
            description: description || null,
            startDate,
            endDate,
            selectedWeekdays,
            dailyStartMinutes: minutesFromTime(dailyStart),
            dailyEndMinutes: minutesFromTime(dailyEnd),
            durationMinutes,
            inviteEmails: inviteEmails
              .split(/[\s,]+/)
              .map((email) => email.trim())
              .filter(Boolean),
          },
        }),
      ),
    onSuccess: (meeting) => {
      setName("");
      setDescription("");
      setInviteEmails("");
      onCreated(meeting);
    },
  });

  const toggleWeekday = (day: number) => {
    setSelectedWeekdays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day].sort((a, b) => a - b),
    );
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || selectedWeekdays.length === 0) return;
    createMutation.mutate();
  };

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div>
          <h3 className="text-lg font-bold text-primary">Create Meeting</h3>
          <p className="text-sm text-muted-foreground">
            Pick candidate days, a daily window, and optional registered invitees.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="meeting-name">Name</Label>
              <Input
                id="meeting-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Project sync"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meeting-duration">Duration minutes</Label>
              <Input
                id="meeting-duration"
                type="number"
                min={1}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="meeting-description">Description</Label>
            <Textarea
              id="meeting-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="meeting-start-date">Start date</Label>
              <Input
                id="meeting-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meeting-end-date">End date</Label>
              <Input
                id="meeting-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="meeting-daily-start">Daily start</Label>
              <Input
                id="meeting-daily-start"
                type="time"
                value={dailyStart}
                onChange={(e) => setDailyStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meeting-daily-end">Daily end</Label>
              <Input
                id="meeting-daily-end"
                type="time"
                value={dailyEnd}
                onChange={(e) => setDailyEnd(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Weekdays</Label>
            <div className="flex flex-wrap gap-2">
              {weekdays.map((day, index) => (
                <label
                  key={day}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selectedWeekdays.includes(index)}
                    onChange={() => toggleWeekday(index)}
                  />
                  {day}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="meeting-invites">Invite emails</Label>
            <Input
              id="meeting-invites"
              value={inviteEmails}
              onChange={(e) => setInviteEmails(e.target.value)}
              placeholder="friend@example.com, teammate@example.com"
            />
          </div>
          <Button type="submit" disabled={createMutation.isPending}>
            Create meeting
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function JoinCodePanel({
  onJoined,
}: {
  onJoined: (meeting: MeetingDetail) => void;
}) {
  const [joinCode, setJoinCode] = useState("");
  const joinMutation = useMutation({
    mutationFn: () =>
      parseResponse(
        meetingsApi["join-code"][":joinCode"].$post({
          param: {joinCode},
        }),
      ),
    onSuccess: (meeting) => {
      setJoinCode("");
      onJoined(meeting);
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    joinMutation.mutate();
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <h3 className="text-lg font-bold text-primary">Join Meeting</h3>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="Meeting code"
          />
          <Button type="submit" disabled={joinMutation.isPending}>
            Join
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function MeetingsPanel({
  data,
  selectedMeetingId,
  onSelect,
  onChanged,
}: {
  data: InferResponseType<typeof meetingsApi.$get> | undefined;
  selectedMeetingId: string | null;
  onSelect: (id: string) => void;
  onChanged: (meeting?: MeetingDetail) => void;
}) {
  const acceptMutation = useMutation({
    mutationFn: ({meetingId, inviteId}: {meetingId: string; inviteId: string}) =>
      parseResponse(
        meetingsApi[":id"].invites[":inviteId"].accept.$post({
          param: {id: meetingId, inviteId},
        }),
      ),
    onSuccess: onChanged,
  });

  const declineMutation = useMutation({
    mutationFn: ({meetingId, inviteId}: {meetingId: string; inviteId: string}) =>
      parseResponse(
        meetingsApi[":id"].invites[":inviteId"].decline.$post({
          param: {id: meetingId, inviteId},
        }),
      ),
    onSuccess: onChanged,
  });

  return (
    <Card id="meetings">
      <CardContent className="space-y-5 p-5">
        <div>
          <h3 className="text-lg font-bold text-primary">Meetings</h3>
          <p className="text-sm text-muted-foreground">
            Owned and joined meetings show here. Pending invites can be accepted or declined.
          </p>
        </div>

        <div className="space-y-2">
          {(data?.memberships ?? []).map(({meeting, role}) => (
            <button
              key={meeting.id}
              type="button"
              onClick={() => onSelect(meeting.id)}
              className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-white p-3 text-left transition hover:border-primary"
            >
              <span>
                <span className="block font-medium">{meeting.name}</span>
                <span className="text-xs text-muted-foreground">
                  {meeting.startDate} to {meeting.endDate}
                </span>
              </span>
              <Badge variant={selectedMeetingId === meeting.id ? "primary" : "neutral"}>
                {role}
              </Badge>
            </button>
          ))}
          {(data?.memberships.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No joined meetings yet.</p>
          ) : null}
        </div>

        <div id="invites" className="space-y-2">
          <h4 className="font-medium">Pending invites</h4>
          {(data?.pendingInvites ?? []).map((invite) => (
            <div
              key={invite.inviteId}
              className="space-y-3 rounded-md border border-border bg-white p-3"
            >
              <div>
                <div className="font-medium">{invite.meeting.name}</div>
                <div className="text-xs text-muted-foreground">
                  {invite.meeting.startDate} to {invite.meeting.endDate}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    acceptMutation.mutate({
                      meetingId: invite.meeting.id,
                      inviteId: invite.inviteId,
                    })
                  }
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    declineMutation.mutate({
                      meetingId: invite.meeting.id,
                      inviteId: invite.inviteId,
                    })
                  }
                >
                  Decline
                </Button>
              </div>
            </div>
          ))}
          {(data?.pendingInvites.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No pending invites.</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function MeetingDetailPanel({
  meeting,
  suggestions,
  isLoading,
  onChanged,
}: {
  meeting: MeetingDetail | undefined;
  suggestions: {startAt: string; endAt: string}[];
  isLoading: boolean;
  onChanged: (meeting?: MeetingDetail) => void;
}) {
  const [email, setEmail] = useState("");
  const inviteMutation = useMutation({
    mutationFn: () =>
      parseResponse(
        meetingsApi[":id"].invites.$post({
          param: {id: meeting?.id ?? ""},
          json: {email},
        }),
      ),
    onSuccess: (updated) => {
      setEmail("");
      onChanged(updated);
    },
  });

  const joinUrl = useMemo(() => {
    if (!meeting) return "";
    return `${window.location.origin}/dashboard?join=${meeting.joinCode}`;
  }, [meeting]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          Loading meeting...
        </CardContent>
      </Card>
    );
  }

  if (!meeting) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          Select a meeting to view details and suggestions.
        </CardContent>
      </Card>
    );
  }

  const handleInvite = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    inviteMutation.mutate();
  };

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">{meeting.name}</h3>
            <Badge variant="primary">{meeting.joinCode}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{meeting.description}</p>
          <p className="text-xs text-muted-foreground">
            {meeting.startDate} to {meeting.endDate}, {timeFromMinutes(meeting.dailyStartMinutes)}-
            {timeFromMinutes(meeting.dailyEndMinutes)}, {meeting.durationMinutes} min
          </p>
          <p className="break-all text-xs text-muted-foreground">{joinUrl}</p>
        </div>

        <form onSubmit={handleInvite} className="flex gap-2">
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Invite registered email"
          />
          <Button type="submit" disabled={inviteMutation.isPending}>
            Invite
          </Button>
        </form>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <h4 className="font-medium">Members</h4>
            {meeting.members.map((member) => (
              <div key={member.userId} className="rounded-md bg-muted px-3 py-2 text-sm">
                {member.name} <span className="text-muted-foreground">({member.role})</span>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <h4 className="font-medium">Invites</h4>
            {meeting.invites.map((invite) => (
              <div key={invite.id} className="rounded-md bg-muted px-3 py-2 text-sm">
                {invite.email} <span className="text-muted-foreground">({invite.status})</span>
              </div>
            ))}
            {meeting.invites.length === 0 ? (
              <p className="text-sm text-muted-foreground">No invites sent.</p>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="font-medium">Suggested times</h4>
          {suggestions.slice(0, 8).map((suggestion) => (
            <div
              key={`${suggestion.startAt}-${suggestion.endAt}`}
            className="rounded-md border border-border bg-white px-3 py-2 text-sm"
            >
              {formatDateTime(suggestion.startAt)} - {formatDateTime(suggestion.endAt)}
            </div>
          ))}
          {suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matching times yet.</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
