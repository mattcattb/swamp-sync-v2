import {zValidator} from "@hono/zod-validator";
import {createRouter} from "../common/hono";
import {
  acceptInvite,
  createMeeting,
  createMeetingSchema,
  declineInvite,
  getMeeting,
  getMeetingAvailability,
  getMeetingSuggestions,
  inviteByEmailSchema,
  inviteParamsSchema,
  inviteRegisteredUser,
  joinCodeParamsSchema,
  joinMeetingByCode,
  listMeetings,
  meetingParamsSchema,
} from "./meetings.service";

export const meetingsController = createRouter()
  .get("/", async (c) => {
    const meetings = await listMeetings(c.get("userId"));
    return c.json(meetings);
  })
  .post("/", zValidator("json", createMeetingSchema), async (c) => {
    const userId = c.get("userId");
    const json = c.req.valid("json");

    const created = await createMeeting(userId, json);
    return c.json(created, 201);
  })
  .post(
    "/join-code/:joinCode",
    zValidator("param", joinCodeParamsSchema),
    async (c) => {
      const {joinCode} = c.req.valid("param");
      const meeting = await joinMeetingByCode(joinCode, c.get("userId"));
      return c.json(meeting);
    },
  )
  .get("/:id", zValidator("param", meetingParamsSchema), async (c) => {
    const {id} = c.req.valid("param");
    const meeting = await getMeeting(id, c.get("userId"));
    return c.json(meeting);
  })
  .post(
    "/:id/invites",
    zValidator("param", meetingParamsSchema),
    zValidator("json", inviteByEmailSchema),
    async (c) => {
      const {id} = c.req.valid("param");
      const {email} = c.req.valid("json");
      const meeting = await inviteRegisteredUser(id, c.get("userId"), email);
      return c.json(meeting, 201);
    },
  )
  .post(
    "/:id/invites/:inviteId/accept",
    zValidator("param", inviteParamsSchema),
    async (c) => {
      const {id, inviteId} = c.req.valid("param");
      const meeting = await acceptInvite(id, inviteId, c.get("userId"));
      return c.json(meeting);
    },
  )
  .post(
    "/:id/invites/:inviteId/decline",
    zValidator("param", inviteParamsSchema),
    async (c) => {
      const {id, inviteId} = c.req.valid("param");
      const meeting = await declineInvite(id, inviteId, c.get("userId"));
      return c.json(meeting);
    },
  )
  .get(
    "/:id/availability",
    zValidator("param", meetingParamsSchema),
    async (c) => {
      const {id} = c.req.valid("param");
      const availability = await getMeetingAvailability(id, c.get("userId"));
      return c.json(availability);
    },
  )
  .get(
    "/:id/suggestions",
    zValidator("param", meetingParamsSchema),
    async (c) => {
      const {id} = c.req.valid("param");
      const suggestions = await getMeetingSuggestions(id, c.get("userId"));
      return c.json(suggestions);
    },
  );
