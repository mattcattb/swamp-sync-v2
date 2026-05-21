import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {createFileRoute, Link, Navigate, useNavigate} from "@tanstack/react-router";
import {parseResponse, type InferResponseType} from "hono/client";
import {type FormEvent, useState} from "react";
import {Badge} from "../components/ui/badge";
import {Button} from "../components/ui/button";
import {Card, CardContent} from "../components/ui/card";
import {Dialog} from "../components/ui/dialog";
import {EmptyState} from "../components/ui/empty";
import {Input} from "../components/ui/input";
import {Tabs} from "../components/ui/tabs";
import {useSession} from "../lib/auth";
import {getRpcErrorMessage, rpcClient} from "../lib/rpc.client";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

const meetingsApi = rpcClient.api.meetings;
const meetingDetailApi = meetingsApi[":id"];

type MeetingDetail = InferResponseType<typeof meetingDetailApi.$get>;

const meetingsKey = ["meetings"] as const;
const meetingKey = (id: string) => ["meeting", id] as const;

function DashboardPage() {
  const {data: session, isPending} = useSession();

  if (!isPending && !session) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-primary/15 bg-white p-5 shadow-sm shadow-primary/5">
        <p className="gator-kicker mb-3">Home</p>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-extrabold text-primary">
              Schedule command center
            </h2>
            <p className="mt-1 text-muted-foreground">
              Welcome back, {session?.user.name ?? session?.user.email}.
            </p>
          </div>
          {session ? <JoinMeetingDialog /> : null}
        </div>
      </section>

      {session ? <DashboardHub /> : null}
    </div>
  );
}

function DashboardHub() {
  const queryClient = useQueryClient();
  const [meetingsTab, setMeetingsTab] = useState("meetings");

  const meetingsQuery = useQuery({
    queryKey: meetingsKey,
    queryFn: () => parseResponse(meetingsApi.$get()),
  });

  const meetingsData = meetingsQuery.data
    ? {
        memberships: Array.isArray(meetingsQuery.data.memberships)
          ? meetingsQuery.data.memberships
          : [],
        pendingInvites: Array.isArray(meetingsQuery.data.pendingInvites)
          ? meetingsQuery.data.pendingInvites
          : [],
      }
    : undefined;

  return (
    <div>
      <MeetingsPanel
        data={meetingsData}
        onChanged={() => queryClient.invalidateQueries({queryKey: meetingsKey})}
        tab={meetingsTab}
        onTabChange={setMeetingsTab}
      />
    </div>
  );
}

function JoinMeetingDialog() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");

  const joinMutation = useMutation({
    mutationFn: () =>
      parseResponse(
        meetingsApi["join-code"][":joinCode"].$post({
          param: {joinCode},
        }),
      ),
    onSuccess: async (meeting) => {
      setIsOpen(false);
      setJoinCode("");
      queryClient.setQueryData(meetingKey(meeting.id), meeting);
      await queryClient.invalidateQueries({queryKey: meetingsKey});
      await navigate({
        to: "/meetings/$meetingId",
        params: {meetingId: meeting.id},
      });
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    joinMutation.mutate();
  };

  return (
    <>
      <Button type="button" onClick={() => setIsOpen(true)}>
        Join meeting
      </Button>
      <Dialog
        open={isOpen}
        onOpenChange={setIsOpen}
        title="Join meeting"
        description="Use a meeting code. More join options can live here later."
      >
        {joinMutation.error ? (
          <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {getRpcErrorMessage(joinMutation.error, "Could not join meeting")}
          </div>
        ) : null}
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
      </Dialog>
    </>
  );
}

function MeetingsPanel({
  data,
  onChanged,
  tab,
  onTabChange,
}: {
  data: InferResponseType<typeof meetingsApi.$get> | undefined;
  onChanged: () => void;
  tab: string;
  onTabChange: (tab: string) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const acceptMutation = useMutation({
    mutationFn: ({meetingId, inviteId}: {meetingId: string; inviteId: string}) =>
      parseResponse(
        meetingsApi[":id"].invites[":inviteId"].accept.$post({
          param: {id: meetingId, inviteId},
        }),
      ),
    onSuccess: async (meeting: MeetingDetail) => {
      queryClient.setQueryData(meetingKey(meeting.id), meeting);
      await queryClient.invalidateQueries({queryKey: meetingsKey});
      await navigate({
        to: "/meetings/$meetingId",
        params: {meetingId: meeting.id},
      });
    },
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

  const memberships = data?.memberships ?? [];
  const pendingInvites = data?.pendingInvites ?? [];
  const hasInvites = pendingInvites.length > 0;

  return (
    <Card id="meetings" className="border-primary/15">
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-extrabold text-primary">Meetings</h3>
            <p className="text-sm text-muted-foreground">
              Open a meeting workspace or handle pending invites.
            </p>
          </div>
          <Button asChild variant="secondary" size="sm">
            <Link to="/meetings/new">
              New
            </Link>
          </Button>
        </div>

        <Tabs
          value={tab}
          onValueChange={onTabChange}
          items={[
            {value: "meetings", label: "Meetings", count: memberships.length},
            {value: "invites", label: "Invites", count: pendingInvites.length},
          ]}
        />

        {tab === "meetings" ? (
          <div className="space-y-2">
            {memberships.map(({meeting, role}) => (
              <Link
                key={meeting.id}
                to="/meetings/$meetingId"
                params={{meetingId: meeting.id}}
                className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-surface-elevated p-3 text-left shadow-sm shadow-primary/5 transition hover:border-primary"
              >
                <span>
                  <span className="block font-medium">{meeting.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {meeting.startDate} to {meeting.endDate}
                  </span>
                </span>
                <Badge variant="neutral">{role}</Badge>
              </Link>
            ))}
            {memberships.length === 0 ? (
              <EmptyState
                title="No meetings yet"
                description="Create the first meeting workspace or join one with a code."
                action={
                  <Button asChild size="sm" variant="secondary">
                    <Link to="/meetings/new">Create meeting</Link>
                  </Button>
                }
              />
            ) : null}
          </div>
        ) : null}

        {tab === "invites" ? (
          <div className="space-y-2">
          {acceptMutation.error || declineMutation.error ? (
            <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {getRpcErrorMessage(
                acceptMutation.error ?? declineMutation.error,
                "Could not update invite",
              )}
            </div>
          ) : null}
          {pendingInvites.map((invite) => (
            <div
              key={invite.inviteId}
              className="space-y-3 rounded-md border border-border bg-surface-elevated p-3 shadow-sm shadow-primary/5"
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
          {!hasInvites ? (
            <EmptyState
              title="No pending invites"
              description="When someone invites you to a meeting, the invite review queue appears here."
            />
          ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
