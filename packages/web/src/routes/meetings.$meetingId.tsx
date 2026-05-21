import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {createFileRoute, Link, Navigate} from "@tanstack/react-router";
import {parseResponse, type InferResponseType} from "hono/client";
import {Fragment, type FormEvent, useState} from "react";
import {Badge} from "../components/ui/badge";
import {Button} from "../components/ui/button";
import {Card, CardContent} from "../components/ui/card";
import {EmptyState} from "../components/ui/empty";
import {Input} from "../components/ui/input";
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
const meetingAvailabilityApi = meetingDetailApi.availability;

const meetingKey = (id: string) => ["meeting", id] as const;
const suggestionsKey = (id: string) => ["meeting-suggestions", id] as const;
const availabilityKey = (id: string) => ["meeting-availability", id] as const;

type MeetingAvailability = InferResponseType<typeof meetingAvailabilityApi.$get>;

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
  const [tab, setTab] = useState("availability");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const meetingQuery = useQuery({
    queryKey: meetingKey(meetingId),
    queryFn: () =>
      parseResponse(
        meetingDetailApi.$get({
          param: {id: meetingId},
        }),
      ),
  });

  const suggestionsQuery = useQuery({
    queryKey: suggestionsKey(meetingId),
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
        meetingAvailabilityApi.$get({
          param: {id: meetingId},
        }),
      ),
  });

  const meeting =
    meetingQuery.data &&
    Array.isArray(meetingQuery.data.members) &&
    Array.isArray(meetingQuery.data.invites)
      ? meetingQuery.data
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
      queryClient.invalidateQueries({queryKey: ["meetings"]});
      queryClient.invalidateQueries({queryKey: suggestionsKey(meetingId)});
    },
  });

  if (!isPending && !session) {
    return <Navigate to="/login" replace />;
  }

  if (meetingQuery.isLoading) {
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
            {meetingQuery.error
              ? getRpcErrorMessage(meetingQuery.error, "This meeting could not be loaded")
              : "This meeting could not be loaded."}
          </p>
          <Button asChild variant="outline">
            <Link to="/dashboard">Back to home</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const members = meeting.members ?? [];
  const invites = meeting.invites ?? [];
  const joinUrl = `${window.location.origin}/meetings/${meeting.id}`;
  const pendingInvites = invites.filter((invite) => invite.status === "pending");
  const acceptedCount = members.length;
  const totalPeople = members.length + pendingInvites.length;
  const participation =
    totalPeople === 0 ? 100 : Math.round((acceptedCount / totalPeople) * 100);

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
                <Button type="button" size="sm" onClick={() => setInviteOpen(true)}>
                  Invite
                </Button>
              </div>
              <div className="rounded-lg border border-border bg-surface-elevated p-3">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-bold text-primary">Participation</span>
                <span className="text-muted-foreground">{participation}%</span>
              </div>
              <Progress value={participation} />
              <p className="mt-2 text-xs text-muted-foreground">
                {acceptedCount} accepted, {pendingInvites.length} pending
              </p>
              </div>
            </div>
          </div>

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
                <h3 className="font-medium">Members</h3>
                {members.map((member) => (
                  <div
                    key={member.userId}
                    className="flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2 text-sm"
                  >
                    <span>{member.name}</span>
                    <Badge variant="success">{member.role}</Badge>
                  </div>
                ))}
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
                    description="Invite registered users from the side panel when you are ready."
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
}: {
  availability: MeetingAvailability | undefined;
  isLoading: boolean;
  error: unknown;
}) {
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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-extrabold text-primary">
            Availability map
          </h3>
          <p className="text-sm text-muted-foreground">
            Darker blocks mean more people are free. Small dots show which
            members are available in that slot.
          </p>
        </div>
        <Badge variant="neutral">{availability.stepMinutes} min blocks</Badge>
      </div>

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

      <div className="overflow-x-auto rounded-lg border border-border bg-white">
        <div
          className="min-w-[860px] grid"
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

                const intensity = slot.availableCount / maxAvailable;
                const lightness = 94 - intensity * 46;
                const availableNames = slot.availableMembers
                  .map((member) => member.name)
                  .join(", ");
                const busyNames = slot.busyMembers
                  .map((member) => member.name)
                  .join(", ");

                return (
                  <div
                    key={`${day.date}-${slot.startAt}`}
                    title={`Free: ${availableNames || "Nobody"}${
                      busyNames ? ` | Busy: ${busyNames}` : ""
                    }`}
                    className="min-h-12 border-b border-r border-border p-1.5 text-xs transition hover:ring-2 hover:ring-primary/30"
                    style={{
                      background:
                        slot.availableCount === 0
                          ? "hsl(var(--muted))"
                          : `hsl(145 52% ${lightness}%)`,
                    }}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-extrabold text-foreground">
                        {slot.availableCount}/{slot.totalCount}
                      </span>
                      {slot.availableCount === slot.totalCount ? (
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
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
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
