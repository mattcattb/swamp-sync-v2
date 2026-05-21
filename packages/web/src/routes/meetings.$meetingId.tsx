import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {createFileRoute, Link} from "@tanstack/react-router";
import {
  parseResponse,
  type InferRequestType,
  type InferResponseType,
} from "hono/client";
import {Fragment, type FormEvent, useEffect, useState} from "react";
import {Badge} from "../components/ui/badge";
import {Button} from "../components/ui/button";
import {Card, CardContent} from "../components/ui/card";
import {EmptyState} from "../components/ui/empty";
import {Input} from "../components/ui/input";
import {Label} from "../components/ui/label";
import {Progress} from "../components/ui/progress";
import {Sheet} from "../components/ui/sheet";
import {Tabs} from "../components/ui/tabs";
import {useSession} from "../lib/auth";
import {getRpcErrorMessage, rpcClient} from "../lib/rpc.client";

export const Route = createFileRoute("/meetings/$meetingId")({
  component: MeetingPage,
});

const meetingsApi = rpcClient.api.meetings;
const meetingDetailApi = meetingsApi[":id"];
const publicMeetingsApi = rpcClient.api.public.meetings;
const publicMeetingDetailApi = publicMeetingsApi[":id"];
const publicMeetingAvailabilityApi = publicMeetingDetailApi.availability;

const meetingKey = (id: string) => ["meeting", id] as const;
const publicMeetingKey = (id: string) => ["public-meeting", id] as const;
const suggestionsKey = (id: string) => ["meeting-suggestions", id] as const;
const availabilityKey = (id: string) => ["meeting-availability", id] as const;

type MeetingAvailability = InferResponseType<
  typeof publicMeetingAvailabilityApi.$get
>;
type SaveAvailabilityInput = InferRequestType<
  typeof publicMeetingAvailabilityApi.$put
>["json"];

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

const formatTime = (value: string | Date) =>
  new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

const formatDay = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

const memberColors = [
  "bg-primary",
  "bg-accent",
  "bg-success",
  "bg-warning",
  "bg-danger",
  "bg-foreground",
];

function MeetingPage() {
  const {data: session, isPending} = useSession();
  const {meetingId} = Route.useParams();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [guestName, setGuestName] = useState("");
  const [tab, setTab] = useState("availability");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const publicMeetingQuery = useQuery({
    queryKey: publicMeetingKey(meetingId),
    queryFn: () =>
      parseResponse(
        publicMeetingDetailApi.$get({
          param: {id: meetingId},
        }),
      ),
  });

  const protectedMeetingQuery = useQuery({
    queryKey: meetingKey(meetingId),
    enabled: Boolean(session),
    queryFn: () =>
      parseResponse(
        meetingDetailApi.$get({
          param: {id: meetingId},
        }),
      ),
  });

  const suggestionsQuery = useQuery({
    queryKey: suggestionsKey(meetingId),
    enabled: Boolean(session),
    queryFn: () =>
      parseResponse(
        meetingDetailApi.suggestions.$get({
          param: {id: meetingId},
        }),
      ),
  });

  const availabilityQuery = useQuery({
    queryKey: availabilityKey(meetingId),
    queryFn: () =>
      parseResponse(
        publicMeetingAvailabilityApi.$get({
          param: {id: meetingId},
        }),
      ),
  });

  const meeting = publicMeetingQuery.data;
  const protectedMeeting =
    protectedMeetingQuery.data &&
    Array.isArray(protectedMeetingQuery.data.members) &&
    Array.isArray(protectedMeetingQuery.data.invites)
      ? protectedMeetingQuery.data
      : undefined;
  const suggestions = Array.isArray(suggestionsQuery.data)
    ? suggestionsQuery.data
    : [];

  const inviteMutation = useMutation({
    mutationFn: () =>
      parseResponse(
        meetingDetailApi.invites.$post({
          param: {id: meetingId},
          json: {email},
        }),
      ),
    onSuccess: (updated) => {
      setEmail("");
      setInviteOpen(false);
      queryClient.setQueryData(meetingKey(meetingId), updated);
      queryClient.invalidateQueries({queryKey: publicMeetingKey(meetingId)});
      queryClient.invalidateQueries({queryKey: ["meetings"]});
      queryClient.invalidateQueries({queryKey: suggestionsKey(meetingId)});
    },
  });

  const guestJoinMutation = useMutation({
    mutationFn: () =>
      parseResponse(
        publicMeetingDetailApi.guest.$post({
          param: {id: meetingId},
          json: {displayName: guestName.trim()},
        }),
      ),
    onSuccess: () => {
      setGuestName("");
      queryClient.invalidateQueries({queryKey: publicMeetingKey(meetingId)});
      queryClient.invalidateQueries({queryKey: availabilityKey(meetingId)});
    },
  });

  const saveAvailabilityMutation = useMutation({
    mutationFn: (json: SaveAvailabilityInput) =>
      parseResponse(
        publicMeetingAvailabilityApi.$put({
          param: {id: meetingId},
          json,
        }),
      ),
    onSuccess: (availability) => {
      queryClient.setQueryData(availabilityKey(meetingId), availability);
      queryClient.invalidateQueries({queryKey: suggestionsKey(meetingId)});
    },
  });

  if (publicMeetingQuery.isLoading || isPending) {
    return (
      <Card className="border-primary/15">
        <CardContent className="p-5 text-sm text-muted-foreground">
          Loading meeting...
        </CardContent>
      </Card>
    );
  }

  if (!meeting) {
    return (
      <Card className="border-primary/15">
        <CardContent className="space-y-3 p-5">
          <p className="text-sm text-muted-foreground">
            {publicMeetingQuery.error
              ? getRpcErrorMessage(publicMeetingQuery.error, "This meeting could not be loaded")
              : "This meeting could not be loaded."}
          </p>
          <Button asChild variant="outline">
            <Link to="/dashboard">Back to home</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const invites = protectedMeeting?.invites ?? [];
  const participants = meeting.participants ?? [];
  const joinUrl = `${window.location.origin}/meetings/${meeting.id}`;
  const pendingInvites = invites.filter((invite) => invite.status === "pending");
  const acceptedCount = participants.length;
  const totalPeople = participants.length + pendingInvites.length;
  const participation =
    totalPeople === 0 ? 100 : Math.round((acceptedCount / totalPeople) * 100);
  const currentParticipantId =
    availabilityQuery.data?.currentParticipantId ?? meeting.currentParticipantId;

  const handleInvite = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    inviteMutation.mutate();
  };

  const copyJoinUrl = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-primary/15">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <Link
                to="/dashboard"
                aria-label="Back to home"
                className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-md border border-primary/20 text-lg font-extrabold text-primary transition hover:border-primary hover:bg-primary/10"
              >
                ←
              </Link>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-extrabold text-primary sm:text-3xl">
                    {meeting.name}
                  </h2>
                  <Badge variant="primary">{meeting.joinCode}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {meeting.description || "No description yet."}
                </p>
                <p className="break-all text-xs text-muted-foreground">
                  {joinUrl}
                </p>
              </div>
            </div>
            <div className="w-full max-w-sm space-y-2">
              <div className="flex justify-end gap-2">
                <Button type="button" size="sm" variant="outline" onClick={copyJoinUrl}>
                  {copied ? "Copied" : "Copy link"}
                </Button>
                {session ? (
                  <Button type="button" size="sm" onClick={() => setInviteOpen(true)}>
                    Invite
                  </Button>
                ) : null}
              </div>
              <div className="rounded-lg border border-border bg-surface-elevated p-3">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-bold text-primary">Participation</span>
                <span className="text-muted-foreground">{participation}%</span>
              </div>
              <Progress value={participation} />
              <p className="mt-2 text-xs text-muted-foreground">
                {acceptedCount} joined, {pendingInvites.length} pending
              </p>
              </div>
            </div>
          </div>

          {!currentParticipantId ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!guestName.trim()) return;
                guestJoinMutation.mutate();
              }}
              className="grid gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 sm:grid-cols-[1fr_auto]"
            >
              <div className="space-y-2">
                <Label htmlFor="guest-name">Join as guest</Label>
                <Input
                  id="guest-name"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Your name"
                />
                {guestJoinMutation.error ? (
                  <p className="text-sm text-danger">
                    {getRpcErrorMessage(guestJoinMutation.error, "Could not join meeting")}
                  </p>
                ) : null}
              </div>
              <Button
                type="submit"
                className="self-end"
                disabled={guestJoinMutation.isPending || !guestName.trim()}
              >
                Join meeting
              </Button>
            </form>
          ) : null}

          <Tabs
            value={tab}
            onValueChange={setTab}
            items={[
              {value: "overview", label: "Overview"},
              {value: "availability", label: "Availability"},
              {value: "people", label: "People", count: totalPeople},
              {value: "suggestions", label: "Suggestions", count: suggestions.length},
            ]}
          />

          {tab === "availability" ? (
            <AvailabilityGrid
              availability={availabilityQuery.data}
              isLoading={availabilityQuery.isLoading}
              error={availabilityQuery.error}
              canEdit={Boolean(currentParticipantId)}
              isSaving={saveAvailabilityMutation.isPending}
              saveError={saveAvailabilityMutation.error}
              onSave={(slots) => saveAvailabilityMutation.mutate({slots})}
            />
          ) : null}

          {tab === "overview" ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-surface-elevated p-3">
                <div className="text-xs font-bold uppercase text-muted-foreground">
                  Date range
                </div>
                <div className="mt-1 font-semibold">
                  {meeting.startDate} to {meeting.endDate}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-surface-elevated p-3">
                <div className="text-xs font-bold uppercase text-muted-foreground">
                  Daily window
                </div>
                <div className="mt-1 font-semibold">
                  {timeFromMinutes(meeting.dailyStartMinutes)}-
                  {timeFromMinutes(meeting.dailyEndMinutes)}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-surface-elevated p-3">
                <div className="text-xs font-bold uppercase text-muted-foreground">
                  Duration
                </div>
                <div className="mt-1 font-semibold">
                  {meeting.durationMinutes} minutes
                </div>
              </div>
            </div>
          ) : null}

          {tab === "people" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <h3 className="font-medium">Participants</h3>
                {participants.map((participant) => (
                  <div
                    key={participant.id}
                    className="flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2 text-sm"
                  >
                    <span>{participant.displayName}</span>
                    <Badge variant={participant.kind === "guest" ? "neutral" : "success"}>
                      {participant.kind}
                    </Badge>
                  </div>
                ))}
                {participants.length === 0 ? (
                  <EmptyState
                    title="No participants yet"
                    description="Share the meeting link so people can join and mark availability."
                  />
                ) : null}
              </div>
              <div className="space-y-2">
                <h3 className="font-medium">Invites</h3>
                {invites.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2 text-sm"
                  >
                    <span className="truncate">{invite.email}</span>
                    <Badge
                      variant={invite.status === "pending" ? "warning" : "neutral"}
                    >
                      {invite.status}
                    </Badge>
                  </div>
                ))}
                {invites.length === 0 ? (
                  <EmptyState
                    title="No invites sent"
                    description={
                      session
                        ? "Invite registered users from the side panel when you are ready."
                        : "Sign in to use registered-user invites."
                    }
                  />
                ) : null}
              </div>
            </div>
          ) : null}

          {tab === "suggestions" ? (
            <SuggestionList
              suggestions={suggestions}
              error={suggestionsQuery.error}
            />
          ) : null}
        </CardContent>
      </Card>

      <Sheet
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title="Invite people"
        description="A side sheet is useful when an action supports the current page without replacing it."
      >
        <form onSubmit={handleInvite} className="grid gap-3">
          {inviteMutation.error ? (
            <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {getRpcErrorMessage(inviteMutation.error, "Could not send invite")}
            </div>
          ) : null}
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Invite registered email"
          />
          <Button type="submit" disabled={inviteMutation.isPending}>
            Send invite
          </Button>
        </form>
      </Sheet>
    </div>
  );
}

function AvailabilityGrid({
  availability,
  isLoading,
  error,
  canEdit,
  isSaving,
  saveError,
  onSave,
}: {
  availability: MeetingAvailability | undefined;
  isLoading: boolean;
  error: unknown;
  canEdit: boolean;
  isSaving: boolean;
  saveError: unknown;
  onSave: (slots: SaveAvailabilityInput["slots"]) => void;
}) {
  const [selectedSlotKey, setSelectedSlotKey] = useState<string | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set());
  const [paintMode, setPaintMode] = useState<"add" | "remove" | null>(null);

  useEffect(() => {
    if (!availability) return;
    setSelectedSlots(
      new Set(
        availability.currentParticipantAvailability.map(
          (slot) => `${slot.startAt}|${slot.endAt}`,
        ),
      ),
    );
  }, [availability?.currentParticipantId]);

  useEffect(() => {
    if (!paintMode) return;
    const stopPainting = () => setPaintMode(null);
    window.addEventListener("mouseup", stopPainting);
    return () => window.removeEventListener("mouseup", stopPainting);
  }, [paintMode]);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-surface-elevated p-4 text-sm text-muted-foreground">
        Loading availability map...
      </div>
    );
  }

  if (!availability || availability.days.length === 0) {
    return (
      <EmptyState
        title="No availability grid yet"
        description={
          error
            ? getRpcErrorMessage(error, "Could not load availability")
            : "This meeting needs at least one selected day and one member."
        }
      />
    );
  }

  const timeRows = availability.days[0]?.slots ?? [];
  const maxAvailable = Math.max(
    1,
    ...availability.days.flatMap((day) =>
      day.slots.map((slot) => slot.availableCount),
    ),
  );
  const selectedSlot =
    availability.days
      .flatMap((day) => day.slots)
      .find((slot) => `${slot.startAt}|${slot.endAt}` === selectedSlotKey) ??
    availability.days[0]?.slots[0];
  const dirty =
    selectedSlots.size !== availability.currentParticipantAvailability.length ||
    availability.currentParticipantAvailability.some(
      (slot) => !selectedSlots.has(`${slot.startAt}|${slot.endAt}`),
    );

  const paintSlot = (
    slot: {startAt: string; endAt: string},
    mode: "add" | "remove",
  ) => {
    setSelectedSlotKey(`${slot.startAt}|${slot.endAt}`);
    if (!canEdit) return;

    setSelectedSlots((current) => {
      const next = new Set(current);
      const key = `${slot.startAt}|${slot.endAt}`;
      if (mode === "add") {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const saveSlots = () => {
    onSave(
      [...selectedSlots].map((key) => {
        const [startAt, endAt] = key.split("|");
        return {startAt, endAt};
      }),
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-extrabold text-primary">
            Availability map
          </h3>
          <p className="text-sm text-muted-foreground">
            Darker blocks mean more people are free. Small dots show which
            participants are available in that slot. Click and drag to paint
            your free times.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dirty ? <Badge variant="warning">Unsaved changes</Badge> : null}
          <Badge variant="neutral">{availability.stepMinutes} min blocks</Badge>
          <Button
            type="button"
            size="sm"
            disabled={!canEdit || !dirty || isSaving}
            onClick={saveSlots}
          >
            {isSaving ? "Saving" : "Save availability"}
          </Button>
        </div>
      </div>
      {!canEdit ? (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          Join as a guest or sign in before marking your own availability.
        </div>
      ) : null}
      {saveError ? (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {getRpcErrorMessage(saveError, "Could not save availability")}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {availability.members.map((member, index) => (
          <span
            key={member.userId}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1 text-xs font-semibold"
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                memberColors[index % memberColors.length]
              }`}
            />
            {member.name}
          </span>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
        <div className="overflow-x-auto rounded-lg border border-border bg-white">
          <div
            className="min-w-[860px] grid select-none"
            style={{
              gridTemplateColumns: `84px repeat(${availability.days.length}, minmax(116px, 1fr))`,
            }}
          >
            <div className="sticky left-0 z-10 border-b border-r border-border bg-surface-elevated p-2 text-xs font-bold text-muted-foreground">
              Time
            </div>
            {availability.days.map((day) => (
              <div
                key={day.date}
                className="border-b border-r border-border bg-surface-elevated p-2 text-center text-sm font-extrabold text-primary last:border-r-0"
              >
                {formatDay(day.date)}
              </div>
            ))}

            {timeRows.map((rowSlot, rowIndex) => (
              <Fragment key={rowSlot.startAt}>
                <div
                  key={`${rowSlot.startAt}-label`}
                  className="sticky left-0 z-10 border-b border-r border-border bg-white p-2 text-xs font-semibold text-muted-foreground"
                >
                  {formatTime(rowSlot.startAt)}
                </div>
                {availability.days.map((day) => {
                  const slot = day.slots[rowIndex];
                  if (!slot) {
                    return (
                      <div
                        key={`${day.date}-${rowSlot.startAt}-empty`}
                        className="border-b border-r border-border bg-muted/40"
                      />
                    );
                  }

                  const slotKey = `${slot.startAt}|${slot.endAt}`;
                  const isMine = selectedSlots.has(slotKey);
                  const isSelected = selectedSlotKey === slotKey;
                  const intensity = slot.availableCount / maxAvailable;
                  const lightness = 94 - intensity * 46;
                  const availableNames = slot.availableMembers
                    .map((member) => member.name)
                    .join(", ");
                  const busyNames = slot.busyMembers
                    .map((member) => member.name)
                    .join(", ");

                  return (
                    <button
                      key={`${day.date}-${slot.startAt}`}
                      type="button"
                      title={`Free: ${availableNames || "Nobody"}${
                        busyNames ? ` | Busy: ${busyNames}` : ""
                      }`}
                      onMouseDown={() => {
                        const mode = isMine ? "remove" : "add";
                        setPaintMode(mode);
                        paintSlot(slot, mode);
                      }}
                      onMouseEnter={() => {
                        if (paintMode) {
                          paintSlot(slot, paintMode);
                        }
                      }}
                      onClick={() => setSelectedSlotKey(slotKey)}
                      className={`min-h-12 border-b border-r border-border p-1.5 text-left text-xs transition hover:ring-2 hover:ring-primary/30 ${
                        isSelected ? "ring-2 ring-primary" : ""
                      } ${isMine ? "shadow-[inset_0_0_0_2px_hsl(var(--primary))]" : ""}`}
                      style={{
                        background: isMine
                          ? "hsl(var(--primary) / 0.16)"
                          : slot.availableCount === 0
                            ? "hsl(var(--muted))"
                            : `hsl(145 52% ${lightness}%)`,
                      }}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-extrabold text-foreground">
                          {slot.availableCount}/{slot.totalCount}
                        </span>
                        {isMine ? (
                          <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                            me
                          </span>
                        ) : slot.availableCount === slot.totalCount ? (
                          <span className="rounded-full bg-success/20 px-1.5 py-0.5 text-[10px] font-bold text-success">
                            all
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {slot.availableMembers.slice(0, 6).map((member) => {
                          const memberIndex = availability.members.findIndex(
                            (item) => item.userId === member.userId,
                          );
                          return (
                            <span
                              key={member.userId}
                              className={`h-2 w-2 rounded-full ${
                                memberColors[memberIndex % memberColors.length]
                              }`}
                            />
                          );
                        })}
                      </div>
                    </button>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface-elevated p-3">
          <h3 className="font-extrabold text-primary">Selected time</h3>
          {selectedSlot ? (
            <div className="mt-2 space-y-3">
              <div className="text-sm font-semibold">
                {formatDateTime(selectedSlot.startAt)} -{" "}
                {formatTime(selectedSlot.endAt)}
              </div>
              <ParticipantList
                title="Free"
                members={selectedSlot.availableMembers}
              />
              <ParticipantList
                title="Calendar busy"
                members={selectedSlot.busyMembers}
              />
              <ParticipantList
                title="Not available"
                members={selectedSlot.notAvailableMembers}
              />
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Select a cell to inspect responses.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ParticipantList({
  title,
  members,
}: {
  title: string;
  members: Array<{userId: string; name: string; email?: string | null}>;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-bold uppercase text-muted-foreground">
        {title}
      </div>
      <div className="space-y-1">
        {members.length === 0 ? (
          <div className="text-xs text-muted-foreground">None</div>
        ) : (
          members.map((member) => (
            <div
              key={member.userId}
              className="rounded-md bg-white px-2 py-1 text-sm font-medium"
            >
              {member.name}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SuggestionList({
  suggestions,
  error,
}: {
  suggestions: Array<{startAt: string | Date; endAt: string | Date}>;
  error: unknown;
}) {
  if (suggestions.length === 0) {
    return (
      <EmptyState
        title="No matching times yet"
        description={
          error
            ? getRpcErrorMessage(error, "Could not load suggested times")
            : "Add availability and accepted members to generate candidate windows."
        }
      />
    );
  }

  return (
    <div className="grid gap-2">
      {suggestions.slice(0, 8).map((suggestion, index) => (
        <div
          key={`${suggestion.startAt}-${suggestion.endAt}`}
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm shadow-sm shadow-primary/5"
        >
          <span>
            {formatDateTime(suggestion.startAt)} -{" "}
            {formatDateTime(suggestion.endAt)}
          </span>
          <Badge variant={index === 0 ? "success" : "neutral"}>
            {index === 0 ? "Best next" : `Option ${index + 1}`}
          </Badge>
        </div>
      ))}
    </div>
  );
}
