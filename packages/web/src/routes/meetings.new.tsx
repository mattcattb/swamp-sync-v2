import {useMutation, useQueryClient} from "@tanstack/react-query";
import {createFileRoute, Link, Navigate, useNavigate} from "@tanstack/react-router";
import {parseResponse, type InferResponseType} from "hono/client";
import {type FormEvent, useState} from "react";
import {Button} from "../components/ui/button";
import {CalendarRangePicker} from "../components/ui/calendar";
import {Card, CardContent} from "../components/ui/card";
import {Input} from "../components/ui/input";
import {Label} from "../components/ui/label";
import {useSession} from "../lib/auth";
import {getRpcErrorMessage, rpcClient} from "../lib/rpc.client";

export const Route = createFileRoute("/meetings/new")({
  component: NewMeetingPage,
});

const meetingsApi = rpcClient.api.meetings;
const meetingDetailApi = meetingsApi[":id"];
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type MeetingDetail = InferResponseType<typeof meetingDetailApi.$get>;

const meetingsKey = ["meetings"] as const;
const meetingKey = (id: string) => ["meeting", id] as const;
const durationOptions = [30, 45, 60, 90];
const timeOptions = Array.from({length: 29}, (_, index) => {
  const totalMinutes = 7 * 60 + index * 30;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const value = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  const label = new Date(2000, 0, 1, hours, minutes).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return {value, label};
});

const minutesFromTime = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
};

const timeAfter = (value: string) =>
  timeOptions.find((option) => minutesFromTime(option.value) > minutesFromTime(value))
    ?.value ?? value;

function NewMeetingPage() {
  const {data: session, isPending} = useSession();

  if (!isPending && !session) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div>
      {session ? <MeetingCreatePanel /> : null}
    </div>
  );
}

function MeetingCreatePanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedWeekdays, setSelectedWeekdays] = useState([1, 2, 3, 4, 5]);
  const [dailyStart, setDailyStart] = useState("09:00");
  const [dailyEnd, setDailyEnd] = useState("17:00");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [inviteEmails, setInviteEmails] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

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
    onSuccess: async (meeting: MeetingDetail) => {
      queryClient.setQueryData(meetingKey(meeting.id), meeting);
      await queryClient.invalidateQueries({queryKey: meetingsKey});
      await navigate({
        to: "/meetings/$meetingId",
        params: {meetingId: meeting.id},
      });
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

  const handleDailyStartChange = (value: string) => {
    setDailyStart(value);
    if (minutesFromTime(dailyEnd) <= minutesFromTime(value)) {
      setDailyEnd(timeAfter(value));
    }
  };

  return (
    <Card className="border-primary/15">
      <CardContent className="space-y-4 p-4 sm:p-5">
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
              <p className="gator-kicker mb-2">New meeting</p>
              <h2 className="text-2xl font-extrabold text-primary sm:text-3xl">
                Create meeting
              </h2>
            </div>
          </div>
          <Button type="submit" form="create-meeting-form" disabled={createMutation.isPending} variant="secondary">
            Create meeting
          </Button>
        </div>

        <form id="create-meeting-form" onSubmit={handleSubmit} className="grid gap-4">
          {createMutation.error ? (
            <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {getRpcErrorMessage(createMutation.error, "Could not create meeting")}
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
            <section className="grid content-start gap-3 rounded-lg border border-border bg-surface-elevated p-3">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div className="space-y-1.5">
                  <Label htmlFor="meeting-name">Name</Label>
                  <Input
                    id="meeting-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Project sync"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Duration</Label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {durationOptions.map((duration) => (
                      <button
                        key={duration}
                        type="button"
                        onClick={() => setDurationMinutes(duration)}
                        className={[
                          "h-10 rounded-md border text-sm font-bold transition",
                          durationMinutes === duration
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-white text-foreground hover:border-primary",
                        ].join(" ")}
                      >
                        {duration}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="meeting-description">Description</Label>
                <Input
                  id="meeting-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional"
                />
              </div>

              <div className="grid gap-3 lg:grid-cols-[270px_1fr]">
                <div className="space-y-1.5">
                  <Label>Daily window</Label>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <select
                      aria-label="Daily start"
                      value={dailyStart}
                      onChange={(e) => handleDailyStartChange(e.target.value)}
                      className="h-10 min-w-0 rounded-md border border-input bg-white px-2 text-sm font-semibold text-foreground shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
                    >
                      {timeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs font-bold text-muted-foreground">
                      to
                    </span>
                    <select
                      aria-label="Daily end"
                      value={dailyEnd}
                      onChange={(e) => setDailyEnd(e.target.value)}
                      className="h-10 min-w-0 rounded-md border border-input bg-white px-2 text-sm font-semibold text-foreground shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
                    >
                      {timeOptions
                        .filter(
                          (option) =>
                            minutesFromTime(option.value) > minutesFromTime(dailyStart),
                        )
                        .map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Weekdays</Label>
                  <div className="grid grid-cols-7 gap-1.5">
                    {weekdays.map((day, index) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleWeekday(index)}
                        className={[
                          "h-10 rounded-md border text-xs font-bold transition",
                          selectedWeekdays.includes(index)
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-border bg-white text-foreground hover:border-accent",
                        ].join(" ")}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-white">
                <button
                  type="button"
                  onClick={() => setShowAdvanced((current) => !current)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                >
                  <span>
                    <span className="block text-sm font-extrabold text-primary">
                      Invite people
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Optional now. You can invite later from the meeting page.
                    </span>
                  </span>
                  <span className="text-sm font-bold text-primary">
                    {showAdvanced ? "Hide" : "Show"}
                  </span>
                </button>
                {showAdvanced ? (
                  <div className="border-t border-border p-3">
                    <Label htmlFor="meeting-invites">Invite emails</Label>
                    <Input
                      id="meeting-invites"
                      className="mt-2"
                      value={inviteEmails}
                      onChange={(e) => setInviteEmails(e.target.value)}
                      placeholder="friend@example.com, teammate@example.com"
                    />
                  </div>
                ) : null}
              </div>
            </section>

            <section className="space-y-2">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <Label>Meeting range</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {startDate} to {endDate}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const today = new Date().toISOString().slice(0, 10);
                    setStartDate(today);
                    setEndDate(today);
                  }}
                >
                  Today
                </Button>
              </div>
              <CalendarRangePicker
                startDate={startDate}
                endDate={endDate}
                onChange={(range) => {
                  setStartDate(range.startDate);
                  setEndDate(range.endDate);
                }}
              />
            </section>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
